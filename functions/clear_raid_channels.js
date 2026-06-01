/**
 * 긴급: 레이드 채널 전체 삭제 스크립트
 * 이전 주 waiting 채널이 남아 입장을 막는 경우 실행
 */

const fs    = require('fs');
const https = require('https');

const PROJECT_ID = 'creature-world-81ca5';
const BOSS_ID    = 'cursed_doll_king';

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

  if (listRes.status >= 400) throw new Error(`채널 조회 실패 (${listRes.status}): ${JSON.stringify(listRes.body)}`);

  const docs = listRes.body.documents || [];
  if (docs.length === 0) {
    console.log('삭제할 채널이 없습니다.');
    return;
  }

  console.log(`채널 ${docs.length}개 발견 → 전체 삭제 중...\n`);

  // 3. 각 채널 삭제
  for (const d of docs) {
    const channelId = d.name.split('/').pop();
    const status    = d.fields?.status?.stringValue || 'unknown';
    const deleteUrl = `https://firestore.googleapis.com/v1/${d.name}`;
    const delRes    = await request('DELETE', deleteUrl, null, { Authorization: `Bearer ${accessToken}` });

    if (delRes.status >= 400) {
      console.error(`  ${channelId} (${status}) 삭제 실패 (${delRes.status})`);
    } else {
      console.log(`  ${channelId} (${status}) 삭제 완료`);
    }
  }

  console.log('\n채널 정리 완료! 이제 레이드 입장 가능합니다.');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('\n실패:', err.message || err);
  process.exit(1);
});
