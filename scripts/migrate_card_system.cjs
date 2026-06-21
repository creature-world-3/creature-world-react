/**
 * [실제 마이그레이션] 카드 시스템 개편 — 1장 제한 적용
 *
 * 동작:
 *   1. 모든 유저의 카드 중 같은 id가 여러 장이면, 최우선 1장만 남기고 나머지 제거
 *      우선순위: 잠금 > enhanceLevel 높음 > growth 높음 > condition 높음
 *   2. 제거된 카드 수만큼 우편함에 뽑기권 보상 발송
 *   3. 처리 결과 요약 출력
 *
 * 실행: node scripts/migrate_card_system.cjs
 */

'use strict';

const fs    = require('fs');
const https = require('https');

const PROJECT_ID             = 'creature-world-81ca5';
const FIREBASE_CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const BASE_URL               = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── HTTP 유틸 ──────────────────────────────────────────────────────────────
function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let r = ''; res.on('data', c => r += c); res.on('end', () => { try { resolve(JSON.parse(r)); } catch(e) { reject(new Error('parse error: ' + r)); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function httpRequest(method, url, token, body) {
  const bodyStr = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    }, res => {
      let r = '';
      res.on('data', c => r += c);
      res.on('end', () => {
        try { resolve(JSON.parse(r)); }
        catch(e) { reject(new Error('parse error: ' + r)); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Firestore 타입 파서 ────────────────────────────────────────────────────
function parseValue(v) {
  if (!v) return null;
  if ('stringValue'  in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue'  in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue'    in v) return null;
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(parseValue);
  if ('mapValue'     in v) {
    const obj = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) obj[k] = parseValue(val);
    return obj;
  }
  return null;
}

function parseDoc(doc) {
  const obj = {};
  for (const [k, v] of Object.entries(doc.fields || {})) obj[k] = parseValue(v);
  return obj;
}

// ── Firestore 타입 직렬화 ──────────────────────────────────────────────────
function serializeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(serializeValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = serializeValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

// ── 전체 유저 조회 (페이지네이션) ─────────────────────────────────────────
async function fetchAllUsers(token) {
  const users = [];
  let pageToken = null;

  do {
    const url = `${BASE_URL}/users?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await httpRequest('GET', url, token);
    if (res.error) throw new Error(`Firestore 오류: ${JSON.stringify(res.error)}`);
    for (const doc of res.documents || []) {
      const uid  = doc.name.split('/').pop();
      const data = parseDoc(doc);
      users.push({ uid, data });
    }
    pageToken = res.nextPageToken || null;
  } while (pageToken);

  return users;
}

// ── 유저 카드 업데이트 ─────────────────────────────────────────────────────
async function updateUserCards(token, uid, newOwnedCards) {
  const url = `${BASE_URL}/users/${uid}?updateMask.fieldPaths=ownedCards`;
  const res = await httpRequest('PATCH', url, token, {
    fields: { ownedCards: serializeValue(newOwnedCards) },
  });
  if (res.error) throw new Error(`카드 업데이트 실패 (${uid}): ${JSON.stringify(res.error)}`);
  return res;
}

// ── 우편 발송 ──────────────────────────────────────────────────────────────
async function sendMail(token, uid, removeCount) {
  const now = new Date().toISOString();
  const mail = {
    title: '카드 시스템 개편 보상',
    message: `카드 보유 방식이 캐릭터당 1장으로 개편되어, 보유 중이던 중복 카드 ${removeCount}장이 정리되었습니다. 그만큼 뽑기권 ${removeCount}장을 보상으로 드립니다. 이용에 불편을 드려 죄송합니다.`,
    targetUid: uid,
    reward: { type: 'tickets', amount: removeCount },
    createdAt: now,
  };
  const url = `${BASE_URL}/mailbox`;
  const res = await httpRequest('POST', url, token, { fields: Object.fromEntries(
    Object.entries(mail).map(([k, v]) => [k, serializeValue(v)])
  ) });
  if (res.error) throw new Error(`우편 발송 실패 (${uid}): ${JSON.stringify(res.error)}`);
  return res;
}

// ── 메인 ──────────────────────────────────────────────────────────────────
async function main() {
  // 1. 인증
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  if (!fs.existsSync(configPath)) throw new Error(`firebase-tools 설정 파일 없음: ${configPath}\n  → firebase login 후 다시 실행하세요`);

  const config   = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tokenRes = await postForm('https://oauth2.googleapis.com/token', {
    grant_type:    'refresh_token',
    refresh_token: config.tokens.refresh_token,
    client_id:     FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
  });
  if (!tokenRes.access_token) throw new Error('토큰 갱신 실패: ' + JSON.stringify(tokenRes));
  const token = tokenRes.access_token;
  console.log('✓ 인증 완료');

  // 2. 전체 유저 조회
  process.stdout.write('유저 데이터 조회 중...');
  const users = await fetchAllUsers(token);
  console.log(` 총 ${users.length}명\n`);

  // 3. 마이그레이션
  let totalAffectedUsers = 0;
  let totalRemovedCards  = 0;
  let totalMailsSent     = 0;
  const errors = [];

  for (const { uid, data } of users) {
    const nickname   = data.nickname || `(닉네임 없음 / ${uid.slice(0, 8)})`;
    const ownedCards = Array.isArray(data.ownedCards) ? data.ownedCards : [];
    if (ownedCards.length === 0) continue;

    const cardBonusDmg = (typeof data.cardBonusDmg === 'object' && data.cardBonusDmg) ? data.cardBonusDmg : {};

    // 잠금 카드 uid 집합
    const lockedSet = new Set([
      ...(Array.isArray(data.lockedCardUids) ? data.lockedCardUids : []),
      ...(data.raidCard && data.raidCard.uid ? [data.raidCard.uid] : []),
    ]);

    // 각성/레이드 카드는 중복 제거 대상에서 제외
    const EXCLUDED_GRADES = new Set(['raid', 'awakened']);

    // 카드 id별 그룹핑
    const groups = {};
    for (const inst of ownedCards) {
      if (!inst || !inst.id) continue;
      if (!groups[inst.id]) groups[inst.id] = [];
      groups[inst.id].push(inst);
    }

    // 중복(2장 이상)인 그룹 처리
    let removeCount = 0;
    let newOwnedCards = [...ownedCards];

    for (const [cardId, instances] of Object.entries(groups)) {
      if (instances.length <= 1) continue;

      // 각성/레이드 등급은 건드리지 않음 (id에서 추론)
      const isExcluded = cardId.startsWith('awakened_') || cardId.startsWith('raid_');
      if (isExcluded) continue;

      // 우선순위 정렬: 잠금 > enhanceLevel 내림 > growth 내림 > condition 내림
      const sorted = [...instances].sort((a, b) => {
        const aLock = lockedSet.has(a.uid) ? 1 : 0;
        const bLock = lockedSet.has(b.uid) ? 1 : 0;
        if (aLock !== bLock) return bLock - aLock;

        const aEnhance = a.enhanceLevel || 0;
        const bEnhance = b.enhanceLevel || 0;
        if (aEnhance !== bEnhance) return bEnhance - aEnhance;

        const aGrowth = cardBonusDmg[a.uid] || 0;
        const bGrowth = cardBonusDmg[b.uid] || 0;
        if (aGrowth !== bGrowth) return bGrowth - aGrowth;

        return (b.condition || 1) - (a.condition || 1);
      });

      const keep      = sorted[0];
      const toRemove  = sorted.slice(1);
      const removeUids = new Set(toRemove.map(c => c.uid));

      newOwnedCards = newOwnedCards.filter(c => !removeUids.has(c.uid));
      removeCount += toRemove.length;
    }

    if (removeCount === 0) continue;

    totalAffectedUsers++;
    totalRemovedCards += removeCount;

    process.stdout.write(`  처리 중: ${nickname} — ${removeCount}장 제거...`);

    try {
      // 카드 업데이트
      await updateUserCards(token, uid, newOwnedCards);
      // 우편 발송
      await sendMail(token, uid, removeCount);
      totalMailsSent++;
      console.log(' ✓');
    } catch (err) {
      console.log(' ✗');
      errors.push({ nickname, uid, err: err.message });
    }

    // Firestore rate limit 방지
    await new Promise(r => setTimeout(r, 150));
  }

  // 4. 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log('마이그레이션 결과');
  console.log('='.repeat(60));
  console.log(`전체 유저 수:       ${users.length}명`);
  console.log(`영향받은 유저 수:   ${totalAffectedUsers}명`);
  console.log(`총 정리된 카드 수:  ${totalRemovedCards}장`);
  console.log(`총 발송된 도토리:   ${totalRemovedCards}장`);
  console.log(`우편 발송 성공:     ${totalMailsSent}건`);

  if (errors.length > 0) {
    console.log(`\n오류 발생 (${errors.length}건):`);
    errors.forEach(({ nickname, uid, err }) => {
      console.log(`  ${nickname} (${uid.slice(0, 8)}): ${err}`);
    });
  }

  console.log('='.repeat(60));
  console.log('마이그레이션 완료');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('\n실패:', err.message || err);
  process.exit(1);
});
