import { useState, useRef, useEffect, useCallback } from 'react';
import { CARDS } from '../../data/cards.js';
import { getGrowth, calcBonus } from '../../utils/growth.js';
import { GRADE_BORDER } from './GachaTab.jsx';

const GRADES      = ['n', 'r', 'sr', 'ur', 'lg'];
const ALL_GRADES  = ['n', 'r', 'sr', 'ur', 'lg', 'raid'];
const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID' };
const FLASH_LABEL = { sr: 'SUPER RARE!', ur: 'ULTRA RARE!', lg: 'L E G E N D !' };
const GRADE_BG    = { n: 'rgba(80,80,80,0.9)', r: '#1a6fd4', sr: '#7c3aed', ur: '#d97706', lg: '#ff6b6b', raid: '#b8860b' };
const GRADE_COL   = { n: '#ccc', r: '#7eb8ff', sr: '#d4a8ff', ur: '#ffd97a', lg: '#fff', raid: '#fff' };
const EXCHANGE_COSTS   = { n: 10, r: 10, sr: 10, ur: 10, lg: 10, raid: 1 };
const EXCHANGE_TICKETS = { n: 1, r: 5, sr: 15, ur: 50, lg: 100, raid: 100 };
const EXCHANGE_GRADES  = ['n', 'r', 'sr', 'ur', 'lg', 'raid'];

// 단계별 강화 비용: +1~+5 / +6~+10 / +11 이상
const ENHANCE_COST = {
  base: { n: 5,  r: 10, sr: 20, ur: 35,  lg: 50,  raid: 70  }, // +1~+5
  mid:  { n: 8,  r: 15, sr: 30, ur: 53,  lg: 75,  raid: 105 }, // +6~+10
  high: { n: 10, r: 20, sr: 40, ur: 70,  lg: 100, raid: 140 }, // +11 이상
};
function getEnhanceCost(grade, currentLevel) {
  if (currentLevel <= 4) return ENHANCE_COST.base[grade] ?? 5;
  if (currentLevel <= 9) return ENHANCE_COST.mid[grade]  ?? 8;
  return ENHANCE_COST.high[grade] ?? 10;
}
const ENHANCE_RATE = { 1: 90, 2: 80, 3: 70, 4: 60, 5: 50, 6: 40, 7: 30, 8: 20, 9: 10, 10: 5 };
const GRADE_RANGE  = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65] };

let _uid = 0;
const genUid = () => `${++_uid}_${Date.now()}`;

function randomCondition() {
  const r = Math.random();
  if (r < 0.02) return 10; if (r < 0.07) return 9; if (r < 0.20) return 8;
  if (r < 0.37) return 7;  if (r < 0.53) return 6; if (r < 0.65) return 5;
  if (r < 0.76) return 4;  if (r < 0.86) return 3; if (r < 0.93) return 2;
  return 1;
}

function calcDmgRange(grade, cond, enhanceLevel = 0) {
  const [min, max] = GRADE_RANGE[grade] || [1, 10];
  const mult = 1 + enhanceLevel * 0.1;
  return [Math.floor((min + (cond || 1)) * mult), Math.floor((max + (cond || 1)) * mult)];
}

// ── 공통 인스턴스 피커 바텀시트 ──
const INST_CARD_W = 76; // 카드 68px + gap 8px
const INST_SCROLL = INST_CARD_W * 3; // 한 번에 3장씩

function InstanceSheet({ cardDef, instances, title, onSelect, onClose }) {
  const listRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd,   setAtEnd]   = useState(false);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 2);
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    setAtEnd(el.scrollWidth <= el.clientWidth + 2);
  }, [instances]);

  const scroll = (dir) => {
    listRef.current?.scrollBy({ left: dir * INST_SCROLL, behavior: 'smooth' });
  };

  const showArrows = instances.length > 4;

  return (
    <div className="card-zoom-overlay" onClick={onClose}>
      <div className="inst-sheet" onClick={e => e.stopPropagation()}>
        <div className="inst-sheet-title">
          {title || cardDef.name}
          <span className="inst-sheet-count">{instances.length}장 보유</span>
        </div>
        <div className="inst-list-wrap">
          {showArrows && (
            <button className="inst-scroll-btn" disabled={atStart} onClick={() => scroll(-1)}>‹</button>
          )}
          <div className="inst-list" ref={listRef} onScroll={onScroll}>
            {instances.map((inst, i) => {
              const lvl  = inst.enhanceLevel || 0;
              const cond = inst.condition || 1;
              const cc   = cond >= 9 ? '#d97706' : cond >= 6 ? '#7c3aed' : '#888';
              return (
                <div
                  key={inst.uid}
                  className="inst-item"
                  style={{ animationDelay: `${i * 50}ms` }}
                  onClick={() => onSelect(inst)}
                >
                  <div className="inst-item-img">
                    <img src={`/${cardDef.img}`} alt={cardDef.name} />
                    {lvl > 0 && <div className="inst-item-badge">+{lvl}</div>}
                  </div>
                  <div className="inst-item-meta" style={{ color: cc }}>컨디션 {cond}</div>
                </div>
              );
            })}
          </div>
          {showArrows && (
            <button className="inst-scroll-btn" disabled={atEnd} onClick={() => scroll(1)}>›</button>
          )}
        </div>
        <button className="zoom-close" onClick={onClose}>닫기 ✕</button>
      </div>
    </div>
  );
}

