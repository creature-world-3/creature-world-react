import { useState, useRef, useEffect } from 'react';
import { CARDS } from '../../data/cards.js';

const GRADES      = ['n', 'r', 'sr', 'ur', 'lg'];
const ALL_GRADES  = ['n', 'r', 'sr', 'ur', 'lg', 'raid'];
const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID' };
const FLASH_LABEL = { sr: 'SUPER RARE!', ur: 'ULTRA RARE!', lg: 'L E G E N D !' };
const GRADE_BG    = { n: 'rgba(80,80,80,0.9)', r: '#1a6fd4', sr: '#7c3aed', ur: '#d97706', lg: '#ff6b6b', raid: '#b8860b' };
const GRADE_COL   = { n: '#ccc', r: '#7eb8ff', sr: '#d4a8ff', ur: '#ffd97a', lg: '#fff', raid: '#fff' };
const EXCHANGE_COST = 10;

const ENHANCE_COST = { n: 5, r: 10, sr: 20, ur: 35, lg: 50, raid: 70 };
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

// ── 합성 서브탭 ──
function SynthSubTab({ gs, setGs }) {
  const [synthGrade, setSynthGrade] = useState('n');
  const [slots, setSlots]   = useState([null, null, null]);
  const [result, setResult] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [flash, setFlash]   = useState(null);
  const [toast, setToast]   = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => { setSlots([null, null, null]); setFlipped(false); }, [synthGrade]);
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

  const lockedUid  = gs?.raidCard?.uid;
  const ownedCards = (gs?.ownedCards || []).filter(c => c.uid !== lockedUid);

  const addToSlot = (card) => {
    const emptyIdx = slots.findIndex(s => s === null);
    if (emptyIdx === -1) { showToast('슬롯이 가득 찼어요!'); return; }
    const next = [...slots]; next[emptyIdx] = card; setSlots(next);
  };
  const removeSlot = (i) => { const n = [...slots]; n[i] = null; setSlots(n); };

  const doSynth = () => {
    if (slots.some(s => s === null)) return;
    const grade    = slots[0].grade;
    const gradeIdx = GRADES.indexOf(grade);
    const newOwned = [...(gs.ownedCards || [])];
    for (const card of slots) {
      const copies = newOwned.filter(c => c.id === card.id).sort((a, b) => a.condition - b.condition);
      if (copies.length > 0) newOwned.splice(newOwned.findIndex(c => c.uid === copies[0].uid), 1);
    }
    let resultGrade = grade;
    if (gradeIdx < GRADES.length - 1 && Math.random() < 0.1) {
      resultGrade = GRADES[gradeIdx + 1]; showToast('등급 업그레이드 성공!');
    }
    const pool = CARDS.filter(c => c.grade === resultGrade && !c.raid);
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

  const doExchange = (card) => {
    const myCards = ownedCards.filter(c => c.id === card.id);
    if (myCards.length < EXCHANGE_COST) return;
    const toRemove = new Set(
      [...myCards].sort((a, b) => a.condition - b.condition).slice(0, EXCHANGE_COST).map(c => c.uid),
    );
    setGs(prev => ({
      ...prev,
      ownedCards: prev.ownedCards.filter(c => !toRemove.has(c.uid)),
      tickets:    prev.tickets + 1,
    }));
    showToast(`${card.name} ${EXCHANGE_COST}장 → 뽑기권 1장 교환 완료!`);
  };

  const canSynth   = slots.every(s => s !== null);
  const gradeCards = CARDS.filter(c => c.grade === synthGrade && !c.raid && ownedCards.some(oc => oc.id === c.id));
  const noCards    = ownedCards.length === 0 || gradeCards.length === 0;
  const countById  = {};
  ownedCards.forEach(oc => { countById[oc.id] = (countById[oc.id] || 0) + 1; });
  const exchangeable = CARDS.filter(c => (countById[c.id] || 0) >= EXCHANGE_COST);

  return (
    <>
      {flash && <div className={`grade-flash grade-flash-${flash}`}><div className="grade-flash-text">{FLASH_LABEL[flash]}</div></div>}
      {toast && <div className="cw-toast">{toast}</div>}

      <div className="synth-top">
        <div className="synth-title">카드 합성</div>
        <div className="synth-desc">같은 등급 카드 3장으로 합성! 10% 확률로 상위 등급 카드 획득!</div>
        <div className="synth-main-row">
          <div className="synth-slots-wrap">
            <div className="synth-slots-label">재료 카드 (3장)</div>
            <div className="synth-slots">
              {slots.map((card, i) => (
                <div key={i} className={`synth-slot${card ? ' filled grade-highlight' : ''}`} onClick={() => card && removeSlot(i)}>
                  {card ? (
                    <>
                      <img src={`/${card.img}`} alt={card.name} />
                      <span className="slot-grade" style={{ background: GRADE_BG[card.grade], color: GRADE_COL[card.grade] }}>{GRADE_LABEL[card.grade]}</span>
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
                      <div className="sr-footer"><div className="sr-slogan">{result.card.slogan}</div></div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="synth-result-hint">뒤집힌 후 클릭하면 크게 볼 수 있어요</div>
          </div>
        </div>
        <button className="synth-btn" onClick={doSynth} disabled={!canSynth}>합성하기</button>
      </div>

      {exchangeable.length > 0 && (
        <div className="synth-exchange-section">
          <div className="col-header" style={{ marginBottom: 12 }}>
            <div className="col-title">카드 교환</div>
            <div className="col-count" style={{ background: '#fef3c7', color: '#d97706' }}>{EXCHANGE_COST}장 → 뽑기권 1장</div>
          </div>
          <div className="synth-exchange-list">
            {exchangeable.map(card => {
              const count = countById[card.id] || 0;
              return (
                <div key={card.id} className="synth-exchange-item">
                  <div className={`synth-exchange-img grade-${card.grade}`}><img src={`/${card.img}`} alt={card.name} /></div>
                  <div className="synth-exchange-info">
                    <div className="synth-exchange-name">
                      {card.name}
                      <span className="synth-exchange-grade" style={{ color: GRADE_BG[card.grade] === 'rgba(80,80,80,0.9)' ? '#888' : GRADE_BG[card.grade] }}>&nbsp;{GRADE_LABEL[card.grade]}</span>
                    </div>
                    <div className="synth-exchange-meta">보유 <strong>{count}장</strong> · {Math.floor(count / EXCHANGE_COST)}회 교환 가능</div>
                  </div>
                  <button className="exchange-btn" onClick={() => doExchange(card)}>{EXCHANGE_COST}장 → 뽑기권 1장</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              const used  = slots.filter(s => s?.id === card.id).length;
              const avail = total - used;
              return (
                <div key={card.id} className={`synth-card grade-${card.grade}${avail <= 0 ? ' disabled' : ''}`} onClick={() => avail > 0 && addToSlot(card)}>
                  <img src={`/${card.img}`} alt={card.name} loading="lazy" />
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
function EnhanceSubTab({ gs, setGs }) {
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

  const lockedUid  = gs?.raidCard?.uid;
  const ownedCards = (gs?.ownedCards || []).filter(c => c.uid !== lockedUid);

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
    const cost         = currentLevel >= 10 ? 100 : (ENHANCE_COST[grade] ?? 5);

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
  const [curMin, curMax] = selectedCardDef ? calcDmgRange(selectedCardDef.grade, cond, currentLevel) : [0, 0];
  const [nxtMin, nxtMax] = selectedCardDef ? calcDmgRange(selectedCardDef.grade, cond, nextLevel)    : [0, 0];

  const cost     = selectedCardDef ? (currentLevel >= 10 ? 100 : (ENHANCE_COST[selectedCardDef.grade] ?? 5)) : 0;
  const rate     = currentLevel >= 10 ? 1 : (ENHANCE_RATE[nextLevel] ?? 1);
  const isAurora = displayLevel >= 8;
  const isBusy   = enhancePhase !== 'idle';

  return (
    <>
      {toast && <div className="cw-toast">{toast}</div>}

      {/* ── 강화 메인 패널 ── */}
      {selectedInst && selectedCardDef ? (
        <div className="enhance-main-panel">

          {/* 카드 대형 표시 */}
          <div className={`enhance-card-large-wrap${enhancePhase === 'success' ? ' enhance-success-glow' : ''}`}>
            <div className={`enhance-card-large${isAurora ? ' enhance-aurora-card' : ''}${enhancePhase === 'shaking' ? ' enhance-shaking' : ''}`}>
              <img src={`/${selectedCardDef.img}`} alt={selectedCardDef.name} />

              {/* 강화 단계 배지 */}
              {displayLevel > 0 && (
                <div className={`enhance-badge-large${enhancePhase === 'success' ? ' enhance-badge-pop' : ''}`}>
                  +{displayLevel}
                </div>
              )}

              {/* 페이즈 오버레이 */}
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

            {/* 파티클 (오버플로우 바깥으로 표시) */}
            {enhancePhase === 'success' && particles.map((p, i) => (
              <div
                key={i}
                className="enhance-particle"
                style={{
                  '--dx':          `${Math.cos(p.angle) * p.dist}px`,
                  '--dy':          `${Math.sin(p.angle) * p.dist}px`,
                  width:           p.size + 'px',
                  height:          p.size + 'px',
                  background:      p.color,
                  animationDelay:  p.delay + 'ms',
                  borderRadius:    Math.random() > 0.5 ? '50%' : '2px',
                }}
              />
            ))}
          </div>

          {/* 카드 이름 / 등급 */}
          <div className="enhance-card-title">
            <span className="enhance-card-name-txt">{selectedCardDef.name}</span>
            <span className="enhance-grade-tag" style={{ background: GRADE_BG[selectedCardDef.grade], color: GRADE_COL[selectedCardDef.grade] }}>
              {GRADE_LABEL[selectedCardDef.grade]}
            </span>
          </div>

          {/* 같은 카드 여러 장 선택 */}
          {siblingInsts.length > 1 && (
            <div className="enhance-sibling-section">
              <div className="enhance-sibling-label">같은 카드 {siblingInsts.length}장 보유 — 선택해 강화</div>
              <div className="enhance-sibling-list">
                {siblingInsts.map((inst, i) => {
                  const lvl  = inst.enhanceLevel || 0;
                  const cndNum = inst.condition || 1;
                  const condColor = cndNum >= 9 ? '#d97706' : cndNum >= 6 ? '#7c3aed' : '#888';
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
                      <div className="enhance-sibling-cond" style={{ color: condColor }}>
                        컨디션 {cndNum}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 데미지 범위 */}
          <div className="enhance-dmg-section">
            <div className="enhance-dmg-row">
              <span className="enhance-dmg-label">현재 데미지</span>
              <span className="enhance-dmg-val">{curMin}~{curMax}<span className="enhance-dmg-unit"> /틱</span></span>
            </div>
            <div className="enhance-dmg-divider">↓</div>
            <div className="enhance-dmg-row enhance-dmg-after">
              <span className="enhance-dmg-label">강화 후</span>
              <span className="enhance-dmg-val enhance-dmg-highlight">{nxtMin}~{nxtMax}<span className="enhance-dmg-unit"> /틱</span></span>
            </div>
          </div>

          {/* 강화 정보 */}
          <div className="enhance-cost-row">
            <div className="enhance-cost-item">
              <span className="enhance-cost-label">비용</span>
              <span className="enhance-cost-val">{cost}장</span>
            </div>
            <div className="enhance-cost-divider" />
            <div className="enhance-cost-item">
              <span className="enhance-cost-label">성공률</span>
              <span className="enhance-cost-val enhance-rate-val">{rate}%</span>
            </div>
            {currentLevel >= 11 && (
              <div className="enhance-cost-warn">실패 시 -1단계</div>
            )}
          </div>
          <div className="enhance-tickets-row">보유 뽑기권: <strong>{gs.tickets}장</strong></div>

          <button
            className="enhance-btn-main"
            onClick={doEnhance}
            disabled={(gs.tickets || 0) < cost || isBusy}
          >
            {isBusy ? '강화 중...' : '강화하기'}
          </button>
        </div>
      ) : (
        <div className="enhance-empty-hint">강화할 카드를 아래에서 선택하세요</div>
      )}

      {/* ── 카드 선택 그리드 ── */}
      <div className={`synth-cards-section${isBusy ? ' enhance-cards-locked' : ''}`}>
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

// ── 메인 탭 (서브탭 슬라이드) ──
export default function SynthTab({ gs, setGs }) {
  const [subTab, setSubTab]     = useState('synth');
  const [slideClass, setSlideClass] = useState('');

  const switchSubTab = (newTab) => {
    if (newTab === subTab) return;
    const dir = newTab === 'enhance' ? 'right' : 'left';
    setSubTab(newTab);
    setSlideClass(` subtab-slide-${dir}`);
    setTimeout(() => setSlideClass(''), 300);
  };

  return (
    <>
      <div className="subtab-bar">
        <button className={`subtab-btn${subTab === 'synth' ? ' active' : ''}`} onClick={() => switchSubTab('synth')}>합성</button>
        <button className={`subtab-btn${subTab === 'enhance' ? ' active' : ''}`} onClick={() => switchSubTab('enhance')}>강화</button>
      </div>

      <div className={`subtab-content${slideClass}`}>
        {subTab === 'synth'
          ? <SynthSubTab gs={gs} setGs={setGs} />
          : <EnhanceSubTab gs={gs} setGs={setGs} />
        }
      </div>
    </>
  );
}
