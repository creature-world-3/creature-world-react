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
const FARMING_DURATION = 600;
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

function groupByType(cards, bonusDmg) {
  const map = {};
  for (const inst of cards) {
    const def = CARDS.find(c => c.id === inst.id);
    if (!def) continue;
    if (!map[inst.id]) map[inst.id] = { def, instances: [] };
    map[inst.id].instances.push(inst);
  }
  const groups = Object.values(map);
  groups.forEach(g => {
    const bDmg = bonusDmg[g.def.id] || 0;
    g.instances.sort((a, b) =>
      calcAvgDmg(g.def.grade, b.condition, b.enhanceLevel||0, bDmg) -
      calcAvgDmg(g.def.grade, a.condition, a.enhanceLevel||0, bDmg)
    );
    g.bestDmg = calcAvgDmg(
      g.def.grade, g.instances[0].condition, g.instances[0].enhanceLevel||0, bDmg
    );
  });
  groups.sort((a, b) => b.bestDmg - a.bestDmg);
  return groups;
}

// ══════════════════════════════════════
// 성장 던전
// ══════════════════════════════════════
function GrowthDungeon({ gs, setGs, user, isGuest }) {
  const [phase, setPhase]               = useState('grade');
  const [slideClass, setSlideClass]     = useState('');
  const [growthInfoOpen, setGrowthInfoOpen] = useState(false);
  const [selGrade, setSelGrade]         = useState(null);
  const [expandedId, setExpandedId]     = useState(null);
  const [selInst, setSelInst]           = useState(null);
  const [selDef,  setSelDef]            = useState(null);
  const [hp,      setHp]                = useState(0);
  const [maxHp,   setMaxHp]             = useState(0);
  const [totalDmg,setTotalDmg]          = useState(0);
  const [tickDmg, setTickDmg]           = useState(null);
  const [dmgFloats, setDmgFloats]       = useState([]);
  const [shaking,   setShaking]         = useState(false);
  const [toast,   setToast]             = useState(null);
  const [saving,  setSaving]            = useState(false);
  const tickRef    = useRef(null);
  const toastRef   = useRef(null);
  const clearedRef = useRef(false);
  const selInstRef = useRef(null);
  const selDefRef  = useRef(null);
  const bonusRef   = useRef({});
  const floatIdRef = useRef(0);

  useEffect(() => { selInstRef.current = selInst; }, [selInst]);
  useEffect(() => { selDefRef.current  = selDef;  }, [selDef]);
  useEffect(() => { bonusRef.current   = gs?.cardBonusDmg || {}; }, [gs?.cardBonusDmg]);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  const goPhase = (next, dir = 'forward') => {
    setPhase(next);
    const cls = dir === 'forward' ? ' dungeon-slide-right' : ' dungeon-slide-left';
    setSlideClass(cls);
    setTimeout(() => setSlideClass(''), 320);
  };

  const today    = todayKST();
  const bonusDmg = gs?.cardBonusDmg || {};
  const attempts = gs?.dungeonAttempts || {};
  const lockedUid = gs?.raidCard?.uid;
  const ownedCards = (gs?.ownedCards||[]).filter(c => c.uid !== lockedUid);

  const getAttempts = (cardId) => {
    const a = attempts[cardId];
    return (!a || a.date !== today) ? 0 : (a.count||0);
  };

  const handleGradeClick = (grade) => {
    if (isGuest) { showToast('로그인이 필요합니다'); return; }
    const has = ownedCards.some(oc => CARDS.find(c=>c.id===oc.id)?.grade===grade);
    if (!has) { showToast(`${GRADE_LABEL[grade]} 등급 카드가 없어요!`); return; }
    setSelGrade(grade);
    setExpandedId(null);
    goPhase('card', 'forward');
  };

  const handleCardTypeClick = (groupId) => {
    setExpandedId(prev => prev === groupId ? null : groupId);
  };

  const handleInstSelect = (inst) => {
    const def = CARDS.find(c=>c.id===inst.id);
    if (!def) return;
    const att = getAttempts(inst.id);
    if (att >= MAX_DAILY_GROWTH) { showToast('오늘 이 카드의 도전 횟수를 다 사용했어요!'); return; }
    const bDmg = bonusDmg[inst.id]||0;
    const avg  = calcAvgDmg(def.grade, inst.condition, inst.enhanceLevel||0, bDmg);
    clearedRef.current = false;
    setSelInst(inst);
    setSelDef(def);
    setHp(avg * 1200);
    setMaxHp(avg * 1200);
    setTotalDmg(0);
    setTickDmg(null);
    setDmgFloats([]);
    goPhase('battle', 'forward');
  };

  useEffect(() => {
    if (phase !== 'battle') { clearInterval(tickRef.current); return; }
    tickRef.current = setInterval(() => {
      const inst = selInstRef.current;
      const def  = selDefRef.current;
      if (!inst || !def) return;
      const bDmg = bonusRef.current[inst.id]||0;
      const dmg  = calcTickDmg(def.grade, inst.condition, inst.enhanceLevel||0, bDmg);
      setTickDmg(dmg);
      setTotalDmg(p => p + dmg);
      setHp(p => Math.max(0, p - dmg));
      // 플로팅 데미지
      const fid = ++floatIdRef.current;
      setDmgFloats(prev => [...prev, { id: fid, dmg }]);
      setTimeout(() => setDmgFloats(prev => prev.filter(f => f.id !== fid)), 1200);
      // 보스 흔들기
      setShaking(true);
      setTimeout(() => setShaking(false), 550);
    }, TICK_S * 1000);
    return () => clearInterval(tickRef.current);
  }, [phase]);

  useEffect(() => {
    if (phase === 'battle' && hp === 0 && maxHp > 0 && !clearedRef.current) {
      clearedRef.current = true;
      clearInterval(tickRef.current);
      handleClear();
    }
  }, [hp, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = async () => {
    goPhase('clear', 'forward');
    const inst = selInstRef.current;
    if (!user || !inst) return;
    setSaving(true);
    const cardId   = inst.id;
    const newCount = getAttempts(cardId) + 1;
    const newBonus = (bonusDmg[cardId]||0) + 1;
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
    setExpandedId(null);
    setSelInst(null); setSelDef(null);
    setHp(0); setMaxHp(0); setTotalDmg(0); setTickDmg(null);
    setDmgFloats([]); setShaking(false);
    goPhase('grade', 'back');
  };

  const gradeGroups = selGrade
    ? groupByType(ownedCards.filter(oc => CARDS.find(c=>c.id===oc.id)?.grade===selGrade), bonusDmg)
    : [];

  return (
    <div className="dungeon-sub-wrap">
      {toast && <div className="cw-toast">{toast}</div>}

      {growthInfoOpen && (
        <div className="card-zoom-overlay" onClick={() => setGrowthInfoOpen(false)}>
          <div className="dungeon-info-sheet" onClick={e => e.stopPropagation()}>
            <div className="dungeon-info-title">성장 던전 안내</div>
            <p className="dungeon-info-body">카드 1장을 선택해 보스에게 도전하세요. 클리어하면 해당 카드의 기본 데미지가 영구적으로 +1 상승합니다. 카드 1장당 하루 3번 성장 가능합니다.</p>
            <button className="zoom-close" onClick={() => setGrowthInfoOpen(false)}>닫기 ✕</button>
          </div>
        </div>
      )}

      <div className={`dungeon-sub-content${slideClass}`}>

        {/* ── 등급 선택 ── */}
        {phase === 'grade' && (
          <>
            <div className="dungeon-section-header">
              <div className="dungeon-section-title">성장 던전</div>
              <button className="dungeon-info-btn" onClick={() => setGrowthInfoOpen(true)}>설명</button>
            </div>
            <div className="growth-grade-grid">
              {GRADES_ALL.map(grade => {
                const hasCards = !isGuest && ownedCards.some(oc=>CARDS.find(c=>c.id===oc.id)?.grade===grade);
                return (
                  <div key={grade} className={`growth-boss-card${hasCards?'':' locked'}`} onClick={() => handleGradeClick(grade)}>
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

        {/* ── 카드 선택 ── */}
        {phase === 'card' && (
          <>
            <div className="dungeon-nav-row">
              <button className="dungeon-back-btn" onClick={() => { setExpandedId(null); goPhase('grade','back'); }}>← 뒤로</button>
              <span className="dungeon-nav-title">{GRADE_LABEL[selGrade]} 등급 카드 선택</span>
            </div>
            <div className="dungeon-card-group-list">
              {gradeGroups.map(({ def, instances, bestDmg }) => {
                const bDmg    = bonusDmg[def.id]||0;
                const att     = getAttempts(def.id);
                const left    = MAX_DAILY_GROWTH - att;
                const allDone = left <= 0;
                const isExpanded = expandedId === def.id;
                return (
                  <div key={def.id} className={`dungeon-card-group${allDone?' exhausted':''}`}>
                    <div className="dungeon-card-group-header" onClick={() => !allDone && handleCardTypeClick(def.id)}>
                      <div className={`dungeon-card-thumb grade-${def.grade}`}>
                        <img src={`/${def.img}`} alt={def.name} />
                        {instances.length > 1 && <div className="dup">×{instances.length}</div>}
                        {(instances[0].enhanceLevel||0) > 0 && <div className="enhance-badge-card">+{instances[0].enhanceLevel}</div>}
                      </div>
                      <div className="dungeon-card-group-info">
                        <div className="dungeon-card-group-name">{def.name}</div>
                        <div className="dungeon-card-group-dmg">
                          평균 데미지 <strong>{bestDmg}</strong>
                          {bDmg > 0 && <span className="growth-bonus-tag" style={{marginLeft:5}}>성장 +{bDmg}</span>}
                        </div>
                        <div className="growth-attempts-row" style={{marginTop:3}}>
                          {[...Array(MAX_DAILY_GROWTH)].map((_,i)=>(
                            <span key={i} className={`growth-dot${i<att?' used':''}`} />
                          ))}
                          <span className="growth-att-label">{allDone?'오늘 완료':`${left}번 남음`}</span>
                        </div>
                      </div>
                      <div className={`dungeon-expand-arrow${isExpanded?' open':''}`}>›</div>
                      {allDone && <div className="growth-exhausted-badge">완료</div>}
                    </div>
                    {isExpanded && (
                      <div className="dungeon-inst-row">
                        {instances.map((inst, i) => {
                          const cond = inst.condition||1;
                          const enh  = inst.enhanceLevel||0;
                          const cc   = cond>=9?'#d97706':cond>=6?'#7c3aed':'#888';
                          const dmg  = calcAvgDmg(def.grade, cond, enh, bDmg);
                          return (
                            <div key={inst.uid} className="dungeon-inst-item" style={{animationDelay:`${i*50}ms`}}
                              onClick={() => handleInstSelect(inst)}>
                              <div className="dungeon-inst-img">
                                <img src={`/${def.img}`} alt={def.name} />
                                {enh > 0 && <div className="inst-item-badge">+{enh}</div>}
                              </div>
                              <div className="dungeon-inst-cond" style={{color:cc}}>컨디션 {cond}</div>
                              <div className="dungeon-inst-dmg">평균 {dmg}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── 전투 (레이드 스타일) ── */}
        {phase === 'battle' && selDef && selInst && (() => {
          const bDmg  = bonusDmg[selInst.id]||0;
          const hpPct = maxHp > 0 ? (hp/maxHp)*100 : 0;
          const gc    = GRADE_COLOR[selDef.grade];
          return (
            <div className="dg-battle-wrap">
              {/* 보스 섹션 */}
              <div className="dg-boss-section" style={{ borderColor: gc + '55', boxShadow: `0 4px 28px ${gc}22` }}>
                <div className="dg-boss-img-wrap">
                  <img
                    src={GROWTH_BOSS_IMG[selDef.grade]}
                    className={`dg-boss-img${shaking?' dg-boss-shaking':''}`}
                    alt="boss"
                  />
                  <div className="dg-boss-vignette" />
                  {dmgFloats.map(f => (
                    <div key={f.id} className="dg-dmg-float" style={{ color: gc }}>
                      -{f.dmg.toLocaleString()}
                    </div>
                  ))}
                </div>
                <div className="dg-boss-info">
                  <div className="dg-boss-name" style={{ color: gc }}>
                    {GRADE_LABEL[selDef.grade]} 보스
                  </div>
                  <div className="dg-hp-row">
                    <span className="dg-hp-label">HP</span>
                    <span className="dg-hp-num">{hp.toLocaleString()} / {maxHp.toLocaleString()}</span>
                  </div>
                  <div className="dg-hp-bar">
                    <div className="dg-hp-fill" style={{ width:`${hpPct}%`, background: gc, boxShadow: `0 0 8px ${gc}` }} />
                  </div>
                </div>
              </div>

              {/* 내 카드 */}
              <div className="dg-my-card" style={{ borderColor: gc + '44' }}>
                <div className="dg-my-label">
                  <span className="dg-tick-dot" style={{ background: gc, boxShadow: `0 0 6px ${gc}` }} />
                  출격 카드
                </div>
                <div className="dg-my-row">
                  <div className={`dg-my-img grade-${selDef.grade}`}>
                    <img src={`/${selDef.img}`} alt={selDef.name} />
                    {(selInst.enhanceLevel||0) > 0 && <div className="enhance-badge-card">+{selInst.enhanceLevel}</div>}
                  </div>
                  <div className="dg-my-details">
                    <div className="dg-my-name">{selDef.name}</div>
                    <div className="dg-my-stat">컨디션 <strong style={{color:gc}}>{selInst.condition}</strong></div>
                    <div className="dg-my-stat">데미지/틱 <strong style={{color:gc}}>{dmgRangeStr(selDef.grade,selInst.condition,selInst.enhanceLevel||0,bDmg)}</strong></div>
                    {bDmg > 0 && <div className="dg-my-bonus">성장 보너스 +{bDmg}</div>}
                    <div className="dg-my-total">누적 데미지 <strong style={{color:'#fbbf24'}}>{totalDmg.toLocaleString()}</strong></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── 클리어 ── */}
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
                <strong style={{color:'#fbbf24'}}>+{(gs?.cardBonusDmg||{})[selInst.id]||0}</strong>
              </div>
            </div>
            {saving && <div className="growth-saving">저장 중...</div>}
            <button className="dungeon-primary-btn" onClick={reset}>다른 던전 도전하기</button>
          </div>
        )}

      </div>
    </div>
  );
}

// ══════════════════════════════════════
// 파밍 던전
// ══════════════════════════════════════
function FarmingDungeon({ gs, setGs, user, isGuest }) {
  const [phase, setPhase]               = useState('select');
  const [phaseDir, setPhaseDir]         = useState('forward');
  const [farmInfoOpen, setFarmInfoOpen] = useState(false);
  const [slots, setSlots]               = useState({});
  const [pickGrade, setPickGrade]       = useState(null);
  const [pickExpanded, setPickExpanded] = useState(null);
  const [elapsed, setElapsed]           = useState(0);
  const [totalDmg, setTotalDmg]         = useState(0);
  const [tickDmg, setTickDmg]           = useState(null);
  const [dmgFloats, setDmgFloats]       = useState([]);
  const [reward, setReward]             = useState(null);
  const [toast, setToast]               = useState(null);
  const toastRef   = useRef(null);
  const timerRef   = useRef(null);
  const battleRef  = useRef(null);
  const floatIdRef = useRef(0);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  const goPhase = (next, dir = 'forward') => {
    setPhaseDir(dir);
    setPhase(next);
  };

  const today     = todayKST();
  const bonusDmg  = gs?.cardBonusDmg || {};
  const doneToday = gs?.farmingAttempt?.date === today;
  const lockedUid = gs?.raidCard?.uid;
  const ownedCards = (gs?.ownedCards||[]).filter(c => c.uid !== lockedUid);

  const selectedSlots = Object.values(slots).filter(Boolean);
  const canStart = selectedSlots.length >= 5 && !doneToday && !isGuest;

  const handleSlotClick = (grade) => {
    if (isGuest) { showToast('로그인이 필요합니다'); return; }
    if (doneToday) return;
    if (slots[grade]) {
      setSlots(prev => { const n={...prev}; delete n[grade]; return n; });
    } else {
      setPickGrade(grade);
      setPickExpanded(null);
    }
  };

  const handlePickTypeClick = (groupId) => {
    setPickExpanded(prev => prev === groupId ? null : groupId);
  };

  const handlePickInst = (inst) => {
    const def = CARDS.find(c=>c.id===inst.id);
    if (!def) return;
    setSlots(prev => ({ ...prev, [def.grade]: { cardDef: def, inst } }));
    setPickGrade(null);
    setPickExpanded(null);
  };

  const handleStart = () => {
    if (!canStart) return;
    battleRef.current = { slots: { ...slots }, bonusDmg: { ...bonusDmg } };
    setElapsed(0); setTotalDmg(0); setTickDmg(null); setDmgFloats([]);
    goPhase('battle', 'forward');
  };

  useEffect(() => {
    if (phase !== 'battle') { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next % TICK_S === 0) {
          const p = battleRef.current;
          if (p) {
            let dmg = 0;
            Object.values(p.slots).forEach(slot => {
              if (!slot) return;
              dmg += calcTickDmg(slot.cardDef.grade, slot.inst.condition, slot.inst.enhanceLevel||0, p.bonusDmg[slot.inst.id]||0);
            });
            setTickDmg(dmg);
            setTotalDmg(d => d + dmg);
            // 플로팅 데미지
            const fid = ++floatIdRef.current;
            setDmgFloats(prev => [...prev, { id: fid, dmg }]);
            setTimeout(() => setDmgFloats(prev => prev.filter(f => f.id !== fid)), 1200);
          }
        }
        if (next >= FARMING_DURATION) { clearInterval(timerRef.current); return FARMING_DURATION; }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (phase === 'battle' && elapsed >= FARMING_DURATION) handleDone();
  }, [elapsed, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDone = async () => {
    goPhase('done', 'forward');
    const tier = FARM_REWARDS.find(r => totalDmg >= r.min) || FARM_REWARDS[FARM_REWARDS.length-1];
    setReward(tier.tickets);
    setGs(prev => ({ ...prev, tickets: prev.tickets + tier.tickets, farmingAttempt: { date: today } }));
    if (user) {
      try {
        await updateDoc(doc(db,'users',user.uid), {
          tickets: (gs.tickets||0) + tier.tickets,
          farmingAttempt: { date: today },
        });
      } catch(e) { console.error('[farming done]', e); }
    }
  };

  const resetFarming = () => {
    clearInterval(timerRef.current);
    setSlots({}); setElapsed(0); setTotalDmg(0); setTickDmg(null); setDmgFloats([]); setReward(null);
    goPhase('select', 'back');
  };

  const pickerGroups = pickGrade
    ? groupByType(ownedCards.filter(oc => CARDS.find(c=>c.id===oc.id)?.grade===pickGrade), bonusDmg)
    : [];

  // 현재 보상 티어
  const currentTier = FARM_REWARDS.find(r => totalDmg >= r.min) || FARM_REWARDS[FARM_REWARDS.length-1];
  const nextTier    = totalDmg < FARM_REWARDS[0].min
    ? FARM_REWARDS.slice().reverse().find(r => r.min > totalDmg)
    : null;

  return (
    <div className="dungeon-sub-wrap">
      {toast && <div className="cw-toast">{toast}</div>}

      {farmInfoOpen && (
        <div className="card-zoom-overlay" onClick={() => setFarmInfoOpen(false)}>
          <div className="dungeon-info-sheet" onClick={e => e.stopPropagation()}>
            <div className="dungeon-info-title">파밍 던전 안내</div>
            <p className="dungeon-info-body">6가지 등급 중 각 등급별 1장씩 총 5장의 카드를 선택해 10분간 자동 전투를 진행합니다. 10분 후 누적 데미지에 따라 뽑기권을 획득할 수 있습니다.</p>
            <div className="dungeon-info-rewards">
              <div className="dungeon-info-reward-title">보상 기준</div>
              <div className="dungeon-info-reward-row"><span>0 ~ 1만 데미지</span><span>뽑기권 20장</span></div>
              <div className="dungeon-info-reward-row"><span>1만 ~ 5만 데미지</span><span>뽑기권 50장</span></div>
              <div className="dungeon-info-reward-row"><span>5만 ~ 10만 데미지</span><span>뽑기권 100장</span></div>
              <div className="dungeon-info-reward-row"><span>10만 이상 데미지</span><span>뽑기권 200장</span></div>
            </div>
            <button className="zoom-close" onClick={() => setFarmInfoOpen(false)}>닫기 ✕</button>
          </div>
        </div>
      )}

      {/* 카드 타입 피커 */}
      {pickGrade && (
        <div className="card-zoom-overlay" onClick={() => { setPickGrade(null); setPickExpanded(null); }}>
          <div className="inst-sheet" onClick={e=>e.stopPropagation()}>
            <div className="inst-sheet-title">
              {GRADE_LABEL[pickGrade]} 등급 카드 선택
              <span className="inst-sheet-count">{pickerGroups.length}종 보유</span>
            </div>
            <div style={{overflowY:'auto', maxHeight:'55vh', padding:'0 4px'}}>
              {pickerGroups.length === 0 ? (
                <div style={{color:'var(--muted)',padding:'20px',textAlign:'center'}}>
                  {GRADE_LABEL[pickGrade]} 등급 카드가 없어요
                </div>
              ) : pickerGroups.map(({ def, instances, bestDmg }) => {
                const bDmg = bonusDmg[def.id]||0;
                const isExp = pickExpanded === def.id;
                return (
                  <div key={def.id} className="dungeon-picker-group">
                    <div className="dungeon-picker-group-row" onClick={() => instances.length > 1 ? handlePickTypeClick(def.id) : handlePickInst(instances[0])}>
                      <div className="dungeon-picker-thumb">
                        <img src={`/${def.img}`} alt={def.name} />
                        {instances.length > 1 && <div className="dup">×{instances.length}</div>}
                      </div>
                      <div className="dungeon-picker-info">
                        <div className="dungeon-picker-name">{def.name}</div>
                        <div className="dungeon-picker-dmg">
                          최대 평균 {bestDmg}
                          {bDmg>0 && <span className="growth-bonus-tag" style={{marginLeft:5}}>성장 +{bDmg}</span>}
                        </div>
                      </div>
                      {instances.length > 1 && (
                        <div className={`dungeon-expand-arrow${isExp?' open':''}`}>›</div>
                      )}
                    </div>
                    {isExp && (
                      <div className="dungeon-inst-row">
                        {instances.map((inst, i) => {
                          const cond = inst.condition||1;
                          const enh  = inst.enhanceLevel||0;
                          const cc   = cond>=9?'#d97706':cond>=6?'#7c3aed':'#888';
                          return (
                            <div key={inst.uid} className="dungeon-inst-item" style={{animationDelay:`${i*50}ms`}}
                              onClick={() => handlePickInst(inst)}>
                              <div className="dungeon-inst-img">
                                <img src={`/${def.img}`} alt={def.name} />
                                {enh>0 && <div className="inst-item-badge">+{enh}</div>}
                              </div>
                              <div className="dungeon-inst-cond" style={{color:cc}}>컨디션 {cond}</div>
                              <div className="dungeon-inst-dmg">평균 {calcAvgDmg(def.grade,cond,enh,bDmg)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button className="zoom-close" onClick={()=>{setPickGrade(null);setPickExpanded(null);}}>닫기 ✕</button>
          </div>
        </div>
      )}

      <div key={phase} className={`dungeon-phase-${phaseDir}`}>

        {/* ── 카드 선택 화면 ── */}
        {phase === 'select' && (
          <>
            <div className="dungeon-section-header">
              <div className="dungeon-section-title">파밍 던전</div>
              <button className="dungeon-info-btn" onClick={() => setFarmInfoOpen(true)}>설명</button>
            </div>
            {doneToday && (
              <div className="farming-done-today">오늘 이미 파밍 던전을 완료했어요. 내일 다시 도전하세요!</div>
            )}
            <div className="farming-boss-preview">
              <img src={FARMING_BOSS_IMG} alt="파밍 던전 보스" />
            </div>
            <div className="farming-slots-title">
              참여 카드 선택 <span className="farming-slots-count">{selectedSlots.length}/5</span>
            </div>
            <div className="farming-slots">
              {GRADES_ALL.map(grade => {
                const sel = slots[grade];
                const hasCards = ownedCards.some(oc=>CARDS.find(c=>c.id===oc.id)?.grade===grade);
                return (
                  <div key={grade}
                    className={`farming-slot${sel?' filled':''}${!hasCards&&!sel?' no-card':''}`}
                    onClick={() => hasCards||sel ? handleSlotClick(grade) : showToast(`${GRADE_LABEL[grade]} 등급 카드가 없어요`)}
                  >
                    <div className="farming-slot-inner">
                      <div className="farming-slot-back">
                        <div className="farming-slot-back-inner">
                          <div className="farming-slot-back-logo">CW</div>
                          <div className="farming-slot-grade-label" style={{color:GRADE_COLOR[grade]}}>{GRADE_LABEL[grade]}</div>
                          <div className="farming-slot-plus">{hasCards?'+':'—'}</div>
                        </div>
                      </div>
                      <div className="farming-slot-front">
                        {sel && <img src={`/${sel.cardDef.img}`} alt={sel.cardDef.name} />}
                        {sel && <div className="farming-slot-grade-tag" style={{background:GRADE_BG[grade]}}>{GRADE_LABEL[grade]}</div>}
                        {sel && (
                          <button className="farming-slot-remove"
                            onClick={e=>{e.stopPropagation();setSlots(p=>{const n={...p};delete n[grade];return n;})}}>×</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="dungeon-primary-btn" onClick={handleStart} disabled={!canStart}
              style={!canStart?{opacity:0.45,cursor:'not-allowed'}:{}}>
              {isGuest?'로그인이 필요합니다':doneToday?'오늘 완료':selectedSlots.length<5?`카드 ${5-selectedSlots.length}장 더 선택`:'입장하기'}
            </button>
          </>
        )}

        {/* ── 전투 (레이드 스타일) ── */}
        {phase === 'battle' && (
          <div className="dg-farm-battle-wrap">
            {/* 보스 섹션 */}
            <div className="dg-boss-section dg-farm-boss-section">
              <div className="dg-boss-img-wrap dg-farm-img-wrap">
                <img src={FARMING_BOSS_IMG} className="dg-boss-img" alt="boss" />
                <div className="dg-boss-vignette" />
                {dmgFloats.map(f => (
                  <div key={f.id} className="dg-dmg-float">-{f.dmg.toLocaleString()}</div>
                ))}
              </div>
              <div className="dg-farm-info">
                <div className="dg-farm-info-row">
                  <div>
                    <div className="dg-farm-timer-label">남은 시간</div>
                    <div className="dg-farm-timer">{fmtTime(FARMING_DURATION - elapsed)}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="dg-farm-timer-label">누적 데미지</div>
                    <div className="dg-farm-total-dmg">{totalDmg.toLocaleString()}</div>
                  </div>
                </div>
                <div className="dg-farm-progress-bar">
                  <div className="dg-farm-progress-fill" style={{width:`${(elapsed/FARMING_DURATION)*100}%`}} />
                </div>
                <div className="dg-farm-reward-hint">
                  현재 예상 보상: <strong style={{color:'#4a9eff'}}>{currentTier.tickets}장</strong>
                  {nextTier && <span style={{color:'var(--muted)',fontSize:'0.72rem'}}> · {nextTier.min.toLocaleString()} 달성 시 {nextTier.tickets}장</span>}
                </div>
              </div>
            </div>

            {/* 참여 카드 */}
            <div className="dg-farm-cards-section">
              <div className="dg-my-label">
                <span className="dg-tick-dot" style={{background:'#4a9eff', boxShadow:'0 0 6px #4a9eff'}} />
                출격 카드
              </div>
              <div className="dg-farm-cards">
                {Object.values(slots).filter(Boolean).map(({cardDef, inst}) => {
                  const bDmg = bonusDmg[inst.id]||0;
                  return (
                    <div key={inst.uid} className={`dg-farm-card grade-${cardDef.grade}`}>
                      <div className="dg-farm-card-img">
                        <img src={`/${cardDef.img}`} alt={cardDef.name} />
                        <div className="dg-farm-card-grade-tag" style={{background:GRADE_BG[cardDef.grade]}}>{GRADE_LABEL[cardDef.grade]}</div>
                      </div>
                      <div className="dg-farm-card-name">{cardDef.name}</div>
                      <div className="dg-farm-card-dmg">{dmgRangeStr(cardDef.grade,inst.condition,inst.enhanceLevel||0,bDmg)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── 완료 화면 ── */}
        {phase === 'done' && (
          <div className="farming-done-wrap">
            <div className="farming-done-title">파밍 완료!</div>
            <div className="farming-done-boss"><img src={FARMING_BOSS_IMG} alt="boss" /></div>
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
                <div key={r.min} className={`farming-reward-tier-row${totalDmg>=r.min&&r===FARM_REWARDS.find(x=>totalDmg>=x.min)?' current':''}`}>
                  <span>{r.label}</span><span>{r.tickets}장</span>
                </div>
              ))}
            </div>
            <button className="dungeon-primary-btn" onClick={resetFarming} style={{marginTop:16}}>확인</button>
          </div>
        )}

      </div>
    </div>
  );
}

// ══════════════════════════════════════
// 메인 던전 탭
// ══════════════════════════════════════
const TAB_ORDER_DG = ['growth', 'farming'];

export default function DungeonTab({ gs, setGs, user, isGuest, musicOn }) {
  const [subTab, setSubTab]         = useState('growth');
  const [slideClass, setSlideClass] = useState('');
  const growthAudio  = useRef(null);
  const farmingAudio = useRef(null);

  useEffect(() => {
    const g = new Audio('/성장던전노래.mp3');
    const f = new Audio('/파밍던전노래.mp3');
    g.loop = true; g.volume = 0.4;
    f.loop = true; f.volume = 0.4;
    growthAudio.current  = g;
    farmingAudio.current = f;
    return () => { g.pause(); g.src=''; f.pause(); f.src=''; };
  }, []);

  useEffect(() => {
    const g = growthAudio.current;
    const f = farmingAudio.current;
    if (!g || !f) return;
    if (!musicOn) { g.pause(); f.pause(); return; }
    if (subTab === 'growth') { f.pause(); g.play().catch(()=>{}); }
    else                     { g.pause(); f.play().catch(()=>{}); }
  }, [subTab, musicOn]);

  useEffect(() => {
    if (!musicOn) { growthAudio.current?.pause(); farmingAudio.current?.pause(); }
    else {
      if (subTab === 'growth') growthAudio.current?.play().catch(()=>{});
      else farmingAudio.current?.play().catch(()=>{});
    }
  }, [musicOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchSubTab = (t) => {
    if (t === subTab) return;
    const dir = TAB_ORDER_DG.indexOf(t) > TAB_ORDER_DG.indexOf(subTab) ? 'right' : 'left';
    setSubTab(t);
    setSlideClass(` subtab-slide-${dir}`);
    setTimeout(() => setSlideClass(''), 300);
  };

  return (
    <>
      <div className="subtab-bar">
        <button className={`subtab-btn${subTab==='growth'?' active':''}`} onClick={()=>switchSubTab('growth')}>성장 던전</button>
        <button className={`subtab-btn${subTab==='farming'?' active':''}`} onClick={()=>switchSubTab('farming')}>파밍 던전</button>
      </div>
      {/* 두 컴포넌트 항상 마운트 유지 → 탭 전환해도 상태 초기화 안됨 */}
      <div className={`subtab-content${slideClass}`}>
        <div style={{display: subTab==='growth' ? 'block' : 'none'}}>
          <GrowthDungeon  gs={gs} setGs={setGs} user={user} isGuest={isGuest} />
        </div>
        <div style={{display: subTab==='farming' ? 'block' : 'none'}}>
          <FarmingDungeon gs={gs} setGs={setGs} user={user} isGuest={isGuest} />
        </div>
      </div>
    </>
  );
}
