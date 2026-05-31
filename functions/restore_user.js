/**
 * 긴급 유저 데이터 복구 스크립트 (Firestore REST API 사용)
 * uid: anX1qpQ6vFeb9Gzet8DdnEVGWEe2 (주빠셍)
 */

const fs    = require('fs');
const https = require('https');

const PROJECT_ID = 'creature-world-81ca5';
const TARGET_UID = 'anX1qpQ6vFeb9Gzet8DdnEVGWEe2';

const FIREBASE_CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function request(method, url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined;
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...headers,
      },
    };
    const req = https.request(url, opts, res => {
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

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function genUid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const CARDS = [
  { id: 'rumi_n',           grade: 'n'    },
  { id: 'rumi_r',           grade: 'r'    },
  { id: 'rumi_sr',          grade: 'sr'   },
  { id: 'rumi_ur',          grade: 'ur'   },
  { id: 'rumi_lg',          grade: 'lg'   },
  { id: 'toto_n',           grade: 'n'    },
  { id: 'toto_r',           grade: 'r'    },
  { id: 'toto_sr',          grade: 'sr'   },
  { id: 'toto_ur',          grade: 'ur'   },
  { id: 'toto_lg',          grade: 'lg'   },
  { id: 'pin_n',            grade: 'n'    },
  { id: 'pin_r',            grade: 'r'    },
  { id: 'pin_sr',           grade: 'sr'   },
  { id: 'pin_ur',           grade: 'ur'   },
  { id: 'pin_lg',           grade: 'lg'   },
  { id: 'luka_n',           grade: 'n'    },
  { id: 'luka_r',           grade: 'r'    },
  { id: 'luka_sr',          grade: 'sr'   },
  { id: 'luka_ur',          grade: 'ur'   },
  { id: 'luka_lg',          grade: 'lg'   },
  { id: 'misti_n',          grade: 'n'    },
  { id: 'misti_r',          grade: 'r'    },
  { id: 'misti_sr',         grade: 'sr'   },
  { id: 'misti_ur',         grade: 'ur'   },
  { id: 'misti_lg',         grade: 'lg'   },
  { id: 'daitron_n',        grade: 'n'    },
  { id: 'daitron_r',        grade: 'r'    },
  { id: 'daitron_sr',       grade: 'sr'   },
  { id: 'daitron_ur',       grade: 'ur'   },
  { id: 'daitron_lg',       grade: 'lg'   },
  { id: 'raid_cursed_doll', grade: 'raid' },
];

// Firestore REST API용 value 타입 변환
function toFirestoreValue(v) {
  if (typeof v === 'string')  return { stringValue: v };
  if (typeof v === 'number')  return { integerValue: String(v) };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v))       return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (v && typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFirestoreValue(val);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function toFirestoreDoc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return { fields };
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

  // 2. 카드 데이터 구성
  const ownedCards = CARDS.map(card => ({
    uid:       genUid(),
    id:        card.id,
    condition: randInt(1, 10),
  }));

  const userData = {
    nickname:   '주빠셍',
    tickets:    500,
    ownedCards,
  };

  // 3. Firestore REST API PATCH (merge: updateMask 없이 하면 덮어쓰기)
  const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${TARGET_UID}`;
  const firestoreDoc = toFirestoreDoc(userData);

  const res = await request('PATCH', docUrl, firestoreDoc, {
    Authorization: `Bearer ${accessToken}`,
  });

  if (res.status >= 400) {
    throw new Error(`Firestore 오류 (${res.status}): ${JSON.stringify(res.body)}`);
  }

  console.log('복구 완료!');
  console.log(`  nickname : ${userData.nickname}`);
  console.log(`  tickets  : ${userData.tickets}`);
  console.log(`  카드 수  : ${ownedCards.length}장`);
  console.log('\n카드 목록:');
  ownedCards.forEach(c => {
    const grade = CARDS.find(x => x.id === c.id).grade;
    console.log(`  ${c.id.padEnd(22)} grade=${grade.padEnd(4)}  condition=${c.condition}`);
  });
}

main().then(() => process.exit(0)).catch(err => {
  console.error('\n복구 실패:', err.message || err);
  process.exit(1);
});
