/**
 * 관리자용 우편 발송 스크립트
 *
 * 사용법:
 *   node api/send_mail.js --nickname haenglee --tickets 100
 *   node api/send_mail.js --nickname haenglee --tickets 50 --title "이벤트 보상" --message "감사합니다!"
 *   node api/send_mail.js --uid VSg8zcGH... --tickets 100   (uid 직접 지정)
 *
 * mailbox 문서 구조 (MailboxTab.jsx 기준):
 *   title, message, targetUid, createdAt, reward: { type: 'tickets', amount: N }
 */

const fs    = require('fs');
const https = require('https');

const PROJECT_ID             = 'creature-world-81ca5';
const FIREBASE_CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// ── 인자 파싱 ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const ARG_NICKNAME = get('--nickname');
const ARG_UID      = get('--uid');
const ARG_TICKETS  = parseInt(get('--tickets') || '0');
const ARG_TITLE    = get('--title')   || '관리자 지급';
const ARG_MESSAGE  = get('--message') || `뽑기권 ${ARG_TICKETS}장을 지급해 드립니다!`;

if (!ARG_NICKNAME && !ARG_UID) {
  console.error('사용법: node api/send_mail.js --nickname <닉네임> --tickets <장수>');
  process.exit(1);
}
if (!ARG_TICKETS || ARG_TICKETS < 1) {
  console.error('--tickets 값을 1 이상으로 지정해주세요');
  process.exit(1);
}

// ── 유틸 ──────────────────────────────────────────────────────
function request(method, url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : undefined;
    const req  = https.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...headers,
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Firestore REST API 값 변환 (중첩 객체 → mapValue)
function toFV(v) {
  if (typeof v === 'string')  return { stringValue: v };
  if (typeof v === 'number')  return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (v === null)             return { nullValue: null };
  if (Array.isArray(v))       return { arrayValue: { values: v.map(toFV) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFV(val);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function toDoc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFV(v);
  return { fields };
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── 메인 ──────────────────────────────────────────────────────
async function main() {
  // 1. Firebase 토큰 갱신
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  const config     = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tokenRes   = await postForm('https://oauth2.googleapis.com/token', {
    grant_type:    'refresh_token',
    refresh_token: config.tokens.refresh_token,
    client_id:     FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
  });
  if (!tokenRes.access_token) throw new Error('토큰 갱신 실패: ' + JSON.stringify(tokenRes));
  const auth = { Authorization: `Bearer ${tokenRes.access_token}` };

  // 2. UID 결정 (직접 지정 or 닉네임 검색)
  let targetUid  = ARG_UID;
  let targetNick = ARG_NICKNAME || targetUid;

  if (!targetUid) {
    console.log(`닉네임 "${ARG_NICKNAME}" 유저 검색 중...`);
    const qRes = await request('POST', `${BASE}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'nickname' },
            op:    'EQUAL',
            value: { stringValue: ARG_NICKNAME },
          },
        },
        limit: 5,
      },
    }, auth);

    if (qRes.status >= 400) throw new Error(`검색 실패 (${qRes.status}): ${JSON.stringify(qRes.body)}`);
    const docs = (qRes.body || []).filter(r => r.document);
    if (docs.length === 0) throw new Error(`닉네임 "${ARG_NICKNAME}" 유저를 찾을 수 없습니다.`);
    if (docs.length > 1) {
      console.warn(`⚠️  동일 닉네임 ${docs.length}명 — 첫 번째 유저를 사용합니다.`);
      docs.forEach((d, i) => console.warn(`   [${i}] ${d.document.name.split('/').pop()}`));
    }

    targetUid  = docs[0].document.name.split('/').pop();
    targetNick = docs[0].document.fields?.nickname?.stringValue || ARG_NICKNAME;
  }

  console.log(`대상: ${targetNick} (${targetUid})`);

  // 3. mailbox 문서 생성 — reward 필드를 중첩 맵으로 저장해야 앱이 읽을 수 있음
  const mailDoc = toDoc({
    title:     ARG_TITLE,
    message:   ARG_MESSAGE,
    targetUid: targetUid,
    createdAt: new Date().toISOString(),
    reward: {
      type:   'tickets',
      amount: ARG_TICKETS,
    },
  });

  const cRes = await request('POST', `${BASE}/mailbox`, mailDoc, auth);
  if (cRes.status >= 400) throw new Error(`메일 생성 실패 (${cRes.status}): ${JSON.stringify(cRes.body)}`);

  const newId = cRes.body.name?.split('/').pop();
  console.log('\n우편 발송 완료!');
  console.log(`  수신자:  ${targetNick} (${targetUid})`);
  console.log(`  제목:    ${ARG_TITLE}`);
  console.log(`  보상:    뽑기권 ${ARG_TICKETS}장`);
  console.log(`  메일 ID: ${newId}`);
}

main().catch(err => { console.error('\n오류:', err.message || err); process.exit(1); });
