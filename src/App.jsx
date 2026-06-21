import { useState, useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, GoogleAuthProvider, getRedirectResult,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase/config.js';
import Header from './components/Header.jsx';
import TabBar from './components/TabBar.jsx';
import Footer from './components/Footer.jsx';
import GachaTab from './components/tabs/GachaTab.jsx';
import SynthTab from './components/tabs/SynthTab.jsx';
import ShopTab from './components/tabs/ShopTab.jsx';
import DungeonTab from './components/tabs/DungeonTab.jsx';
import BoardTab from './components/tabs/BoardTab.jsx';
import RaidTab from './components/tabs/RaidTab.jsx';
import MailboxTab from './components/tabs/MailboxTab.jsx';
import RankingTab from './components/tabs/RankingTab.jsx';
import BagTab from './components/tabs/BagTab.jsx';
import TutorialOverlay from './components/TutorialOverlay.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';
import TermsPage from './pages/TermsPage.jsx';
import { CARDS, COLLECTIBLE_CARDS, COLLECTIBLE_IDS } from './data/cards.js';
import './App.css';

// uid 없는 카드에 uid 부여 + card.id 키 성장 데이터 → 인스턴스 uid로 1회 마이그레이션
let _migUid = 0;
const genMigUid = () => `m${++_migUid}_${Date.now()}`;

function migrateUserData(state) {
  const cards   = state.ownedCards   ? [...state.ownedCards]   : [];
  const growMap = state.cardBonusDmg ? { ...state.cardBonusDmg } : {};
  let changed = false;

  // 1) uid 없는 카드에 uid 발급
  for (const inst of cards) {
    if (!inst.uid) {
      inst.uid = genMigUid();
      changed = true;
    }
  }

  // 2) card.id 키(구버전)로 저장된 성장값 → best 인스턴스 uid로 이전
  const cardIdSet = new Set(CARDS.map(c => c.id));
  for (const [key, value] of Object.entries(growMap)) {
    if (!cardIdSet.has(key)) continue; // uid 형식 키는 건드리지 않음
    const instances = cards.filter(c => c.id === key);
    if (!instances.length) { delete growMap[key]; changed = true; continue; }
    // 강화 > 컨디션 순으로 best 선택
    const best = instances.reduce((a, b) =>
      (b.enhanceLevel || 0) !== (a.enhanceLevel || 0)
        ? ((b.enhanceLevel || 0) > (a.enhanceLevel || 0) ? b : a)
        : ((b.condition || 1) > (a.condition || 1) ? b : a)
    );
    if (!growMap[best.uid]) growMap[best.uid] = value; // 이미 uid 데이터 있으면 덮지 않음
    delete growMap[key];
    changed = true;
  }

  if (!changed) return state;
  return { ...state, ownedCards: cards, cardBonusDmg: growMap };
}

const COLLECTIBLE_CARD_COUNT = COLLECTIBLE_CARDS.length;
const TAB_ORDER = ['gacha', 'synth', 'dungeon', 'bag', 'raid', 'shop', 'board', 'mailbox', 'ranking'];


export const BASE_STATE = {
  tickets: 5, ownedCards: [],
  attendDate: null, attendStreak: 0,
  dailyBonusDate: null,
  clickCount: 0, clickRound: 0, clickDone: false, clickDate: null,
  testEventDate: null,
  sessionMinutes: 0, sessionBonus: false, sessionDate: null,
  raidCard: null,
  claimedRaids: {},
  claimedMails: {},
  nickname: null,
  referredBy: null,
  cardBonusDmg: {},
  dungeonAttempts: {},
  farmingAttempt: null,
  enhanceStones: {},
  lockedCardUids: [],
  awakeningFragments: {},
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
  if (s.dailyBonusDate !== today) {
    s.tickets = (s.tickets || 0) + 50;
    s.dailyBonusDate = today;
  }
  return s;
}

const NOTICES = [
  {
    version: 'v2.0', date: '2026.06.21',
    items: [
      '카드 보유 규칙 변경 — 캐릭터+등급 조합당 1장 보유, 중복 뽑기 시 레벨 진행도 누적 (100장 = 레벨 1 / 레벨당 데미지 +2%)',
      '각성 뽑기 시스템 추가 — 뽑기 탭 내 각성 뽑기 서브탭, 도토리 100장 소모, 0.01% 확률 각성카드 획득, 나머지는 캐릭터별 각성조각 10~50개 획득',
      '각성조각 10,000개 모으면 해당 캐릭터 각성카드 교환 가능',
      '공방 탭 개편 — 합성/교환 제거, 강화만 유지',
      '컨디션 재설정 추가 — 강화 화면에서 도토리 250장으로 컨디션 무작위 재설정',
      '거래소 탭 제거',
      '기존 중복 카드 정리 보상 — 중복 카드 수만큼 도토리 우편 발송 완료',
    ],
  },
  {
    version: 'v1.5', date: '2026.06.03',
    items: [
      '성장 던전 오픈 — 등급별 보스 처치 시 성장석 획득, 가방에서 카드에 사용하면 데미지 영구 +1 (하루 3회)',
      '파밍 던전 오픈 — 카드 배치 후 10분 자동 전투, 도토리 획득 (하루 1회)',
      '서부 시리즈 SR 6종 추가 (상점 전용 뽑기)',
      '거래소 삽니다 탭 추가',
    ],
  },
  {
    version: 'v1.4', date: '2026.06.01',
    items: [
      '랭킹 탭 추가',
      '교환 탭 추가',
      '로그인 안정성 개선',
      '강화 비용 UI 정리',
    ],
  },
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
  { icon: '', title: '매일 도토리',    desc: '매일 처음 접속하면 도토리 50장을 자동으로 드려요!' },
  { icon: '', title: '1시간 접속 보너스', desc: '오늘 1시간 이상 접속하면 추가로 30장을 드려요.' },
  { icon: '', title: '클릭 뽑기',      desc: '100번 클릭할 때마다 도토리 1장! 하루 최대 10장까지!' },
  { icon: '', title: '출석체크',       desc: '하루 1회 출석체크로 5~15장을 받아요. 7일 개근 시 보너스 100장!' },
  { icon: '', title: '카드 합성',      desc: '같은 등급 카드 3장을 합성하면 새 카드가 나와요. 10% 확률로 상위 등급!' },
  { icon: '', title: '카드 수집',      desc: '카드를 수집북에 모아보세요. 도감에서 전체 카드를 확인할 수 있어요!' },
  { icon: '', title: '자동 저장',      desc: '수집한 카드는 클라우드에 자동으로 저장돼요.' },
];

export default function App() {
  const [gs, setGs]               = useState({ ...BASE_STATE });
  const [activeTab, setActiveTab] = useState('gacha');
  const [slideDir, setSlideDir]   = useState(null);
  const prevTabRef = useRef('gacha');
  const [showNotice, setShowNotice]           = useState(false);
  const [showHelp, setShowHelp]               = useState(false);
  const [showBonusInfo, setShowBonusInfo]     = useState(false);
  const [showUpdateNotice, setShowUpdateNotice] = useState(false);
  const [toast, setToast]           = useState(null);
  const [user, setUser]             = useState(null);
  const [authReady, setAuthReady]   = useState(false);
  const [moreOpen, setMoreOpen]                   = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput]         = useState('');
  const [nicknameError, setNicknameError]         = useState('');
  const [nicknameChecking, setNicknameChecking]   = useState(false);
  const [showTutorial, setShowTutorial]           = useState(false);
  const isNewUserRef = useRef(false);
  const [showInviteModal, setShowInviteModal]     = useState(false);
  const [inviteCopied, setInviteCopied]           = useState(false);
  const [isGuest, setIsGuest]                     = useState(false);
  const [referrerInput, setReferrerInput]         = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return decodeURIComponent(p.get('ref') || '');
  });
  const [showWelcomeNotice, setShowWelcomeNotice] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [mailboxDocs, setMailboxDocs] = useState([]);
  const [musicOn, setMusicOn]   = useState(() => localStorage.getItem('music_on') !== 'false');
  const homeAudioRef    = useRef(null);
  const raidAudioRef    = useRef(null);
  const growthAudioRef  = useRef(null);
  // 오디오 제어용 ref (이벤트 핸들러에서 동기 접근 — state 업데이트 지연과 무관)
  const musicOnRef      = useRef(musicOn);
  const activeTabRef    = useRef('gacha');
  const dungeonSubRef   = useRef('growth');
  const interactedRef   = useRef(false);
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

  // ── 카드 시스템 개편 공지 (1회) ──
  useEffect(() => {
    if (!user) return;
    if (!localStorage.getItem('updateNoticeV2_confirmed')) {
      setShowUpdateNotice(true);
    }
  }, [user]);

  // ── 오디오 헬퍼: 전체 정지 후 현재 탭 트랙만 재생 (이벤트 핸들러에서 직접 호출) ──
  const applyAudio = (tab, sub) => {
    const home   = homeAudioRef.current;
    const raid   = raidAudioRef.current;
    const growth = growthAudioRef.current;
    if (!home || !raid || !growth) return;
    home.pause(); raid.pause(); growth.pause();
    if (!interactedRef.current || !musicOnRef.current) return;
    if (tab === 'raid')         { raid.play().catch(() => {}); }
    else if (tab === 'dungeon') { growth.play().catch(() => {}); }
    else                        { home.play().catch(() => {}); }
  };

  // ── 던전 서브탭 변경 핸들러 ──
  const handleDungeonSubTabChange = (newSub) => {
    dungeonSubRef.current = newSub;
    applyAudio(activeTabRef.current, newSub);
  };

  // ── 오디오 초기화 ──
  useEffect(() => {
    const home   = new Audio('/홈화면_노래.mp3');
    const raid   = new Audio('/레이드_노래.mp3');
    const growth = new Audio('/성장던전노래.mp3');
    [home, raid, growth].forEach(a => { a.loop = true; a.volume = 0.4; });
    homeAudioRef.current    = home;
    raidAudioRef.current    = raid;
    growthAudioRef.current  = growth;

    const onFirstInteraction = () => {
      interactedRef.current = true;
      applyAudio(activeTabRef.current, dungeonSubRef.current);
    };
    document.addEventListener('click',      onFirstInteraction, { once: true });
    document.addEventListener('touchstart', onFirstInteraction, { once: true, passive: true });

    return () => {
      home.pause(); raid.pause(); growth.pause();
      document.removeEventListener('click',      onFirstInteraction);
      document.removeEventListener('touchstart', onFirstInteraction);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 공통: Firestore 유저 데이터 로드/생성 ──
  const loadUserData = async (uid, profileData = null) => {
    const today = new Date().toDateString();
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const rawData = snap.data();
      const gotDailyBonus = rawData.dailyBonusDate !== today;
      const merged   = applyDailyReset({ ...BASE_STATE, ...rawData });
      const migrated = migrateUserData(merged);
      const loaded   = migrated;
      // 마이그레이션 발생 시 즉시 Firestore 반영 (다음 로드부터 불필요)
      if (migrated !== merged) {
        updateDoc(doc(db, 'users', uid), {
          ownedCards:   migrated.ownedCards,
          cardBonusDmg: migrated.cardBonusDmg,
        }).catch(console.error);
      }
      setGs(loaded);

      // raidCard 유효성 체크 — 채널이 없거나 active가 아니면 즉시 해제
      if (loaded.raidCard?.raidId && loaded.raidCard?.channelId) {
        getDoc(doc(db, 'raids', loaded.raidCard.raidId, 'channels', loaded.raidCard.channelId))
          .then(chSnap => {
            if (!chSnap.exists() || chSnap.data().status !== 'active') {
              updateDoc(doc(db, 'users', uid), { raidCard: null }).catch(console.error);
              setGs(prev => ({ ...prev, raidCard: null }));
            }
          })
          .catch(console.error);
      }

      // dailyBonusDate를 즉시 Firestore에 기록 (첫 로드 저장 스킵 우회)
      if (gotDailyBonus) {
        updateDoc(doc(db, 'users', uid), { dailyBonusDate: today, tickets: loaded.tickets }).catch(console.error);
        clearTimeout(toastTimer.current);
        setToast('매일 접속 보너스! 도토리 +50장!');
        toastTimer.current = setTimeout(() => setToast(null), 2500);
      }
      if (!loaded.nickname) setShowNicknameModal(true);
      else if (!rawData.tutorialCompleted) setShowTutorial(true);
    } else {
      const newState = {
        ...BASE_STATE,
        tickets: BASE_STATE.tickets + 50, // 신규 유저도 첫날 보너스 50장
        dailyBonusDate: today,
        ...(profileData?.nickname ? { nickname: profileData.nickname } : {}),
      };
      await setDoc(doc(db, 'users', uid), newState);
      setGs(newState);
      isNewUserRef.current = true;
      if (!newState.nickname) setShowNicknameModal(true);
      else setShowTutorial(true);
    }
    isFirstLoad.current = true;
  };

  // ── 인증 초기화 ──
  useEffect(() => {
    getRedirectResult(auth).catch(() => {});

    const unsubFirebase = onAuthStateChanged(auth, async (firebaseUser) => {
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

    return () => { unsubFirebase(); };
  }, []);

  // ── Firestore 저장 (gs 변경 시, 1초 디바운스) ──
  // setDoc 전체 덮어쓰기 대신 updateDoc 사용 → 관리자 직접 수정 데이터 보호
  useEffect(() => {
    if (!user) {
      clearTimeout(saveTimer.current);
      return;
    }
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateDoc(doc(db, 'users', user.uid), gs)
        .catch(() => setDoc(doc(db, 'users', user.uid), gs).catch(console.error));
    }, 1000);
  }, [gs, user]);

  const handleLogin = async () => {
    setLoginError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        return;
      }
      // 팝업이 차단되거나 브라우저가 세션 스토리지 공유를 막는 경우(Safari, Brave 등)
      // → 리다이렉트 방식으로 자동 전환
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/missing-initial-state') {
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr) {
          console.error('redirect login error:', redirectErr);
          setLoginError('Google 로그인에 실패했습니다. Chrome 브라우저에서 다시 시도해주세요.');
        }
        return;
      }
      console.error('login error:', e);
      setLoginError('Google 로그인에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };


  const handleSaveNickname = async () => {
    const trimmed  = nicknameInput.trim();
    const referrer = referrerInput.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 10 || !user) return;
    setNicknameError('');
    setNicknameChecking(true);
    try {
      // 중복 닉네임 확인
      const dupSnap = await getDocs(query(collection(db, 'users'), where('nickname', '==', trimmed)));
      if (!dupSnap.empty) {
        setNicknameError('이미 존재하는 닉네임입니다.');
        setNicknameChecking(false);
        return;
      }
      await updateDoc(doc(db, 'users', user.uid), { nickname: trimmed });
      setGs(prev => ({ ...prev, nickname: trimmed }));
      setShowNicknameModal(false);
      if (isNewUserRef.current || !gs.tutorialCompleted) { isNewUserRef.current = false; setShowTutorial(true); }

      // ── 추천인 처리 (최초 가입 시, 자기 자신 제외) ──
      if (referrer && referrer !== trimmed && !gs.referredBy) {
        const q = query(collection(db, 'users'), where('nickname', '==', referrer));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const referrerUid = snap.docs[0].id;
          const now = serverTimestamp();

          // 신규 유저 우편 (500장)
          await addDoc(collection(db, 'mailbox'), {
            title: '친구 초대 보상',
            message: `${referrer} 님의 초대로 가입하셨습니다! 도토리 500장을 드립니다.`,
            targetUid: user.uid,
            reward: { type: 'tickets', amount: 500 },
            createdAt: now,
          });

          // 추천인 우편 (100장)
          await addDoc(collection(db, 'mailbox'), {
            title: '친구 초대 보상',
            message: `${trimmed} 님이 초대로 가입했습니다! 도토리 100장을 드립니다.`,
            targetUid: referrerUid,
            reward: { type: 'tickets', amount: 100 },
            createdAt: now,
          });

          // 추천인 기록 저장 (중복 방지)
          await updateDoc(doc(db, 'users', user.uid), { referredBy: referrer });
          setGs(prev => ({ ...prev, referredBy: referrer }));
        }
      }
    } catch (e) {
      console.error('닉네임 저장 실패:', e);
      setNicknameError('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setNicknameChecking(false);
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
          setToast('1시간 접속 달성! 도토리 +30장!');
          toastTimer.current = setTimeout(() => setToast(null), 2500);
          return { ...prev, sessionMinutes: newMins, sessionBonus: true, tickets: prev.tickets + 30 };
        }
        return { ...prev, sessionMinutes: newMins };
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // ── 우편함 구독 ──
  useEffect(() => {
    if (!user) { setMailboxDocs([]); return; }
    const q = query(collection(db, 'mailbox'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q,
      snap => setMailboxDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('mailbox snapshot:', err),
    );
    return unsub;
  }, [user]);

  const GUEST_BLOCKED = new Set(['raid', 'board', 'mailbox', 'dungeon']);

  const handleTabChange = (newTab) => {
    if (isGuest && GUEST_BLOCKED.has(newTab)) {
      clearTimeout(toastTimer.current);
      setToast('로그인이 필요합니다');
      toastTimer.current = setTimeout(() => setToast(null), 2000);
      setMoreOpen(false);
      return;
    }
    const oldIdx = TAB_ORDER.indexOf(prevTabRef.current);
    const newIdx = TAB_ORDER.indexOf(newTab);
    setSlideDir(newIdx >= oldIdx ? 'right' : 'left');
    prevTabRef.current  = newTab;
    activeTabRef.current = newTab;           // ref 즉시 동기화
    setActiveTab(newTab);
    applyAudio(newTab, dungeonSubRef.current); // 음악 즉시 전환
    setMoreOpen(false);
  };

  const handleRefreshTickets = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) setGs(prev => ({ ...prev, tickets: snap.data()?.tickets ?? prev.tickets }));
    } catch (e) { console.error(e); }
  };

  const getInviteUrl = () => {
    const base = window.location.origin + window.location.pathname;
    return gs.nickname ? `${base}?ref=${encodeURIComponent(gs.nickname)}` : base;
  };

  const handleCopyInviteLink = () => {
    const url = getInviteUrl();
    navigator.clipboard.writeText(url)
      .then(() => {
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2000);
      })
      .catch(() => window.prompt('링크를 복사해서 친구에게 보내주세요!', url));
  };

  const handleShare = () => {
    setInviteCopied(false);
    setShowInviteModal(true);
  };

  const uniqueOwned = new Set(gs.ownedCards.map(c => c.id).filter(id => COLLECTIBLE_IDS.has(id))).size;
  const sessionMins = Math.min(gs.sessionMinutes || 0, 60);
  const sessionPct  = (sessionMins / 60) * 100;
  const tabProps    = { gs, setGs };

  const hasUnreadMail = mailboxDocs.some(m =>
    (!m.targetUid || m.targetUid === user?.uid) && !(gs.claimedMails?.[m.id]),
  );

  const TABS = {
    gacha:   <GachaTab {...tabProps} isGuest={isGuest} />,
    synth:   <SynthTab {...tabProps} isGuest={isGuest} />,
    dungeon: <DungeonTab gs={gs} setGs={setGs} user={user} isGuest={isGuest} onSubTabChange={handleDungeonSubTabChange} />,
    shop:    <ShopTab {...tabProps} />,
    board:   <BoardTab gs={gs} user={user} />,
    raid:    <RaidTab gs={gs} setGs={setGs} user={user} />,
    mailbox: <MailboxTab gs={gs} setGs={setGs} user={user} />,
    ranking: <RankingTab />,
    bag:     <BagTab gs={gs} setGs={setGs} />,
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
  const ua = navigator.userAgent;
  const isKakaoInApp    = /KAKAOTALK/i.test(ua);
  const isSamsungBrowser = /SamsungBrowser/i.test(ua);

  const openInChrome = () => {
    const url = window.location.href;
    window.location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
  };

  if (!user && !isGuest) {
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
              {isKakaoInApp && (
                <div className="login-inapp-notice">
                  카카오톡 내에서는 Google 로그인이 원활하지 않을 수 있어요.<br />
                  우측 하단 <strong>···</strong> → <strong>다른 브라우저로 열기</strong>를 눌러주세요.
                </div>
              )}
              {isSamsungBrowser && (
                <div className="login-inapp-notice" style={{borderColor:'#1a73e8', background:'#e8f0fe'}}>
                  삼성 인터넷에서는 Google 로그인 시 Gmail이 열리는 문제가 있어요.<br />
                  <strong>Chrome 브라우저</strong>로 접속하시면 정상 로그인이 가능합니다.<br />
                  <button
                    onClick={openInChrome}
                    style={{marginTop:8, padding:'6px 14px', background:'#1a73e8', color:'white',
                      border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', fontSize:'0.85rem'}}>
                    Chrome으로 열기
                  </button>
                </div>
              )}
              <button className="login-google-btn" onClick={handleLogin}>
                <svg className="google-icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Google로 로그인
              </button>
              {loginError && (
                <div style={{ color: '#e53e3e', fontSize: '0.78rem', textAlign: 'center', marginBottom: 8, lineHeight: 1.5 }}>
                  {loginError}
                </div>
              )}
              <button className="login-guest-btn" onClick={() => setIsGuest(true)}>
                로그인 없이 둘러보기
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
            isGuest={isGuest}
            onExitGuest={() => setIsGuest(false)}
          />

          <div className="status-bar">
            <div className="status-card" data-tut="tickets">
              <div className="status-label">보유 도토리</div>
              <div className="status-val">
                {gs.tickets}
                <button className="ticket-refresh-btn" onClick={handleRefreshTickets} title="새로고침">↻</button>
              </div>
              <div className="status-sub">장</div>
            </div>
            <div className="status-card" style={{ cursor: 'pointer' }} onClick={() => handleTabChange('gacha')}>
              <div className="status-label">도감</div>
              <div className="status-val">{uniqueOwned}</div>
              <div className="status-sub">/ {COLLECTIBLE_CARD_COUNT} 종류</div>
            </div>
            <div className="status-card">
              <div className="status-label">접속 시간</div>
              <div className="status-val">{sessionMins}</div>
              <div className="status-sub">분 (1시간 달성시 +30장)</div>
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

          <TabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            moreOpen={moreOpen}
            onMoreToggle={() => setMoreOpen(p => !p)}
            hasUnreadMail={hasUnreadMail}
          />
          <div className="tab-slide-wrapper">
            {/* DungeonTab 항상 마운트 유지 → 탭 이동해도 자동사냥 상태 유지 */}
            <div style={{display: activeTab === 'dungeon' ? 'block' : 'none'}}>
              <DungeonTab gs={gs} setGs={setGs} user={user} isGuest={isGuest} onSubTabChange={handleDungeonSubTabChange} />
            </div>
            {activeTab !== 'dungeon' && (
              <div key={activeTab} className={slideDir ? `tab-slide-${slideDir}` : undefined}>
                {TABS[activeTab]}
              </div>
            )}
          </div>
          <Footer />
        </div>

        {toast && <div className="cw-toast">{toast}</div>}
        <button
          className="music-toggle-btn"
          onClick={() => {
            const n = !musicOn;
            musicOnRef.current = n;
            localStorage.setItem('music_on', n);
            setMusicOn(n);
            applyAudio(activeTabRef.current, dungeonSubRef.current);
          }}
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
              <button className="tut-btn-cancel" style={{ width:'100%', marginBottom: 8 }} onClick={() => { setShowHelp(false); setShowTutorial(true); }}>
                튜토리얼 다시보기
              </button>
              <button className="modal-close" onClick={() => setShowHelp(false)}>닫기</button>
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
                className={`nickname-input${nicknameError ? ' nickname-input-error' : ''}`}
                type="text"
                placeholder="닉네임 입력 (2~10자)"
                value={nicknameInput}
                onChange={e => { setNicknameInput(e.target.value.slice(0, 10)); setNicknameError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSaveNickname()}
                maxLength={10}
                autoFocus
              />
              {nicknameError
                ? <div className="nickname-error">{nicknameError}</div>
                : <div className="nickname-char-count">{nicknameInput.trim().length} / 10</div>
              }

              <div className="referrer-section">
                <div className="referrer-label">추천인 닉네임 <span className="referrer-optional">(선택)</span></div>
                <input
                  className="nickname-input"
                  type="text"
                  placeholder="추천인 닉네임 입력"
                  value={referrerInput}
                  onChange={e => setReferrerInput(e.target.value.slice(0, 10))}
                  maxLength={10}
                />
                <div className="referrer-hint">입력 시 신규 가입 보상 도토리 500장 지급</div>
              </div>

              <button
                className="modal-close"
                onClick={handleSaveNickname}
                disabled={nicknameInput.trim().length < 2 || nicknameChecking}
              >
                {nicknameChecking ? '확인 중...' : '설정하기'}
              </button>
            </div>
          </div>
        )}
        {showInviteModal && (
          <div className="modal-overlay show" onClick={() => setShowInviteModal(false)}>
            <div className="modal invite-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">친구 초대 이벤트</div>

              <div className="invite-reward-grid">
                <div className="invite-reward-card invite-reward-me">
                  <div className="invite-reward-role">나 (추천인)</div>
                  <div className="invite-reward-amount">도토리 100장</div>
                  <div className="invite-reward-desc">친구가 가입하면 지급</div>
                </div>
                <div className="invite-reward-card invite-reward-friend">
                  <div className="invite-reward-role">초대받은 친구</div>
                  <div className="invite-reward-amount">도토리 500장</div>
                  <div className="invite-reward-desc">닉네임 설정 시 지급</div>
                </div>
              </div>

              <div className="invite-how">
                <div className="invite-how-title">이용 방법</div>
                <div className="invite-how-step"><span className="invite-step-num">1</span> 아래 내 초대 링크를 복사해요</div>
                <div className="invite-how-step"><span className="invite-step-num">2</span> 친구에게 링크를 공유해요</div>
                <div className="invite-how-step"><span className="invite-step-num">3</span> 친구가 링크로 접속 후 닉네임 설정 시 추천인란에 내 닉네임이 자동 입력돼요</div>
                <div className="invite-how-step"><span className="invite-step-num">4</span> 둘 다 우편함에서 보상 수령!</div>
              </div>

              <div className="invite-link-box">
                <div className="invite-link-label">내 초대 링크</div>
                <div className="invite-link-url">{getInviteUrl()}</div>
              </div>

              <button className={`invite-copy-btn${inviteCopied ? ' copied' : ''}`} onClick={handleCopyInviteLink}>
                {inviteCopied ? '복사 완료!' : '링크 복사하기'}
              </button>
              <button className="modal-close" style={{ marginTop: 8, background: 'white', color: 'var(--muted)', border: '1.5px solid #e5e7eb' }} onClick={() => setShowInviteModal(false)}>닫기</button>
            </div>
          </div>
        )}
        {showBonusInfo && (
          <div className="modal-overlay show" onClick={() => setShowBonusInfo(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">레이드 데미지 보너스</div>
              <div style={{ fontSize: '0.85rem', color: '#444', lineHeight: 1.9 }}>
                보유 카드 종류에 따라 <strong>레이드 전투</strong>에서 추가 데미지가 적용됩니다. (중복 카드는 1종으로 계산)
              </div>
              <div className="bonus-info-table">
                {[
                  ['N',    '0.5', '#888'],
                  ['R',    '1',   '#4a9eff'],
                  ['SR',   '2',   '#c084fc'],
                  ['UR',   '3',   '#fbbf24'],
                  ['LG',   '5',   '#ff6b6b'],
                  ['RAID', '10',  '#ffd700'],
                ].map(([grade, val, color]) => (
                  <div key={grade} className="bonus-info-row">
                    <span className="bonus-info-grade" style={{ color }}>{grade}</span>
                    <span className="bonus-info-desc">종류 1종 보유 시</span>
                    <span className="bonus-info-val">+{val} 데미지</span>
                  </div>
                ))}
              </div>
              {(() => {
                const MULT = { n:0.5, r:1, sr:2, ur:3, lg:5, raid:10 };
                let total = 0;
                const seen = new Set();
                for (const o of (gs.ownedCards || [])) {
                  if (seen.has(o.id)) continue;
                  seen.add(o.id);
                  const c = CARDS.find(x => x.id === o.id);
                  if (c) total += MULT[c.grade] || 0;
                }
                return (
                  <div className="bonus-info-current">
                    현재 데미지 보너스 : <strong>+{Math.floor(total)}</strong>
                  </div>
                );
              })()}
              <button className="modal-close" onClick={() => setShowBonusInfo(false)}>확인</button>
            </div>
          </div>
        )}
        {showUpdateNotice && (
          <div className="modal-overlay show" style={{ zIndex: 9999 }} onClick={() => { setShowUpdateNotice(false); localStorage.setItem('updateNoticeV2_confirmed', '1'); }}>
            <div className="modal modal-scroll" onClick={e => e.stopPropagation()}>
              <div className="modal-title" style={{ color:'#b347ff' }}>카드 시스템 대규모 개편 안내</div>
              <div style={{ fontSize:'0.85rem', color:'#333', lineHeight:1.9 }}>
                카드 보유 방식이 캐릭터당 1장으로 개편되었습니다.
                <ul style={{ paddingLeft:18, marginTop:8 }}>
                  <li>중복 카드는 더 이상 쌓이지 않고, 같은 카드를 100장 모으면 레벨업됩니다.</li>
                  <li>보유 중이던 중복 카드는 정리되었고, 그만큼 도토리를 우편함으로 보상 드렸습니다.</li>
                  <li>합성/교환/거래소 기능이 제거되었습니다.</li>
                  <li>새로운 <strong>각성 뽑기</strong>가 추가되었습니다. (뽑기 탭에서 확인)</li>
                  <li>카드 컨디션을 도토리로 재설정할 수 있는 기능이 추가되었습니다.</li>
                </ul>
                이용에 불편을 드려 죄송하며, 더 재미있는 크리쳐 월드를 위해 계속 노력하겠습니다.
              </div>
              <button className="modal-close" style={{ background:'#7c3aed', color:'#fff' }}
                onClick={() => { setShowUpdateNotice(false); localStorage.setItem('updateNoticeV2_confirmed', '1'); }}>
                확인
              </button>
            </div>
          </div>
        )}
        {showWelcomeNotice && (
          <div className="modal-overlay show" onClick={() => setShowWelcomeNotice(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">공지사항</div>
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
        {showTutorial && (
          <TutorialOverlay
            user={user}
            onComplete={() => {
              setShowTutorial(false);
              if (!gs.tutorialCompleted) {
                setGs(prev => ({ ...prev, tickets: prev.tickets + 50, tutorialCompleted: true }));
                clearTimeout(toastTimer.current);
                setToast('튜토리얼 완료! 도토리 +50장 지급!');
                toastTimer.current = setTimeout(() => setToast(null), 3000);
              }
            }}
            onSkip={() => setShowTutorial(false)}
          />
        )}
        </>
      } />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms"   element={<TermsPage />} />
    </Routes>
  );
}
