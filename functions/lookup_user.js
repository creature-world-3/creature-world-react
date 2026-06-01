/**
 * 닉네임으로 유저 데이터 상세 조회
 */

const fs    = require('fs');
const https = require('https');

const PROJECT_ID = 'creature-world-81ca5';
const NICKNAME   = '모든뽑기의신';

const FIREBASE_CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let r = ''; res.on('data', c => r += c); res.on('end', () => resolve(JSON.parse(r))); });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function main() {
  const config   = JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/configstore/firebase-tools.json`, 'utf8'));
  const tokenRes = await postForm('https://oauth2.googleapis.com/token', {
    grant_type: 'refresh_token', refresh_token: config.tokens.refresh_token,
    client_id: FIREBASE_CLIENT_ID, client_secret: FIREBASE_CLIENT_SECRET,
  });
  if (!tokenRes.access_token) throw new Error('토큰 갱신 실패');
  const token = tokenRes.access_token;

  const queryUrl  = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const queryBody = JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: { fieldFilter: { field: { fieldPath: 'nickname' }, op: 'EQUAL', value: { stringValue: NICKNAME } } },
      limit: 1,
    }
  });

  const res = await new Promise((resolve, reject) => {
    const req = https.request(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Content-Length': Buffer.byteLength(queryBody) }
    }, res => { let r = ''; res.on('data', c => r += c); res.on('end', () => resolve(JSON.parse(r))); });
    req.on('error', reject); req.write(queryBody); req.end();
  });

  const doc    = res.find(r => r.document);
  if (!doc) { console.log('유저 없음'); return; }

  const fields = doc.document.fields;
  const uid    = doc.document.name.split('/').pop();

  // raidCard 파싱
  const rc = fields.raidCard?.mapValue?.fields;
  const raidCardInfo = rc
    ? Object.fromEntries(Object.entries(rc).map(([k, v]) => [k, Object.values(v)[0]]))
    : null;

  // ownedCards 파싱
  const ownedArr = fields.ownedCards?.arrayValue?.values || [];
  const cards = ownedArr.map(c => {
    const f = c.mapValue?.fields || {};
    return {
      uid:          f.uid?.stringValue,
      id:           f.id?.stringValue,
      condition:    f.condition?.integerValue ?? f.condition?.doubleValue,
      enhanceLevel: f.enhanceLevel?.integerValue ?? 0,
    };
  });

  console.log(`\n=== ${NICKNAME} (${uid}) ===`);
  console.log(`뽑기권: ${fields.tickets?.integerValue || 0}장`);
  console.log(`\n[raidCard 세션]`);
  if (raidCardInfo) {
    console.log(`  cardId:    ${raidCardInfo.cardId}`);
    console.log(`  channelId: ${raidCardInfo.channelId}`);
    console.log(`  uid:       ${raidCardInfo.uid}`);
  } else {
    console.log('  없음');
  }

  console.log(`\n[보유 카드 ${cards.length}장]`);
  cards.forEach(c => {
    const enhance = c.enhanceLevel > 0 ? ` +${c.enhanceLevel}` : '';
    console.log(`  ${c.id}${enhance}  (컨디션 ${c.condition}, uid: ${c.uid})`);
  });

  // raidCard가 ownedCards에 실제로 있는지 확인
  if (raidCardInfo?.uid) {
    const found = cards.find(c => c.uid === raidCardInfo.uid);
    console.log(`\n[raidCard 카드(${raidCardInfo.cardId}) ownedCards에 있음?] ${found ? '✓ YES' : '✗ NO — 카드 소실됨!'}`);
  }
}

main().then(() => process.exit(0)).catch(err => { console.error('실패:', err.message); process.exit(1); });