// ── 합성 서브탭 ──
// 슬롯 아이템: { cardDef, inst } | null
function SynthSubTab({ gs, setGs, isGuest }) {
  const [synthGrade, setSynthGrade] = useState('n');
  const [slots, setSlots]   = useState([null, null, null]); // { cardDef, inst }
  const [synthPicker, setSynthPicker] = useState(null); // { cardDef, instances }
  const [result, setResult] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [flash, setFlash]   = useState(null);
  const [toast, setToast]   = useState(null);
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [synthConfirm, setSynthConfirm] = useState(null); // null | { is3card: bool }
  const toastTimer = useRef(null);

  useEffect(() => { setSlots([null, null, null]); setFlipped(false); setSynthPicker(null); setAutoFillOpen(false); setSynthConfirm(null); }, [synthGrade]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1000);
    return () => clearTimeout(t);
  }, [flash]);

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const lockedUids = new Set([gs?.raidCard?.uid, ...(gs?.lockedCardUids || [])].filter(Boolean));
  const ownedCards = (gs?.ownedCards || []).filter(c => !lockedUids.has(c.uid));

  const addInstToSlot = (cardDef, inst) => {
    const emptyIdx = slots.findIndex(s => s === null);
    if (emptyIdx === -1) { showToast('슬롯이 가득 찼어요!'); return; }
    const next = [...slots]; next[emptyIdx] = { cardDef, inst }; setSlots(next);
  };
  const removeSlot = (i) => { const n = [...slots]; n[i] = null; setSlots(n); };

  const handleCardTypeClick = (cardDef) => {
    const usedUids  = new Set(slots.filter(Boolean).filter(s => s.cardDef.id === cardDef.id).map(s => s.inst.uid));
    const available = ownedCards.filter(c => c.id === cardDef.id && !usedUids.has(c.uid));
    if (available.length === 0) return;
    if (available.length === 1) {
      addInstToSlot(cardDef, available[0]);
    } else {
      setSynthPicker({ cardDef, instances: available });
    }
  };

  const autoFill = (sortBy) => {
    const gradeInsts = [];
    for (const c of ownedCards) {
      const def = CARDS.find(x => x.id === c.id);
      if (!def || def.grade !== synthGrade || def.raid || def.special) continue;
      gradeInsts.push({ inst: c, cardDef: def });
    }
    if (gradeInsts.length < 3) { showToast('카드가 3장 미만이에요'); setAutoFillOpen(false); return; }
    if (sortBy === 'condition') {
      gradeInsts.sort((a, b) => (a.inst.condition || 1) - (b.inst.condition || 1));
    } else {
      const [mn, mx] = GRADE_RANGE[synthGrade] || [1, 10];
      gradeInsts.sort((a, b) => {
        const sA = Math.floor(((mn + mx) / 2 + (a.inst.condition || 1)) * (1 + (a.inst.enhanceLevel || 0) * 0.1));
        const sB = Math.floor(((mn + mx) / 2 + (b.inst.condition || 1)) * (1 + (b.inst.enhanceLevel || 0) * 0.1));
        return sA - sB;
      });
    }
    setSlots([
      { cardDef: gradeInsts[0].cardDef, inst: gradeInsts[0].inst },
      { cardDef: gradeInsts[1].cardDef, inst: gradeInsts[1].inst },
      { cardDef: gradeInsts[2].cardDef, inst: gradeInsts[2].inst },
    ]);
    setAutoFillOpen(false);
  };

  const executeSynth = () => {
    setSynthConfirm(null);
    const grade    = slots[0].cardDef.grade;
    const gradeIdx = GRADES.indexOf(grade);
    const removeUids = new Set(slots.map(s => s.inst.uid));
    const newOwned = (gs.ownedCards || []).filter(c => !removeUids.has(c.uid));
    let resultGrade = grade;
    if (gradeIdx < GRADES.length - 1 && Math.random() < 0.1) {
      resultGrade = GRADES[gradeIdx + 1]; showToast('등급 업그레이드 성공!');
    }
    const pool = CARDS.filter(c => c.grade === resultGrade && !c.raid && !c.special);
    const card  = pool[Math.floor(Math.random() * pool.length)] ?? CARDS[0];
    const cond  = randomCondition();
    newOwned.push({ uid: genUid(), id: card.id, condition: cond, enhanceLevel: 0 });
    setGs(prev => ({ ...prev, ownedCards: newOwned }));
    setResult({ card, cond });
    setSlots([null, null, null]);
    setFlipped(false);
    if (['sr', 'ur', 'lg'].includes(card.grade)) setFlash(card.grade);
    setTimeout(() => setFlipped(true), 300);
  };

  const doSynth = () => {
    if (slots.some(s => s === null)) return;
    // 슬롯에 넣은 카드 중 1장만 보유한 카드 찾기
    const lastCopySlot = slots.find(s => {
      const total = ownedCards.filter(c => c.id === s.cardDef.id).length;
      return total === 1;
    });
    setSynthConfirm({ lastCopyCard: lastCopySlot ? lastCopySlot.cardDef : null });
  };

  const canSynth   = slots.every(s => s !== null);
  const gradeCards = CARDS.filter(c => c.grade === synthGrade && !c.raid && ownedCards.some(oc => oc.id === c.id));
  const noCards    = gradeCards.length === 0;
  const countById  = {};
  ownedCards.forEach(oc => { countById[oc.id] = (countById[oc.id] || 0) + 1; });

  return (
    <>
      {flash && <div className={`grade-flash grade-flash-${flash}`}><div className="grade-flash-text">{FLASH_LABEL[flash]}</div></div>}
      {toast && <div className="cw-toast">{toast}</div>}

      {/* 합성 확인 모달 */}
      {synthConfirm && (
        <div className="card-zoom-overlay" onClick={() => setSynthConfirm(null)}>
          <div className="synth-confirm-box" onClick={e => e.stopPropagation()}>
            {synthConfirm.lastCopyCard ? (
              <>
                <div className="synth-confirm-title">마지막 1장입니다</div>
                <div className="synth-confirm-card-preview">
                  <img src={`/${synthConfirm.lastCopyCard.img}`} alt={synthConfirm.lastCopyCard.name} />
                </div>
                <div className="synth-confirm-desc">
                  <strong>{synthConfirm.lastCopyCard.name}</strong>을(를) 1장 보유중입니다.<br />정말 합성하시겠습니까?
                </div>
              </>
            ) : (
              <div className="synth-confirm-title">합성하시겠습니까?</div>
            )}
            <div className="synth-confirm-btns">
              <button className="synth-confirm-cancel" onClick={() => setSynthConfirm(null)}>취소</button>
              <button className="synth-confirm-ok" onClick={executeSynth}>확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 인스턴스 피커 */}
      {synthPicker && (
        <InstanceSheet
          cardDef={synthPicker.cardDef}
          instances={synthPicker.instances}
          title={`${synthPicker.cardDef.name} — 재료로 쓸 카드를 선택하세요`}
          onSelect={inst => { addInstToSlot(synthPicker.cardDef, inst); setSynthPicker(null); }}
          onClose={() => setSynthPicker(null)}
        />
      )}

      <div className="synth-top">
        <div className="synth-title">카드 합성</div>
        <div className="synth-desc">같은 등급 카드 3장으로 합성! 10% 확률로 상위 등급 카드 획득!</div>
        <div className="synth-main-row">
          <div className="synth-slots-wrap">
            <div className="synth-slots-label">
              재료 카드 (3장)
              <div className="synth-autofill-wrap">
                <button className="synth-autofill-btn" onClick={() => setAutoFillOpen(p => !p)}>
                  자동 채우기 {autoFillOpen ? '▴' : '▾'}
                </button>
                {autoFillOpen && (
                  <div className="synth-autofill-menu">
                    <button className="synth-autofill-option" onClick={() => autoFill('condition')}>컨디션 낮은순</button>
                    <button className="synth-autofill-option" onClick={() => autoFill('power')}>데미지 낮은순</button>
                  </div>
                )}
              </div>
            </div>
            <div className="synth-slots">
              {slots.map((slot, i) => (
                <div key={i} className={`synth-slot${slot ? ' filled grade-highlight' : ''}`} onClick={() => slot && removeSlot(i)}>
                  {slot ? (
                    <>
                      <img src={`/${slot.cardDef.img}`} alt={slot.cardDef.name} />
                      <span className="slot-grade" style={{ background: GRADE_BG[slot.cardDef.grade], color: GRADE_COL[slot.cardDef.grade] }}>{GRADE_LABEL[slot.cardDef.grade]}</span>
                      {(slot.inst.enhanceLevel || 0) > 0 && <div className="enhance-badge-card">+{slot.inst.enhanceLevel}</div>}
                      <button className="slot-remove" onClick={e => { e.stopPropagation(); removeSlot(i); }}>×</button>
                    </>
                  ) : <div className="slot-empty-text">카드<br />선택</div>}
                </div>
              ))}
            </div>
          </div>
          <div className="synth-arrow">→</div>
          <div className="synth-result-col">
            <div className="synth-slots-label">결과</div>
            <div className="synth-result-wrap">
              <div className={`synth-result-inner${flipped ? ' flipped' : ''}`}>
                <div className="synth-result-face synth-result-back">?</div>
                <div className={`synth-result-face synth-result-front${result ? ` grade-${result.card.grade}` : ''}`}>
                  {result && (
                    <>
                      <div className="sr-header">
                        <span className="sr-name">{result.card.name}</span>
                        <span className="sr-grade" style={{ background: GRADE_BG[result.card.grade], color: GRADE_COL[result.card.grade] }}>{GRADE_LABEL[result.card.grade]}</span>
                      </div>
                      <div className="sr-art"><img src={`/${result.card.img}`} alt={result.card.name} /></div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="synth-result-hint">뒤집힌 후 클릭하면 크게 볼 수 있어요</div>
          </div>
        </div>
        <button className="synth-btn" onClick={doSynth} disabled={!canSynth || isGuest}>
          {isGuest ? '로그인이 필요합니다' : '합성하기'}
        </button>
      </div>

      <div className="synth-cards-section">
        <div className="col-header" style={{ marginBottom: 14 }}>
          <div className="col-title">카드 선택</div>
          <div className="col-count">{GRADE_LABEL[synthGrade]} 등급</div>
        </div>
        <div className="synth-grade-filter">
          {GRADES.map(g => (
            <button key={g} className={`col-filter-btn${synthGrade === g ? ' active' : ''}`} onClick={() => setSynthGrade(g)}>{GRADE_LABEL[g]}</button>
          ))}
        </div>
        {noCards ? (
          <div className="col-empty">{ownedCards.length === 0 ? '카드가 부족합니다' : `${GRADE_LABEL[synthGrade]} 등급 카드가 없어요!`}</div>
        ) : (
          <div className="synth-card-grid">
            {gradeCards.map(card => {
              const total = ownedCards.filter(c => c.id === card.id).length;
              const used  = slots.filter(s => s?.cardDef?.id === card.id).length;
              const avail = total - used;
              return (
                <div key={card.id} className={`synth-card grade-${card.grade}${avail <= 0 ? ' disabled' : ''}`} onClick={() => avail > 0 && handleCardTypeClick(card)}>
                  <img src={`/${card.img}`} alt={card.name} loading="lazy" />
                  {GRADE_BORDER[card.grade] && <img src={GRADE_BORDER[card.grade]} className="grade-border-overlay" alt="" loading="lazy" />}
                  <div className="sc-footer">
                    <div className="sc-name">{card.name}</div>
                    <span className="sc-grade" style={{ background: GRADE_BG[card.grade], color: GRADE_COL[card.grade] }}>{GRADE_LABEL[card.grade]}</span>
                  </div>
                  <div className="sc-count">×{avail}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ── 강화 서브탭 ──
function EnhanceSubTab({ gs, setGs, isGuest }) {
  const [filterGrade, setFilterGrade] = useState('n');

  // 선택된 카드 정보
  const [selectedInst, setSelectedInst]   = useState(null); // 현재 인스턴스
  const [selectedCardDef, setSelectedCardDef] = useState(null);
  const [siblingInsts, setSiblingInsts]   = useState([]); // 같은 카드 전체 목록

  // 강화 애니메이션 페이즈: idle | shaking | success | fail | descend
  const [enhancePhase, setEnhancePhase] = useState('idle');
  const [displayLevel, setDisplayLevel] = useState(0); // 배지에 표시할 레벨
  const [particles, setParticles]       = useState([]);

  const [toast, setToast] = useState(null);
  const toastTimer  = useRef(null);
  const phaseTimer  = useRef(null);
  const instUidRef  = useRef(null); // 진행 중 인스턴스 UID 잠금

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
    if (instances.length === 0) return;
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
    setEnhancePhase('idle');
  };

  const doEnhance = () => {
    if (!selectedInst || !selectedCardDef || enhancePhase !== 'idle') return;
    const grade        = selectedCardDef.grade;
    const currentLevel = selectedInst.enhanceLevel || 0;
    const nextLevel    = currentLevel + 1;
    const cost         = getEnhanceCost(grade, currentLevel);

    if ((gs.tickets || 0) < cost) { showToast('뽑기권이 부족합니다!'); return; }

    const rate    = (currentLevel >= 10 ? 1 : (ENHANCE_RATE[nextLevel] ?? 1)) / 100;
    const success = Math.random() < rate;
    const instUid = selectedInst.uid;
    instUidRef.current = instUid;

    // 뽑기권 즉시 차감 (이중 클릭 방지)
    setGs(prev => ({ ...prev, tickets: prev.tickets - cost }));
    setEnhancePhase('shaking');

    clearTimeout(phaseTimer.current);
    phaseTimer.current = setTimeout(() => {
      if (success) {
        setGs(prev => ({
          ...prev,
          ownedCards: prev.ownedCards.map(c =>
            c.uid === instUid ? { ...c, enhanceLevel: nextLevel } : c,
          ),
        }));
        setSelectedInst(prev => prev ? { ...prev, enhanceLevel: nextLevel } : prev);
        setSiblingInsts(prev => prev.map(c => c.uid === instUid ? { ...c, enhanceLevel: nextLevel } : c));
        setDisplayLevel(nextLevel);

        // 파티클 생성
        setParticles(
          Array.from({ length: 14 }, (_, i) => ({
            angle: (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.6,
            dist:  55 + Math.floor(Math.random() * 35),
            color: ['#fbbf24','#ffd700','#ff8c00','#fffacd','#ffffff'][i % 5],
            size:  5 + Math.floor(Math.random() * 6),
            delay: Math.floor(Math.random() * 150),
          })),
        );
        setEnhancePhase('success');
        phaseTimer.current = setTimeout(() => { setEnhancePhase('idle'); setParticles([]); }, 2200);

      } else {
        if (currentLevel >= 11) {
          const newLevel = currentLevel - 1;
          setGs(prev => ({
            ...prev,
            ownedCards: prev.ownedCards.map(c =>
              c.uid === instUid ? { ...c, enhanceLevel: newLevel } : c,
            ),
          }));
          setSelectedInst(prev => prev ? { ...prev, enhanceLevel: newLevel } : prev);
          setSiblingInsts(prev => prev.map(c => c.uid === instUid ? { ...c, enhanceLevel: newLevel } : c));
          setDisplayLevel(newLevel);
          setEnhancePhase('descend');
        } else {
          setEnhancePhase('fail');
        }
        phaseTimer.current = setTimeout(() => setEnhancePhase('idle'), 1900);
      }
    }, 1500);
  };

  // 데미지 범위 계산
  const cond         = selectedInst?.condition || 1;
  const currentLevel = selectedInst ? (selectedInst.enhanceLevel || 0) : 0;
  const nextLevel    = currentLevel + 1;
  const cost       = selectedCardDef ? getEnhanceCost(selectedCardDef.grade, currentLevel) : 0;
  const costTier   = currentLevel <= 4 ? '+1~+5' : currentLevel <= 9 ? '+6~+10' : '+11 이상';
  const rate       = currentLevel >= 10 ? 1 : (ENHANCE_RATE[nextLevel] ?? 1);
  const isAurora   = displayLevel >= 8;
  const isBusy     = enhancePhase !== 'idle';
  const cardGrowth = selectedInst ? getGrowth(gs?.cardBonusDmg, selectedInst) : 0;
  const [rawCurMin, rawCurMax] = selectedCardDef ? calcDmgRange(selectedCardDef.grade, cond, currentLevel) : [0, 0];
  const [rawNxtMin, rawNxtMax] = selectedCardDef ? calcDmgRange(selectedCardDef.grade, cond, nextLevel)    : [0, 0];
  const curMin = rawCurMin + cardGrowth;
  const curMax = rawCurMax + cardGrowth;
  const nxtMin = rawNxtMin + cardGrowth;
  const nxtMax = rawNxtMax + cardGrowth;
  const cardBonus  = calcBonus(ownedCards);

  return (
    <>
      {toast && <div className="cw-toast">{toast}</div>}

      {/* ── 강화 상세 모달 ── */}
      {selectedInst && selectedCardDef && (
        <div className="card-zoom-overlay" onClick={() => { if (!isBusy) { setSelectedInst(null); setSelectedCardDef(null); setSiblingInsts([]); } }}>
          <div className="card-zoom-inner" onClick={e => e.stopPropagation()}>
            <div className="modal-card-main">
              {/* 왼쪽: 카드 이미지 */}
              <div
                className={`enhance-card-large-wrap${enhancePhase === 'success' ? ' enhance-success-glow' : ''}`}
                style={{ width: 'auto', height: 'auto' }}
              >
                <div className={`zoom-card grade-${selectedCardDef.grade}${isAurora ? ' enhance-aurora' : ''}${enhancePhase === 'shaking' ? ' enhance-shaking' : ''}`}>
                  <div className="card-header">
                    <span className="card-name">{selectedCardDef.name}</span>
                    <span className="grade-badge" style={{ background: GRADE_BG[selectedCardDef.grade], color: GRADE_COL[selectedCardDef.grade] }}>
                      {GRADE_LABEL[selectedCardDef.grade]}
                    </span>
                  </div>
                  <div className="card-art">
                    <img src={`/${selectedCardDef.img}`} alt={selectedCardDef.name} />
                  </div>
                  <div className="card-aurora" />
                  {displayLevel > 0 && (
                    <div className={`enhance-badge-large${enhancePhase === 'success' ? ' enhance-badge-pop' : ''}`}>
                      +{displayLevel}
                    </div>
                  )}
                  {enhancePhase === 'shaking' && (
                    <div className="enhance-overlay enhance-overlay-pending">강화 중...</div>
                  )}
                  {enhancePhase === 'success' && (
                    <div className="enhance-overlay enhance-overlay-success">✨ 성공!</div>
                  )}
                  {enhancePhase === 'fail' && (
                    <div className="enhance-overlay enhance-overlay-fail">✗ 강화 실패</div>
                  )}
                  {enhancePhase === 'descend' && (
                    <div className="enhance-overlay enhance-overlay-descend">▼ 강화 하락</div>
                  )}
                </div>
                {enhancePhase === 'success' && particles.map((p, i) => (
                  <div
                    key={i}
                    className="enhance-particle"
                    style={{
                      '--dx':         `${Math.cos(p.angle) * p.dist}px`,
                      '--dy':         `${Math.sin(p.angle) * p.dist}px`,
                      width:          p.size + 'px',
                      height:         p.size + 'px',
                      background:     p.color,
                      animationDelay: p.delay + 'ms',
                      borderRadius:   Math.random() > 0.5 ? '50%' : '2px',
                    }}
                  />
                ))}
              </div>

              {/* 오른쪽: 스탯 패널 */}
              <div className="modal-stat-panel">
                <div className="modal-stat-row">
                  <span className="modal-stat-label">현재 데미지</span>
                  <span className="modal-stat-value modal-stat-dmg">{curMin}~{curMax}</span>
                </div>
                <div className="modal-stat-row">
                  <span className="modal-stat-label">강화 후 데미지</span>
                  <span className="modal-stat-value" style={{ color: '#4ade80', fontWeight: 900 }}>{nxtMin}~{nxtMax}</span>
                </div>
                <div className="modal-stat-row">
                  <span className="modal-stat-label">비용</span>
                  <span className="modal-stat-value">{cost}장</span>
                </div>
                <div className="modal-stat-row">
                  <span className="modal-stat-label">성공률</span>
                  <span className="modal-stat-value">{rate}%</span>
                </div>
                {cardGrowth > 0 && (
                  <div className="modal-stat-row">
                    <span className="modal-stat-label">성장</span>
                    <span className="modal-stat-value modal-stat-enhance">+{cardGrowth}</span>
                  </div>
                )}
                {cardBonus > 0 && (
                  <div className="modal-stat-row">
                    <span className="modal-stat-label">도감 보너스</span>
                    <span className="modal-stat-value modal-stat-enhance">+{cardBonus}</span>
                  </div>
                )}
                {currentLevel >= 11 && (
                  <div style={{ color: '#f87171', fontSize: '0.72rem', fontWeight: 700 }}>실패 시 -1단계</div>
                )}
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem' }}>
                  보유 <strong style={{ color: 'white' }}>{gs.tickets}장</strong>
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

            {/* 같은 카드 여러 장 선택 */}
            {siblingInsts.length > 1 && (
              <div className="enhance-sibling-section" style={{ background: 'rgba(255,255,255,0.08)', maxWidth: 360 }}>
                <div className="enhance-sibling-label" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  같은 카드 {siblingInsts.length}장 보유 — 선택해 강화
                </div>
                <div className="enhance-sibling-list">
                  {siblingInsts.map((inst, i) => {
                    const lvl    = inst.enhanceLevel || 0;
                    const cndNum = inst.condition || 1;
                    const condColor = cndNum >= 9 ? '#fbbf24' : cndNum >= 6 ? '#c084fc' : 'rgba(255,255,255,0.5)';
                    return (
                      <div
                        key={inst.uid}
                        className={`enhance-sibling-item${selectedInst?.uid === inst.uid ? ' active' : ''}`}
                        style={{ animationDelay: `${i * 55}ms` }}
                        onClick={() => selectInstance(inst)}
                      >
                        <div className="enhance-sibling-img">
                          <img src={`/${selectedCardDef.img}`} alt="" />
                          {lvl > 0 && <div className="enhance-sibling-badge">+{lvl}</div>}
                        </div>
                        <div className="enhance-sibling-cond" style={{ background: 'rgba(0,0,0,0.3)', color: condColor }}>
                          컨디션 {cndNum}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button className="zoom-close" onClick={() => { setSelectedInst(null); setSelectedCardDef(null); setSiblingInsts([]); }}>
              닫기 ✕
            </button>
          </div>
        </div>
      )}

      {/* ── 카드 선택 그리드 ── */}
      <div className="synth-cards-section">
        <div className="col-header" style={{ marginBottom: 14 }}>
          <div className="col-title">카드 선택</div>
          <div className="col-count">{GRADE_LABEL[filterGrade]} 등급</div>
        </div>
        <div className="synth-grade-filter">
          {ALL_GRADES.map(g => (
            <button
              key={g}
              className={`col-filter-btn${filterGrade === g ? ' active' : ''}`}
              onClick={() => { setFilterGrade(g); setSelectedInst(null); setSelectedCardDef(null); setEnhancePhase('idle'); }}
            >
              {GRADE_LABEL[g]}
            </button>
          ))}
        </div>

        {cardTypesInGrade.length === 0 ? (
          <div className="col-empty">{GRADE_LABEL[filterGrade]} 등급 카드가 없어요!</div>
        ) : (
          <div className="synth-card-grid">
            {cardTypesInGrade.map(cd => {
              const instances = ownedCards.filter(c => c.id === cd.id);
              const bestLevel = Math.max(...instances.map(c => c.enhanceLevel || 0));
              const isSelected = selectedInst?.id === cd.id;
              return (
                <div
                  key={cd.id}
                  className={`synth-card grade-${cd.grade}${isSelected ? ' enhance-selected' : ''}${bestLevel >= 8 ? ' enhance-aurora-card' : ''}`}
                  onClick={() => selectCardType(cd)}
                >
                  <img src={`/${cd.img}`} alt={cd.name} loading="lazy" />
                  {bestLevel > 0 && <div className="enhance-badge-card">+{bestLevel}</div>}
                  <div className="sc-footer">
                    <div className="sc-name">{cd.name}</div>
                    <span className="sc-grade" style={{ background: GRADE_BG[cd.grade], color: GRADE_COL[cd.grade] }}>{GRADE_LABEL[cd.grade]}</span>
                  </div>
                  <div className="sc-count">×{instances.length}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ── 교환 서브탭 ──
function ExchangeSubTab({ gs, setGs, isGuest }) {
  const [filterGrade, setFilterGrade] = useState('n');
  const [selectedCard, setSelectedCard] = useState(null);
  const [qty, setQty]       = useState(1);
  const [showRates, setShowRates] = useState(false);
  const [toast, setToast]   = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const lockedUids = new Set([gs?.raidCard?.uid, ...(gs?.lockedCardUids || [])].filter(Boolean));
  const ownedCards = (gs?.ownedCards || []).filter(c => !lockedUids.has(c.uid));

  const countById = {};
  ownedCards.forEach(oc => { countById[oc.id] = (countById[oc.id] || 0) + 1; });

  const exchangeCost       = EXCHANGE_COSTS[filterGrade] ?? 10;
  const ticketsPerExchange = EXCHANGE_TICKETS[selectedCard?.grade] || 1;
  const selectedCost       = EXCHANGE_COSTS[selectedCard?.grade] ?? 10;
  const maxQty             = selectedCard ? Math.floor((countById[selectedCard.id] || 0) / selectedCost) : 0;

  // 현재 등급 필터의 보유 카드 목록 (1장 이상)
  const gradeCards = CARDS.filter(c =>
    c.grade === filterGrade && (countById[c.id] || 0) > 0,
  );

  // 등급 버튼에 표시할 교환 가능 종 수
  const exchCountByGrade = {};
  EXCHANGE_GRADES.forEach(g => {
    const cost = EXCHANGE_COSTS[g] ?? 10;
    exchCountByGrade[g] = CARDS.filter(c => c.grade === g && (countById[c.id] || 0) >= cost).length;
  });

  // 등급 변경 시 선택 초기화
  useEffect(() => { setSelectedCard(null); setQty(1); }, [filterGrade]);

  // 교환 후 수량 재조정
  useEffect(() => {
    if (!selectedCard) return;
    const cost = EXCHANGE_COSTS[selectedCard.grade] ?? 10;
    const newMax = Math.floor((countById[selectedCard.id] || 0) / cost);
    if (newMax === 0) { setSelectedCard(null); setQty(1); }
    else setQty(q => Math.min(q, newMax));
  }, [gs?.ownedCards]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectCard = (card) => {
    const cost = EXCHANGE_COSTS[card.grade] ?? 10;
    if ((countById[card.id] || 0) < cost) return;
    setSelectedCard(card);
    setQty(1);
  };

  const executeExchange = (toRemove, exchangeQty, totalCards) => {
    const earned = exchangeQty * ticketsPerExchange;
    setGs(prev => ({
      ...prev,
      ownedCards: prev.ownedCards.filter(c => !toRemove.has(c.uid)),
      tickets:    prev.tickets + earned,
    }));
    setConfirmData(null);
    showToast(`${selectedCard.name} ${totalCards}장 → 뽑기권 ${earned}장 교환 완료!`);
  };

  const doExchange = () => {
    if (!selectedCard || qty < 1) return;
    const cost       = EXCHANGE_COSTS[selectedCard.grade] ?? 10;
    const totalCards = qty * cost;
    const myCards = ownedCards.filter(c => c.id === selectedCard.id);
    if (myCards.length < totalCards) return;
    const toRemoveArr = [...myCards].sort((a, b) => a.condition - b.condition).slice(0, totalCards);
    const toRemove    = new Set(toRemoveArr.map(c => c.uid));
    const highCondCards = toRemoveArr.filter(c => (c.condition || 1) >= 8);
    setConfirmData({ toRemove, qty, totalCards, highCondCards });
  };

  return (
    <>
      {toast && <div className="cw-toast">{toast}</div>}

      {/* 교환 확인 모달 */}
      {confirmData && (
        <div className="exsub-confirm-overlay" onClick={() => setConfirmData(null)}>
          <div className="exsub-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="exsub-confirm-title">교환하시겠습니까?</div>
            <div className="exsub-confirm-desc">
              카드 <strong>{confirmData.totalCards}장</strong> →{' '}
              뽑기권 <strong>{confirmData.qty * ticketsPerExchange}장</strong>
            </div>
            {confirmData.highCondCards.length > 0 && (
              <>
                <div className="exsub-confirm-desc" style={{ color: '#f97316', fontSize: '0.8rem' }}>
                  ⚠ 컨디션 8 이상 카드 {confirmData.highCondCards.length}장 포함
                </div>
                <div className="exsub-confirm-conds">
                  {confirmData.highCondCards.map(c => (
                    <span key={c.uid} className="exsub-confirm-cond-badge">컨디션 {c.condition}</span>
                  ))}
                </div>
              </>
            )}
            <div className="exsub-confirm-btns">
              <button className="exsub-confirm-cancel" onClick={() => setConfirmData(null)}>취소</button>
              <button className="exsub-confirm-ok" onClick={() => executeExchange(confirmData.toRemove, confirmData.qty, confirmData.totalCards)}>확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 교환 비율 안내 토글 */}
      <button className="exsub-rate-toggle" onClick={() => setShowRates(r => !r)}>
        교환 비율 안내&nbsp;&nbsp;{showRates ? '▲' : '▼'}
      </button>
      {showRates && (
        <div className="exsub-rate-table">
          {EXCHANGE_GRADES.map(g => (
            <div key={g} className="exsub-rate-row">
              <span className="exsub-rate-grade" style={{ background: GRADE_BG[g], color: GRADE_COL[g] }}>{GRADE_LABEL[g]}</span>
              <span className="exsub-rate-formula">카드 {EXCHANGE_COSTS[g]}장</span>
              <span className="exsub-rate-arrow">→</span>
              <span className="exsub-rate-tickets">뽑기권 {EXCHANGE_TICKETS[g]}장</span>
            </div>
          ))}
        </div>
      )}

      {/* 등급 필터 */}
      <div className="exsub-grade-filter">
        {EXCHANGE_GRADES.map(g => {
          const cnt = exchCountByGrade[g];
          const isActive = filterGrade === g;
          return (
            <button
              key={g}
              className={`exsub-grade-btn${isActive ? ' active' : ''}`}
              style={isActive ? { background: GRADE_BG[g], color: GRADE_COL[g], borderColor: GRADE_BG[g] } : {}}
              onClick={() => setFilterGrade(g)}
            >
              {GRADE_LABEL[g]}
              {cnt > 0 && <span className="exsub-grade-badge">{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* 선택된 카드 패널 */}
      {selectedCard && (
        <div className="exsub-panel" key={selectedCard.id}>
          <div className="exsub-panel-img-wrap">
            <div className={`exsub-panel-img grade-${selectedCard.grade}`}>
              <img src={`/${selectedCard.img}`} alt={selectedCard.name} />
            </div>
          </div>
          <div className="exsub-panel-info">
            <div className="exsub-panel-name">{selectedCard.name}</div>
            <span className="exsub-panel-grade" style={{ background: GRADE_BG[selectedCard.grade], color: GRADE_COL[selectedCard.grade] }}>
              {GRADE_LABEL[selectedCard.grade]}
            </span>
            <div className="exsub-panel-owned">
              보유 <strong>{countById[selectedCard.id] || 0}장</strong>
              <span className="exsub-panel-avail"> · 최대 {maxQty}회 교환 가능</span>
            </div>
            <div className="exsub-qty-row">
              <button className="exsub-qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1}>−</button>
              <div className="exsub-qty-display">
                <span className="exsub-qty-num">{qty}</span>
                <span className="exsub-qty-unit">회</span>
              </div>
              <button className="exsub-qty-btn" onClick={() => setQty(q => Math.min(maxQty, q + 1))} disabled={qty >= maxQty}>+</button>
            </div>
            <div className="exsub-qty-summary">
              카드 <strong>{qty * selectedCost}장</strong> → 뽑기권 <strong>{qty * ticketsPerExchange}장</strong>
            </div>
            <button className="exsub-do-btn" onClick={doExchange} disabled={!!isGuest} style={isGuest ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
              {isGuest ? '로그인이 필요합니다' : '교환하기'}
            </button>
          </div>
        </div>
      )}

      {/* 카드 목록 */}
      <div className="exsub-list-wrap">
        <div className="exsub-list-header">
          <span>{GRADE_LABEL[filterGrade]} 등급 카드</span>
          <span className="exsub-list-rate-hint">{exchangeCost}장 → 뽑기권 {EXCHANGE_TICKETS[filterGrade]}장</span>
        </div>
        {gradeCards.length === 0 ? (
          <div className="col-empty">{GRADE_LABEL[filterGrade]} 등급 카드가 없어요</div>
        ) : (
          gradeCards.map(card => {
            const cost   = EXCHANGE_COSTS[card.grade] ?? 10;
            const count  = countById[card.id] || 0;
            const canEx  = count >= cost;
            const isSel  = selectedCard?.id === card.id;
            const gradeColor = GRADE_BG[card.grade] === 'rgba(80,80,80,0.9)' ? '#888' : GRADE_BG[card.grade];
            return (
              <div
                key={card.id}
                className={`exsub-item${isSel ? ' selected' : ''}${!canEx ? ' insufficient' : ''}`}
                onClick={() => handleSelectCard(card)}
              >
                <div className={`exsub-item-img grade-${card.grade}`}>
                  <img src={`/${card.img}`} alt={card.name} />
                </div>
                <div className="exsub-item-info">
                  <div className="exsub-item-name">
                    {card.name}
                    <span className="exsub-item-grade" style={{ color: gradeColor }}>&nbsp;{GRADE_LABEL[card.grade]}</span>
                  </div>
                  <div className="exsub-item-meta">
                    보유 <strong>{count}장</strong>
                    {canEx
                      ? <span className="exsub-item-ok"> · {Math.floor(count / cost)}회 교환 가능</span>
                      : <span className="exsub-item-lack"> · {count} / {cost}장</span>
                    }
                  </div>
                </div>
                {canEx
                  ? <div className="exsub-item-check">{isSel ? '✓' : '›'}</div>
                  : <div className="exsub-item-lock">부족</div>
                }
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

// ── 메인 탭 (서브탭 슬라이드) ──
const TAB_ORDER = ['synth', 'enhance', 'exchange'];

export default function SynthTab({ gs, setGs, isGuest }) {
  const [subTab, setSubTab]     = useState('synth');
  const [slideClass, setSlideClass] = useState('');

  const switchSubTab = (newTab) => {
    if (newTab === subTab) return;
    const oldIdx = TAB_ORDER.indexOf(subTab);
    const newIdx = TAB_ORDER.indexOf(newTab);
    const dir = newIdx > oldIdx ? 'right' : 'left';
    setSubTab(newTab);
    setSlideClass(` subtab-slide-${dir}`);
    setTimeout(() => setSlideClass(''), 300);
  };

  return (
    <>
      <div className="subtab-bar">
        <button className={`subtab-btn${subTab === 'synth'    ? ' active' : ''}`} onClick={() => switchSubTab('synth')}>합성</button>
        <button className={`subtab-btn${subTab === 'enhance'  ? ' active' : ''}`} onClick={() => switchSubTab('enhance')}>강화</button>
        <button className={`subtab-btn${subTab === 'exchange' ? ' active' : ''}`} onClick={() => switchSubTab('exchange')}>교환</button>
      </div>

      <div className={`subtab-content${slideClass}`}>
        {subTab === 'synth'    && <SynthSubTab    gs={gs} setGs={setGs} isGuest={isGuest} />}
        {subTab === 'enhance'  && <EnhanceSubTab  gs={gs} setGs={setGs} isGuest={isGuest} />}
        {subTab === 'exchange' && <ExchangeSubTab gs={gs} setGs={setGs} isGuest={isGuest} />}
      </div>
    </>
  );
}
