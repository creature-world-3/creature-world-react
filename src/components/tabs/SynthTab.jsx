import { useState, useRef } from 'react';
import { CARDS } from '../../data/cards.js';
import { calcDmgRange } from '../../utils/cardDraw.js';

const ALL_GRADES  = ['n', 'r', 'sr', 'ur', 'lg', 'raid'];
const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID', awakened: 'AWAKENED' };
const GRADE_BG    = { n: 'rgba(80,80,80,0.9)', r: '#1a6fd4', sr: '#7c3aed', ur: '#d97706', lg: '#ff6b6b', raid: '#b8860b', awakened: '#2d0060' };
const GRADE_COL   = { n: '#ccc', r: '#7eb8ff', sr: '#d4a8ff', ur: '#ffd97a', lg: '#fff', raid: '#fff', awakened: '#d4a8ff' };

const ENHANCE_COST = {
  base: { n: 5,  r: 10, sr: 20, ur: 35,  lg: 50,  raid: 70,  awakened: 100 },
  mid:  { n: 8,  r: 15, sr: 30, ur: 53,  lg: 75,  raid: 105, awakened: 150 },
  high: { n: 10, r: 20, sr: 40, ur: 70,  lg: 100, raid: 140, awakened: 200 },
};
function getEnhanceCost(grade, currentLevel) {
  if (currentLevel <= 4) return ENHANCE_COST.base[grade] ?? 5;
  if (currentLevel <= 9) return ENHANCE_COST.mid[grade]  ?? 8;
  return ENHANCE_COST.high[grade] ?? 10;
}
const ENHANCE_RATE = { 1: 90, 2: 80, 3: 70, 4: 60, 5: 50, 6: 40, 7: 30, 8: 20, 9: 10, 10: 5 };
const CONDITION_RESET_COST = 250;
const DISPLAY_GRADES = [...ALL_GRADES, 'awakened'];

function calcBonus(ownedCards) {
  const BONUS_MULT = { n:0.5, r:1, sr:2, ur:3, lg:5, raid:10, awakened:20 };
  let b = 0;
  const seen = new Set();
  for (const o of ownedCards) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    const c = CARDS.find(x => x.id === o.id);
    if (c) b += BONUS_MULT[c.grade] || 0;
  }
  return Math.floor(b);
}

