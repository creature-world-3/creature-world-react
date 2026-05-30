// Vercel Serverless Function
// Kakao 인가코드 → 액세스 토큰 교환 프록시
// kauth.kakao.com은 브라우저 직접 호출 시 CORS 오류 → 서버 측에서 중계

const KAKAO_JS_KEY = '86daeae42ced20dec5fb375bf0b15aec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, redirect_uri } = req.body;
  if (!code || !redirect_uri) {
    return res.status(400).json({ error: 'code and redirect_uri are required' });
  }

  try {
    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KAKAO_JS_KEY,
        redirect_uri,
        code,
      }),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Token exchange failed', detail: e.message });
  }
}
