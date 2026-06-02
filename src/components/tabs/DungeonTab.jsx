import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS } from '../../data/cards.js';

const GRADE_LABEL = { n:'N', r:'R', sr:'SR', ur:'UR', lg:'LEGEND', raid:'RAID' };
const GRADE_COLOR = { n:'#aaa', r:'#4a9eff', sr:'#c084fc', ur:'#fbbf24', lg:'#ff6b6b', raid:'#ffd700' };
const GRADE_BG    = { n:'rgba(80,80,80,0.9)', r:'#1a6fd4', sr:'#7c3aed', ur:'#d97706', lg:'#ff6b6b', raid:'#b8860b' };
const GRADE_RANGE = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65] };
const GRADES_ALL  = ['n','r','sr','ur','lg','raid'];

const GROWTH_BOSS_IMG = {
  n:    '/dungeons/growth/노말성장.png',
  r:    '/dungeons/growth/레어성장.png',
  sr:   '/dungeons/growth/슈퍼레어성장.png',
  ur:   '/dungeons/growth/울트라레어성장.png',
  lg:   '/dungeons/growth/레전드성장.png',
  raid: '/dungeons/growth/레이드성장.png',
};
const FARMING_BOSS_IMG = '/dungeons/farming/파밍던전.png';

const MAX_DAILY_GROWTH = 3;
const FARMING_DURATION = 600; // 10분 = 600초
const TICK_S = 3;

const FARM_REWARDS = [
  { min: 100000, tickets: 200, label: '10만 이상' },
  { min: 50000,  tickets: 100, label: '5만~10만' },
  { min: 10000,  tickets: 50,  label: '1만~5만' },
  { min: 0,      tickets: 20,  label: '0~1만' },
];

