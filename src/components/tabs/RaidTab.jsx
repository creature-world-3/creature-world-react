import { useState, useEffect, useRef } from 'react';
import {
  doc, setDoc, updateDoc, getDoc,
  onSnapshot, serverTimestamp,
  increment, Timestamp, runTransaction,
} from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS } from '../../data/cards.js';

const RAID_ID        = 'current_boss';
const BOSS_HP        = 3_000_000;
const MAX_PARTS      = 10;
const DURATION_MS    = 14 * 24 * 60 * 60 * 1000;
const TICK_MS        = 3_000;
const MIN_REWARD_DMG = 10_000;
const RAID_CARD_ID   = 'raid_cursed_doll';

const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND' };
const GRADE_COLOR = { n: '#888', r: '#4a9eff', sr: '#c084fc', ur: '#fbbf24', lg: '#ff6b6b' };
const GRADE_RANGE = { n: [1, 10], r: [21, 30], sr: [31, 40], ur: [41, 50], lg: [91, 100] };
const GRADE_ORDER = { n: 0, r: 1, sr: 2, ur: 3, lg: 4 };

function calcDmg(grade, cond) {
  const [min, max] = GRADE_RANGE[grade] || [1, 10];
  return Math.floor(Math.random() * (max - min + 1)) + min + (cond || 1);
}
function avgDmg(grade, cond) {
  const [min, max] = GRADE_RANGE[grade] || [1, 10];
  return Math.floor((min + max) / 2) + (cond || 1);
}
function dmgRange(grade, cond) {
  const [min, max] = GRADE_RANGE[grade] || [1, 10];
  return `${min + (cond || 1)}~${max + (cond || 1)}`;
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

let _rUid = 0;
const genUid = () => `raid_${++_rUid}_${Date.now()}`;

// raids/current_boss 문서 초기 구조
const INITIAL_RAID = () => ({
  bossName:        '저주받은 인형의 왕',
  hp:              BOSS_HP,
  maxHp:           BOSS_HP,
  maxParticipants: MAX_PARTS,
  startDate:       serverTimestamp(),
  endDate:         Timestamp.fromDate(new Date(Date.now() + DURATION_MS)),
  participants:    {},   // uid → 참여자 정보 맵
  status:          'active',
});

export default function RaidTab({ gs, setGs, user }) {
  const [raid, setRaid]               = useState(null);
  const [showPicker, setShowPicker]   = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [cardSort, setCardSort]       = useState('dmg-desc');
  const [toast, setToast]             = useState(null);
  const [timeLeft, setTimeLeft]       = useState('');
  const [ticking, setTicking]         = useState(false);
  const [shaking, setShaking]         = useState(false);
  const [hpFlash, setHpFlash]         = useState(false);
  const [dmgFloats, setDmgFloats]     = useState([]);
  const toastRef = useRef(null);
  const tickRef  = useRef(null);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  };

  // ── raids/current_boss 단일 문서 구독 ──
  // participants도 이 문서 안의 맵 필드로 관리
  useEffect(() => {
    const raidRef = doc(db, 'raids', RAID_ID);

    // 문서 없으면 생성
    getDoc(raidRef).then(snap => {
      if (!snap.exists()) {
        setDoc(raidRef, INITIAL_RAID()).catch(e => console.error('raid init error:', e));
      }
    }).catch(e => console.error('raid getDoc error:', e));

    const unsub = onSnapshot(
      raidRef,
      snap => { setRaid(snap.exists() ? { id: snap.id, ...snap.data() } : null); },
      err  => console.error('raid snapshot error:', err),
    );
    return () => unsub();
  }, []);

  // ── 남은 시간 ──
  useEffect(() => {
    if (raid?.endDate) setTimeLeft(fmtTimeLeft(raid.endDate));
    const id = setInterval(() => {
      if (raid?.endDate) setTimeLeft(fmtTimeLeft(raid.endDate));
    }, 30_000);
    return () => clearInterval(id);
  }, [raid?.endDate]);

  // ── 만료 자동 처리 ──
  useEffect(() => {
    if (!raid || raid.status !== 'active' || !raid.endDate) return;
    const end = raid.endDate.toDate ? raid.endDate.toDate() : new Date(raid.endDate);
    if (end < new Date()) {
      updateDoc(doc(db, 'raids', RAID_ID), { status: 'expired' }).catch(console.error);
    }
    if (raid.status === 'expired' && gs?.raidCard?.raidId === RAID_ID) {
      setGs(prev => ({ ...prev, raidCard: null }));
    }
  }, [raid?.status]);

  // participants: 문서 안의 맵에서 파생
  const parts   = raid?.participants || {};
  const myPart  = user ? (parts[user.uid] || null) : null;

  // ── 자동 데미지 틱 (3초마다 단일 문서 업데이트) ──
  useEffect(() => {
    clearInterval(tickRef.current);
    if (!myPart || raid?.status !== 'active' || !user) { setTicking(false); return; }

    setTicking(true);

    tickRef.current = setInterval(async () => {
      const dmg = calcDmg(myPart.cardGrade, myPart.cardCondition);
      // 공격 애니메이션 즉시 트리거 (optimistic)
      const floatId = Date.now() + Math.random();
      const floatX  = 25 + Math.random() * 50;
      const floatY  = 28 + Math.random() * 28;
      setShaking(true);
      setHpFlash(true);
      setDmgFloats(prev => [...prev, { id: floatId, value: dmg, x: floatX, y: floatY }]);
      setTimeout(() => setShaking(false), 600);
      setTimeout(() => setHpFlash(false), 480);
      setTimeout(() => setDmgFloats(prev => prev.filter(f => f.id !== floatId)), 1300);

      try {
        const raidRef = doc(db, 'raids', RAID_ID);
        await runTransaction(db, async (t) => {
          const snap = await t.get(raidRef);
          if (!snap.exists() || snap.data().status !== 'active') return;
          const hp     = snap.data().hp;
          if (hp <= 0) return;
          const actual = Math.min(dmg, hp);
          const newHp  = hp - actual;
          // 단일 문서 업데이트: hp + participants.{uid}.damage
          t.update(raidRef, {
            hp:    newHp,
            [`participants.${user.uid}.damage`]: increment(actual),
            ...(newHp <= 0 ? { status: 'defeated' } : {}),
          });
        });
      } catch (e) { console.error('tick error:', e); }
    }, TICK_MS);

    return () => { clearInterval(tickRef.current); setTicking(false); };
  }, [!!myPart, raid?.status, user?.uid]);

  // ── 참여: participants 맵에 유저 정보 추가 ──
  const handleJoin = async (card) => {
    if (!user) return;
    const partCount = Object.keys(parts).length;
    if (partCount >= MAX_PARTS) { showToast('참여 인원이 가득 찼어요!'); return; }

    const lockedUid = gs?.raidCard?.uid;
    const inst = (gs?.ownedCards || []).find(c => c.id === card.id && c.uid !== lockedUid);
    if (!inst) { showToast('카드를 찾을 수 없어요'); return; }

    try {
      // participants.{uid} 필드를 setDoc merge로 추가
      await setDoc(
        doc(db, 'raids', RAID_ID),
        {
          participants: {
            [user.uid]: {
              uid:           user.uid,
              displayName:   user.displayName,
              photoURL:      user.photoURL || null,
              cardUid:       inst.uid,
              cardId:        card.id,
              cardImg:       card.img,
              cardName:      card.name,
              cardGrade:     card.grade,
              cardCondition: inst.condition,
              damage:        0,
              joinedAt:      serverTimestamp(),
              rewardClaimed: false,
            },
          },
        },
        { merge: true },  // 기존 participants의 다른 유저 데이터 보존
      );
      setGs(prev => ({
        ...prev,
        raidCard: { uid: inst.uid, cardId: card.id, raidId: RAID_ID },
      }));
      setShowPicker(false);
      showToast(`${card.name} (${GRADE_LABEL[card.grade]})로 레이드 참여! ⚔️`);
    } catch (e) {
      console.error('join error:', e);
      showToast('참여 중 오류가 발생했어요');
    }
  };

  // ── 보상 수령 ──
  const handleClaimReward = async () => {
    if (!user || !myPart) return;
    const raidCard = CARDS.find(c => c.id === RAID_CARD_ID);
    try {
      await updateDoc(doc(db, 'raids', RAID_ID), {
        [`participants.${user.uid}.rewardClaimed`]: true,
      });
      setGs(prev => ({
        ...prev,
        raidCard: null,
        ownedCards: raidCard
          ? [...prev.ownedCards, { uid: genUid(), id: RAID_CARD_ID, condition: 10 }]
          : prev.ownedCards,
      }));
      showToast('🎉 레이드 보상 수령! RAID 한정 카드 획득!');
    } catch (e) { console.error('reward error:', e); }
  };

  // ── 로딩 ──
  if (!raid) return (
    <div className="raid-wrap">
      <div className="raid-atmosphere" />
      <div className="raid-loading">레이드 불러오는 중...</div>
    </div>
  );

  const hp          = Math.max(0, raid.hp || 0);
  const hpPct       = Math.min(100, (hp / BOSS_HP) * 100);
  const hpColor     = hpPct > 50 ? '#4a9eff' : hpPct > 20 ? '#fbbf24' : '#ff4444';
  const myDmg       = myPart?.damage || 0;
  const canReward   = raid.status === 'defeated' && myDmg >= MIN_REWARD_DMG && !myPart?.rewardClaimed;
  const sortedParts = Object.values(parts).sort((a, b) => (b.damage || 0) - (a.damage || 0));
  const partCount   = Object.keys(parts).length;
  const lockedUid   = gs?.raidCard?.uid;
  const availCards  = CARDS.filter(c =>
    !c.raid && (gs?.ownedCards || []).some(o => o.id === c.id && o.uid !== lockedUid)
  ).filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);

  return (
    <div className="raid-wrap">
      <div className="raid-atmosphere" />
      {toast && <div className="cw-toast">{toast}</div>}

      {/* ── 보스 섹션 ── */}
      <div className="raid-boss-section">
        <div className="raid-boss-img-wrap">
          <img
            src="/boss_cursed_doll.png"
            alt="저주받은 인형의 왕"
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
          <div className="raid-boss-name">저주받은 인형의 왕</div>
          <div className={`raid-status-badge raid-status-${raid.status}`}>
            {raid.status === 'active' ? '⚔️ 진행 중' : raid.status === 'defeated' ? '💀 처치 완료' : '⌛ 종료됨'}
          </div>
          {timeLeft && raid.status === 'active' && (
            <div className="raid-time-left">🕐 {timeLeft}</div>
          )}
          <div className="raid-hp-row">
            <span className="raid-hp-label-text">HP</span>
            <span className="raid-hp-num">{hp.toLocaleString()} / {BOSS_HP.toLocaleString()}</span>
          </div>
          <div className="raid-hp-bar">
            <div className="raid-hp-fill" style={{ width: `${hpPct}%`, background: hpColor }} />
            {hpFlash && <div className="raid-hp-flash-overlay" />}
          </div>
          <div className="raid-meta-row">
            <div className="raid-meta">참여 <strong>{partCount}</strong> / {MAX_PARTS}명</div>
            <button className="raid-clear-reward-btn" onClick={() => setShowRewardModal(true)}>
              🏆 클리어 보상
            </button>
          </div>
        </div>
      </div>

      {/* ── 클리어 보상 모달 ── */}
      {showRewardModal && (
        <div className="card-zoom-overlay" onClick={() => setShowRewardModal(false)}>
          <div className="raid-reward-modal" onClick={e => e.stopPropagation()}>
            <div className="raid-reward-card-wrap">
              <img src="/boss_cursed_doll.png" alt="저주받은 인형의 왕" className="raid-reward-card-img" />
              <div className="raid-reward-card-glow" />
              <div className="raid-reward-card-footer">
                <div className="raid-reward-card-name">저주받은 인형의 왕</div>
                <div className="raid-reward-grade-tag">RAID</div>
              </div>
            </div>
            <div className="raid-reward-modal-info">
              <div className="raid-reward-modal-title">저주받은 인형의 왕</div>
              <div className="raid-reward-grade-badge">✦ RAID 한정 등급</div>
              <div className="raid-reward-modal-desc">
                보스 처치 완료 후<br />
                <strong>10,000 데미지 이상 기여</strong> 시 획득 가능
              </div>
            </div>
            <button className="zoom-close" onClick={() => setShowRewardModal(false)}>닫기 ✕</button>
          </div>
        </div>
      )}

      {/* ── 내 참여 상태 ── */}
      {myPart ? (
        <div className="raid-my-card">
          <div className="raid-my-label">
            내 참여 카드
            {ticking && raid.status === 'active' && (
              <span className="raid-tick-dot" title="자동 공격 중" />
            )}
          </div>
          <div className="raid-my-row">
            <div className={`raid-my-img grade-${myPart.cardGrade}${ticking && raid.status === 'active' ? ' raid-card-pulse' : ''}`}>
              <img src={`/${myPart.cardImg}`} alt={myPart.cardName} />
              <div className="raid-lock-tag">⚔️ 레이드</div>
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
                {dmgRange(myPart.cardGrade, myPart.cardCondition)}dmg / 3초
              </div>
              {myDmg >= MIN_REWARD_DMG
                ? <div className="raid-reward-qualify">✓ 보상 수령 가능!</div>
                : <div className="raid-reward-progress">
                    보상까지 {Math.max(0, MIN_REWARD_DMG - myDmg).toLocaleString()} 데미지
                  </div>
              }
            </div>
          </div>
          {raid.status === 'defeated' && (
            myPart?.rewardClaimed ? (
              <button className="raid-reward-btn raid-reward-btn-done" disabled>
                ✅ 보상 수령 완료
              </button>
            ) : myDmg >= MIN_REWARD_DMG ? (
              <button className="raid-reward-btn" onClick={handleClaimReward}>
                🏆 레이드 보상 수령하기
              </button>
            ) : (
              <button className="raid-reward-btn raid-reward-btn-disabled" disabled>
                🏆 보상 수령 불가 (데미지 부족)
              </button>
            )
          )}
          {raid.status === 'active' && (
            <div className="raid-lock-notice">⚠️ 참여 카드는 보스 처치까지 잠금됩니다</div>
          )}
        </div>
      ) : (
        <div className="raid-join-area">
          {raid.status !== 'active' ? (
            <div className="raid-over-msg">
              {raid.status === 'defeated' ? '보스가 이미 처치되었습니다!' : '레이드 기간이 종료되었습니다.'}
            </div>
          ) : partCount >= MAX_PARTS ? (
            <div className="raid-over-msg">참여 인원이 가득 찼어요! ({MAX_PARTS}/{MAX_PARTS})</div>
          ) : (
            <>
              <button className="raid-join-btn" onClick={() => setShowPicker(p => !p)}>
                ⚔️ 레이드 참여하기
              </button>
              <div className="raid-join-sub">카드 1장을 선택해 보스에게 도전하세요</div>
            </>
          )}
        </div>
      )}

      {/* ── 카드 픽커 ── */}
      {showPicker && !myPart && raid.status === 'active' && (
        <div className="raid-picker">
          <div className="raid-picker-header">
            <div className="raid-picker-title">참여할 카드를 선택하세요</div>
            <div className="raid-sort-btns">
              {[['dmg-desc','강한순'], ['dmg-asc','약한순'], ['grade','등급순']].map(([val, label]) => (
                <button
                  key={val}
                  className={`raid-sort-btn${cardSort === val ? ' active' : ''}`}
                  onClick={() => setCardSort(val)}
                >{label}</button>
              ))}
            </div>
          </div>
          <div className="raid-picker-hint">
            ⚠️ 선택한 카드는 보스 처치 완료 전까지 복귀 불가
            &nbsp;·&nbsp; 10,000 데미지 이상 기여 시 RAID 한정 카드 보상
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
                const inst   = (gs?.ownedCards || []).find(o => o.id === card.id && o.uid !== lockedUid);
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
                      <div className="raid-picker-dmg">{dmgRange(card.grade, inst?.condition || 1)}dmg / 틱</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 참여자 현황 (실시간) ── */}
      <div className="raid-participants">
        <div className="raid-section-title">참여자 현황 ({partCount}/{MAX_PARTS})</div>
        {sortedParts.length === 0 ? (
          <div className="raid-no-parts">아직 참여자가 없어요! 첫 번째로 참여해보세요.</div>
        ) : (
          <div className="raid-parts-grid">
            {sortedParts.map((p, i) => {
              const isMe     = p.uid === user?.uid;
              const barPct   = Math.min(100, ((p.damage || 0) / MIN_REWARD_DMG) * 100);
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
                      {p.photoURL && (
                        <img src={p.photoURL} className="raid-part-avatar" referrerPolicy="no-referrer" alt="" />
                      )}
                      <span className="raid-part-name">{p.displayName}{isMe ? ' (나)' : ''}</span>
                    </div>
                    <div className="raid-part-grade-row">
                      <span className="raid-part-grade" style={{ color: GRADE_COLOR[p.cardGrade] }}>
                        {GRADE_LABEL[p.cardGrade]}
                      </span>
                      <span className="raid-part-dps">{dmgRange(p.cardGrade, p.cardCondition)}dmg/틱</span>
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
        <div className="raid-reward-hint">✓ = 10,000 데미지 달성 시 RAID 한정 카드 보상</div>
      </div>
    </div>
  );
}
