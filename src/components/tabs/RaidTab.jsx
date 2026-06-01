import { useState, useEffect, useRef } from 'react';
import {
  doc, setDoc, updateDoc, getDoc, addDoc, collection,
  onSnapshot, serverTimestamp, query, orderBy,
  increment, Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS } from '../../data/cards.js';

// ── 상수 ──
const BOSS_HP        = 50_000_000;
const MAX_PARTS      = 10;
const DURATION_MS    = 14 * 24 * 60 * 60 * 1000;
const TICK_MS        = 3_000;
const MIN_REWARD_DMG = 3_000_000;

const GRADE_LABEL = { n:'N', r:'R', sr:'SR', ur:'UR', lg:'LEGEND', raid:'RAID' };
const GRADE_COLOR = { n:'#888', r:'#4a9eff', sr:'#c084fc', ur:'#fbbf24', lg:'#ff6b6b', raid:'#ffd700' };
const GRADE_RANGE = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65] };
const GRADE_ORDER = { n:0, r:1, sr:2, ur:3, lg:4, raid:5 };
const BONUS_MULT  = { n:0.5, r:1, sr:2, ur:3, lg:5, raid:10 };

const BOSS_CONFIGS = [
  {
    id:         'cursed_doll_king',
    name:       '저주받은 인형의 왕',
    img:        '/boss_cursed_doll.png',
    raidCardId: 'raid_cursed_doll',
    hp:         BOSS_HP,
    maxParticipants: MAX_PARTS,
    durationMs: DURATION_MS,
    schedule:   '매주 월요일',
    desc:       '저주에 걸린 인형들의 왕. 14일간 도전 가능.',
    fixedEndDate: new Date('2026-06-07T14:59:00Z'), // 2026-06-07T23:59:00+09:00
    period:       '월요일 09:00 ~ 일요일 23:59',
  },
];

// ── 레이드 오픈 시간 체크 (KST 기준) ──
// 오픈: 월요일 09:00 ~ 일요일 23:59 KST
// 닫힘: 월요일 00:00 ~ 08:59 KST
function isRaidOpen() {
  const kst  = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC → KST
  const day  = kst.getUTCDay();   // 0=일, 1=월, ..., 6=토
  const hour = kst.getUTCHours();
  // 월요일 00:00~08:59만 닫힘
  return !(day === 1 && hour < 9);
}
function nextOpenKST() {
  // 다음 월요일 09:00 KST까지 남은 시간 문자열
  const kst      = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const msTilMon = ((1 - kst.getUTCDay() + 7) % 7) * 86_400_000;
  const open     = new Date(kst);
  open.setUTCDate(open.getUTCDate() + ((1 - kst.getUTCDay() + 7) % 7));
  open.setUTCHours(9, 0, 0, 0);
  const ms   = open - kst;
  const hrs  = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hrs}시간 ${mins}분 후 오픈`;
}

// ── 유틸 ──
function calcBonus(ownedCards) {
  let b = 0;
  for (const o of ownedCards) {
    const c = CARDS.find(x => x.id === o.id);
    if (c) b += BONUS_MULT[c.grade] || 0;
  }
  return Math.floor(b);
}
function calcDmg(grade, cond, bonus = 0, enhanceLevel = 0) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  const base = Math.floor(Math.random() * (mx - mn + 1)) + mn;
  return Math.floor((base + (cond || 1)) * (1 + enhanceLevel * 0.1)) + bonus;
}
function avgDmg(grade, cond, enhanceLevel = 0) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  return Math.floor((Math.floor((mn + mx) / 2) + (cond || 1)) * (1 + enhanceLevel * 0.1));
}
function dmgRange(grade, cond, bonus = 0, enhanceLevel = 0) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  const mult = 1 + enhanceLevel * 0.1;
  return `${Math.floor((mn + (cond||1)) * mult) + bonus}~${Math.floor((mx + (cond||1)) * mult) + bonus}`;
}
function fmtTimeLeft(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const ms = d - new Date();
  if (ms <= 0) return '종료됨';
  const days = Math.floor(ms / 86_400_000);
  const hrs  = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}일 ${hrs}시간 남음`;
  if (hrs > 0)  return `${hrs}시간 ${mins}분 남음`;
  return `${mins}분 남음`;
}
function fmtCountdown(ts) {
  if (!ts) return '';
  const d  = ts.toDate ? ts.toDate() : new Date(ts);
  const ms = d - new Date();
  if (ms <= 0) return '곧 시작!';
  const hrs  = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1_000);
  return `${hrs}시간 ${String(mins).padStart(2,'0')}분 ${String(secs).padStart(2,'0')}초`;
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

let _rUid = 0;
const genUid = () => `raid_${++_rUid}_${Date.now()}`;

const INITIAL_CHANNEL = (boss, channelNum) => ({
  channelNum,
  bossId:       boss.id,
  bossName:     boss.name,
  hp:           boss.hp,
  maxHp:        boss.hp,
  participants: {},
  status:       'active',
  startDate:    serverTimestamp(),
  endDate:      boss.fixedEndDate
    ? Timestamp.fromDate(boss.fixedEndDate)
    : Timestamp.fromDate(new Date(Date.now() + boss.durationMs)),
});

