import { useState, useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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

export const BASE_STATE = {
  tickets: 5, ownedCards: [],
  attendDate: null, attendStreak: 0,
  clickCount: 0, clickRound: 0, clickDone: false, clickDate: null,
  testEventDate: null,
  sessionMinutes: 0, sessionBonus: false, sessionDate: null,
  raidCard: null,
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
  const [showNotice, setShowNotice] = useState(false);
  const [showHelp, setShowHelp]     = useState(false);
  const [toast, setToast]           = useState(null);
  const [user, setUser]             = useState(null);
  const [authReady, setAuthReady]   = useState(false);
  const toastTimer  = useRef(null);
  const saveTimer   = useRef(null);
  const isFirstLoad = useRef(true);

  // ── 레이드 탭 배경 테마 ──
  useEffect(() => {
    document.body.classList.toggle('raid-theme', activeTab === 'raid');
    return () => document.body.classList.remove('raid-theme');
  }, [activeTab]);

  // ── 인증 상태 감지 + Firestore 로드 ──
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            setGs(applyDailyReset({ ...BASE_STATE, ...snap.data() }));
          } else {
            const newState = { ...BASE_STATE };
            await setDoc(doc(db, 'users', firebaseUser.uid), newState);
            setGs(newState);
          }
        } catch (e) {
          console.error('Firestore 로드 실패:', e);
          setGs({ ...BASE_STATE });
        }
      } else {
        setGs({ ...BASE_STATE });
      }
      setUser(firebaseUser);
      setAuthReady(true);
      isFirstLoad.current = true;
    });
    return unsubscribe;
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
      if (e.code !== 'auth/popup-closed-by-user') console.error(e);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
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
              <p className="login-desc">카드를 수집하고 도감을 완성해보세요!<br />Google 계정으로 간편하게 시작할 수 있어요.</p>
              <button className="login-google-btn" onClick={handleLogin}>
                <svg className="google-icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Google로 로그인
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
            onLogin={handleLogin}
            onLogout={handleLogout}
          />

          <div className="status-bar">
            <div className="status-card">
              <div className="status-label">보유 뽑기권</div>
              <div className="status-val">{gs.tickets}</div>
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

          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
          {TABS[activeTab]}
          <Footer />
        </div>

        {toast && <div className="cw-toast">{toast}</div>}

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
        </>
      } />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms"   element={<TermsPage />} />
    </Routes>
  );
}
