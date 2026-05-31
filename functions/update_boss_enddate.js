/**
 * 레이드 보스 endDate 업데이트 스크립트
 * cursed_doll_king의 모든 채널 endDate → 2026-06-07T09:00:00+09:00
 */

const fs    = require('fs');
const https = require('https');

const PROJECT_ID  = 'creature-world-81ca5';
const BOSS_ID     = 'cursed_doll_king';
// 2026-06-07T09:00:00+09:00 = 2026-06-07T00:00:00Z
const NEW_END_DATE = '2026-06-07T00:00:00Z';

const FIREBASE_CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
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

function request(method, url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : undefined;
    const req = https.request(url, {
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

async function main() {
  // 1. 토큰 갱신
  const configPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refreshToken = config.tokens.refresh_token;

  console.log('토큰 갱신 중...');
  const tokenRes = await postForm('https://oauth2.googleapis.com/token', {
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
  });
  if (!tokenRes.access_token) throw new Error('토큰 갱신 실패: ' + JSON.stringify(tokenRes));
  const accessToken = tokenRes.access_token;
  console.log('토큰 갱신 성공\n');

  // 2. 채널 목록 조회
  const listUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/raids/${BOSS_ID}/channels`;
  const listRes = await request('GET', listUrl, null, { Authorization: `Bearer ${accessToken}` });

  if (listRes.status >= 400) {
    throw new Error(`채널 목록 조회 실패 (${listRes.status}): ${JSON.stringify(listRes.body)}`);
  }

  const docs = listRes.body.documents || [];
  if (docs.length === 0) {
    console.log('채널이 없습니다. endDate 업데이트 없이 종료.');
    return;
  }

  console.log(`채널 ${docs.length}개 발견`);

  // 3. 각 채널 endDate 업데이트 (PATCH updateMask)
  for (const d of docs) {
    const channelId = d.name.split('/').pop();
    const patchUrl  = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/raids/${BOSS_ID}/channels/${channelId}?updateMask.fieldPaths=endDate`;

    const patchRes = await request('PATCH', patchUrl, {
      fields: {
        endDate: { timestampValue: NEW_END_DATE },
      },
    }, { Authorization: `Bearer ${accessToken}` });

    if (patchRes.status >= 400) {
      console.error(`  ${channelId} 업데이트 실패 (${patchRes.status}):`, JSON.stringify(patchRes.body));
    } else {
      const status = d.fields?.status?.stringValue || 'unknown';
      console.log(`  ${channelId} (${status}) → endDate: ${NEW_END_DATE} ✓`);
    }
  }

  console.log('\n완료!');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('\n실패:', err.message || err);
  process.exit(1);
});