// ── 강화 서브탭 ──────────────────────────────────────────────────────────────
function EnhanceSubTab({ gs, setGs, isGuest }) {
  const [filterGrade, setFilterGrade] = useState('n');
  const [selectedInst, setSelectedInst]       = useState(null);
  const [selectedCardDef, setSelectedCardDef] = useState(null);
  const [siblingInsts, setSiblingInsts]       = useState([]);
  const [enhancePhase, setEnhancePhase]       = useState('idle');
  const [displayLevel, setDisplayLevel]       = useState(0);
  const [particles, setParticles]             = useState([]);
  const [toast, setToast]   = useState(null);
  const toastTimer  = useRef(null);
  const phaseTimer  = useRef(null);

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const ownedCards = gs?.ownedCards || [];
  const cardTypesInGrade = CARDS.filter(c =>
    c.grade === filterGrade && ownedCards.some(oc => oc.id === c.id),
  );

  const selectCardType = (cardDef) => {
    if (enhancePhase !== 'idle') return;
    const instances = ownedCards.filter(c => c.id === cardDef.id);
    if (!instances.length) return;
    const sorted = [...instances].sort((a, b) => (b.enhanceLevel || 0) - (a.enhanceLevel || 0));
    setSelectedInst(sorted[0]);
    setSelectedCardDef(cardDef);
    setDisplayLevel(sorted[0].enhanceLevel || 0);
    setSiblingInsts(sorted);
    setEnhancePhase('idle');
  };

  const selectInstance = (inst) => {
    if (enhancePhase !== 'idle') return;
    setSelectedInst(inst);
    setDisplayLevel(inst.enhanceLevel || 0);
  };

  const doEnhance = () => {
    if (!selectedInst || !selectedCardDef || enhancePhase !== 'idle') return;
    const grade        = selectedCardDef.grade;
    const currentLevel = selectedInst.enhanceLevel || 0;
    const nextLevel    = currentLevel + 1;
    const cost         = getEnhanceCost(grade, currentLevel);
    if ((gs.tickets || 0) < cost) { showToast('도토리가 부족합니다!'); return; }

    const rate    = (currentLevel >= 10 ? 1 : (ENHANCE_RATE[nextLevel] ?? 1)) / 100;
    const success = Math.random() < rate;
    const instUid = selectedInst.uid;

    setGs(prev => ({ ...prev, tickets: prev.tickets - cost }));
    setEnhancePhase('shaking');

    clearTimeout(phaseTimer.current);
    phaseTimer.current = setTimeout(() => {
      if (success) {
        setGs(prev => ({
          ...prev,
          ownedCards: prev.ownedCards.map(c => c.uid === instUid ? { ...c, enhanceLevel: nextLevel } : c),
        }));
        setSelectedInst(prev => prev ? { ...prev, enhanceLevel: nextLevel } : prev);
        setSiblingInsts(prev => prev.map(c => c.uid === instUid ? { ...c, enhanceLevel: nextLevel } : c));
        setDisplayLevel(nextLevel);
        setParticles(Array.from({ length: 14 }, (_, i) => ({
          angle: (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.6,
          dist:  55 + Math.floor(Math.random() * 35),
          color: ['#fbbf24','#ffd700','#ff8c00','#fffacd','#ffffff'][i % 5],
          size:  5 + Math.floor(Math.random() * 6),
          delay: Math.floor(Math.random() * 150),
        })));
        setEnhancePhase('success');
        phaseTimer.current = setTimeout(() => { setEnhancePhase('idle'); setParticles([]); }, 2200);
      } else {
        if (currentLevel >= 11) {
          const newLv = currentLevel - 1;
          setGs(prev => ({
            ...prev,
            ownedCards: prev.ownedCards.map(c => c.uid === instUid ? { ...c, enhanceLevel: newLv } : c),
          }));
          setSelectedInst(prev => prev ? { ...prev, enhanceLevel: newLv } : prev);
          setSiblingInsts(prev => prev.map(c => c.uid === instUid ? { ...c, enhanceLevel: newLv } : c));
          setDisplayLevel(newLv);
          setEnhancePhase('descend');
        } else {
          setEnhancePhase('fail');
        }
        phaseTimer.current = setTimeout(() => setEnhancePhase('idle'), 1900);
      }
    }, 1500);
  };

  const cond         = selectedInst?.condition || 1;
  const levelCount   = selectedInst?.levelCount || 0;
  const currentLevel = selectedInst?.enhanceLevel || 0;
  const nextLevel    = currentLevel + 1;
  const cardGrowth   = selectedInst ? (gs?.cardBonusDmg?.[selectedInst.uid] || 0) : 0;
  const cardBonus    = calcBonus(ownedCards);
  const [curMin, curMax] = selectedCardDef ? calcDmgRange(selectedCardDef.grade, cond, currentLevel, levelCount, cardGrowth + cardBonus) : [0, 0];
  const [nxtMin, nxtMax] = selectedCardDef ? calcDmgRange(selectedCardDef.grade, cond, nextLevel,    levelCount, cardGrowth + cardBonus) : [0, 0];
  const cost     = selectedCardDef ? getEnhanceCost(selectedCardDef.grade, currentLevel) : 0;
  const rate     = currentLevel >= 10 ? 1 : (ENHANCE_RATE[nextLevel] ?? 1);
  const isAurora = displayLevel >= 8;
  const isBusy   = enhancePhase !== 'idle';

  return (
    <>
      {toast && <div className="cw-toast">{toast}</div>}

      {/* 강화 모달 */}
      {selectedInst && selectedCardDef && (
        <div className="card-zoom-overlay" onClick={() => { if (!isBusy) { setSelectedInst(null); setSelectedCardDef(null); setSiblingInsts([]); } }}>
          <div className="card-zoom-inner" onClick={e => e.stopPropagation()}>
            <div className="modal-card-main">
              <div className={`enhance-card-large-wrap${enhancePhase === 'success' ? ' enhance-success-glow' : ''}`} style={{ width:'auto', height:'auto' }}>
                <div className={`zoom-card grade-${selectedCardDef.grade}${isAurora ? ' enhance-aurora' : ''}${enhancePhase === 'shaking' ? ' enhance-shaking' : ''}`}>
                  <div className="card-header">
                    <span className="card-name">{selectedCardDef.name}</span>
                    <span className="grade-badge" style={{ background: GRADE_BG[selectedCardDef.grade], color: GRADE_COL[selectedCardDef.grade] }}>
                      {GRADE_LABEL[selectedCardDef.grade]}
                    </span>
                  </div>
                  <div className="card-art"><img src={`/${selectedCardDef.img}`} alt={selectedCardDef.name} /></div>
                  <div className="card-aurora" />
                  {displayLevel > 0 && (
                    <div className={`enhance-badge-large${enhancePhase === 'success' ? ' enhance-badge-pop' : ''}`}>+{displayLevel}</div>
                  )}
                  {enhancePhase === 'shaking' && <div className="enhance-overlay enhance-overlay-pending">강화 중...</div>}
                  {enhancePhase === 'success' && <div className="enhance-overlay enhance-overlay-success">성공!</div>}
                  {enhancePhase === 'fail'    && <div className="enhance-overlay enhance-overlay-fail">강화 실패</div>}
                  {enhancePhase === 'descend' && <div className="enhance-overlay enhance-overlay-descend">▼ 강화 하락</div>}
                </div>
                {enhancePhase === 'success' && particles.map((p, i) => (
                  <div key={i} className="enhance-particle" style={{
                    '--dx': `${Math.cos(p.angle) * p.dist}px`, '--dy': `${Math.sin(p.angle) * p.dist}px`,
                    width: p.size + 'px', height: p.size + 'px', background: p.color,
                    animationDelay: p.delay + 'ms', borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                  }} />
                ))}
              </div>

              <div className="modal-stat-panel">
                <div className="modal-stat-row">
                  <span className="modal-stat-label">현재 데미지</span>
                  <span className="modal-stat-value modal-stat-dmg">{curMin}~{curMax}</span>
                </div>
                <div className="modal-stat-row">
                  <span className="modal-stat-label">강화 후 데미지</span>
                  <span className="modal-stat-value" style={{ color:'#4ade80', fontWeight:900 }}>{nxtMin}~{nxtMax}</span>
                </div>
                <div className="modal-stat-row">
                  <span className="modal-stat-label">비용</span>
                  <span className="modal-stat-value">{cost}장</span>
                </div>
                <div className="modal-stat-row">
                  <span className="modal-stat-label">성공률</span>
                  <span className="modal-stat-value">{rate}%</span>
                </div>
                <div className="modal-stat-row">
                  <span className="modal-stat-label">컨디션</span>
                  <span className="modal-stat-value" style={{ color: cond>=9?'#d97706':cond>=6?'#c084fc':'#aaa' }}>{cond}</span>
                </div>
                {levelCount > 0 && (
                  <div className="modal-stat-row">
                    <span className="modal-stat-label">카드 레벨</span>
                    <span className="modal-stat-value" style={{ color:'#4ade80' }}>Lv.{levelCount}</span>
                  </div>
                )}
                {currentLevel >= 11 && (
                  <div style={{ color:'#f87171', fontSize:'0.72rem', fontWeight:700 }}>실패 시 -1단계</div>
                )}
                <div style={{ color:'rgba(255,255,255,0.55)', fontSize:'0.75rem' }}>
                  보유 <strong style={{ color:'white' }}>{gs.tickets}개</strong>
                </div>
                <button
                  className="enhance-btn-main"
                  onClick={doEnhance}
                  disabled={(gs.tickets || 0) < cost || isBusy || isGuest}
                >
                  {isGuest ? '로그인 필요' : isBusy ? '강화 중...' : '강화하기'}
                </button>
              </div>
            </div>

            {siblingInsts.length > 1 && (
              <div className="enhance-sibling-section" style={{ background:'rgba(255,255,255,0.08)', maxWidth:360 }}>
                <div className="enhance-sibling-label" style={{ color:'rgba(255,255,255,0.55)' }}>
                  같은 카드 {siblingInsts.length}장 보유 — 선택해 강화
                </div>
                <div className="enhance-sibling-list">
                  {siblingInsts.map((inst, i) => {
                    const lvl = inst.enhanceLevel || 0;
                    const cn  = inst.condition || 1;
                    const cc  = cn>=9?'#fbbf24':cn>=6?'#c084fc':'rgba(255,255,255,0.5)';
                    return (
                      <div key={inst.uid} className={`enhance-sibling-item${selectedInst?.uid===inst.uid?' active':''}`}
                        style={{ animationDelay:`${i*55}ms` }} onClick={() => selectInstance(inst)}>
                        <div className="enhance-sibling-img">
                          <img src={`/${selectedCardDef.img}`} alt="" />
                          {lvl > 0 && <div className="enhance-sibling-badge">+{lvl}</div>}
                        </div>
                        <div className="enhance-sibling-cond" style={{ background:'rgba(0,0,0,0.3)', color:cc }}>컨디션 {cn}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <button className="zoom-close" onClick={() => { setSelectedInst(null); setSelectedCardDef(null); setSiblingInsts([]); }}>닫기 ✕</button>
          </div>
        </div>
      )}

      {/* 카드 선택 그리드 */}
      <div className="synth-cards-section">
        <div className="col-header" style={{ marginBottom:14 }}>
          <div className="col-title">카드 강화</div>
          <div className="col-count">{GRADE_LABEL[filterGrade] || filterGrade} 등급</div>
        </div>
        <div className="synth-grade-filter">
          {DISPLAY_GRADES.map(g => (
            <button key={g} className={`col-filter-btn${filterGrade===g?' active':''}`}
              onClick={() => { setFilterGrade(g); setSelectedInst(null); setSelectedCardDef(null); setEnhancePhase('idle'); }}>
              {GRADE_LABEL[g] || g}
            </button>
          ))}
        </div>
        {cardTypesInGrade.length === 0 ? (
          <div className="col-empty">{GRADE_LABEL[filterGrade]||filterGrade} 등급 카드가 없어요!</div>
        ) : (
          <div className="synth-card-grid">
            {cardTypesInGrade.map(cd => {
              const instances = ownedCards.filter(c => c.id === cd.id);
              const bestLevel = Math.max(...instances.map(c => c.enhanceLevel || 0));
              const cardLv    = Math.max(...instances.map(c => c.levelCount || 0));
              return (
                <div key={cd.id}
                  className={`synth-card grade-${cd.grade}${selectedInst?.id===cd.id?' enhance-selected':''}${bestLevel>=8?' enhance-aurora-card':''}`}
                  onClick={() => selectCardType(cd)}>
                  <img src={`/${cd.img}`} alt={cd.name} loading="lazy" />
                  {bestLevel > 0 && <div className="enhance-badge-card">+{bestLevel}</div>}
                  <div className="sc-footer">
                    <div className="sc-name">{cd.name}</div>
                    <span className="sc-grade" style={{ background:GRADE_BG[cd.grade], color:GRADE_COL[cd.grade] }}>{GRADE_LABEL[cd.grade]}</span>
                  </div>
                  {cardLv > 0 && <div className="sc-count" style={{ color:'#4ade80' }}>Lv.{cardLv}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ── 컨디션 재설정 서브탭 ─────────────────────────────────────────────────────
function ConditionSubTab({ gs, setGs, isGuest }) {
  const [filterGrade, setFilterGrade] = useState('n');
  const [confirmData, setConfirmData] = useState(null); // { cardDef, inst }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const ownedCards = gs?.ownedCards || [];
  const cardTypesInGrade = CARDS.filter(c =>
    c.grade === filterGrade && ownedCards.some(oc => oc.id === c.id),
  );

  const handleCardClick = (cardDef) => {
    const instances = ownedCards.filter(c => c.id === cardDef.id);
    if (!instances.length) return;
    const best = instances.reduce((a, b) => (b.condition||1) > (a.condition||1) ? b : a);
    setConfirmData({ cardDef, inst: best });
  };

  const doReset = () => {
    if (!confirmData) return;
    if ((gs.tickets || 0) < CONDITION_RESET_COST) {
      showToast(`도토리가 부족합니다! ${CONDITION_RESET_COST}개가 필요해요`);
      setConfirmData(null);
      return;
    }
    const newCond = Math.floor(Math.random() * 10) + 1;
    const instUid = confirmData.inst.uid;
    setGs(prev => ({
      ...prev,
      tickets: prev.tickets - CONDITION_RESET_COST,
      ownedCards: prev.ownedCards.map(c => c.uid === instUid ? { ...c, condition: newCond } : c),
    }));
    showToast(`컨디션이 ${newCond}으로 재설정되었습니다!`);
    setConfirmData(null);
  };

  const condColor = (c) => c >= 9 ? '#d97706' : c >= 6 ? '#c084fc' : '#aaa';

  return (
    <>
      {toast && <div className="cw-toast">{toast}</div>}

      {/* 확인 모달 */}
      {confirmData && (
        <div className="card-zoom-overlay" onClick={() => setConfirmData(null)}>
          <div className="synth-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="synth-confirm-title">컨디션 재설정</div>
            <div className="synth-confirm-card-preview">
              <img src={`/${confirmData.cardDef.img}`} alt={confirmData.cardDef.name} />
            </div>
            <div style={{ textAlign:'center', margin:'8px 0' }}>
              <strong>{confirmData.cardDef.name}</strong>
              <div style={{ color: condColor(confirmData.inst.condition||1), fontWeight:700, marginTop:4 }}>
                현재 컨디션 {confirmData.inst.condition||1}
              </div>
            </div>
            <div className="synth-confirm-desc" style={{ textAlign:'center', fontSize:'0.82rem' }}>
              도토리 <strong>{CONDITION_RESET_COST}개</strong>를 소모해<br />
              컨디션을 1~10 사이로 무작위 재설정합니다.
            </div>
            <div style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.5)', textAlign:'center', marginBottom:4 }}>
              보유 도토리: {gs.tickets}개
            </div>
            <div className="synth-confirm-btns">
              <button className="synth-confirm-cancel" onClick={() => setConfirmData(null)}>취소</button>
              <button
                className="synth-confirm-ok"
                onClick={doReset}
                disabled={isGuest || (gs.tickets || 0) < CONDITION_RESET_COST}
                style={{ background: '#7c3aed' }}
              >
                {isGuest ? '로그인 필요' : '재설정'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 안내 */}
      <div style={{ padding:'10px 12px', background:'rgba(124,58,237,0.08)', borderRadius:8, margin:'4px 0 12px', fontSize:'0.8rem', color:'rgba(255,255,255,0.7)' }}>
        카드를 선택하면 도토리 {CONDITION_RESET_COST}개로 컨디션을 1~10 사이로 무작위 재설정합니다.
      </div>

      {/* 카드 선택 그리드 */}
      <div className="synth-cards-section">
        <div className="col-header" style={{ marginBottom:14 }}>
          <div className="col-title">카드 선택</div>
          <div className="col-count">{GRADE_LABEL[filterGrade]||filterGrade} 등급</div>
        </div>
        <div className="synth-grade-filter">
          {DISPLAY_GRADES.map(g => (
            <button key={g} className={`col-filter-btn${filterGrade===g?' active':''}`}
              onClick={() => setFilterGrade(g)}>
              {GRADE_LABEL[g]||g}
            </button>
          ))}
        </div>
        {cardTypesInGrade.length === 0 ? (
          <div className="col-empty">{GRADE_LABEL[filterGrade]||filterGrade} 등급 카드가 없어요!</div>
        ) : (
          <div className="synth-card-grid">
            {cardTypesInGrade.map(cd => {
              const inst = ownedCards.find(c => c.id === cd.id);
              const cond = inst?.condition || 1;
              return (
                <div key={cd.id}
                  className={`synth-card grade-${cd.grade}`}
                  onClick={() => handleCardClick(cd)}
                  style={{ cursor:'pointer' }}>
                  <img src={`/${cd.img}`} alt={cd.name} loading="lazy" />
                  <div className="sc-footer">
                    <div className="sc-name">{cd.name}</div>
                    <span className="sc-grade" style={{ background:GRADE_BG[cd.grade], color:GRADE_COL[cd.grade] }}>{GRADE_LABEL[cd.grade]}</span>
                  </div>
                  <div className="sc-count" style={{ color: condColor(cond) }}>컨디션 {cond}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ── 메인 탭 ──────────────────────────────────────────────────────────────────
export default function SynthTab({ gs, setGs, isGuest }) {
  const [subTab, setSubTab] = useState('enhance');

  return (
    <>
      <div className="subtab-bar">
        <button className={`subtab-btn${subTab==='enhance'?' active':''}`} onClick={() => setSubTab('enhance')}>강화</button>
        <button className={`subtab-btn${subTab==='condition'?' active':''}`} onClick={() => setSubTab('condition')}>컨디션 재설정</button>
      </div>
      <div className="subtab-content">
        {subTab === 'enhance'   && <EnhanceSubTab   gs={gs} setGs={setGs} isGuest={isGuest} />}
        {subTab === 'condition' && <ConditionSubTab gs={gs} setGs={setGs} isGuest={isGuest} />}
      </div>
    </>
  );
}