function todayKST() {
  return new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
}
function calcAvgDmg(grade, cond, enh=0, bonus=0) {
  const [mn,mx] = GRADE_RANGE[grade]||[1,10];
  return Math.floor(((mn+mx)/2+(cond||1))*(1+enh*0.1))+bonus;
}
function calcTickDmg(grade, cond, enh=0, bonus=0) {
  const [mn,mx] = GRADE_RANGE[grade]||[1,10];
  return Math.floor((Math.floor(Math.random()*(mx-mn+1))+mn+(cond||1))*(1+enh*0.1))+bonus;
}
function dmgRangeStr(grade, cond, enh=0, bonus=0) {
  const [mn,mx] = GRADE_RANGE[grade]||[1,10];
  const m=1+enh*0.1;
  return `${Math.floor((mn+(cond||1))*m)+bonus}~${Math.floor((mx+(cond||1))*m)+bonus}`;
}
function fmtTime(s) {
  const m=Math.floor(s/60), sec=s%60;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

// ══════════════════════════════════════
// 성장 던전
// ══════════════════════════════════════
function GrowthDungeon({ gs, setGs, user, isGuest }) {
  const [phase, setPhase] = useState('grade'); // grade | card | battle | clear
  const [selGrade, setSelGrade] = useState(null);
  const [selInst, setSelInst]   = useState(null);
  const [selDef,  setSelDef]    = useState(null);
  const [hp,      setHp]        = useState(0);
  const [maxHp,   setMaxHp]     = useState(0);
  const [totalDmg,setTotalDmg]  = useState(0);
  const [tickDmg, setTickDmg]   = useState(null);
  const [toast,   setToast]     = useState(null);
  const [saving,  setSaving]    = useState(false);
  const tickRef   = useRef(null);
  const toastRef  = useRef(null);
  const clearedRef = useRef(false);

  // refs for interval closure
  const selInstRef = useRef(null);
  const selDefRef  = useRef(null);
  const bonusRef   = useRef({});

  useEffect(() => { selInstRef.current = selInst; }, [selInst]);
  useEffect(() => { selDefRef.current  = selDef;  }, [selDef]);
  useEffect(() => { bonusRef.current   = gs?.cardBonusDmg || {}; }, [gs?.cardBonusDmg]);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  const today = todayKST();
  const bonusDmg = gs?.cardBonusDmg || {};
  const attempts = gs?.dungeonAttempts || {};
  const lockedUid = gs?.raidCard?.uid;
  const ownedCards = (gs?.ownedCards || []).filter(c => c.uid !== lockedUid);

  const getAttempts = (cardId) => {
    const a = attempts[cardId];
    return (!a || a.date !== today) ? 0 : (a.count || 0);
  };

  const handleGradeClick = (grade) => {
    if (isGuest) { showToast('로그인이 필요합니다'); return; }
    const has = ownedCards.some(oc => CARDS.find(c=>c.id===oc.id)?.grade===grade);
    if (!has) { showToast(`${GRADE_LABEL[grade]} 등급 카드가 없어요!`); return; }
    setSelGrade(grade);
    setPhase('card');
  };

  const handleCardSelect = (inst) => {
    const def = CARDS.find(c=>c.id===inst.id);
    if (!def) return;
    const att = getAttempts(inst.id);
    if (att >= MAX_DAILY_GROWTH) { showToast('오늘 이 카드의 도전 횟수를 다 사용했어요!'); return; }
    const bDmg = bonusDmg[inst.id]||0;
    const avg  = calcAvgDmg(def.grade, inst.condition, inst.enhanceLevel||0, bDmg);
    const bossHp = avg * 1200;
    clearedRef.current = false;
    setSelInst(inst);
    setSelDef(def);
    setHp(bossHp);
    setMaxHp(bossHp);
    setTotalDmg(0);
    setTickDmg(null);
    setPhase('battle');
  };

  // 전투 틱
  useEffect(() => {
    if (phase !== 'battle') { clearInterval(tickRef.current); return; }
    tickRef.current = setInterval(() => {
      const inst = selInstRef.current;
      const def  = selDefRef.current;
      if (!inst || !def) return;
      const bDmg = bonusRef.current[inst.id]||0;
      const dmg  = calcTickDmg(def.grade, inst.condition, inst.enhanceLevel||0, bDmg);
      setTickDmg(dmg);
      setTotalDmg(p=>p+dmg);
      setHp(p => {
        const next = Math.max(0, p-dmg);
        return next;
      });
    }, TICK_S*1000);
    return () => clearInterval(tickRef.current);
  }, [phase]);

  // HP 0 감지 → 클리어
  useEffect(() => {
    if (phase==='battle' && hp===0 && maxHp>0 && !clearedRef.current) {
      clearedRef.current = true;
      clearInterval(tickRef.current);
      handleClear();
    }
  }, [hp, phase]);

  const handleClear = async () => {
    setPhase('clear');
    const inst = selInstRef.current;
    const def  = selDefRef.current;
    if (!user || !inst || !def) return;

    setSaving(true);
    const cardId = inst.id;
    const att = getAttempts(cardId);
    const newCount = att + 1;
    const currentBonus = bonusDmg[cardId]||0;
    const newBonus = currentBonus + 1;

    setGs(prev => ({
      ...prev,
      cardBonusDmg:    { ...(prev.cardBonusDmg||{}),    [cardId]: newBonus },
      dungeonAttempts: { ...(prev.dungeonAttempts||{}), [cardId]: { count: newCount, date: today } },
    }));

    try {
      await updateDoc(doc(db,'users',user.uid), {
        [`cardBonusDmg.${cardId}`]:    newBonus,
        [`dungeonAttempts.${cardId}`]: { count: newCount, date: today },
      });
    } catch(e) { console.error('[growth clear]', e); }
    setSaving(false);
  };

  const reset = () => {
    clearInterval(tickRef.current);
    clearedRef.current = false;
    setPhase('grade');
    setSelGrade(null); setSelInst(null); setSelDef(null);
    setHp(0); setMaxHp(0); setTotalDmg(0); setTickDmg(null);
  };

  // ── 렌더 ──
  return (
    <div className="dungeon-sub-wrap">
      {toast && <div className="cw-toast">{toast}</div>}

      {/* 등급 선택 */}
      {phase === 'grade' && (
        <>
          <div className="dungeon-section-header">
            <div className="dungeon-section-title">성장 던전</div>
            <div className="dungeon-section-desc">카드를 클리어해 데미지를 영구 성장시키세요! 카드 1장당 하루 3번 도전 가능</div>
          </div>
          <div className="growth-grade-grid">
            {GRADES_ALL.map(grade => {
              const hasCards = !isGuest && ownedCards.some(oc=>CARDS.find(c=>c.id===oc.id)?.grade===grade);
              return (
                <div
                  key={grade}
                  className={`growth-boss-card${hasCards ? '' : ' locked'}`}
                  onClick={() => handleGradeClick(grade)}
                >
                  <div className="growth-boss-img-wrap">
                    <img src={GROWTH_BOSS_IMG[grade]} alt={GRADE_LABEL[grade]} />
                  </div>
                  <div className="growth-boss-grade-tag" style={{ background: GRADE_BG[grade] }}>
                    {GRADE_LABEL[grade]}
                  </div>
                  {!hasCards && <div className="growth-boss-lock">카드 없음</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 카드 선택 */}
      {phase === 'card' && (
        <>
          <div className="dungeon-nav-row">
            <button className="dungeon-back-btn" onClick={() => setPhase('grade')}>← 뒤로</button>
            <span className="dungeon-nav-title">{GRADE_LABEL[selGrade]} 등급 카드 선택</span>
          </div>
          <div className="growth-card-list">
            {ownedCards
              .filter(oc => CARDS.find(c=>c.id===oc.id)?.grade===selGrade)
              .map(inst => {
                const def  = CARDS.find(c=>c.id===inst.id);
                if (!def) return null;
                const bDmg = bonusDmg[inst.id]||0;
                const att  = getAttempts(inst.id);
                const left = MAX_DAILY_GROWTH - att;
                return (
                  <div
                    key={inst.uid}
                    className={`growth-card-item grade-${def.grade}${left<=0?' exhausted':''}`}
                    onClick={() => left>0 && handleCardSelect(inst)}
                  >
                    <div className="growth-card-img-wrap">
                      <img src={`/${def.img}`} alt={def.name} />
                      {(inst.enhanceLevel||0)>0 && <div className="enhance-badge-card">+{inst.enhanceLevel}</div>}
                    </div>
                    <div className="growth-card-info">
                      <div className="growth-card-name">{def.name}</div>
                      <div className="growth-card-stat">컨디션 {inst.condition}</div>
                      <div className="growth-card-stat">데미지 {dmgRangeStr(def.grade,inst.condition,inst.enhanceLevel||0,bDmg)}</div>
                      {bDmg>0 && <div className="growth-bonus-tag">성장 +{bDmg}</div>}
                      <div className={`growth-attempts-row${left<=0?' zero':''}`}>
                        {[...Array(MAX_DAILY_GROWTH)].map((_,i)=>(
                          <span key={i} className={`growth-dot${i<att?' used':''}`} />
                        ))}
                        <span className="growth-att-label">{left>0?`${left}번 남음`:'오늘 완료'}</span>
                      </div>
                    </div>
                    {left<=0 && <div className="growth-exhausted-badge">완료</div>}
                  </div>
                );
              })}
          </div>
        </>
      )}

      {/* 전투 */}
      {phase === 'battle' && selDef && selInst && (
        <div className="growth-battle-wrap">
          <div className="growth-battle-boss">
            <img src={GROWTH_BOSS_IMG[selDef.grade]} className="growth-battle-boss-img" alt="boss" />
            <div className="growth-hp-bar-wrap">
              <div className="growth-hp-label">
                <span>보스 HP</span>
                <span>{hp.toLocaleString()} / {maxHp.toLocaleString()}</span>
              </div>
              <div className="growth-hp-track">
                <div
                  className="growth-hp-fill"
                  style={{ width: `${maxHp>0?(hp/maxHp)*100:0}%`, background: GRADE_COLOR[selDef.grade] }}
                />
              </div>
            </div>
            {tickDmg!=null && (
              <div className="growth-tick-dmg" key={totalDmg}>-{tickDmg.toLocaleString()}</div>
            )}
          </div>

          <div className="growth-battle-card-row">
            <div className={`growth-battle-card-img grade-${selDef.grade}`}>
              <img src={`/${selDef.img}`} alt={selDef.name} />
              {(selInst.enhanceLevel||0)>0 && <div className="enhance-badge-card">+{selInst.enhanceLevel}</div>}
            </div>
            <div className="growth-battle-card-info">
              <div className="growth-battle-card-name">{selDef.name}</div>
              <div className="growth-battle-stat">컨디션 {selInst.condition}</div>
              <div className="growth-battle-stat">
                데미지 {dmgRangeStr(selDef.grade,selInst.condition,selInst.enhanceLevel||0,bonusDmg[selInst.id]||0)} / 틱
              </div>
              <div className="growth-battle-total">누적: {totalDmg.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* 클리어 */}
      {phase === 'clear' && selDef && selInst && (
        <div className="growth-clear-wrap">
          <div className="growth-clear-glow" />
          <div className="growth-clear-title">던전 클리어!</div>
          <div className={`growth-clear-card-img grade-${selDef.grade}`}>
            <img src={`/${selDef.img}`} alt={selDef.name} />
          </div>
          <div className="growth-clear-reward-box">
            <div className="growth-clear-card-name">{selDef.name}</div>
            <div className="growth-clear-reward-text">기본 데미지 <span className="growth-clear-plus">+1</span> 영구 상승!</div>
            <div className="growth-clear-bonus-now">
              현재 성장 보너스&nbsp;
              <strong style={{ color: '#fbbf24' }}>+{(gs?.cardBonusDmg||{})[selInst.id]||0}</strong>
            </div>
          </div>
          {saving && <div className="growth-saving">저장 중...</div>}
          <button className="dungeon-primary-btn" onClick={reset}>다른 던전 도전하기</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// 파밍 던전
// ══════════════════════════════════════
function FarmingDungeon({ gs, setGs, user, isGuest }) {
  // phase: select | battle | done
  const [phase, setPhase]       = useState('select');
  // slots: { [grade]: { cardDef, inst } | null }
  const [slots, setSlots]       = useState({});
  const [pickGrade, setPickGrade] = useState(null); // 카드 피커 열린 등급
  const [elapsed, setElapsed]   = useState(0);
  const [totalDmg, setTotalDmg] = useState(0);
  const [tickDmg, setTickDmg]   = useState(null);
  const [reward, setReward]     = useState(null);
  const [toast, setToast]       = useState(null);
  const toastRef  = useRef(null);
  const timerRef  = useRef(null);
  const battleRef = useRef(null); // { slots, bonusDmg }

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  const today     = todayKST();
  const bonusDmg  = gs?.cardBonusDmg || {};
  const farmDate  = gs?.farmingAttempt?.date;
  const doneToday = farmDate === today;
  const lockedUid = gs?.raidCard?.uid;
  const ownedCards = (gs?.ownedCards||[]).filter(c=>c.uid!==lockedUid);

  const selectedSlots = Object.values(slots).filter(Boolean);
  const canStart = selectedSlots.length >= 5 && !doneToday && !isGuest;

  const handleSlotClick = (grade) => {
    if (isGuest) { showToast('로그인이 필요합니다'); return; }
    if (doneToday) return;
    if (slots[grade]) {
      setSlots(prev => { const n={...prev}; delete n[grade]; return n; });
    } else {
      setPickGrade(grade);
    }
  };

  const handlePickCard = (inst) => {
    const def = CARDS.find(c=>c.id===inst.id);
    if (!def) return;
    setSlots(prev => ({ ...prev, [def.grade]: { cardDef: def, inst } }));
    setPickGrade(null);
  };

  const handleStart = () => {
    if (!canStart) return;
    battleRef.current = { slots: { ...slots }, bonusDmg: { ...bonusDmg } };
    setElapsed(0);
    setTotalDmg(0);
    setTickDmg(null);
    setPhase('battle');
  };

  // 전투 타이머
  useEffect(() => {
    if (phase !== 'battle') { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        // 3초마다 데미지 틱
        if (next % TICK_S === 0) {
          const params = battleRef.current;
          if (params) {
            let dmg = 0;
            Object.values(params.slots).forEach(slot => {
              if (!slot) return;
              const bDmg = params.bonusDmg[slot.inst.id]||0;
              dmg += calcTickDmg(slot.cardDef.grade, slot.inst.condition, slot.inst.enhanceLevel||0, bDmg);
            });
            setTickDmg(dmg);
            setTotalDmg(p => p + dmg);
          }
        }
        if (next >= FARMING_DURATION) {
          clearInterval(timerRef.current);
          return FARMING_DURATION;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // 타이머 완료 감지
  useEffect(() => {
    if (phase === 'battle' && elapsed >= FARMING_DURATION) {
      handleDone();
    }
  }, [elapsed, phase]);

  const handleDone = async () => {
    setPhase('done');
    const tier = FARM_REWARDS.find(r => totalDmg >= r.min) || FARM_REWARDS[FARM_REWARDS.length-1];
    setReward(tier.tickets);

    setGs(prev => ({
      ...prev,
      tickets: prev.tickets + tier.tickets,
      farmingAttempt: { date: today },
    }));

    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          tickets: (gs.tickets||0) + tier.tickets,
          farmingAttempt: { date: today },
        });
      } catch(e) { console.error('[farming done]', e); }
    }
  };

  const resetFarming = () => {
    clearInterval(timerRef.current);
    setPhase('select');
    setSlots({});
    setElapsed(0);
    setTotalDmg(0);
    setTickDmg(null);
    setReward(null);
  };

  // ── 렌더 ──
  return (
    <div className="dungeon-sub-wrap">
      {toast && <div className="cw-toast">{toast}</div>}

      {/* 카드 피커 */}
      {pickGrade && (
        <div className="card-zoom-overlay" onClick={() => setPickGrade(null)}>
          <div className="inst-sheet" onClick={e=>e.stopPropagation()}>
            <div className="inst-sheet-title">
              {GRADE_LABEL[pickGrade]} 등급 카드 선택
              <span className="inst-sheet-count">
                {ownedCards.filter(oc=>CARDS.find(c=>c.id===oc.id)?.grade===pickGrade).length}장 보유
              </span>
            </div>
            <div className="inst-list-wrap">
              <div className="inst-list">
                {ownedCards
                  .filter(oc=>CARDS.find(c=>c.id===oc.id)?.grade===pickGrade)
                  .map((inst,i) => {
                    const def = CARDS.find(c=>c.id===inst.id);
                    if (!def) return null;
                    const bDmg = bonusDmg[inst.id]||0;
                    const cond = inst.condition||1;
                    const cc   = cond>=9?'#d97706':cond>=6?'#7c3aed':'#888';
                    return (
                      <div key={inst.uid} className="inst-item" style={{animationDelay:`${i*50}ms`}}
                        onClick={() => handlePickCard(inst)}>
                        <div className="inst-item-img">
                          <img src={`/${def.img}`} alt={def.name} />
                          {(inst.enhanceLevel||0)>0 && <div className="inst-item-badge">+{inst.enhanceLevel}</div>}
                        </div>
                        <div className="inst-item-meta" style={{color:cc}}>컨디션 {cond}</div>
                        {bDmg>0 && <div className="inst-item-meta" style={{color:'#fbbf24',fontSize:'0.65rem'}}>성장 +{bDmg}</div>}
                      </div>
                    );
                  })}
                {ownedCards.filter(oc=>CARDS.find(c=>c.id===oc.id)?.grade===pickGrade).length===0 && (
                  <div style={{color:'var(--muted)',padding:'20px',textAlign:'center',width:'100%'}}>
                    {GRADE_LABEL[pickGrade]} 등급 카드가 없어요
                  </div>
                )}
              </div>
            </div>
            <button className="zoom-close" onClick={()=>setPickGrade(null)}>닫기 ✕</button>
          </div>
        </div>
      )}

      {/* 카드 선택 화면 */}
      {phase === 'select' && (
        <>
          <div className="dungeon-section-header">
            <div className="dungeon-section-title">파밍 던전</div>
            <div className="dungeon-section-desc">
              6개 등급 중 5장 선택해 10분 자동 전투! 하루 1번 입장 가능
            </div>
          </div>

          {doneToday && (
            <div className="farming-done-today">오늘 이미 파밍 던전을 완료했어요. 내일 다시 도전하세요!</div>
          )}

          {/* 보스 이미지 */}
          <div className="farming-boss-preview">
            <img src={FARMING_BOSS_IMG} alt="파밍 던전 보스" />
          </div>

          {/* 보상 안내 */}
          <div className="farming-reward-table">
            {FARM_REWARDS.slice().reverse().map(r => (
              <div key={r.min} className="farming-reward-row">
                <span className="farming-reward-label">{r.label}</span>
                <span className="farming-reward-val">뽑기권 {r.tickets}장</span>
              </div>
            ))}
          </div>

          {/* 슬롯 선택 */}
          <div className="farming-slots-title">참여 카드 선택 <span className="farming-slots-count">{selectedSlots.length}/5</span></div>
          <div className="farming-slots">
            {GRADES_ALL.map(grade => {
              const sel = slots[grade];
              const hasCards = ownedCards.some(oc=>CARDS.find(c=>c.id===oc.id)?.grade===grade);
              return (
                <div
                  key={grade}
                  className={`farming-slot${sel?' filled':''}${!hasCards&&!sel?' no-card':''}`}
                  onClick={() => hasCards || sel ? handleSlotClick(grade) : showToast(`${GRADE_LABEL[grade]} 등급 카드가 없어요`)}
                >
                  {sel ? (
                    <>
                      <img src={`/${sel.cardDef.img}`} alt={sel.cardDef.name} />
                      <div className="farming-slot-grade" style={{ background: GRADE_BG[grade] }}>{GRADE_LABEL[grade]}</div>
                      <button className="farming-slot-remove" onClick={e=>{e.stopPropagation();setSlots(p=>{const n={...p};delete n[grade];return n;})}}>×</button>
                    </>
                  ) : (
                    <div className="farming-slot-empty">
                      <div className="farming-slot-grade-label" style={{ color: GRADE_COLOR[grade] }}>{GRADE_LABEL[grade]}</div>
                      <div className="farming-slot-plus">{hasCards ? '+' : '—'}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            className="dungeon-primary-btn"
            onClick={handleStart}
            disabled={!canStart}
            style={!canStart ? { opacity:0.45, cursor:'not-allowed' } : {}}
          >
            {isGuest ? '로그인이 필요합니다' : doneToday ? '오늘 완료' : selectedSlots.length<5 ? `카드 ${5-selectedSlots.length}장 더 선택` : '입장하기'}
          </button>
        </>
      )}

      {/* 전투 화면 */}
      {phase === 'battle' && (
        <div className="farming-battle-wrap">
          <div className="farming-battle-boss">
            <img src={FARMING_BOSS_IMG} className="farming-boss-img" alt="boss" />
            <div className="farming-timer-row">
              <div className="farming-timer">{fmtTime(FARMING_DURATION - elapsed)}</div>
              <div className="farming-progress-track">
                <div className="farming-progress-fill" style={{ width:`${(elapsed/FARMING_DURATION)*100}%` }} />
              </div>
            </div>
          </div>

          {tickDmg!=null && (
            <div className="farming-tick-dmg" key={elapsed}>-{tickDmg.toLocaleString()}</div>
          )}

          <div className="farming-total-dmg">
            <span className="farming-total-label">누적 데미지</span>
            <span className="farming-total-val">{totalDmg.toLocaleString()}</span>
          </div>

          <div className="farming-battle-cards">
            {Object.values(slots).filter(Boolean).map(({cardDef, inst}) => {
              const bDmg = bonusDmg[inst.id]||0;
              return (
                <div key={inst.uid} className={`farming-battle-card grade-${cardDef.grade}`}>
                  <img src={`/${cardDef.img}`} alt={cardDef.name} />
                  <div className="farming-battle-card-grade" style={{ background: GRADE_BG[cardDef.grade] }}>
                    {GRADE_LABEL[cardDef.grade]}
                  </div>
                  <div className="farming-battle-card-dmg">
                    {dmgRangeStr(cardDef.grade,inst.condition,inst.enhanceLevel||0,bDmg)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 완료 화면 */}
      {phase === 'done' && (
        <div className="farming-done-wrap">
          <div className="farming-done-title">파밍 완료!</div>
          <div className="farming-done-boss">
            <img src={FARMING_BOSS_IMG} alt="boss" />
          </div>
          <div className="farming-done-stats">
            <div className="farming-done-stat">
              <span className="farming-done-stat-label">총 데미지</span>
              <span className="farming-done-stat-val">{totalDmg.toLocaleString()}</span>
            </div>
            <div className="farming-done-stat highlight">
              <span className="farming-done-stat-label">획득 뽑기권</span>
              <span className="farming-done-stat-val">+{reward}장</span>
            </div>
          </div>
          <div className="farming-reward-tier">
            {FARM_REWARDS.map(r => (
              <div key={r.min} className={`farming-reward-tier-row${totalDmg>=r.min&&(r===FARM_REWARDS.find(x=>totalDmg>=x.min))?' current':''}`}>
                <span>{r.label}</span><span>{r.tickets}장</span>
              </div>
            ))}
          </div>
          <button className="dungeon-primary-btn" onClick={resetFarming} style={{marginTop:16}}>확인</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// 메인 던전 탭
// ══════════════════════════════════════
const TAB_ORDER = ['growth', 'farming'];

export default function DungeonTab({ gs, setGs, user, isGuest }) {
  const [subTab, setSubTab]     = useState('growth');
  const [slideClass, setSlideClass] = useState('');

  const switchSubTab = (t) => {
    if (t === subTab) return;
    const dir = TAB_ORDER.indexOf(t) > TAB_ORDER.indexOf(subTab) ? 'right' : 'left';
    setSubTab(t);
    setSlideClass(` subtab-slide-${dir}`);
    setTimeout(() => setSlideClass(''), 300);
  };

  return (
    <>
      <div className="subtab-bar">
        <button className={`subtab-btn${subTab==='growth'?' active':''}`} onClick={() => switchSubTab('growth')}>성장 던전</button>
        <button className={`subtab-btn${subTab==='farming'?' active':''}`} onClick={() => switchSubTab('farming')}>파밍 던전</button>
      </div>
      <div className={`subtab-content${slideClass}`}>
        {subTab==='growth'  && <GrowthDungeon  gs={gs} setGs={setGs} user={user} isGuest={isGuest} />}
        {subTab==='farming' && <FarmingDungeon gs={gs} setGs={setGs} user={user} isGuest={isGuest} />}
      </div>
    </>
  );
}
