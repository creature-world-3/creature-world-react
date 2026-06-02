import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
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
  const [battles, setBattles]               = useState({});
  const [toast, setToast]                   = useState(null);
  const [growthInfoOpen, setGrowthInfoOpen] = useState(false);
  const [selectedGrade, setSelectedGrade]   = useState(null);
  const [detailCardPick, setDetailCardPick] = useState(null); // { inst, def, bDmg }
  const [showGrowthPicker, setShowGrowthPicker] = useState(false);
  const [growthPickExp, setGrowthPickExp]   = useState(null);
  const toastRef    = useRef(null);
  const tickRef     = useRef(null);
  const gsRef       = useRef(gs);
  const userRef     = useRef(user);
  const battlesRef  = useRef({});
  const clearingRef = useRef(new Set());
  const restoredRef = useRef(false);

  useEffect(() => { gsRef.current = gs; }, [gs]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { battlesRef.current = battles; }, [battles]);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  const bonusDmg   = gs?.cardBonusDmg || {};
  const lockedUid  = gs?.raidCard?.uid;
  const ownedCards = (gs?.ownedCards||[]).filter(c => c.uid !== lockedUid);

  // Firestore growthBattles 복원 (마운트 후 gs 로드 완료 시 1회)
  useEffect(() => {
    if (!user || !gs?.ownedCards?.length || restoredRef.current) return;
    restoredRef.current = true;
    const saved = gs?.growthBattles || {};
    if (!Object.keys(saved).length) return;
    const now = Date.now();
    const restored = {};
    for (const [grade, b] of Object.entries(saved)) {
      const inst = gs.ownedCards.find(c => c.uid === b.cardInstUid);
      const def  = CARDS.find(c => c.id === b.cardId);
      if (!inst || !def) continue;
      const ticksGone  = Math.floor((now - (b.startTime||now)) / (TICK_S * 1000));
      const avgDmgTick = calcAvgDmg(grade, inst.condition, inst.enhanceLevel||0, b.bDmg);
      const dmgDealt   = ticksGone * avgDmgTick;
      const currentHp  = Math.max(0, (b.maxHp||0) - dmgDealt);
      if (currentHp > 0) {
        restored[grade] = {
          active: true, hp: currentHp, maxHp: b.maxHp,
          cardInst: inst, cardDef: def, bDmg: b.bDmg,
          totalDmg: dmgDealt, lastDmg: null, shaking: false,
        };
      }
    }
    if (Object.keys(restored).length > 0) setBattles(restored);
  }, [user, gs?.ownedCards?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const getAttempts = (cardId) => {
    const a = gsRef.current?.dungeonAttempts?.[cardId];
    return (!a || a.date !== todayKST()) ? 0 : (a.count||0);
  };

  const startBattle = async (grade, inst) => {
    if (isGuest) { showToast('로그인이 필요합니다'); return; }
    const def  = CARDS.find(c => c.id === inst.id);
    if (!def) return;
    const att  = getAttempts(inst.id);
    if (att >= MAX_DAILY_GROWTH) { showToast('오늘 이 등급의 도전 횟수를 다 사용했어요!'); return; }
    const bDmg   = gsRef.current?.cardBonusDmg?.[inst.id] || 0;
    const avgDmg = calcAvgDmg(grade, inst.condition, inst.enhanceLevel||0, bDmg);
    const maxHp  = avgDmg * 1200;
    const battleData = { cardInstUid: inst.uid, cardId: inst.id, bDmg, maxHp, startTime: Date.now() };
    setBattles(prev => ({
      ...prev,
      [grade]: { active: true, hp: maxHp, maxHp, cardInst: inst, cardDef: def, bDmg, totalDmg: 0, lastDmg: null, shaking: false },
    }));
    setGs(prev => ({ ...prev, growthBattles: { ...(prev.growthBattles||{}), [grade]: battleData } }));
    if (user) {
      try { await updateDoc(doc(db,'users',user.uid), { [`growthBattles.${grade}`]: battleData }); }
      catch(e) { console.error('[growth start]', e); }
    }
  };

  // 틱 인터벌
  useEffect(() => {
    tickRef.current = setInterval(async () => {
      const current = battlesRef.current;
      const updates = {};
      const clears  = [];
      for (const [grade, b] of Object.entries(current)) {
        if (!b?.active || clearingRef.current.has(grade)) continue;
        const dmg   = calcTickDmg(b.cardDef.grade, b.cardInst.condition, b.cardInst.enhanceLevel||0, b.bDmg);
        const newHp = Math.max(0, b.hp - dmg);
        updates[grade] = { ...b, hp: newHp, totalDmg: b.totalDmg + dmg, lastDmg: dmg, shaking: true };
        if (newHp === 0) { updates[grade].active = false; clears.push({ grade, battle: b }); }
      }
      if (Object.keys(updates).length > 0) {
        setBattles(prev => ({ ...prev, ...updates }));
        setTimeout(() => {
          setBattles(prev => {
            const reset = {};
            for (const g of Object.keys(updates)) reset[g] = prev[g] ? { ...prev[g], shaking: false } : prev[g];
            return { ...prev, ...reset };
          });
        }, 500);
      }
      for (const { grade, battle } of clears) {
        clearingRef.current.add(grade);
        const currentGs   = gsRef.current;
        const currentUser = userRef.current;
        const t      = todayKST();
        const cardId = battle.cardInst.id;
        const a      = currentGs?.dungeonAttempts?.[cardId];
        const att    = (!a || a.date !== t) ? 0 : (a.count||0);
        const newCount = att + 1;
        const newBonus = (currentGs?.cardBonusDmg?.[cardId] || 0) + 1;
        setGs(prev => ({
          ...prev,
          cardBonusDmg:    { ...(prev.cardBonusDmg||{}), [cardId]: newBonus },
          dungeonAttempts: { ...(prev.dungeonAttempts||{}), [cardId]: { count: newCount, date: t } },
          growthBattles:   (() => { const nb={...(prev.growthBattles||{})}; delete nb[grade]; return nb; })(),
        }));
        if (currentUser) {
          try {
            await updateDoc(doc(db,'users',currentUser.uid), {
              [`cardBonusDmg.${cardId}`]:    newBonus,
              [`dungeonAttempts.${cardId}`]: { count: newCount, date: t },
              [`growthBattles.${grade}`]:    deleteField(),
            });
          } catch(e) { console.error('[growth clear]', e); }
        }
        if (newCount < MAX_DAILY_GROWTH) {
          const avg   = calcAvgDmg(grade, battle.cardInst.condition, battle.cardInst.enhanceLevel||0, newBonus);
          const maxHp = avg * 1200;
          const newBD = { cardInstUid: battle.cardInst.uid, cardId: battle.cardInst.id, bDmg: newBonus, maxHp, startTime: Date.now() };
          setBattles(prev => ({
            ...prev,
            [grade]: { ...prev[grade], active: true, hp: maxHp, maxHp, bDmg: newBonus, totalDmg: 0, lastDmg: null },
          }));
          setGs(prev => ({ ...prev, growthBattles: { ...(prev.growthBattles||{}), [grade]: newBD } }));
          if (currentUser) {
            try { await updateDoc(doc(db,'users',currentUser.uid), { [`growthBattles.${grade}`]: newBD }); }
            catch(e) { console.error('[growth restart]', e); }
          }
        }
        clearingRef.current.delete(grade);
      }
    }, TICK_S * 1000);
    return () => clearInterval(tickRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeModal = () => {
    setSelectedGrade(null);
    setDetailCardPick(null);
    setShowGrowthPicker(false);
    setGrowthPickExp(null);
  };

  const selGrade    = selectedGrade;
  const selBattle   = selGrade ? battles[selGrade] : null;
  const selHasCards = selGrade && !isGuest && ownedCards.some(oc => CARDS.find(c=>c.id===oc.id)?.grade===selGrade);
  const selGradeCards = selGrade ? groupByType(ownedCards.filter(oc => CARDS.find(c=>c.id===oc.id)?.grade===selGrade), bonusDmg) : [];
  const selAtt      = selBattle?.active
    ? getAttempts(selBattle.cardInst.id)
    : detailCardPick ? getAttempts(detailCardPick.inst.id) : 0;
  const selAllDone  = selHasCards && selAtt >= MAX_DAILY_GROWTH && !selBattle?.active;
  const selHpPct    = selBattle ? (selBattle.hp / selBattle.maxHp) * 100 : 100;

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

      {/* 성장 던전 상세 모달 */}
      {selectedGrade && (
        <div className="card-zoom-overlay" onClick={closeModal}>
          <div className="growth-detail-sheet" onClick={e => e.stopPropagation()}>

            {/* 카드 선택 팝업 */}
            {showGrowthPicker && (
              <div className="growth-picker-overlay" onClick={() => { setShowGrowthPicker(false); setGrowthPickExp(null); }}>
                <div className="inst-sheet" onClick={e => e.stopPropagation()}>
                  <div className="inst-sheet-title">
                    {GRADE_LABEL[selGrade]} 카드 선택
                    <span className="inst-sheet-count">{selGradeCards.length}종</span>
                  </div>
                  <div style={{overflowY:'auto', maxHeight:'52vh', padding:'0 4px'}}>
                    {selGradeCards.length === 0 ? (
                      <div style={{color:'var(--muted)',padding:'20px',textAlign:'center'}}>카드가 없어요</div>
                    ) : selGradeCards.map(({ def, instances, bestDmg }) => {
                      const bDmg = bonusDmg[def.id]||0;
                      const isExp = growthPickExp === def.id;
                      const pickOne = (inst) => {
                        setDetailCardPick({ inst, def, bDmg: gsRef.current?.cardBonusDmg?.[def.id]||0 });
                        setShowGrowthPicker(false);
                        setGrowthPickExp(null);
                      };
                      return (
                        <div key={def.id} className="dungeon-picker-group">
                          <div className="dungeon-picker-group-row"
                            onClick={() => instances.length > 1 ? setGrowthPickExp(p => p===def.id?null:def.id) : pickOne(instances[0])}>
                            <div className="dungeon-picker-thumb">
                              <img src={`/${def.img}`} alt={def.name} />
                              {instances.length > 1 && <div className="dup">×{instances.length}</div>}
                            </div>
                            <div className="dungeon-picker-info">
                              <div className="dungeon-picker-name">{def.name}</div>
                              <div className="dungeon-picker-dmg">
                                평균 {bestDmg}
                                {bDmg>0 && <span className="growth-bonus-tag" style={{marginLeft:5}}>+{bDmg}</span>}
                              </div>
                            </div>
                            {instances.length > 1 && <div className={`dungeon-expand-arrow${isExp?' open':''}`}>›</div>}
                          </div>
                          {isExp && (
                            <div className="dungeon-inst-row">
                              {instances.map((inst, i) => {
                                const cond = inst.condition||1;
                                const enh  = inst.enhanceLevel||0;
                                const cc   = cond>=9?'#d97706':cond>=6?'#7c3aed':'#888';
                                return (
                                  <div key={inst.uid} className="dungeon-inst-item" style={{animationDelay:`${i*50}ms`}}
                                    onClick={() => pickOne(inst)}>
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
                  <button className="zoom-close" onClick={() => { setShowGrowthPicker(false); setGrowthPickExp(null); }}>닫기 ✕</button>
                </div>
              </div>
            )}

            <div className="growth-detail-header">
              <span className="growth-detail-grade-tag" style={{ background: GRADE_BG[selectedGrade] }}>
                {GRADE_LABEL[selectedGrade]}
              </span>
              <span className="growth-detail-title">성장 던전</span>
            </div>

            <div className="growth-detail-boss-wrap">
              <img
                src={GROWTH_BOSS_IMG[selectedGrade]}
                alt={GRADE_LABEL[selectedGrade]}
                className={selBattle?.shaking ? 'gbc-shaking' : ''}
              />
              {selBattle?.active && selBattle.lastDmg != null && (
                <div className="gbc-detail-dmg-float" key={selBattle.totalDmg} style={{ color: GRADE_COLOR[selectedGrade] }}>
                  -{selBattle.lastDmg.toLocaleString()}
                </div>
              )}
            </div>

            {/* HP 바 (전투 중일 때) */}
            {selBattle && (
              <div className="growth-detail-hp-wrap">
                <div className="growth-detail-hp-label">
                  <span>HP</span>
                  <span>{selBattle.hp.toLocaleString()} / {selBattle.maxHp.toLocaleString()}</span>
                </div>
                <div className="growth-detail-hp-bar">
                  <div className="growth-detail-hp-fill" style={{ width:`${selHpPct}%`, background: GRADE_COLOR[selectedGrade] }} />
                </div>
                {selBattle.active && (
                  <div className="growth-detail-total-dmg">누적 데미지: {selBattle.totalDmg.toLocaleString()}</div>
                )}
              </div>
            )}

            {/* 출격 카드 */}
            {selHasCards && !selBattle?.active && (
              <div className="growth-detail-card-wrap">
                <div className="growth-detail-card-label">출격 카드</div>
                {detailCardPick ? (
                  <div className="growth-detail-card-row">
                    <div className="growth-detail-card-img">
                      <img src={`/${detailCardPick.def.img}`} alt={detailCardPick.def.name} />
                      {(detailCardPick.inst.enhanceLevel||0) > 0 && (
                        <div className="inst-item-badge">+{detailCardPick.inst.enhanceLevel}</div>
                      )}
                    </div>
                    <div className="growth-detail-card-info">
                      <div className="growth-detail-card-name">{detailCardPick.def.name}</div>
                      <div className="growth-detail-card-dmg">
                        {dmgRangeStr(detailCardPick.def.grade, detailCardPick.inst.condition, detailCardPick.inst.enhanceLevel||0, detailCardPick.bDmg)}
                      </div>
                      {detailCardPick.bDmg > 0 && <div className="growth-bonus-tag">성장 +{detailCardPick.bDmg}</div>}
                    </div>
                    <button className="growth-detail-change-btn" onClick={() => setShowGrowthPicker(true)}>변경</button>
                  </div>
                ) : (
                  <button className="growth-detail-pick-btn" onClick={() => setShowGrowthPicker(true)}>
                    카드 선택하기
                  </button>
                )}
              </div>
            )}

            {/* 전투 중일 때 출격 카드 표시 */}
            {selBattle?.active && (
              <div className="growth-detail-card-wrap">
                <div className="growth-detail-card-label">출격 중인 카드</div>
                <div className="growth-detail-card-row">
                  <div className="growth-detail-card-img">
                    <img src={`/${selBattle.cardDef.img}`} alt={selBattle.cardDef.name} />
                    {(selBattle.cardInst.enhanceLevel||0) > 0 && (
                      <div className="inst-item-badge">+{selBattle.cardInst.enhanceLevel}</div>
                    )}
                  </div>
                  <div className="growth-detail-card-info">
                    <div className="growth-detail-card-name">{selBattle.cardDef.name}</div>
                    <div className="growth-detail-card-dmg">
                      {dmgRangeStr(selBattle.cardDef.grade, selBattle.cardInst.condition, selBattle.cardInst.enhanceLevel||0, selBattle.bDmg)}
                    </div>
                    {selBattle.bDmg > 0 && <div className="growth-bonus-tag">성장 +{selBattle.bDmg}</div>}
                  </div>
                </div>
              </div>
            )}

            {!selHasCards && (
              <div className="growth-detail-no-card">{GRADE_LABEL[selectedGrade]} 등급 카드가 없어요</div>
            )}

            {/* 도전 횟수 */}
            {selHasCards && (
              <div className="growth-detail-attempts">
                <span>오늘 도전 횟수</span>
                <div className="gbc-attempts" style={{ display:'inline-flex', marginLeft:8 }}>
                  {[...Array(MAX_DAILY_GROWTH)].map((_,i) => (
                    <span key={i} className={`gbc-dot${i<selAtt?' used':''}`} />
                  ))}
                </div>
                <span style={{ marginLeft:8, color:'var(--muted)', fontSize:'0.8rem' }}>{selAtt}/{MAX_DAILY_GROWTH}</span>
              </div>
            )}

            {/* 버튼 */}
            <div className="growth-detail-btns">
              {selBattle?.active ? (
                <div className="growth-detail-fighting-badge">전투 중 ⚔</div>
              ) : selAllDone ? (
                <div className="growth-detail-done-badge">오늘 완료 ✓</div>
              ) : selHasCards ? (
                <button
                  className="dungeon-primary-btn"
                  disabled={!detailCardPick}
                  style={!detailCardPick ? {opacity:0.45,cursor:'not-allowed'} : {}}
                  onClick={async () => {
                    if (!detailCardPick) return;
                    await startBattle(selGrade, detailCardPick.inst);
                    closeModal();
                  }}
                >
                  전투 시작
                </button>
              ) : null}
              <button className="zoom-close" style={{ marginTop: 8 }} onClick={closeModal}>닫기 ✕</button>
            </div>
          </div>
        </div>
      )}

      <div className="dungeon-section-header">
        <div className="dungeon-section-title">성장 던전</div>
        <button className="dungeon-info-btn" onClick={() => setGrowthInfoOpen(true)}>설명</button>
      </div>

      <div className="growth-grade-grid">
        {GRADES_ALL.map(grade => {
          const hasCards = !isGuest && ownedCards.some(oc=>CARDS.find(c=>c.id===oc.id)?.grade===grade);
          const battle   = battles[grade];
          const bestCard = hasCards ? (() => {
            const bDmg = bonusDmg;
            const gc = ownedCards.filter(oc => CARDS.find(c=>c.id===oc.id)?.grade===grade);
            if (!gc.length) return null;
            return gc.reduce((best, oc) => {
              const def = CARDS.find(c=>c.id===oc.id);
              if (!def) return best;
              const b = bDmg[oc.id]||0;
              const dmg = calcAvgDmg(grade, oc.condition, oc.enhanceLevel||0, b);
              return (!best || dmg > best.dmg) ? { inst: oc, def, dmg, bDmg: b } : best;
            }, null);
          })() : null;
          const att     = bestCard ? getAttempts(bestCard.inst.id) : 0;
          const allDone = hasCards && att >= MAX_DAILY_GROWTH;
          const isActive = battle?.active;
          const hpPct    = battle ? (battle.hp / battle.maxHp) * 100 : 100;
          const gc       = GRADE_COLOR[grade];

          return (
            <div
              key={grade}
              className={`growth-boss-card${hasCards?'':' locked'}${isActive?' gbc-active':''}${allDone?' gbc-done-card':''}`}
              onClick={() => setSelectedGrade(grade)}
            >
              <div className="growth-boss-img-wrap">
                <img
                  src={GROWTH_BOSS_IMG[grade]}
                  alt={GRADE_LABEL[grade]}
                  className={battle?.shaking ? 'gbc-shaking' : ''}
                />
              </div>
              {battle && (
                <div className="gbc-hp-wrap">
                  <div className="gbc-hp-bar">
                    <div className="gbc-hp-fill" style={{ width:`${hpPct}%`, background: gc }} />
                  </div>
                </div>
              )}
              <div className="growth-boss-grade-tag" style={{ background: GRADE_BG[grade] }}>
                {GRADE_LABEL[grade]}
              </div>
              {hasCards && (
                <div className="gbc-attempts">
                  {[...Array(MAX_DAILY_GROWTH)].map((_,i) => (
                    <span key={i} className={`gbc-dot${i<att?' used':''}`} />
                  ))}
                </div>
              )}
              {isActive && <div className="gbc-status-badge gbc-fighting">전투 중</div>}
              {allDone && <div className="gbc-status-badge gbc-done">완료</div>}
              {!hasCards && <div className="growth-boss-lock">카드 없음</div>}
              {isActive && battle.lastDmg != null && (
                <div className="gbc-last-dmg" key={battle.totalDmg} style={{ color: gc }}>
                  -{battle.lastDmg.toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="gbc-hint">보스를 눌러 상세 정보 확인 · 등급별 동시 진행 가능</div>
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
  const [selectedCards, setSelectedCards] = useState([]); // [{ cardDef, inst }]
  const [pickGrade, setPickGrade]         = useState(null);
  const [pickExpanded, setPickExpanded]   = useState(null);
  const [elapsed, setElapsed]             = useState(0);
  const [totalDmg, setTotalDmg]         = useState(0);
  const [dmgFloats, setDmgFloats]       = useState([]);
  const [reward, setReward]             = useState(null);
  const [toast, setToast]               = useState(null);
  const toastRef    = useRef(null);
  const timerRef    = useRef(null);
  const battleRef   = useRef(null);
  const floatIdRef  = useRef(0);
  const restoredRef = useRef(false);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  const goPhase = (next, dir = 'forward') => { setPhaseDir(dir); setPhase(next); };

  const today      = todayKST();
  const bonusDmg   = gs?.cardBonusDmg || {};
  const doneToday  = gs?.farmingAttempt?.date === today;
  const lockedUid  = gs?.raidCard?.uid;
  const ownedCards = (gs?.ownedCards||[]).filter(c => c.uid !== lockedUid);

  // Firestore farmingBattle 복원
  useEffect(() => {
    if (!user || !gs?.ownedCards?.length || restoredRef.current) return;
    restoredRef.current = true;
    const fb = gs?.farmingBattle;
    if (!fb || fb.date !== today) return;
    const elapsedSec = Math.floor((Date.now() - fb.startTime) / 1000);
    if (elapsedSec >= FARMING_DURATION) return;
    const restoredCards = [];
    for (const s of (fb.slots||[])) {
      const inst = gs.ownedCards.find(c => c.uid === s.cardInstUid);
      const def  = CARDS.find(c => c.id === s.cardId);
      if (inst && def) restoredCards.push({ cardDef: def, inst });
    }
    if (!restoredCards.length) return;
    const avgTickDmg = restoredCards.reduce((sum, s) => {
      const bDmg = (fb.bonusDmg||{})[s.inst.id]||0;
      return sum + calcAvgDmg(s.cardDef.grade, s.inst.condition, s.inst.enhanceLevel||0, bDmg);
    }, 0);
    const estimatedDmg = Math.floor(elapsedSec / TICK_S) * avgTickDmg;
    const slotsObj = Object.fromEntries(restoredCards.map(s => [s.cardDef.grade, s]));
    setSelectedCards(restoredCards);
    setElapsed(elapsedSec);
    setTotalDmg(estimatedDmg);
    battleRef.current = { slots: slotsObj, bonusDmg: fb.bonusDmg||{} };
    goPhase('battle', 'forward');
  }, [user, gs?.ownedCards?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSlotClick = (grade) => {
    if (isGuest) { showToast('로그인이 필요합니다'); return; }
    if (doneToday) return;
    const sel = selectedCards.find(s => s.cardDef.grade === grade);
    if (sel) {
      // 이미 선택됨 → 해제
      setSelectedCards(prev => prev.filter(s => s.inst.uid !== sel.inst.uid));
    } else {
      const hasCards = ownedCards.some(oc => CARDS.find(c => c.id === oc.id)?.grade === grade);
      if (!hasCards) { showToast(`${GRADE_LABEL[grade]} 등급 카드가 없어요`); return; }
      setPickGrade(grade);
      setPickExpanded(null);
    }
  };

  const handlePickInst = (inst) => {
    const def = CARDS.find(c => c.id === inst.id);
    if (!def) return;
    setSelectedCards(prev => {
      const filtered = prev.filter(s => s.cardDef.grade !== def.grade);
      return [...filtered, { cardDef: def, inst }];
    });
    setPickGrade(null);
    setPickExpanded(null);
  };

  const handleStart = async () => {
    if (isGuest) { showToast('로그인이 필요합니다'); return; }
    if (doneToday) { showToast('오늘은 이미 파밍 던전을 완료했어요'); return; }
    if (!selectedCards.length) { showToast('카드를 선택해주세요'); return; }
    const slotsObj = Object.fromEntries(selectedCards.map(s => [s.cardDef.grade, s]));
    battleRef.current = { slots: slotsObj, bonusDmg: { ...bonusDmg } };
    setElapsed(0); setTotalDmg(0); setDmgFloats([]);
    const fbData = {
      date: today,
      startTime: Date.now(),
      slots: selectedCards.map(s => ({ cardInstUid: s.inst.uid, cardId: s.cardDef.id })),
      bonusDmg: { ...bonusDmg },
    };
    setGs(prev => ({ ...prev, farmingBattle: fbData }));
    if (user) {
      try { await updateDoc(doc(db,'users',user.uid), { farmingBattle: fbData }); }
      catch(e) { console.error('[farming start]', e); }
    }
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
            setTotalDmg(d => d + dmg);
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
    setGs(prev => ({ ...prev, tickets: prev.tickets + tier.tickets, farmingAttempt: { date: today }, farmingBattle: null }));
    if (user) {
      try {
        await updateDoc(doc(db,'users',user.uid), {
          tickets: (gs.tickets||0) + tier.tickets,
          farmingAttempt: { date: today },
          farmingBattle: deleteField(),
        });
      } catch(e) { console.error('[farming done]', e); }
    }
  };

  const resetFarming = () => {
    clearInterval(timerRef.current);
    setSelectedCards([]); setElapsed(0); setTotalDmg(0); setDmgFloats([]); setReward(null);
    goPhase('select', 'back');
  };

  const currentTier = FARM_REWARDS.find(r => totalDmg >= r.min) || FARM_REWARDS[FARM_REWARDS.length-1];
  const nextTier    = totalDmg < FARM_REWARDS[0].min
    ? FARM_REWARDS.slice().reverse().find(r => r.min > totalDmg) : null;

  // 픽커용: 선택된 등급의 카드 그룹
  const pickerGroups = pickGrade
    ? groupByType(ownedCards.filter(oc => CARDS.find(c => c.id === oc.id)?.grade === pickGrade), bonusDmg)
    : [];

  return (
    <div className="dungeon-sub-wrap">
      {toast && <div className="cw-toast">{toast}</div>}

      {farmInfoOpen && (
        <div className="card-zoom-overlay" onClick={() => setFarmInfoOpen(false)}>
          <div className="dungeon-info-sheet" onClick={e => e.stopPropagation()}>
            <div className="dungeon-info-title">파밍 던전 안내</div>
            <p className="dungeon-info-body">등급별 슬롯을 눌러 카드를 선택하세요. 10분간 자동 전투 후 누적 데미지에 따라 뽑기권을 획득합니다.</p>
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

      {/* 등급별 카드 픽커 팝업 */}
      {pickGrade && (
        <div className="card-zoom-overlay" onClick={() => { setPickGrade(null); setPickExpanded(null); }}>
          <div className="inst-sheet" onClick={e => e.stopPropagation()}>
            <div className="inst-sheet-title">
              <span style={{color: GRADE_COLOR[pickGrade], fontFamily:'Nunito', fontWeight:900}}>{GRADE_LABEL[pickGrade]}</span>
              &nbsp;등급 카드 선택
              <span className="inst-sheet-count">{pickerGroups.length}종</span>
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
                    <div className="dungeon-picker-group-row"
                      onClick={() => instances.length > 1
                        ? setPickExpanded(p => p === def.id ? null : def.id)
                        : handlePickInst(instances[0])
                      }>
                      <div className="dungeon-picker-thumb">
                        <img src={`/${def.img}`} alt={def.name} />
                        {instances.length > 1 && <div className="dup">×{instances.length}</div>}
                      </div>
                      <div className="dungeon-picker-info">
                        <div className="dungeon-picker-name">{def.name}</div>
                        <div className="dungeon-picker-dmg">
                          최대 평균 {bestDmg}
                          {bDmg > 0 && <span className="growth-bonus-tag" style={{marginLeft:5}}>성장 +{bDmg}</span>}
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
                            <div key={inst.uid} className="dungeon-inst-item"
                              style={{animationDelay:`${i*50}ms`}}
                              onClick={() => handlePickInst(inst)}>
                              <div className="dungeon-inst-img">
                                <img src={`/${def.img}`} alt={def.name} />
                                {enh > 0 && <div className="inst-item-badge">+{enh}</div>}
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
            <button className="zoom-close" onClick={() => { setPickGrade(null); setPickExpanded(null); }}>닫기 ✕</button>
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

            <div className="farm-sel-header">
              참여 카드 선택 <span className="farming-slots-count">{selectedCards.length}/6</span>
            </div>
            <div className="farm-sel-slots">
              {GRADES_ALL.map(grade => {
                const sel = selectedCards.find(s => s.cardDef.grade === grade);
                const hasCards = ownedCards.some(oc => CARDS.find(c => c.id === oc.id)?.grade === grade);
                return (
                  <div
                    key={grade}
                    className={`farm-sel-slot${sel?' filled':''}${!hasCards&&!sel?' no-card':''}`}
                    onClick={() => handleSlotClick(grade)}
                  >
                    {sel ? (
                      <>
                        <img src={`/${sel.cardDef.img}`} alt={sel.cardDef.name} />
                        <div className="farm-sel-grade-tag" style={{background:GRADE_BG[grade]}}>{GRADE_LABEL[grade]}</div>
                        <button className="farm-sel-remove"
                          onClick={e => { e.stopPropagation(); setSelectedCards(prev => prev.filter(s => s.inst.uid !== sel.inst.uid)); }}>×</button>
                      </>
                    ) : (
                      <div className="farm-sel-empty">
                        <div className="farm-sel-empty-grade" style={{color: hasCards ? GRADE_COLOR[grade] : 'rgba(255,255,255,0.25)'}}>{GRADE_LABEL[grade]}</div>
                        <div style={{fontSize:'1.2rem', opacity: hasCards ? 0.5 : 0.2, lineHeight:1}}>+</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              className="dungeon-primary-btn"
              onClick={handleStart}
              disabled={doneToday || selectedCards.length === 0}
              style={(doneToday || selectedCards.length === 0) ? {opacity:0.45,cursor:'not-allowed'} : {}}
            >
              {isGuest ? '로그인이 필요합니다' : doneToday ? '오늘 완료' : selectedCards.length === 0 ? '카드를 선택하세요' : '시작하기'}
            </button>
          </>
        )}

        {/* ── 전투 화면 ── */}
        {phase === 'battle' && (
          <div className="dg-farm-battle-wrap">
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
            <div className="dg-farm-cards-section">
              <div className="dg-my-label">
                <span className="dg-tick-dot" style={{background:'#4a9eff',boxShadow:'0 0 6px #4a9eff'}} />
                출격 카드
              </div>
              <div className="dg-farm-cards">
                {selectedCards.map(({cardDef, inst}) => {
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
      <div className={`subtab-content${slideClass}`}>
        <div style={{display: subTab==='growth' ? 'block' : 'none'}}>
          <GrowthDungeon gs={gs} setGs={setGs} user={user} isGuest={isGuest} />
        </div>
        <div style={{display: subTab==='farming' ? 'block' : 'none'}}>
          <FarmingDungeon gs={gs} setGs={setGs} user={user} isGuest={isGuest} />
        </div>
      </div>
    </>
  );
}