// ══════════════════════════════════════════════
// 1. 보스 목록 화면
// ══════════════════════════════════════════════
function BossListScreen({ gs, user, onEnter }) {
  const [bossChannels, setBossChannels] = useState({});
  const [entering, setEntering] = useState({});
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    const unsubs = BOSS_CONFIGS.map(boss => {
      const q = query(collection(db, 'raids', boss.id, 'channels'), orderBy('channelNum'));
      return onSnapshot(q, snap => {
        const channels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setBossChannels(prev => ({ ...prev, [boss.id]: channels }));
      }, err => console.error('boss channels snapshot:', err));
    });
    return () => unsubs.forEach(u => u());
  }, []);

  const getBossStatus = (bossId) => {
    if (!isRaidOpen()) return 'waiting';
    if (!(bossId in bossChannels)) return 'loading'; // snapshot 아직 미수신
    const chs  = bossChannels[bossId];
    const live = chs.filter(c => c.status !== 'waiting'); // 이전 주 waiting 채널 무시
    if (!live.length) return 'active'; // 채널 없음 → 새 채널 생성 가능
    if (live.some(c => c.status === 'active'))   return 'active';
    if (live.some(c => c.status === 'defeated')) return 'defeated';
    return 'expired';
  };

  const handleBossClick = async (boss) => {
    if (entering[boss.id]) return;

    // KST 시간 기반 접속 가능 여부 체크 (월요일 00:00~08:59 차단)
    if (!isRaidOpen()) {
      showToast(`월요일 오전 9시부터 입장 가능합니다 (${nextOpenKST()})`);
      return;
    }

    // 이미 이 보스에 참여 중이면 그 채널로 바로 입장 (채널 존재 확인)
    const myBossId    = gs?.raidCard?.raidId;
    const myChannelId = gs?.raidCard?.channelId;
    if (myBossId === boss.id && myChannelId) {
      const channelStillExists = (bossChannels[boss.id] || []).some(c => c.id === myChannelId);
      if (channelStillExists) {
        onEnter(boss.id, myChannelId);
        return;
      }
      // 채널이 사라짐 (리셋됨) → 새 채널로 입장
    }

    setEntering(prev => ({ ...prev, [boss.id]: true }));
    try {
      const channels = bossChannels[boss.id] || [];

      // 빈 채널 찾기 (active, 자리 있음)
      const available = channels.find(c =>
        c.status === 'active' && Object.keys(c.participants || {}).length < MAX_PARTS,
      );
      if (available) {
        onEnter(boss.id, available.id);
        return;
      }

      // 모두 가득 참 or 채널 없음 → 새 채널 자동 생성
      const maxNum = channels.reduce((m, c) => Math.max(m, c.channelNum || 0), 0);
      const nextNum = maxNum + 1;
      const nextId  = `ch_${nextNum}`;
      await setDoc(
        doc(db, 'raids', boss.id, 'channels', nextId),
        INITIAL_CHANNEL(boss, nextNum),
      );
      onEnter(boss.id, nextId);
    } catch (e) {
      console.error('enter boss error:', e);
    } finally {
      setEntering(prev => ({ ...prev, [boss.id]: false }));
    }
  };

  const myBossId = gs?.raidCard?.raidId;

  return (
    <div className="raid-boss-select-screen">
      {toast && <div className="cw-toast">{toast}</div>}
      <div className="raid-boss-select-title">레이드 보스</div>
      <div className="raid-boss-card-row">
        {BOSS_CONFIGS.map(boss => {
          const status      = getBossStatus(boss.id);
          const channels    = bossChannels[boss.id] || [];
          const activeCount = channels.filter(c => c.status === 'active').length;
          const isMyBoss    = myBossId === boss.id;
          const isEntering  = !!entering[boss.id];
          return (
            <div
              key={boss.id}
              className={`raid-boss-select-card${isMyBoss ? ' my-boss' : ''}${isEntering ? ' entering' : ''}`}
              onClick={() => handleBossClick(boss)}
            >
              <div className="raid-boss-select-img-wrap">
                <img src={boss.img} alt={boss.name} className="raid-boss-select-img" />
                <div className="raid-boss-select-img-vignette" />
                {isEntering && (
                  <div className="raid-boss-entering-overlay">입장 중...</div>
                )}
              </div>
              <div className="raid-boss-select-info">
                <div className="raid-boss-select-name">{boss.name}</div>
                <div className="raid-boss-select-schedule">{boss.schedule}</div>
                {boss.period && <div className="raid-boss-period">{boss.period}</div>}
                <div className={`raid-status-badge raid-status-${status}`}>
                  {status === 'active'   ? '진행 중'  :
                   status === 'waiting'  ? '대기 중'  :
                   status === 'defeated' ? '처치 완료' :
                   status === 'loading'  ? '로딩 중'  : '종료됨'}
                </div>
                {activeCount > 0 && (
                  <div className="raid-boss-select-channels">{activeCount}개 채널 진행 중</div>
                )}
                {isMyBoss && <div className="raid-boss-my-badge">내 레이드 참여 중</div>}
              </div>
              <div className="raid-boss-select-enter">
                {isEntering ? '...' : isMyBoss ? '내 채널 →' : '입장 →'}
              </div>
            </div>
          );
        })}

        {/* 출시 예정 카드 */}
        {[0, 1].map(i => (
          <div key={`soon_${i}`} className="raid-boss-coming-card">
            <div className="raid-boss-coming-inner">
              <div className="raid-boss-coming-logo">CREATURE<br/>WORLD</div>
              <div className="raid-boss-coming-text">출시 예정</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// 2. 채널 선택 화면
// ══════════════════════════════════════════════
function ChannelListScreen({ bossId, gs, user, onBack, onEnter }) {
  const [channels,  setChannels]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [toast,     setToast]     = useState(null);
  const toastRef = useRef(null);

  const bossConfig = BOSS_CONFIGS.find(b => b.id === bossId);
  const myBossId   = gs?.raidCard?.raidId;
  const myChannelId = myBossId === bossId ? gs?.raidCard?.channelId : null;

  useEffect(() => {
    const q = query(collection(db, 'raids', bossId, 'channels'), orderBy('channelNum'));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChannels(data);
      setLoading(false);
    }, err => {
      console.error('channels snapshot:', err);
      setLoading(false);
    });
    return unsub;
  }, [bossId]);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  const createAndEnter = async () => {
    if (!bossConfig || creating) return;
    setCreating(true);
    const maxNum  = channels.reduce((m, c) => Math.max(m, c.channelNum || 0), 0);
    const nextNum = maxNum + 1;
    const nextId  = `ch_${nextNum}`;
    try {
      await setDoc(
        doc(db, 'raids', bossId, 'channels', nextId),
        INITIAL_CHANNEL(bossConfig, nextNum),
      );
      onEnter(nextId);
    } catch (e) {
      console.error('channel create error:', e);
      showToast('채널 생성 중 오류가 발생했어요');
    }
    setCreating(false);
  };

  const handleEnterChannel = (ch) => {
    const partCount = Object.keys(ch.participants || {}).length;
    const isMyChannel = ch.id === myChannelId;
    if (!isMyChannel && partCount >= MAX_PARTS && ch.status === 'active') {
      showToast('이 채널은 가득 찼어요. 다른 채널을 선택하거나 새 채널을 생성하세요.');
      return;
    }
    onEnter(ch.id);
  };

  const allFull = channels.length > 0 &&
    channels.every(c => Object.keys(c.participants || {}).length >= MAX_PARTS || c.status !== 'active');

  return (
    <div className="raid-channel-screen">
      {toast && <div className="cw-toast">{toast}</div>}
      <button className="raid-back-btn" onClick={onBack}>← 보스 목록</button>
      <div className="raid-channel-screen-title">{bossConfig?.name}</div>
      <div className="raid-channel-screen-sub">채널을 선택해 레이드에 참여하세요</div>

      {loading ? (
        <div className="raid-loading">채널 불러오는 중...</div>
      ) : channels.length === 0 ? (
        <div className="raid-channel-empty">
          <div className="raid-channel-empty-text">아직 채널이 없어요!</div>
          <button className="raid-channel-create-btn" onClick={createAndEnter} disabled={creating}>
            {creating ? '생성 중...' : '채널 1 만들고 입장하기'}
          </button>
        </div>
      ) : (
        <>
          <div className="raid-channel-grid">
            {channels.map((ch, idx) => {
              const partCount   = Object.keys(ch.participants || {}).length;
              const isFull      = partCount >= MAX_PARTS;
              const isMyChannel = ch.id === myChannelId;
              const status      = ch.status || 'active';
              const num         = ch.channelNum || (idx + 1);
              return (
                <div
                  key={ch.id}
                  className={`raid-channel-card${isMyChannel ? ' my-channel' : ''}${isFull && !isMyChannel ? ' full' : ''}`}
                  onClick={() => handleEnterChannel(ch)}
                >
                  <div className="raid-channel-num">채널 {num}</div>
                  <div className={`raid-status-badge raid-status-${status}`} style={{ fontSize:'0.7rem', padding:'2px 8px' }}>
                    {status === 'active' ? '진행 중' : status === 'waiting' ? '대기 중' : status === 'defeated' ? '처치 완료' : '종료됨'}
                  </div>
                  <div className="raid-channel-parts">
                    <span className={isFull ? 'raid-channel-full-txt' : ''}>{partCount}</span>
                    <span className="raid-channel-max">/{MAX_PARTS}명</span>
                  </div>
                  {isMyChannel && <div className="raid-channel-my-tag">내 채널</div>}
                  <div className={`raid-channel-enter-btn${isFull && !isMyChannel ? ' disabled' : ''}`}>
                    {isMyChannel ? '내 채널 입장' : isFull ? '가득 참' : '입장'}
                  </div>
                </div>
              );
            })}
          </div>

          {allFull && !myChannelId && (
            <button className="raid-channel-create-btn" onClick={createAndEnter} disabled={creating}>
              {creating ? '생성 중...' : `새 채널 생성 (채널 ${channels.length + 1})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// 3. 레이드 전투 화면
// ══════════════════════════════════════════════
function BattleScreen({ bossId, channelId, gs, setGs, user, onBack }) {
  const [raid,          setRaid]          = useState(null);
  const [showPicker,    setShowPicker]    = useState(false);
  const [isChanging,    setIsChanging]    = useState(false);
  const [cardSort,      setCardSort]      = useState('dmg-desc');
  const [toast,         setToast]         = useState(null);
  const [timeLeft,      setTimeLeft]      = useState('');
  const [ticking,       setTicking]       = useState(false);
  const [shaking,       setShaking]       = useState(false);
  const [hpFlash,       setHpFlash]       = useState(false);
  const [dmgFloats,     setDmgFloats]     = useState([]);
  const [refreshing,    setRefreshing]    = useState(false);
  const [showRewardInfo,setShowRewardInfo]= useState(false);
  const [nicknames,     setNicknames]     = useState({});
  const [startCountdown,setStartCountdown]= useState('');
  const [rewardPhase,   setRewardPhase]   = useState(null);
  const [rewardResult,  setRewardResult]  = useState(null);

  const toastRef    = useRef(null);
  const tickRef     = useRef(null);
  const raidDataRef = useRef(null);

  const bossConfig  = BOSS_CONFIGS.find(b => b.id === bossId);
  const channelRef  = doc(db, 'raids', bossId, 'channels', channelId);
  const raidKey     = `${bossId}_${channelId}`;

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  };

  // ── 채널 onSnapshot 구독 ──
  useEffect(() => {
    let confirmed = false; // 첫 snap 수신 여부
    const unsub = onSnapshot(channelRef,
      async snap => {
        if (!snap.exists()) {
          if (!confirmed) {
            // 첫 응답에서 없음 → getDoc으로 한 번 더 확인 (캐시 오류 방어)
            try {
              const check = await getDoc(channelRef);
              if (check.exists()) { setRaid({ id: check.id, ...check.data() }); confirmed = true; return; }
            } catch { /* ignore */ }
          }
          // 채널이 실제로 없음 → Firestore + 로컬 동시 초기화
          if (user) updateDoc(doc(db, 'users', user.uid), { raidCard: null }).catch(console.error);
          setGs(prev => ({ ...prev, raidCard: null }));
          onBack();
          return;
        }
        confirmed = true;
        setRaid({ id: snap.id, ...snap.data() });
      },
      err => {
        // 네트워크 에러 → raidCard 건드리지 않고 목록으로만 복귀
        console.error('battle snapshot:', err);
        onBack();
      },
    );
    return unsub;
  }, [bossId, channelId]);

  useEffect(() => { raidDataRef.current = raid; }, [raid]);

  // ── 시간 카운트다운 ──
  useEffect(() => {
    if (raid?.endDate) setTimeLeft(fmtTimeLeft(raid.endDate));
    const id = setInterval(() => {
      if (raid?.endDate) setTimeLeft(fmtTimeLeft(raid.endDate));
    }, 30_000);
    return () => clearInterval(id);
  }, [raid?.endDate]);

  useEffect(() => {
    if (raid?.status !== 'waiting' || !raid?.startDate) { setStartCountdown(''); return; }
    const update = () => setStartCountdown(fmtCountdown(raid.startDate));
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [raid?.status, raid?.startDate]);

  // ── 만료 처리 ──
  useEffect(() => {
    if (!raid) return;
    if (raid.status === 'active' && raid.endDate) {
      const end = raid.endDate.toDate ? raid.endDate.toDate() : new Date(raid.endDate);
      if (end < new Date()) {
        updateDoc(channelRef, { status: 'expired' }).catch(console.error);
      }
    }
    if (raid.status === 'expired' &&
        gs?.raidCard?.raidId === bossId &&
        gs?.raidCard?.channelId === channelId) {
      if (user) updateDoc(doc(db, 'users', user.uid), { raidCard: null }).catch(console.error);
      setGs(prev => ({ ...prev, raidCard: null }));
    }
  }, [raid?.status]);

  const parts    = raid?.participants || {};
  const myPart   = user ? (parts[user.uid] || null) : null;
  const myDmg    = myPart?.damage || 0;
  const hasClaimed = !!(gs?.claimedRaids?.[raidKey] || myPart?.rewardClaimed);
  const canShowReward = raid?.status === 'defeated' && myDmg >= MIN_REWARD_DMG && !hasClaimed;

  // ── 자동 데미지 틱 ──
  useEffect(() => {
    clearInterval(tickRef.current);
    if (!myPart || raid?.status !== 'active' || !user) { setTicking(false); return; }
    setTicking(true);
    tickRef.current = setInterval(async () => {
      const dmg = calcDmg(myPart.cardGrade, myPart.cardCondition, myPart.cardBonus || 0, myPart.cardEnhanceLevel || 0);
      const fid = Date.now() + Math.random();
      setShaking(true); setHpFlash(true);
      setDmgFloats(prev => [...prev, { id: fid, value: dmg, x: 25 + Math.random() * 50, y: 28 + Math.random() * 28 }]);
      setTimeout(() => setShaking(false), 600);
      setTimeout(() => setHpFlash(false), 480);
      setTimeout(() => setDmgFloats(prev => prev.filter(f => f.id !== fid)), 1300);
      try {
        const cur = raidDataRef.current;
        if (!cur || cur.status !== 'active') return;
        const localHp = Math.max(0, cur.hp ?? 0);
        if (localHp <= 0) return;
        const actual = Math.min(dmg, localHp);
        await updateDoc(channelRef, {
          hp: increment(-actual),
          [`participants.${user.uid}.damage`]: increment(actual),
          ...(localHp - actual <= 0 ? { status: 'defeated' } : {}),
        });
      } catch (e) { console.error('tick error:', e); }
    }, TICK_MS);
    return () => { clearInterval(tickRef.current); setTicking(false); };
  }, [!!myPart, myPart?.cardGrade, myPart?.cardCondition, myPart?.cardBonus, myPart?.cardEnhanceLevel, raid?.status, user?.uid, bossId, channelId]);

  // ── 닉네임 조회 ──
  useEffect(() => {
    const uids = Object.keys(parts).filter(uid => !(uid in nicknames));
    if (!uids.length) return;
    Promise.all(uids.map(uid => getDoc(doc(db, 'users', uid)))).then(snaps => {
      const fetched = {};
      snaps.forEach(snap => { if (snap.exists()) fetched[snap.id] = snap.data().nickname || null; });
      setNicknames(prev => ({ ...prev, ...fetched }));
    }).catch(e => console.error('nickname fetch:', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(parts).sort().join(',')]);

  // ── 새로고침 ──
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const snap = await getDoc(channelRef);
      if (snap.exists()) setRaid({ id: snap.id, ...snap.data() });
    } catch (e) { console.error('refresh error:', e); }
    setRefreshing(false);
  };

  // ── 참여 / 교체 ──
  const handleJoin = async (card) => {
    if (!user) return;
    const partCount = Object.keys(parts).length;
    if (!isChanging && partCount >= MAX_PARTS) { showToast('참여 인원이 가득 찼어요!'); return; }
    const lockedUid = gs?.raidCard?.uid;
    const inst = (gs?.ownedCards || []).find(c => c.id === card.id && c.uid !== lockedUid);
    if (!inst) { showToast('카드를 찾을 수 없어요'); return; }
    const cardBonus        = calcBonus(gs?.ownedCards || []);
    const cardEnhanceLevel = inst.enhanceLevel || 0;
    const partData = {
      uid: user.uid, displayName: gs?.nickname || user.displayName, photoURL: null,
      cardUid: inst.uid, cardId: card.id, cardImg: card.img,
      cardName: card.name, cardGrade: card.grade, cardCondition: inst.condition,
      cardEnhanceLevel, cardBonus,
      damage:    isChanging ? (myPart?.damage || 0) : 0,
      joinedAt:  isChanging ? (myPart?.joinedAt || serverTimestamp()) : serverTimestamp(),
      rewardClaimed: myPart?.rewardClaimed || false,
    };
    try {
      const newRaidCard = { uid: inst.uid, cardId: card.id, raidId: bossId, channelId };
      // 채널 참여 + raidCard Firestore 동시 저장 (디바운스 의존 제거)
      await Promise.all([
        updateDoc(channelRef, { [`participants.${user.uid}`]: partData }),
        updateDoc(doc(db, 'users', user.uid), { raidCard: newRaidCard }),
      ]);
      setGs(prev => ({ ...prev, raidCard: newRaidCard }));
      setShowPicker(false); setIsChanging(false);
      showToast(isChanging ? `${card.name}으로 카드 교체!` : `${card.name} (${GRADE_LABEL[card.grade]})로 레이드 참여!`);
    } catch (e) { console.error('join error:', e); showToast('오류가 발생했어요'); }
  };

  // ── 보상 ──
  const handleStartReward = () => {
    const rcName   = raid?.rewardCard;
    const cardDef  = rcName
      ? CARDS.find(c => c.grade === 'raid' && c.name.replace(/\s+/g, '_') === rcName)
      : CARDS.find(c => c.id === bossConfig?.raidCardId);
    const raidCardId  = cardDef?.id;
    const alreadyHas  = raidCardId && (gs?.ownedCards || []).some(c => c.id === raidCardId);
    setRewardResult(
      alreadyHas || Math.random() >= 0.3
        ? { type: 'tickets', amount: randInt(200, 400) }
        : { type: 'card', cardId: raidCardId },
    );
    setRewardPhase('card-back');
  };
  const handleCardClick = () => {
    if (rewardPhase !== 'card-back') return;
    setRewardPhase('shaking');
    setTimeout(() => { setRewardPhase('flipping'); setTimeout(() => setRewardPhase('revealed'), 350); }, 2000);
  };
  const handleConfirmReward = async () => {
    if (!user || !rewardResult) return;
    try {
      // claimedRaids 업데이트 + raidCard 초기화
      await updateDoc(doc(db, 'users', user.uid), {
        [`claimedRaids.${raidKey}`]: true,
        raidCard: null,
      });

      // 우편함으로 보상 발송
      await addDoc(collection(db, 'mailbox'), {
        title: '레이드 토벌 보상',
        message: rewardResult.type === 'tickets'
          ? `${bossConfig?.name || '보스'} 토벌 성공! 뽑기권 ${rewardResult.amount}장을 드립니다.`
          : `${bossConfig?.name || '보스'} 토벌 성공! RAID 한정 카드를 드립니다.`,
        targetUid: user.uid,
        reward: rewardResult.type === 'tickets'
          ? { type: 'tickets', amount: rewardResult.amount }
          : { type: 'card', cardId: rewardResult.cardId, condition: 10 },
        createdAt: serverTimestamp(),
      });

      setGs(prev => ({
        ...prev,
        raidCard: null,
        claimedRaids: { ...(prev.claimedRaids || {}), [raidKey]: true },
      }));
      setRewardPhase(null); setRewardResult(null);
      showToast('보상이 우편함으로 전송됐습니다!');
    } catch (e) { console.error('reward error:', e); showToast('오류가 발생했어요. 잠시 후 다시 시도해주세요.'); }
  };

  if (!raid) return <div className="raid-loading">레이드 불러오는 중...</div>;

  const hp          = Math.max(0, raid.hp || 0);
  const maxHp       = bossConfig?.hp || BOSS_HP;
  const hpPct       = Math.min(100, (hp / maxHp) * 100);
  const hpColor     = hpPct > 50 ? '#4a9eff' : hpPct > 20 ? '#fbbf24' : '#ff4444';
  const sortedParts = Object.values(parts).sort((a, b) => (b.damage || 0) - (a.damage || 0));
  const partCount   = Object.keys(parts).length;
  const lockedUid   = gs?.raidCard?.uid;
  const availCards  = CARDS.filter(c =>
    (gs?.ownedCards || []).some(o => o.id === c.id && o.uid !== lockedUid),
  ).filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
  const raidCardDef = (() => {
    const rcName = raid?.rewardCard;
    if (rcName) return CARDS.find(c => c.grade === 'raid' && c.name.replace(/\s+/g, '_') === rcName) || null;
    return bossConfig ? CARDS.find(c => c.id === bossConfig.raidCardId) : null;
  })();

  return (
    <>
      {toast && <div className="cw-toast">{toast}</div>}
      <button className="raid-back-btn" onClick={onBack}>← 보스 목록</button>
      <div className="raid-channel-badge">채널 {raid.channelNum || channelId.replace('ch_','')}</div>
      {bossConfig?.period && (
        <div className="raid-period-banner">레이드 기간: {bossConfig.period}</div>
      )}

      {/* 보상 오버레이 */}
      {rewardPhase && (
        <div className="raid-reward-overlay">
          <div className="raid-reward-flip-area">
            {(rewardPhase === 'card-back' || rewardPhase === 'shaking') && (
              <>
                <div className="raid-reward-overlay-hint">
                  {rewardPhase === 'card-back' ? '카드를 클릭해서 열어보세요!' : '두근두근...'}
                </div>
                <div className={`raid-reward-card-back${rewardPhase === 'shaking' ? ' raid-reward-card-shaking' : ''}`} onClick={handleCardClick}>
                  <div className="raid-reward-card-shine" />
                  <div className="raid-reward-card-label">RAID</div>
                </div>
              </>
            )}
            {rewardPhase === 'flipping' && (
              <div className="raid-reward-card-back raid-reward-card-scale-out">
                <div className="raid-reward-card-shine" />
                <div className="raid-reward-card-label">RAID</div>
              </div>
            )}
            {rewardPhase === 'revealed' && rewardResult && (
              <div className="raid-reward-revealed">
                <div className="raid-reward-result-title">
                  {rewardResult.type === 'card' ? 'RAID 한정 카드 획득!' : `뽑기권 ${rewardResult.amount}장!`}
                </div>
                {rewardResult.type === 'card' && raidCardDef ? (
                  <div className="raid-reward-result-card">
                    <img src={`/${raidCardDef.img}`} alt={raidCardDef.name} />
                    <div className="raid-reward-result-card-glow" />
                    <div className="raid-reward-grade-tag">RAID</div>
                  </div>
                ) : (
                  <div className="raid-reward-ticket-wrap">
                    <div className="raid-reward-ticket-icon"></div>
                    <div className="raid-reward-ticket-amount">{rewardResult.amount}</div>
                    <div className="raid-reward-ticket-label">장</div>
                  </div>
                )}
                <button className="raid-reward-confirm-btn" onClick={handleConfirmReward}>수령하기</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 보상 정보 모달 */}
      {showRewardInfo && (
        <div className="card-zoom-overlay" onClick={() => setShowRewardInfo(false)}>
          <div className="raid-reward-info-modal" onClick={e => e.stopPropagation()}>
            {raidCardDef && (
              <div className="raid-reward-info-card-wrap">
                <img src={`/${raidCardDef.img}`} alt={raidCardDef.name} className="raid-reward-info-card-img" />
                <div className="raid-reward-grade-tag">RAID</div>
              </div>
            )}
            <div className="raid-reward-info-body">
              <div className="raid-reward-info-title">클리어 보상 안내</div>
              <div className="raid-reward-info-row"><span>300만 데미지 이상 기여 시 수령 가능</span></div>
              <div className="raid-reward-info-row"><span>RAID 카드 미보유 → 30% 확률로 카드 획득</span></div>
              <div className="raid-reward-info-row"><span>해당 보스 RAID 카드 보유 시 → 뽑기권 200~400장 랜덤 지급</span></div>
              <div className="raid-reward-info-row"><span>레이드 도전 횟수는 무제한</span></div>
              <div className="raid-reward-info-row"><span>보상은 채널당 1회만 수령 가능</span></div>
            </div>
            <button className="zoom-close" onClick={() => setShowRewardInfo(false)}>닫기 ✕</button>
          </div>
        </div>
      )}

      {/* 보스 섹션 */}
      <div className="raid-boss-section">
        <div className="raid-boss-img-wrap">
          <img src={bossConfig?.img || '/boss_cursed_doll.png'} alt={bossConfig?.name}
            className={`raid-boss-img${shaking ? ' raid-boss-shaking' : ''}`} />
          <div className="raid-boss-vignette" />
          <div className="raid-boss-img-aurora" />
          {hpFlash && <div className="raid-boss-hit-flash" />}
          {dmgFloats.map(f => (
            <div key={f.id} className="raid-dmg-float" style={{ left:`${f.x}%`, top:`${f.y}%` }}>
              -{f.value}
            </div>
          ))}
        </div>
        <div className="raid-boss-info">
          <div className="raid-boss-name">{bossConfig?.name}</div>
          <div className={`raid-status-badge raid-status-${raid.status}`}>
            {raid.status === 'active' ? '진행 중' : raid.status === 'waiting' ? '대기 중' : raid.status === 'defeated' ? '처치 완료' : '종료됨'}
          </div>
          {timeLeft && raid.status === 'active' && <div className="raid-time-left">{timeLeft}</div>}
          {raid.status === 'waiting' && startCountdown && (
            <div className="raid-time-left raid-countdown-inline">레이드 시작까지 {startCountdown}</div>
          )}
          <div className="raid-hp-row">
            <span className="raid-hp-label-text">HP</span>
            <span className="raid-hp-num">{hp.toLocaleString()} / {maxHp.toLocaleString()}</span>
          </div>
          <div className="raid-hp-bar">
            <div className="raid-hp-fill" style={{ width:`${hpPct}%`, background:hpColor }} />
            {hpFlash && <div className="raid-hp-flash-overlay" />}
          </div>
          <div className="raid-meta-row">
            <div className="raid-meta">참여 <strong>{partCount}</strong> / {MAX_PARTS}명</div>
            <button className="raid-clear-reward-btn" onClick={() => setShowRewardInfo(true)}>클리어 보상</button>
          </div>
        </div>
      </div>

      {/* 내 참여 상태 */}
      {myPart ? (
        <div className="raid-my-card">
          <div className="raid-my-label">
            내 참여 카드
            {ticking && raid.status === 'active' && <span className="raid-tick-dot" title="자동 공격 중" />}
            {raid.status === 'active' && (
              <button className="raid-change-card-btn" onClick={() => { setIsChanging(true); setShowPicker(true); }}>카드 교체</button>
            )}
          </div>
          <div className="raid-my-row">
            <div className={`raid-my-img grade-${myPart.cardGrade}${ticking && raid.status === 'active' ? ' raid-card-pulse' : ''}`}>
              <img src={`/${myPart.cardImg}`} alt={myPart.cardName} />
              <div className="raid-lock-tag">레이드</div>
            </div>
            <div className="raid-my-details">
              <div className="raid-my-name">
                {myPart.cardName}
                <span className="raid-my-grade" style={{ color: GRADE_COLOR[myPart.cardGrade] }}>&nbsp;{GRADE_LABEL[myPart.cardGrade]}</span>
              </div>
              <div className="raid-my-stat">내 데미지 <strong>{myDmg.toLocaleString()}</strong></div>
              <div className="raid-my-tick">
                {dmgRange(myPart.cardGrade, myPart.cardCondition, myPart.cardBonus||0, myPart.cardEnhanceLevel||0)}dmg / 3초
                {(myPart.cardEnhanceLevel||0) > 0 && <span className="raid-enhance-tag">+{myPart.cardEnhanceLevel}</span>}
              </div>
              {(myPart.cardBonus||0) > 0 && <div className="raid-my-bonus">보너스 데미지 +{myPart.cardBonus}</div>}
              {myDmg >= MIN_REWARD_DMG
                ? <div className="raid-reward-qualify">✓ 보상 수령 가능!</div>
                : <div className="raid-reward-progress">보상까지 {Math.max(0, MIN_REWARD_DMG - myDmg).toLocaleString()} 데미지</div>}
            </div>
          </div>
          {raid.status === 'defeated' && (
            hasClaimed
              ? <button className="raid-reward-btn raid-reward-btn-done" disabled>보상 수령 완료</button>
              : myDmg >= MIN_REWARD_DMG
                ? <button className="raid-reward-btn" onClick={handleStartReward}>보상 받기</button>
                : <button className="raid-reward-btn raid-reward-btn-disabled" disabled>보상 수령 불가 (데미지 부족)</button>
          )}
          {raid.status === 'active' && <div className="raid-lock-notice">참여 카드는 보스 처치까지 잠금됩니다</div>}
        </div>
      ) : (
        <div className="raid-join-area">
          {raid.status !== 'active' ? (
            <div className="raid-over-msg">
              {raid.status === 'defeated' ? '보스가 이미 처치되었습니다!'
               : raid.status === 'waiting' ? (<>레이드 시작 대기 중입니다.{startCountdown && <div className="raid-countdown-msg">레이드 시작까지<br/>{startCountdown}</div>}</>)
               : '레이드 기간이 종료되었습니다.'}
            </div>
          ) : partCount >= MAX_PARTS ? (
            <div className="raid-over-msg">참여 인원이 가득 찼어요! ({partCount}/{MAX_PARTS})</div>
          ) : (
            <>
              <button className="raid-join-btn" onClick={() => { setIsChanging(false); setShowPicker(p => !p); }}>레이드 참여하기</button>
              <div className="raid-join-sub">카드 1장을 선택해 보스에게 도전하세요</div>
              {calcBonus(gs?.ownedCards || []) > 0 && (
                <div className="raid-bonus-info">보너스 데미지 +{calcBonus(gs?.ownedCards || [])}</div>
              )}
            </>
          )}
        </div>
      )}

      {/* 카드 픽커 */}
      {showPicker && raid.status === 'active' && (
        <div className="raid-picker">
          <div className="raid-picker-header">
            <div className="raid-picker-title">{isChanging ? '교체할 카드를 선택하세요' : '참여할 카드를 선택하세요'}</div>
            <div className="raid-sort-btns">
              {[['dmg-desc','강한순'],['dmg-asc','약한순'],['grade','등급순']].map(([val, label]) => (
                <button key={val} className={`raid-sort-btn${cardSort===val?' active':''}`} onClick={() => setCardSort(val)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="raid-picker-hint" style={isChanging ? { color:'#fbbf24' } : {}}>
            {isChanging ? '교체 시 누적 데미지는 유지됩니다' : '선택한 카드는 보스 처치 전까지 잠금 · 300만 데미지 이상 시 보상'}
          </div>
          {availCards.length === 0 ? (
            <p className="raid-picker-empty">보유한 카드가 없어요!</p>
          ) : (
            <div className="raid-picker-grid">
              {[...availCards].sort((a, b) => {
                const iA = (gs?.ownedCards||[]).find(o => o.id===a.id && o.uid!==lockedUid);
                const iB = (gs?.ownedCards||[]).find(o => o.id===b.id && o.uid!==lockedUid);
                const dA = avgDmg(a.grade, iA?.condition||1, iA?.enhanceLevel||0);
                const dB = avgDmg(b.grade, iB?.condition||1, iB?.enhanceLevel||0);
                if (cardSort==='dmg-desc') return dB-dA;
                if (cardSort==='dmg-asc')  return dA-dB;
                return GRADE_ORDER[b.grade]-GRADE_ORDER[a.grade];
              }).map(card => {
                const inst = (gs?.ownedCards||[]).find(o => o.id===card.id && o.uid!==lockedUid);
                return (
                  <div key={card.id} className={`raid-picker-card grade-${card.grade}${(inst?.enhanceLevel||0)>=8?' enhance-aurora-card':''}`} onClick={() => handleJoin(card)}>
                    <img src={`/${card.img}`} alt={card.name} />
                    {(inst?.enhanceLevel||0) > 0 && <div className="enhance-badge-card">+{inst.enhanceLevel}</div>}
                    <div className="raid-picker-overlay">
                      <div className="raid-picker-name">{card.name}</div>
                      <div className="raid-picker-grade" style={{ color:GRADE_COLOR[card.grade] }}>{GRADE_LABEL[card.grade]}</div>
                      <div className="raid-picker-dmg">{dmgRange(card.grade, inst?.condition||1, 0, inst?.enhanceLevel||0)}dmg/틱</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button className="raid-picker-close-btn" onClick={() => { setShowPicker(false); setIsChanging(false); }}>닫기</button>
        </div>
      )}

      {/* 참여자 현황 */}
      <div className="raid-participants">
        <div className="raid-section-header">
          <div className="raid-section-title">참여자 현황 ({partCount}/{MAX_PARTS})</div>
          <button className={`raid-refresh-btn${refreshing?' refreshing':''}`} onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? '...' : '↻ 새로고침'}
          </button>
        </div>
        {sortedParts.length === 0 ? (
          <div className="raid-no-parts">아직 참여자가 없어요! 첫 번째로 참여해보세요.</div>
        ) : (
          <div className="raid-parts-grid">
            {sortedParts.map((p, i) => {
              const isMe = p.uid === user?.uid;
              const barPct = Math.min(100, ((p.damage||0)/MIN_REWARD_DMG)*100);
              const qualified = (p.damage||0) >= MIN_REWARD_DMG;
              return (
                <div key={p.uid} className={`raid-part-item${isMe?' raid-part-me':''}`}>
                  <div className="raid-part-rank-badge">#{i+1}</div>
                  <div className={`raid-part-card-img grade-${p.cardGrade}${isMe&&ticking&&raid.status==='active'?' raid-card-pulse':''}`}>
                    <img src={`/${p.cardImg}`} alt={p.cardName} />
                    {qualified && <div className="raid-part-qualify-mark">✓</div>}
                  </div>
                  <div className="raid-part-meta">
                    <div className="raid-part-player-row">
                      <span className="raid-part-name">{nicknames[p.uid]||p.displayName}{isMe?' (나)':''}</span>
                    </div>
                    <div className="raid-part-grade-row">
                      <span className="raid-part-grade" style={{ color:GRADE_COLOR[p.cardGrade] }}>{GRADE_LABEL[p.cardGrade]}</span>
                      <span className="raid-part-dps">{dmgRange(p.cardGrade, p.cardCondition, p.cardBonus||0, p.cardEnhanceLevel||0)}dmg/틱</span>
                    </div>
                    <div className="raid-part-dmg-row"><span className="raid-part-dmg">{(p.damage||0).toLocaleString()}</span></div>
                    <div className="raid-part-bar-wrap"><div className="raid-part-bar" style={{ width:`${barPct}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="raid-reward-hint">✓ = 300만 데미지 달성 시 보상 수령 가능</div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════
// 메인 RaidTab
// ══════════════════════════════════════════════
export default function RaidTab({ gs, setGs, user }) {
  const [screen,    setScreen]    = useState('boss-list');
  const [bossId,    setBossId]    = useState(null);
  const [channelId, setChannelId] = useState(null);

  // 기존 raidCard가 있으면 채널로 자동 진입
  useEffect(() => {
    const rc = gs?.raidCard;
    // 구버전 형식(current_boss) 마이그레이션: raidCard 초기화
    if (rc?.raidId === 'current_boss') {
      setGs(prev => ({ ...prev, raidCard: null }));
      return;
    }
    if (rc?.raidId && rc?.channelId) {
      const exists = BOSS_CONFIGS.some(b => b.id === rc.raidId);
      if (exists) {
        setBossId(rc.raidId);
        setChannelId(rc.channelId);
        setScreen('battle');
      }
    }
  // 마운트 시 1회만
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToBossList = () => { setScreen('boss-list'); setBossId(null); setChannelId(null); };
  const enterBattle  = (bid, cid) => { setBossId(bid); setChannelId(cid); setScreen('battle'); };

  return (
    <div className="raid-wrap">
      <div className="raid-atmosphere" />
      {screen === 'boss-list' && (
        <BossListScreen gs={gs} user={user} onEnter={enterBattle} />
      )}
      {screen === 'battle' && bossId && channelId && (
        <BattleScreen
          bossId={bossId}
          channelId={channelId}
          gs={gs}
          setGs={setGs}
          user={user}
          onBack={goToBossList}
        />
      )}
    </div>
  );
}
