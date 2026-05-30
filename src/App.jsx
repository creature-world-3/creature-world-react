import { useState, useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config.js';
import Header from './components/Header.jsx';
import TabBar from './components/TabBar.jsx';
import Footer from './components/Footer.jsx';
import GachaTab from './components/tabs/GachaTab.jsx';
import SynthTab from './components/tabs/SynthTab.jsx';
import ShopTab from './components/tabs/ShopTab.jsx';
import DexTab from './components/tabs/DexTab.jsx';
import BoardTab from './components/tabs/BoardTab.jsx';
import TradeTab from './components/tabs/TradeTab.jsx';
import RaidTab from './components/tabs/RaidTab.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';
import TermsPage from './pages/TermsPage.jsx';
import './App.css';

const TAB_ORDER = ['gacha', 'synth', 'shop', 'dex', 'board', 'trade', 'raid'];

const KAKAO_JS_KEY   = '86daeae42ced20dec5fb375bf0b15aec';
const KAKAO_REDIRECT = 'https://creature-world-react.vercel.app';

export const BASE_STATE = {
  tickets: 5, ownedCards: [],
  attendDate: null, attendStreak: 0,
  clickCount: 0, clickRound: 0, clickDone: false, clickDate: null,
  testEventDate: null,
  sessionMinutes: 0, sessionBonus: false, sessionDate: null,
  raidCard: null,
  nickname: null,
};

function applyDailyReset(state) {
  const today = new Date().toDateString();
  const s = { ...state };
  if (s.clickDate !== today) {
    s.clickCount = 0; s.clickRound = 0; s.clickDone = false; s.clickDate = today;
  }
  if (s.sessionDate !== today) {
    s.sessionMinutes = 0; s.sessionBonus = false; s.sessionDate = today;
  }
  return s;
}

const NOTICES = [
  {
    version: 'v1.3', date: '2025.05.30',
    items: [
      "첫 번째 레이드 보스 '저주받은 인형의 왕' 추가.",
    ],
  },
  {
    version: 'v1.2', date: '2025.05.28',
    items: [
      '다이트론(악마기사) 캐릭터 추가 (총 30종)',
      '컨디션 시스템 추가 (1~10점, 골드/홀로/일반 반짝이)',
      '10뽑 추가 (팡! 터지는 애니메이션)',
      '테스트 이벤트 추가 (상점에서 하루 1회 +100장)',
      '합성 탭 추가 (같은 등급 3장 → 10% 확률 업그레이드)',
    ],
  },
  {
    version: 'v1.1', date: '2025.05.28',
    items: [
      '출석체크 기능 추가 (하루 1회, 7일 개근 시 보너스 100장)',
      '공지 버튼 추가',
      '프리미엄 뽑기 모바일 사이즈 수정',
    ],
  },
  {
    version: 'v1.0', date: '2025.05.27',
    items: [
      '크리쳐 월드 React 버전 오픈!',
      '미스티(고스트) 캐릭터 추가',
      '도감 기능 추가 (보유/미보유 카드 확인)',
      '뽑기 확률: SR 6.9% / UR 1% / LG 0.1%',
    ],
  },
];

const HELP_ITEMS = [
  { icon: '🎟️', title: '매일 뽑기권',    desc: '매일 처음 접속하면 뽑기권 5장을 드려요!' },
  { icon: '⏰', title: '1시간 접속 보너스', desc: '오늘 1시간 이상 접속하면 추가로 1장을 드려요.' },
  { icon: '🐾', title: '클릭 뽑기',      desc: '100번 클릭할 때마다 뽑기권 1장! 하루 최대 10장까지!' },
  { icon: '✅', title: '출석체크',       desc: '하루 1회 출석체크로 5~15장을 받아요. 7일 개근 시 보너스 100장!' },
  { icon: '⚗️', title: '카드 합성',      desc: '같은 등급 카드 3장을 합성하면 새 카드가 나와요. 10% 확률로 상위 등급!' },
  { icon: '📚', title: '카드 수집',      desc: '카드를 수집북에 모아보세요. 도감에서 전체 카드를 확인할 수 있어요!' },
  { icon: '💾', title: '자동 저장',      desc: '수집한 카드는 클라우드에 자동으로 저장돼요.' },
];

export default function App() {
  const [gs, setGs]               = useState({ ...BASE_STATE });
  const [activeTab, setActiveTab] = useState('gacha');
  const [slideDir, setSlideDir]   = useState(null);
  const prevTabRef = useRef('gacha');
  const [showNotice, setShowNotice] = useState(false);
  const [showHelp, setShowHelp]     = useState(false);
  const [toast, setToast]           = useState(null);
  const [user, setUser]             = useState(null);
  const [authReady, setAuthReady]   = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput]         = useState('');
  const [showWelcomeNotice, setShowWelcomeNotice] = useState(false);
  const [musicOn, setMusicOn]   = useState(() => localStorage.getItem('music_on') === 'true');
  const homeAudioRef = useRef(null);
  const raidAudioRef = useRef(null);
  const toastTimer  = useRef(null);
  const saveTimer   = useRef(null);
  const isFirstLoad = useRef(true);

  // ── 레이드 탭 배경 테마 ──
  useEffect(() => {
    document.body.classList.toggle('raid-theme', activeTab === 'raid');
    return () => document.body.classList.remove('raid-theme');
  }, [activeTab]);

  // ── 첫 접속 공지 (하루 1회) ──
  useEffect(() => {
    if (!user) return;
    const today = new Date().toDateString();
    if (localStorage.getItem('welcome_notice_date') !== today) {
      setShowWelcomeNotice(true);
      localStorage.setItem('welcome_notice_date', today);
    }
  }, [user]);

  // ── 배경음악 초기화 ──
  useEffect(() => {
    const home = new Audio('/홈화면_노래.mp3');
    const raid = new Audio('/레이드_노래.mp3');
    home.loop = true; home.volume = 0.4;
    raid.loop = true; raid.volume = 0.4;
    homeAudioRef.current = home;
    raidAudioRef.current = raid;
    return () => { home.pause(); raid.pause(); };
  }, []);

  // ── 탭/뮤직 전환 ──
  useEffect(() => {
    const home = homeAudioRef.current;
    const raid = raidAudioRef.current;
    if (!home || !raid) return;
    if (!musicOn) { home.pause(); raid.pause(); return; }
    if (activeTab === 'raid') {
      home.pause();
      raid.play().catch(() => {});
    } else {
      raid.pause();
      home.play().catch(() => {});
    }
  }, [activeTab, musicOn]);

  // ── 공통: Firestore 유저 데이터 로드/생성 ──
  const loadUserData = async (uid, profileData = null) => {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const loaded = applyDailyReset({ ...BASE_STATE, ...snap.data() });
      setGs(loaded);
      if (!loaded.nickname) setShowNicknameModal(true);
    } else {
      const newState = {
        ...BASE_STATE,
        ...(profileData?.nickname ? { nickname: profileData.nickname } : {}),
      };
      await setDoc(doc(db, 'users', uid), newState);
      setGs(newState);
      if (!newState.nickname) setShowNicknameModal(true);
    }
    isFirstLoad.current = true;
  };

  // ── 인증 초기화: Kakao 우선, 없으면 Firebase ──
  useEffect(() => {
    let unsubFirebase = null;

    const initKakao = () => {
      const K = window.Kakao;
      if (K && !K.isInitialized()) K.init(KAKAO_JS_KEY);
    };

    const loginWithKakaoToken = async (token) => {
      const K = window.Kakao;
      K.Auth.setAccessToken(token);
      const userInfo = await new Promise((res, rej) =>
        K.API.request({ url: '/v2/user/me', success: res, fail: rej })
      );
      const uid         = `kakao_${userInfo.id}`;
      const displayName = userInfo.kakao_account?.profile?.nickname || '카카오유저';
      const photoURL    = userInfo.kakao_account?.profile?.thumbnail_image_url || null;
      await loadUserData(uid, { nickname: displayName });
      setUser({ uid, displayName, photoURL, isKakao: true });
      setAuthReady(true);
    };

    const init = async () => {
      initKakao();

      // 1) 인앱브라우저 implicit grant 리다이렉트 후 hash 토큰 처리
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const hashToken  = hashParams.get('access_token');
      if (hashToken && window.Kakao) {
        window.history.replaceState({}, '', window.location.pathname);
        localStorage.setItem('kakao_token', hashToken);
        try {
          await loginWithKakaoToken(hashToken);
          return;
        } catch (e) {
          localStorage.removeItem('kakao_token');
        }
      }

      // 2) 저장된 Kakao 토큰 복원 (자동 로그인)
      const storedToken = localStorage.getItem('kakao_token');
      if (storedToken && window.Kakao) {
        try {
          await loginWithKakaoToken(storedToken);
          return;
        } catch (e) {
          localStorage.removeItem('kakao_token');
        }
      }

      // 3) Firebase Google 인증
      unsubFirebase = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            await loadUserData(firebaseUser.uid);
          } catch (e) {
            console.error('Firestore 로드 실패:', e);
            setGs({ ...BASE_STATE });
          }
          setUser(firebaseUser);
        } else {
          setGs({ ...BASE_STATE });
          setShowNicknameModal(false);
          setUser(null);
        }
        setAuthReady(true);
        isFirstLoad.current = true;
      });
    };

    init();
    return () => { unsubFirebase?.(); };
  }, []);

  // ── Firestore 저장 (gs 변경 시, 1초 디바운스) ──
  useEffect(() => {
    if (!user) return;
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setDoc(doc(db, 'users', user.uid), gs).catch(console.error);
    }, 1000);
  }, [gs, user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        console.error('login error:', e);
      }
    }
  };

  const handleLogout = async () => {
    if (user?.isKakao) {
      localStorage.removeItem('kakao_token');
      if (window.Kakao) window.Kakao.Auth.setAccessToken(null);
      setUser(null);
      setGs({ ...BASE_STATE });
      setShowNicknameModal(false);
    } else {
      await signOut(auth);
    }
  };

  const handleKakaoLogin = () => {
    const K = window.Kakao;
    if (!K) return;
    // SDK가 초기화 안 됐으면 재시도
    if (!K.isInitialized()) K.init(KAKAO_JS_KEY);

    // 인앱브라우저 감지 (카카오톡·인스타·페북 등 popup 차단 환경)
    const ua    = navigator.userAgent || '';
    const inApp = /KAKAOTALK|Instagram|FBAV|FB_IAB|Line|naver|Snapchat/i.test(ua);

    if (inApp) {
      // implicit grant: 서버 없이 액세스 토큰을 hash로 직접 수신
      const params = new URLSearchParams({
        client_id:     KAKAO_JS_KEY,
        redirect_uri:  KAKAO_REDIRECT,
        response_type: 'token',
        scope:         'profile_nickname,profile_image',
      });
      window.location.href = `https://kauth.kakao.com/oauth/authorize?${params}`;
      return;
    }

    // 일반 브라우저: 팝업 방식
    K.Auth.login({
      scope: 'profile_nickname,profile_image',
      success: async (authObj) => {
        try {
          const token = authObj.access_token;
          localStorage.setItem('kakao_token', token);
          K.Auth.setAccessToken(token);
          const userInfo = await new Promise((res, rej) =>
            K.API.request({ url: '/v2/user/me', success: res, fail: rej })
          );
          const uid         = `kakao_${userInfo.id}`;
          const displayName = userInfo.kakao_account?.profile?.nickname || '카카오유저';
          const photoURL    = userInfo.kakao_account?.profile?.thumbnail_image_url || null;
          await loadUserData(uid, { nickname: displayName });
          setUser({ uid, displayName, photoURL, isKakao: true });
        } catch (e) {
          console.error('Kakao login error:', e);
        }
      },
      fail: (err) => {
        console.error('Kakao login failed:', err);
      },
    });
  };

  const handleSaveNickname = async () => {
    const trimmed = nicknameInput.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 10 || !user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { nickname: trimmed });
      setGs(prev => ({ ...prev, nickname: trimmed }));
      setShowNicknameModal(false);
    } catch (e) {
      console.error('닉네임 저장 실패:', e);
    }
  };

  // ── 접속 시간 타이머 (1분마다, 로그인 상태에서만) ──
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      setGs(prev => {
        const newMins = (prev.sessionMinutes || 0) + 1;
        if (newMins >= 60 && !prev.sessionBonus) {
          clearTimeout(toastTimer.current);
          setToast('1시간 접속 달성! 뽑기권 +1장! 🎉');
          toastTimer.current = setTimeout(() => setToast(null), 2500);
          return { ...prev, sessionMinutes: newMins, sessionBonus: true, tickets: prev.tickets + 1 };
        }
        return { ...prev, sessionMinutes: newMins };
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const handleTabChange = (newTab) => {
    const oldIdx = TAB_ORDER.indexOf(prevTabRef.current);
    const newIdx = TAB_ORDER.indexOf(newTab);
    setSlideDir(newIdx >= oldIdx ? 'right' : 'left');
    prevTabRef.current = newTab;
    setActiveTab(newTab);
  };

  const handleRefreshTickets = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) setGs(prev => ({ ...prev, tickets: snap.data()?.tickets ?? prev.tickets }));
    } catch (e) { console.error(e); }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url)
      .then(() => {
        clearTimeout(toastTimer.current);
        setToast('링크가 복사됐어요! 친구에게 공유해보세요 🎉');
        toastTimer.current = setTimeout(() => setToast(null), 2500);
      })
      .catch(() => window.prompt('링크를 복사해서 친구에게 보내주세요!', url));
  };

  const uniqueOwned = new Set(gs.ownedCards.map(c => c.id)).size;
  const sessionMins = Math.min(gs.sessionMinutes || 0, 60);
  const sessionPct  = (sessionMins / 60) * 100;
  const tabProps    = { gs, setGs };

  const TABS = {
    gacha: <GachaTab {...tabProps} />,
    synth: <SynthTab {...tabProps} />,
    shop:  <ShopTab {...tabProps} />,
    dex:   <DexTab gs={gs} />,
    board: <BoardTab gs={gs} user={user} />,
    trade: <TradeTab gs={gs} setGs={setGs} user={user} />,
    raid:  <RaidTab gs={gs} setGs={setGs} user={user} />,
  };

  // ── 로딩 화면 ──
  if (!authReady) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-logo">CREATURE WORLD</div>
        <div className="auth-loading-spinner" />
      </div>
    );
  }

  // ── 로그인 유도 화면 ──
  if (!user) {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms"   element={<TermsPage />} />
        <Route path="*" element={
          <div className="login-screen">
            <div className="login-card">
              <img src="/fox_sleep.png" alt="fox" className="login-mascot" />
              <div className="login-logo">CREATURE WORLD</div>
              <p className="login-desc">카드를 수집하고 도감을 완성해보세요!</p>
              <button className="login-google-btn" onClick={handleLogin}>
                <svg className="google-icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Google로 로그인
              </button>
              <button className="login-kakao-btn" onClick={handleKakaoLogin}>
                <svg className="kakao-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3C6.477 3 2 6.477 2 11c0 2.824 1.607 5.306 4.063 6.875l-.956 3.563a.375.375 0 0 0 .553.421L9.79 19.5A11.18 11.18 0 0 0 12 19.75C17.523 19.75 22 16.274 22 11S17.523 3 12 3z" fill="#3B1D1E"/>
                </svg>
                카카오로 로그인
              </button>
              <div className="login-footer-links">
                <a href="/privacy" className="login-policy-link">개인정보처리방침</a>
                <span>·</span>
                <a href="/terms" className="login-policy-link">이용약관</a>
              </div>
            </div>
          </div>
        } />
      </Routes>
    );
  }

  // ── 게임 화면 ──
  return (
    <Routes>
      <Route path="/" element={
        <>
        <div className="wrap">
          <Header
            onNotice={() => setShowNotice(true)}
            onHelp={() => setShowHelp(true)}
            onShare={handleShare}
            user={user}
            nickname={gs.nickname}
            onLogin={handleLogin}
            onLogout={handleLogout}
          />

          <div className="status-bar">
            <div className="status-card">
              <div className="status-label">보유 뽑기권</div>
              <div className="status-val">
                {gs.tickets}
                <button className="ticket-refresh-btn" onClick={handleRefreshTickets} title="새로고침">↻</button>
              </div>
              <div className="status-sub">장</div>
            </div>
            <div className="status-card">
              <div className="status-label">수집 카드</div>
              <div className="status-val">{uniqueOwned}</div>
              <div className="status-sub">/ 30 종류</div>
            </div>
            <div className="status-card">
              <div className="status-label">접속 시간</div>
              <div className="status-val">{sessionMins}</div>
              <div className="status-sub">분 (1시간 달성시 +1장)</div>
              <div className="prog-wrap">
                <div className="prog-track">
                  <div className="prog-fill" style={{ width: `${sessionPct}%` }} />
                </div>
              </div>
            </div>
            <div className="status-card">
              <div className="status-label">뽑기 확률</div>
              <div className="prob-mini">
                <div>N <span style={{ color:'#4a9eff', fontWeight:700 }}>70%</span> &nbsp; R <span style={{ color:'#4a9eff', fontWeight:700 }}>22%</span></div>
                <div>SR <span style={{ color:'#c084fc', fontWeight:700 }}>6.9%</span> &nbsp; UR <span style={{ color:'#fbbf24', fontWeight:700 }}>1%</span></div>
                <div>LEGEND <span style={{ color:'#ff6b6b', fontWeight:700 }}>0.1%</span></div>
              </div>
            </div>
          </div>

          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
          <div className="tab-slide-wrapper">
            <div key={activeTab} className={slideDir ? `tab-slide-${slideDir}` : undefined}>
              {TABS[activeTab]}
            </div>
          </div>
          <Footer />
        </div>

        {toast && <div className="cw-toast">{toast}</div>}
        <button
          className="music-toggle-btn"
          onClick={() => setMusicOn(prev => { const n = !prev; localStorage.setItem('music_on', n); return n; })}
          title={musicOn ? '음악 끄기' : '음악 켜기'}
        >{musicOn ? '🎵' : '🔇'}</button>

        {showNotice && (
          <div className="modal-overlay show" onClick={() => setShowNotice(false)}>
            <div className="modal modal-scroll" onClick={e => e.stopPropagation()}>
              <div className="modal-title">공지사항</div>
              <div className="notice-wrap">
                {NOTICES.map((n, i) => (
                  <div key={i} className="notice-item">
                    <div className="notice-version">{n.version}</div>
                    <div className="notice-date">{n.date}</div>
                    <div className="notice-list">
                      {n.items.map((item, j) => (
                        <div key={j} className="notice-row">{item}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button className="modal-close" onClick={() => setShowNotice(false)}>확인</button>
            </div>
          </div>
        )}

        {showHelp && (
          <div className="modal-overlay show" onClick={() => setShowHelp(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">게임 설명</div>
              {HELP_ITEMS.map((item, i) => (
                <div key={i} className="help-item">
                  <div className="help-icon">{item.icon}</div>
                  <div>
                    <div className="help-text-title">{item.title}</div>
                    <div className="help-text-desc">{item.desc}</div>
                  </div>
                </div>
              ))}
              <button className="modal-close" onClick={() => setShowHelp(false)}>시작하기</button>
            </div>
          </div>
        )}

        {showNicknameModal && (
          <div className="modal-overlay show">
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">닉네임 설정</div>
              <p className="nickname-modal-desc">
                게임에서 사용할 닉네임을 설정해주세요.<br />
                <strong>한 번 설정하면 변경할 수 없습니다.</strong>
              </p>
              <input
                className="nickname-input"
                type="text"
                placeholder="닉네임 입력 (2~10자)"
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value.slice(0, 10))}
                onKeyDown={e => e.key === 'Enter' && handleSaveNickname()}
                maxLength={10}
                autoFocus
              />
              <div className="nickname-char-count">{nicknameInput.trim().length} / 10</div>
              <button
                className="modal-close"
                onClick={handleSaveNickname}
                disabled={nicknameInput.trim().length < 2}
              >
                설정하기
              </button>
            </div>
          </div>
        )}
        {showWelcomeNotice && (
          <div className="modal-overlay show" onClick={() => setShowWelcomeNotice(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">🔔 공지사항</div>
              <div style={{ fontSize: '0.88rem', color: '#444', lineHeight: 1.8 }}>
                현재 <strong>테스트 서버 운영 중</strong>입니다.<br />
                서버 안정화 및 기능 개선 작업이 진행 중이며 일부 오류가 있을 수 있습니다.<br /><br />
                1인 개발로 수정 속도가 느릴 수 있으니 양해 부탁드립니다.<br />
                모바일 최적화도 지속적으로 개선 중입니다.
              </div>
              <button className="modal-close" onClick={() => setShowWelcomeNotice(false)}>확인</button>
            </div>
          </div>
        )}
        </>
      } />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms"   element={<TermsPage />} />
    </Routes>
  );
}
