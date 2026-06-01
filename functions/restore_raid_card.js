/**
 * 모든뽑기의신 - 저주받은 인형의 왕 RAID 카드 복구
 */

const fs    = require('fs');
const https = require('https');

const PROJECT_ID = 'creature-world-81ca5';
const TARGET_UID = 'Iz7z033ZJCVjVZTZCF3Y43prm8A3';
const RAID_CARD  = { id: 'raid_cursed_doll', condition: 10, enhanceLevel: 0 };

const CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  return new Promise((res, rej) => {
    const req = https.request(url, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)} },
      r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); });
    req.on('error',rej); req.write(body); req.end();
  });
}

function request(method, url, body, headers={}) {
  return new Promise((res, rej) => {
    const b = body ? JSON.stringify(body) : undefined;
    const req = https.request(url, { method, headers:{'Content-Type':'application/json',...(b?{'Content-Length':Buffer.byteLength(b)}:{}), ...headers} },
      r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res({status:r.statusCode,body:JSON.parse(d)})}catch{res({status:r.statusCode,body:d})} }); });
    req.on('error',rej); if(b) req.write(b); req.end();
  });
}

async function main() {
  const config = JSON.parse(fs.readFileSync(process.env.HOME+'/.config/configstore/firebase-tools.json','utf8'));
  const t = await postForm('https://oauth2.googleapis.com/token', {
    grant_type:'refresh_token', refresh_token:config.tokens.refresh_token,
    client_id:CLIENT_ID, client_secret:CLIENT_SECRET,
  });
  if (!t.access_token) throw new Error('토큰 갱신 실패');
  const token = t.access_token;
  const auth  = { Authorization: `Bearer ${token}` };

  // 현재 유저 데이터 조회
  const userUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${TARGET_UID}`;
  const userRes = await request('GET', userUrl, null, auth);
  if (userRes.status >= 400) throw new Error('유저 조회 실패: ' + JSON.stringify(userRes.body));

  const fields    = userRes.body.fields;
  const ownedArr  = fields.ownedCards?.arrayValue?.values || [];

  // 이미 있는지 확인
  const alreadyHas = ownedArr.some(c => c.mapValue?.fields?.id?.stringValue === RAID_CARD.id);
  if (alreadyHas) { console.log('이미 raid_cursed_doll 카드 보유 중. 복구 불필요.'); return; }

  // uid 생성
  const uid = `restore_${Date.now()}`;

  // 새 카드 Firestore 형식으로 추가
  const newCard = {
    mapValue: { fields: {
      uid:          { stringValue: uid },
      id:           { stringValue: RAID_CARD.id },
      condition:    { integerValue: RAID_CARD.condition },
      enhanceLevel: { integerValue: RAID_CARD.enhanceLevel },
    }}
  };

  const updatedArr = [...ownedArr, newCard];

  // PATCH - ownedCards만 업데이트
  const patchUrl = `${userUrl}?updateMask.fieldPaths=ownedCards`;
  const patchRes = await request('PATCH', patchUrl, {
    fields: { ownedCards: { arrayValue: { values: updatedArr } } }
  }, auth);

  if (patchRes.status >= 400) {
    console.error('복구 실패:', JSON.stringify(patchRes.body));
  } else {
    console.log(`✓ raid_cursed_doll 카드 복구 완료!`);
    console.log(`  uid: ${uid}, condition: ${RAID_CARD.condition}`);
    console.log(`  총 보유 카드: ${updatedArr.length}장`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('실패:', e.message); process.exit(1); });
