import { useState, useEffect, useRef } from 'react';
import {
  doc, setDoc, updateDoc, getDoc,
  onSnapshot, serverTimestamp,
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
const GRADE_RANGE = { n:[1,10], r:[21,30], sr:[31,40], ur:[41,50], lg:[91,100], raid:[101,120] };
const GRADE_ORDER = { n:0, r:1, sr:2, ur:3, lg:4, raid:5 };
const BONUS_MULT  = { n: 0.5, r: 1, sr: 2, ur: 3, lg: 5, raid: 10 };

function calcBonus(ownedCards) {
  let bonus = 0;
  for (const owned of ownedCards) {
    const card = CARDS.find(x => x.id === owned.id);
    if (card) bonus += BONUS_MULT[card.grade] || 0;
  }
  return Math.floor(bonus);
}

// ── 보스 설정 (보스 추가 시 여기에 항목 추가) ──
const BOSS_CONFIGS = [
  {
    id:              'current_boss',
    name:            '저주받은 인형의 왕',
    img:             '/boss_cursed_doll.png',
    raidCardId:      'raid_cursed_doll',
    hp:              BOSS_HP,
    maxParticipants: MAX_PARTS,
    durationMs:      DURATION_MS,
    desc:            '저주에 걸린 인형들의 왕. 14일간 도전 가능.',
  },
];

// ── 유틸 ──
function calcDmg(grade, cond, bonus = 0) {
  const [min, max] = GRADE_RANGE[grade] || [1, 10];
  return Math.floor(Math.random() * (max - min + 1)) + min + (cond || 1) + bonus;
}
function avgDmg(grade, cond) {
  const [min, max] = GRADE_RANGE[grade] || [1, 10];
  return Math.floor((min + max) / 2) + (cond || 1);
}
function dmgRange(grade, cond, bonus = 0) {
  const [min, max] = GRADE_RANGE[grade] || [1, 10];
  return `${min + (cond || 1) + bonus}~${max + (cond || 1) + bonus}`;
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
  if (hrs  > 0) return `${hrs}시간 ${mins}분 남음`;
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

const INITIAL_RAID = (boss) => ({
  bossId:          boss.id,
  bossName:        boss.name,
  hp:              boss.hp,
  maxHp:           boss.hp,
  maxParticipants: boss.maxParticipants,
  startDate:       serverTimestamp(),
  endDate:         Timestamp.fromDate(new Date(Date.now() + boss.durationMs)),
  participants:    {},
  status:          'active',
});

// ── 보스 목록 컴포넌트 (보스 여럿일 때 표시) ──
function BossList({ bosses, raidDataMap, onSelect }) {
  return (
    <div className="raid-boss-list">
      <div className="raid-boss-list-title">레이드 보스 목록</div>
      {bosses.map(boss => {
        const raid   = raidDataMap[boss.id];
        const hp     = Math.max(0, raid?.hp || 0);
        const hpPct  = Math.min(100, (hp / boss.hp) * 100);
        const status = raid?.status || 'loading';
        const hpColor = hpPct > 50 ? '#4a9eff' : hpPct > 20 ? '#fbbf24' : '#ff4444';
        return (
          <div key={boss.id} className="raid-boss-list-item" onClick={() => onSelect(boss.id)}>
            <img src={boss.img} alt={boss.name} className="raid-boss-list-img" />
            <div className="raid-boss-list-info">
              <div className="raid-boss-list-name">{boss.name}</div>
              <div className={`raid-status-badge raid-status-${status}`}>
                {status === 'active' ? '진행 중' : status === 'waiting' ? '대기 중' : status === 'defeated' ? '처치 완료' : '종료됨'}
              </div>
              {raid && (
                <>
                  <div className="raid-boss-list-hp-bar">
                    <div className="raid-boss-list-hp-fill" style={{ width: `${hpPct}%`, background: hpColor }} />
                  </div>
                  <div className="raid-boss-list-hp-text">
                    HP {hp.toLocaleString()} / {boss.hp.toLocaleString()}
                  </div>
                </>
              )}
            </div>
            <div className="raid-boss-list-enter">입장 →</div>
          </div>
        );
      })}
    </div>
  );
}

// ── 메인 컴포넌트 ──
export default function RaidTab({ gs, setGs, user }) {
  // 보스 1개면 자동 입장, 여럿이면 목록 표시
  const [selectedBossId, setSelectedBossId] = useState(
    BOSS_CONFIGS.length === 1 ? BOSS_CONFIGS[0].id : null,
  );
  const [raidDataMap, setRaidDataMap]     = useState({});
  const [showPicker, setShowPicker]       = useState(false);
  const [isChanging, setIsChanging]       = useState(false);
  const [cardSort, setCardSort]           = useState('dmg-desc');
  const [toast, setToast]                 = useState(null);
  const [timeLeft, setTimeLeft]           = useState('');
  const [ticking, setTicking]             = useState(false);
  const [shaking, setShaking]             = useState(false);
  const [hpFlash, setHpFlash]             = useState(false);
  const [dmgFloats, setDmgFloats]         = useState([]);
  const [refreshing, setRefreshing]       = useState(false);
  const [showRewardInfo, setShowRewardInfo] = useState(false);
  const [nicknames, setNicknames]         = useState({});
  const [startCountdown, setStartCountdown] = useState('');

  // 보상 플로우: null → 'card-back' → 'shaking' → 'flipping' → 'revealed'
  const [rewardPhase, setRewardPhase]   = useState(null);
  const [rewardResult, setRewardResult] = useState(null);

  const toastRef    = useRef(null);
  const tickRef     = useRef(null);
  const raidDataRef = useRef(null);

  const bossConfig = BOSS_CONFIGS.find(b => b.id === selectedBossId);
  const raid       = selectedBossId ? (raidDataMap[selectedBossId] ?? null) : null;

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  };

  // ── 모든 보스 문서 onSnapshot 구독 ──
  useEffect(() => {
    const unsubs = BOSS_CONFIGS.map(boss => {
      const raidRef = doc(db, 'raids', boss.id);
      getDoc(raidRef).then(snap => {
        if (!snap.exists()) {
          setDoc(raidRef, INITIAL_RAID(boss)).catch(e => console.error('raid init:', e));
        }
      }).catch(e => console.error('raid getDoc:', e));

      return onSnapshot(
        raidRef,
        snap => {
          const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
          setRaidDataMap(prev => ({ ...prev, [boss.id]: data }));
        },
        err => console.error('raid snapshot:', err),
      );
    });
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => { raidDataRef.current = raid; }, [raid]);

  // ── 남은 시간 카운트다운 (종료까지) ──
  useEffect(() => {
    if (raid?.endDate) setTimeLeft(fmtTimeLeft(raid.endDate));
    const id = setInterval(() => {
      if (raid?.endDate) setTimeLeft(fmtTimeLeft(raid.endDate));
    }, 30_000);
    return () => clearInterval(id);
  }, [raid?.endDate]);

  // ── 대기 카운트다운 (시작까지, 1초 간격) ──
  useEffect(() => {
    if (raid?.status !== 'waiting' || !raid?.startDate) {
      setStartCountdown('');
      return;
    }
    const update = () => setStartCountdown(fmtCountdown(raid.startDate));
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [raid?.status, raid?.startDate]);

  // ── 만료 자동 처리 + 만료 시 카드 잠금 해제 ──
  useEffect(() => {
    if (!raid || !selectedBossId) return;
    if (raid.status === 'active' && raid.endDate) {
      const end = raid.endDate.toDate ? raid.endDate.toDate() : new Date(raid.endDate);
      if (end < new Date()) {
        updateDoc(doc(db, 'raids', selectedBossId), { status: 'expired' }).catch(console.error);
      }
    }
    if (raid.status === 'expired' && gs?.raidCard?.raidId === selectedBossId) {
      setGs(prev => ({ ...prev, raidCard: null }));
    }
  }, [raid?.status, selectedBossId]);

  const parts      = raid?.participants || {};
  const myPart     = user ? (parts[user.uid] || null) : null;
  const myDmg      = myPart?.damage || 0;
  const hasClaimed = !!(gs?.claimedRaids?.[selectedBossId] || myPart?.rewardClaimed);
  const canShowReward = raid?.status === 'defeated' && myDmg >= MIN_REWARD_DMG && !hasClaimed;

  // ── 자동 데미지 틱 (3초마다) ──
  useEffect(() => {
    clearInterval(tickRef.current);
    if (!myPart || raid?.status !== 'active' || !user) { setTicking(false); return; }

    setTicking(true);
    tickRef.current = setInterval(async () => {
      const dmg     = calcDmg(myPart.cardGrade, myPart.cardCondition, myPart.cardBonus || 0);
      const floatId = Date.now() + Math.random();
      setShaking(true);
      setHpFlash(true);
      setDmgFloats(prev => [
        ...prev,
        { id: floatId, value: dmg, x: 25 + Math.random() * 50, y: 28 + Math.random() * 28 },
      ]);
      setTimeout(() => setShaking(false), 600);
      setTimeout(() => setHpFlash(false), 480);
      setTimeout(() => setDmgFloats(prev => prev.filter(f => f.id !== floatId)), 1300);

      try {
        const cur = raidDataRef.current;
        if (!cur || cur.status !== 'active') return;
        const localHp = Math.max(0, cur.hp ?? 0);
        if (localHp <= 0) return;
        const actual  = Math.min(dmg, localHp);
        await updateDoc(doc(db, 'raids', selectedBossId), {
          hp: increment(-actual),
          [`participants.${user.uid}.damage`]: increment(actual),
          ...(localHp - actual <= 0 ? { status: 'defeated' } : {}),
        });
      } catch (e) { console.error('tick error:', e); }
    }, TICK_MS);

    return () => { clearInterval(tickRef.current); setTicking(false); };
  }, [!!myPart, myPart?.cardGrade, myPart?.cardCondition, myPart?.cardBonus, raid?.status, user?.uid, selectedBossId]);

  // ── 참여자 uid로 Firestore users 닉네임 일괄 조회 ──
  useEffect(() => {
    const uids = Object.keys(parts).filter(uid => !(uid in nicknames));
    if (uids.length === 0) return;
    Promise.all(uids.map(uid => getDoc(doc(db, 'users', uid)))).then(snaps => {
      const fetched = {};
      snaps.forEach(snap => {
        if (snap.exists()) fetched[snap.id] = snap.data().nickname || null;
      });
      setNicknames(prev => ({ ...prev, ...fetched }));
    }).catch(e => console.error('nickname fetch:', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(parts).sort().join(',')]);

  // ── 수동 새로고침: getDoc으로 Firestore에서 직접 읽기 ──
  const handleRefresh = async () => {
    if (!selectedBossId || refreshing) return;
    setRefreshing(true);
    try {
      const raidRef = doc(db, 'raids', selectedBossId);
      const snap    = await getDoc(raidRef);
      if (snap.exists()) {
        const fresh = { id: snap.id, ...snap.data() };
        setRaidDataMap(prev => ({ ...prev, [selectedBossId]: fresh }));
      }
    } catch (e) {
      console.error('refresh error:', e);
    }
    setRefreshing(false);
  };

  // ── 참여 / 카드 교체 ──
  const handleJoin = async (card) => {
    if (!user) return;
    const partCount = Object.keys(parts).length;
    if (!isChanging && partCount >= (bossConfig?.maxParticipants || MAX_PARTS)) {
      showToast('참여 인원이 가득 찼어요!'); return;
    }
    const lockedUid = gs?.raidCard?.uid;
    const inst = (gs?.ownedCards || []).find(c => c.id === card.id && c.uid !== lockedUid);
    if (!inst) { showToast('카드를 찾을 수 없어요'); return; }

    const cardBonus = calcBonus(gs?.ownedCards || []);
    const partData = {
      uid:           user.uid,
      displayName:   gs?.nickname || user.displayName,
      photoURL:      null,
      cardUid:       inst.uid,
      cardId:        card.id,
      cardImg:       card.img,
      cardName:      card.name,
      cardGrade:     card.grade,
      cardCondition: inst.condition,
      cardBonus,
      damage:        isChanging ? (myPart?.damage || 0) : 0,
      joinedAt:      isChanging ? (myPart?.joinedAt || serverTimestamp()) : serverTimestamp(),
      rewardClaimed: myPart?.rewardClaimed || false,
    };

    try {
      await updateDoc(doc(db, 'raids', selectedBossId), {
        [`participants.${user.uid}`]: partData,
      });
      setGs(prev => ({
        ...prev,
        raidCard: { uid: inst.uid, cardId: card.id, raidId: selectedBossId },
      }));
      setShowPicker(false);
      setIsChanging(false);
      showToast(isChanging
        ? `${card.name}으로 카드 교체!`
        : `${card.name} (${GRADE_LABEL[card.grade]})로 레이드 참여!`,
      );
    } catch (e) {
      console.error('join error:', e);
      showToast('오류가 발생했어요');
    }
  };

  // ── 보상 시작: 결과를 미리 결정하고 카드 뒷면 표시 ──
  const handleStartReward = () => {
    // Firestore rewardCard 필드(이름_언더스코어) → 카드 id 매핑
    const rewardCardName = raid?.rewardCard; // e.g. '저주받은_인형의_왕'
    const raidCardDef = rewardCardName
      ? CARDS.find(c => c.grade === 'raid' && c.name.replace(/\s+/g, '_') === rewardCardName)
      : CARDS.find(c => c.id === bossConfig?.raidCardId);
    const raidCardId = raidCardDef?.id;
    const alreadyHas = raidCardId && (gs?.ownedCards || []).some(c => c.id === raidCardId);

    let result;
    if (alreadyHas) {
      result = { type: 'tickets', amount: randInt(200, 400) };
    } else if (Math.random() < 0.3) {
      result = { type: 'card', cardId: raidCardId };
    } else {
      result = { type: 'tickets', amount: randInt(200, 400) };
    }
    setRewardResult(result);
    setRewardPhase('card-back');
  };

  // ── 카드 클릭: 2초 흔들기 → 스케일 아웃 → 결과 표시 ──
  const handleCardClick = () => {
    if (rewardPhase !== 'card-back') return;
    setRewardPhase('shaking');
    setTimeout(() => {
      setRewardPhase('flipping');
      setTimeout(() => setRewardPhase('revealed'), 350);
    }, 2000);
  };

  // ── 보상 수령 확정 ──
  const handleConfirmReward = async () => {
    if (!user || !rewardResult || !selectedBossId) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        [`claimedRaids.${selectedBossId}`]: true,
      });
      setGs(prev => {
        const next = {
          ...prev,
          raidCard:     null,
          claimedRaids: { ...(prev.claimedRaids || {}), [selectedBossId]: true },
        };
        if (rewardResult.type === 'tickets') {
          next.tickets = prev.tickets + rewardResult.amount;
        } else {
          const raidCard = CARDS.find(c => c.id === rewardResult.cardId);
          if (raidCard) {
            next.ownedCards = [...prev.ownedCards, { uid: genUid(), id: rewardResult.cardId, condition: 10 }];
          }
        }
        return next;
      });
      setRewardPhase(null);
      setRewardResult(null);
      showToast(rewardResult.type === 'tickets'
        ? `뽑기권 ${rewardResult.amount}장 획득!`
        : 'RAID 한정 카드 획득!',
      );
    } catch (e) {
      console.error('reward error:', e);
      showToast('오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    }
  };

  // ── 보스 목록 화면 ──
  if (selectedBossId === null) {
    return (
      <div className="raid-wrap">
        <div className="raid-atmosphere" />
        <BossList bosses={BOSS_CONFIGS} raidDataMap={raidDataMap} onSelect={setSelectedBossId} />
      </div>
    );
  }

  // ── 로딩 ──
  if (!raid) return (
    <div className="raid-wrap">
      <div className="raid-atmosphere" />
      <div className="raid-loading">레이드 불러오는 중...</div>
    </div>
  );

  const hp          = Math.max(0, raid.hp || 0);
  const maxHp       = bossConfig?.hp || BOSS_HP;
  const hpPct       = Math.min(100, (hp / maxHp) * 100);
  const hpColor     = hpPct > 50 ? '#4a9eff' : hpPct > 20 ? '#fbbf24' : '#ff4444';
  const sortedParts = Object.values(parts).sort((a, b) => (b.damage || 0) - (a.damage || 0));
  const partCount   = Object.keys(parts).length;
  const maxParts    = bossConfig?.maxParticipants || MAX_PARTS;
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
    <div className="raid-wrap">
      <div className="raid-atmosphere" />
      {toast && <div className="cw-toast">{toast}</div>}

      {/* ── 보스 여럿일 때 뒤로가기 ── */}
      {BOSS_CONFIGS.length > 1 && (
        <button className="raid-back-btn" onClick={() => setSelectedBossId(null)}>← 보스 목록</button>
      )}

      {/* ── 보상 카드 플립 오버레이 ── */}
      {rewardPhase && (
        <div className="raid-reward-overlay">
          <div className="raid-reward-flip-area">
            {(rewardPhase === 'card-back' || rewardPhase === 'shaking') && (
              <>
                <div className="raid-reward-overlay-hint">
                  {rewardPhase === 'card-back' ? '카드를 클릭해서 열어보세요!' : '두근두근...'}
                </div>
                <div
                  className={`raid-reward-card-back${rewardPhase === 'shaking' ? ' raid-reward-card-shaking' : ''}`}
                  onClick={handleCardClick}
                >
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
                <button className="raid-reward-confirm-btn" onClick={handleConfirmReward}>
                  수령하기
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 보상 정보 모달 ── */}
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
              <div className="raid-reward-info-row"><span>보상은 보스 1마리당 1회만 수령 가능</span></div>
            </div>
            <button className="zoom-close" onClick={() => setShowRewardInfo(false)}>닫기 ✕</button>
          </div>
        </div>
      )}

      {/* ── 보스 섹션 ── */}
      <div className="raid-boss-section">
        <div className="raid-boss-img-wrap">
          <img
            src={bossConfig?.img || '/boss_cursed_doll.png'}
            alt={bossConfig?.name}
            className={`raid-boss-img${shaking ? ' raid-boss-shaking' : ''}`}
          />
          <div className="raid-boss-vignette" />
          <div className="raid-boss-img-aurora" />
          {hpFlash && <div className="raid-boss-hit-flash" />}
          {dmgFloats.map(f => (
            <div
              key={f.id}
              className="raid-dmg-float"
              style={{ left: `${f.x}%`, top: `${f.y}%` }}
            >
              -{f.value}
            </div>
          ))}
        </div>

        <div className="raid-boss-info">
          <div className="raid-boss-name">{bossConfig?.name}</div>
          <div className={`raid-status-badge raid-status-${raid.status}`}>
            {raid.status === 'active' ? '진행 중' : raid.status === 'waiting' ? '대기 중' : raid.status === 'defeated' ? '처치 완료' : '종료됨'}
          </div>
          {timeLeft && raid.status === 'active' && (
            <div className="raid-time-left">{timeLeft}</div>
          )}
          {raid.status === 'waiting' && startCountdown && (
            <div className="raid-time-left raid-countdown-inline">레이드 시작까지 {startCountdown}</div>
          )}
          <div className="raid-hp-row">
            <span className="raid-hp-label-text">HP</span>
            <span className="raid-hp-num">{hp.toLocaleString()} / {maxHp.toLocaleString()}</span>
          </div>
          <div className="raid-hp-bar">
            <div className="raid-hp-fill" style={{ width: `${hpPct}%`, background: hpColor }} />
            {hpFlash && <div className="raid-hp-flash-overlay" />}
          </div>
          <div className="raid-meta-row">
            <div className="raid-meta">참여 <strong>{partCount}</strong> / {maxParts}명</div>
            <button className="raid-clear-reward-btn" onClick={() => setShowRewardInfo(true)}>
              클리어 보상
            </button>
          </div>
        </div>
      </div>

      {/* ── 내 참여 상태 ── */}
      {myPart ? (
        <div className="raid-my-card">
          <div className="raid-my-label">
            내 참여 카드
            {ticking && raid.status === 'active' && (
              <span className="raid-tick-dot" title="자동 공격 중" />
            )}
            {raid.status === 'active' && (
              <button
                className="raid-change-card-btn"
                onClick={() => { setIsChanging(true); setShowPicker(true); }}
              >
                카드 교체
              </button>
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
                <span className="raid-my-grade" style={{ color: GRADE_COLOR[myPart.cardGrade] }}>
                  &nbsp;{GRADE_LABEL[myPart.cardGrade]}
                </span>
              </div>
              <div className="raid-my-stat">
                내 데미지 <strong>{myDmg.toLocaleString()}</strong>
              </div>
              <div className="raid-my-tick">
                {dmgRange(myPart.cardGrade, myPart.cardCondition, myPart.cardBonus || 0)}dmg / 3초
              </div>
              {(myPart.cardBonus || 0) > 0 && (
                <div className="raid-my-bonus">카드 보너스 +{myPart.cardBonus}dmg/틱</div>
              )}
              {myDmg >= MIN_REWARD_DMG
                ? <div className="raid-reward-qualify">✓ 보상 수령 가능!</div>
                : <div className="raid-reward-progress">
                    보상까지 {Math.max(0, MIN_REWARD_DMG - myDmg).toLocaleString()} 데미지
                  </div>
              }
            </div>
          </div>

          {raid.status === 'defeated' && (
            hasClaimed ? (
              <button className="raid-reward-btn raid-reward-btn-done" disabled>
                보상 수령 완료
              </button>
            ) : myDmg >= MIN_REWARD_DMG ? (
              <button className="raid-reward-btn" onClick={handleStartReward}>
                보상 받기
              </button>
            ) : (
              <button className="raid-reward-btn raid-reward-btn-disabled" disabled>
                보상 수령 불가 (데미지 부족)
              </button>
            )
          )}
          {raid.status === 'active' && (
            <div className="raid-lock-notice">참여 카드는 보스 처치까지 잠금됩니다</div>
          )}
        </div>
      ) : (
        <div className="raid-join-area">
          {raid.status !== 'active' ? (
            <div className="raid-over-msg">
              {raid.status === 'defeated' ? '보스가 이미 처치되었습니다!'
               : raid.status === 'waiting' ? (
                <>
                  레이드 시작 대기 중입니다.
                  {startCountdown && (
                    <div className="raid-countdown-msg">레이드 시작까지<br />{startCountdown}</div>
                  )}
                </>
               ) : '레이드 기간이 종료되었습니다.'}
            </div>
          ) : partCount >= maxParts ? (
            <div className="raid-over-msg">참여 인원이 가득 찼어요! ({partCount}/{maxParts})</div>
          ) : (
            <>
              <button
                className="raid-join-btn"
                onClick={() => { setIsChanging(false); setShowPicker(p => !p); }}
              >
                레이드 참여하기
              </button>
              <div className="raid-join-sub">카드 1장을 선택해 보스에게 도전하세요</div>
              {(() => {
                const myBonus = calcBonus(gs?.ownedCards || []);
                return myBonus > 0 ? (
                  <div className="raid-bonus-info">내 카드 보너스 +{myBonus}dmg/틱</div>
                ) : null;
              })()}
            </>
          )}
        </div>
      )}

      {/* ── 카드 픽커 ── */}
      {showPicker && raid.status === 'active' && (
        <div className="raid-picker">
          <div className="raid-picker-header">
            <div className="raid-picker-title">
              {isChanging ? '교체할 카드를 선택하세요' : '참여할 카드를 선택하세요'}
            </div>
            <div className="raid-sort-btns">
              {[['dmg-desc', '강한순'], ['dmg-asc', '약한순'], ['grade', '등급순']].map(([val, label]) => (
                <button
                  key={val}
                  className={`raid-sort-btn${cardSort === val ? ' active' : ''}`}
                  onClick={() => setCardSort(val)}
                >{label}</button>
              ))}
            </div>
          </div>
          <div className="raid-picker-hint" style={isChanging ? { color: '#fbbf24' } : {}}>
            {isChanging
              ? '교체 시 누적 데미지는 유지됩니다'
              : '선택한 카드는 보스 처치 전까지 잠금 · 300만 데미지 이상 시 보상'
            }
          </div>
          {availCards.length === 0 ? (
            <p className="raid-picker-empty">보유한 카드가 없어요!</p>
          ) : (
            <div className="raid-picker-grid">
              {[...availCards].sort((a, b) => {
                const iA = (gs?.ownedCards || []).find(o => o.id === a.id && o.uid !== lockedUid);
                const iB = (gs?.ownedCards || []).find(o => o.id === b.id && o.uid !== lockedUid);
                const dA = avgDmg(a.grade, iA?.condition || 1);
                const dB = avgDmg(b.grade, iB?.condition || 1);
                if (cardSort === 'dmg-desc') return dB - dA;
                if (cardSort === 'dmg-asc')  return dA - dB;
                return GRADE_ORDER[b.grade] - GRADE_ORDER[a.grade];
              }).map(card => {
                const inst = (gs?.ownedCards || []).find(o => o.id === card.id && o.uid !== lockedUid);
                return (
                  <div
                    key={card.id}
                    className={`raid-picker-card grade-${card.grade}`}
                    onClick={() => handleJoin(card)}
                  >
                    <img src={`/${card.img}`} alt={card.name} />
                    <div className="raid-picker-overlay">
                      <div className="raid-picker-name">{card.name}</div>
                      <div className="raid-picker-grade" style={{ color: GRADE_COLOR[card.grade] }}>
                        {GRADE_LABEL[card.grade]}
                      </div>
                      <div className="raid-picker-dmg">{dmgRange(card.grade, inst?.condition || 1)}dmg/틱</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button
            className="raid-picker-close-btn"
            onClick={() => { setShowPicker(false); setIsChanging(false); }}
          >
            닫기
          </button>
        </div>
      )}

      {/* ── 참여자 현황 ── */}
      <div className="raid-participants">
        <div className="raid-section-header">
          <div className="raid-section-title">참여자 현황 ({partCount}/{maxParts})</div>
          <button
            className={`raid-refresh-btn${refreshing ? ' refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? '...' : '↻ 새로고침'}
          </button>
        </div>
        {sortedParts.length === 0 ? (
          <div className="raid-no-parts">아직 참여자가 없어요! 첫 번째로 참여해보세요.</div>
        ) : (
          <div className="raid-parts-grid">
            {sortedParts.map((p, i) => {
              const isMe      = p.uid === user?.uid;
              const barPct    = Math.min(100, ((p.damage || 0) / MIN_REWARD_DMG) * 100);
              const qualified = (p.damage || 0) >= MIN_REWARD_DMG;
              return (
                <div key={p.uid} className={`raid-part-item${isMe ? ' raid-part-me' : ''}`}>
                  <div className="raid-part-rank-badge">#{i + 1}</div>
                  <div className={`raid-part-card-img grade-${p.cardGrade}${isMe && ticking && raid.status === 'active' ? ' raid-card-pulse' : ''}`}>
                    <img src={`/${p.cardImg}`} alt={p.cardName} />
                    {qualified && <div className="raid-part-qualify-mark">✓</div>}
                  </div>
                  <div className="raid-part-meta">
                    <div className="raid-part-player-row">
                      <span className="raid-part-name">
                        {nicknames[p.uid] || p.displayName}{isMe ? ' (나)' : ''}
                      </span>
                    </div>
                    <div className="raid-part-grade-row">
                      <span className="raid-part-grade" style={{ color: GRADE_COLOR[p.cardGrade] }}>
                        {GRADE_LABEL[p.cardGrade]}
                      </span>
                      <span className="raid-part-dps">{dmgRange(p.cardGrade, p.cardCondition, p.cardBonus || 0)}dmg/틱</span>
                    </div>
                    <div className="raid-part-dmg-row">
                      <span className="raid-part-dmg">{(p.damage || 0).toLocaleString()}</span>
                    </div>
                    <div className="raid-part-bar-wrap">
                      <div className="raid-part-bar" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="raid-reward-hint">✓ = 300만 데미지 달성 시 보상 수령 가능</div>
      </div>
    </div>
  );
}
