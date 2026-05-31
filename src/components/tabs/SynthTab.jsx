import { useState, useEffect, useRef } from 'react';
import { CARDS } from '../../data/cards.js';

const GRADES     = ['n', 'r', 'sr', 'ur', 'lg'];
const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID' };
const FLASH_LABEL = { sr: 'SUPER RARE!', ur: 'ULTRA RARE!', lg: 'L E G E N D !' };
const GRADE_BG   = { n: 'rgba(80,80,80,0.9)', r: '#1a6fd4', sr: '#7c3aed', ur: '#d97706', lg: '#ff6b6b' };
const GRADE_COL  = { n: '#ccc', r: '#7eb8ff', sr: '#d4a8ff', ur: '#ffd97a', lg: '#fff' };
const EXCHANGE_COST = 10;

let _uid = 0;
const genUid = () => `${++_uid}_${Date.now()}`;

function randomCondition() {
  const r = Math.random();
  if (r < 0.02) return 10; if (r < 0.07) return 9; if (r < 0.20) return 8;
  if (r < 0.37) return 7;  if (r < 0.53) return 6; if (r < 0.65) return 5;
  if (r < 0.76) return 4;  if (r < 0.86) return 3; if (r < 0.93) return 2;
  return 1;
}

export default function SynthTab({ gs, setGs }) {
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

  const addToSlot = (card) => {
    const emptyIdx = slots.findIndex(s => s === null);
    if (emptyIdx === -1) { showToast('슬롯이 가득 찼어요!'); return; }
    const next = [...slots]; next[emptyIdx] = card; setSlots(next);
  };

  const removeSlot = (i) => {
    const next = [...slots]; next[i] = null; setSlots(next);
  };

  const doSynth = () => {
    if (slots.some(s => s === null)) return;
    const grade = slots[0].grade;
    const gradeIdx = GRADES.indexOf(grade);

    const newOwned = [...(gs.ownedCards || [])];
    for (const card of slots) {
      const copies = newOwned
        .filter(c => c.id === card.id)
        .sort((a, b) => a.condition - b.condition);
      if (copies.length > 0) {
        const idx = newOwned.findIndex(c => c.uid === copies[0].uid);
        newOwned.splice(idx, 1);
      }
    }

    let resultGrade = grade;
    if (gradeIdx < GRADES.length - 1 && Math.random() < 0.1) {
      resultGrade = GRADES[gradeIdx + 1];
      showToast('등급 업그레이드 성공!');
    }

    const pool = CARDS.filter(c => c.grade === resultGrade && !c.raid);
    const card  = pool[Math.floor(Math.random() * pool.length)] ?? CARDS[0];
    const cond  = randomCondition();
    newOwned.push({ uid: genUid(), id: card.id, condition: cond });

    setGs(prev => ({ ...prev, ownedCards: newOwned }));
    setResult({ card, cond });
    setSlots([null, null, null]);
    setFlipped(false);
    if (['sr', 'ur', 'lg'].includes(card.grade)) setFlash(card.grade);
    setTimeout(() => setFlipped(true), 300);
  };

  // ── 카드 교환: 같은 카드 10장 → 뽑기권 1장 (낮은 컨디션부터 자동 선택) ──
  const doExchange = (card) => {
    const myCards = ownedCards.filter(c => c.id === card.id);
    if (myCards.length < EXCHANGE_COST) return;
    const toRemove = [...myCards]
      .sort((a, b) => a.condition - b.condition)
      .slice(0, EXCHANGE_COST)
      .map(c => c.uid);
    const removeSet = new Set(toRemove);
    setGs(prev => ({
      ...prev,
      ownedCards: prev.ownedCards.filter(c => !removeSet.has(c.uid)),
      tickets:    prev.tickets + 1,
    }));
    showToast(`${card.name} ${EXCHANGE_COST}장 → 뽑기권 1장 교환 완료!`);
  };

  const lockedUid  = gs?.raidCard?.uid;
  const ownedCards = (gs?.ownedCards || []).filter(c => c.uid !== lockedUid);
  const canSynth   = slots.every(s => s !== null);
  const gradeCards = CARDS.filter(c => c.grade === synthGrade && !c.raid && ownedCards.some(oc => oc.id === c.id));
  const noCards    = ownedCards.length === 0 || gradeCards.length === 0;

  // 교환 가능한 카드 목록 (같은 카드 10장 이상 보유)
  const countById = {};
  ownedCards.forEach(oc => { countById[oc.id] = (countById[oc.id] || 0) + 1; });
  const exchangeable = CARDS.filter(c => (countById[c.id] || 0) >= EXCHANGE_COST);

  return (
    <>
      {flash && (
        <div className={`grade-flash grade-flash-${flash}`}>
          <div className="grade-flash-text">{FLASH_LABEL[flash]}</div>
        </div>
      )}
      {toast && <div className="cw-toast">{toast}</div>}

      {/* ── 상단: 슬롯 + 결과 ── */}
      <div className="synth-top">
        <div className="synth-title">카드 합성</div>
        <div className="synth-desc">같은 등급 카드 3장으로 합성! 10% 확률로 상위 등급 카드 획득!</div>

        <div className="synth-main-row">
          <div className="synth-slots-wrap">
            <div className="synth-slots-label">재료 카드 (3장)</div>
            <div className="synth-slots">
              {slots.map((card, i) => (
                <div
                  key={i}
                  className={`synth-slot${card ? ' filled grade-highlight' : ''}`}
                  onClick={() => card && removeSlot(i)}
                >
                  {card ? (
                    <>
                      <img src={`/${card.img}`} alt={card.name} />
                      <span className="slot-grade" style={{ background: GRADE_BG[card.grade], color: GRADE_COL[card.grade] }}>
                        {GRADE_LABEL[card.grade]}
                      </span>
                      <button className="slot-remove" onClick={e => { e.stopPropagation(); removeSlot(i); }}>×</button>
                    </>
                  ) : (
                    <div className="slot-empty-text">카드<br />선택</div>
                  )}
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
                        <span className="sr-grade" style={{ background: GRADE_BG[result.card.grade], color: GRADE_COL[result.card.grade] }}>
                          {GRADE_LABEL[result.card.grade]}
                        </span>
                      </div>
                      <div className="sr-art"><img src={`/${result.card.img}`} alt={result.card.name} /></div>
                      <div className="sr-footer">
                        <div className="sr-slogan">{result.card.slogan}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="synth-result-hint">뒤집힌 후 클릭하면 크게 볼 수 있어요</div>
          </div>
        </div>

        <button className="synth-btn" onClick={doSynth} disabled={!canSynth}>
          합성하기
        </button>
      </div>

      {/* ── 카드 교환 ── */}
      {exchangeable.length > 0 && (
        <div className="synth-exchange-section">
          <div className="col-header" style={{ marginBottom: 12 }}>
            <div className="col-title">카드 교환</div>
            <div className="col-count" style={{ background: '#fef3c7', color: '#d97706' }}>
              {EXCHANGE_COST}장 → 뽑기권 1장
            </div>
          </div>
          <div className="synth-exchange-list">
            {exchangeable.map(card => {
              const count = countById[card.id] || 0;
              const sets  = Math.floor(count / EXCHANGE_COST);
              return (
                <div key={card.id} className="synth-exchange-item">
                  <div className={`synth-exchange-img grade-${card.grade}`}>
                    <img src={`/${card.img}`} alt={card.name} />
                  </div>
                  <div className="synth-exchange-info">
                    <div className="synth-exchange-name">
                      {card.name}
                      <span className="synth-exchange-grade" style={{ color: GRADE_BG[card.grade] === 'rgba(80,80,80,0.9)' ? '#888' : GRADE_BG[card.grade] }}>
                        &nbsp;{GRADE_LABEL[card.grade]}
                      </span>
                    </div>
                    <div className="synth-exchange-meta">
                      보유 <strong>{count}장</strong> · {sets}회 교환 가능
                    </div>
                  </div>
                  <button className="exchange-btn" onClick={() => doExchange(card)}>
                    {EXCHANGE_COST}장 → 뽑기권 1장
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 하단: 카드 선택 ── */}
      <div className="synth-cards-section">
        <div className="col-header" style={{ marginBottom: 14 }}>
          <div className="col-title">카드 선택</div>
          <div className="col-count">{GRADE_LABEL[synthGrade]} 등급</div>
        </div>

        <div className="synth-grade-filter">
          {GRADES.map(g => (
            <button
              key={g}
              className={`col-filter-btn${synthGrade === g ? ' active' : ''}`}
              onClick={() => setSynthGrade(g)}
            >
              {GRADE_LABEL[g]}
            </button>
          ))}
        </div>

        {noCards ? (
          <div className="col-empty">
            {ownedCards.length === 0
              ? '카드가 부족합니다'
              : `${GRADE_LABEL[synthGrade]} 등급 카드가 없어요!`}
          </div>
        ) : (
          <div className="synth-card-grid">
            {gradeCards.map(card => {
              const total  = ownedCards.filter(c => c.id === card.id).length;
              const used   = slots.filter(s => s?.id === card.id).length;
              const avail  = total - used;
              return (
                <div
                  key={card.id}
                  className={`synth-card grade-${card.grade}${avail <= 0 ? ' disabled' : ''}`}
                  onClick={() => avail > 0 && addToSlot(card)}
                >
                  <img src={`/${card.img}`} alt={card.name} loading="lazy" />
                  <div className="sc-footer">
                    <div className="sc-name">{card.name}</div>
                    <span className="sc-grade" style={{ background: GRADE_BG[card.grade], color: GRADE_COL[card.grade] }}>
                      {GRADE_LABEL[card.grade]}
                    </span>
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
