import { useState, useRef } from 'react';
import { CARDS } from '../../data/cards.js';

const GRADES = ['n', 'r', 'sr', 'ur', 'lg', 'raid'];
const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID' };
const GRADE_COLOR = { n: '#aaa', r: '#4a9eff', sr: '#c084fc', ur: '#fbbf24', lg: '#ff6b6b', raid: '#ffd700' };
const GRADE_RANGE = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65] };

// 카드의 최대 데미지(upper bound) 계산 — 정렬 기준
function calcMaxDmg(card, ownedCards, growthMap) {
  const [, mx] = GRADE_RANGE[card.grade] || [1, 10];
  const instances = ownedCards.filter(c => c.id === card.id);
  const bestEnhance = instances.length ? Math.max(...instances.map(c => c.enhanceLevel || 0)) : 0;
  const bestCond    = instances.length ? Math.max(...instances.map(c => c.condition || 1))    : 1;
  const growth      = growthMap[card.id] || 0;
  const mult        = 1 + bestEnhance * 0.1;
  return Math.floor((mx + bestCond) * mult) + growth;
}

// 화면에 표시할 데미지 범위 문자열
function dmgRangeStr(card, ownedCards, growthMap) {
  const [mn, mx] = GRADE_RANGE[card.grade] || [1, 10];
  const instances = ownedCards.filter(c => c.id === card.id);
  const bestEnhance = instances.length ? Math.max(...instances.map(c => c.enhanceLevel || 0)) : 0;
  const bestCond    = instances.length ? Math.max(...instances.map(c => c.condition || 1))    : 1;
  const growth      = growthMap[card.id] || 0;
  const mult        = 1 + bestEnhance * 0.1;
  return `${Math.floor((mn + bestCond) * mult) + growth}~${Math.floor((mx + bestCond) * mult) + growth}`;
}

export default function BagTab({ gs, setGs }) {
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [stoneConfirm, setStoneConfirm]   = useState(null);
  const [toast, setToast]                 = useState(null);
  const toastTimer = useRef(null);

  const stones     = gs?.enhanceStones || {};
  const ownedCards = gs?.ownedCards || [];
  const growthMap  = gs?.cardBonusDmg || {};

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const gradeCards = selectedGrade
    ? CARDS
        .filter(c => c.grade === selectedGrade && ownedCards.some(oc => oc.id === c.id))
        .sort((a, b) => calcMaxDmg(b, ownedCards, growthMap) - calcMaxDmg(a, ownedCards, growthMap))
    : [];

  const useStone = (card) => {
    const stoneCount = stones[card.grade] || 0;
    if (stoneCount <= 0) { showToast('성장석이 없습니다'); return; }
    setStoneConfirm(card);
  };

  const executeUseStone = () => {
    const card = stoneConfirm;
    setStoneConfirm(null);
    if ((stones[card.grade] || 0) <= 0) { showToast('성장석이 없습니다'); return; }
    setGs(prev => {
      const curStone  = prev.enhanceStones?.[card.grade] || 0;
      if (curStone <= 0) return prev;
      const newGrowth = (prev.cardBonusDmg?.[card.id] || 0) + 1;
      showToast(`${card.name} 성장 +${newGrowth} 달성!`);
      return {
        ...prev,
        enhanceStones: { ...prev.enhanceStones, [card.grade]: curStone - 1 },
        cardBonusDmg:  { ...(prev.cardBonusDmg || {}), [card.id]: newGrowth },
      };
    });
  };

  return (
    <div className="bag-wrap">
      {toast && <div className="cw-toast">{toast}</div>}

      {stoneConfirm && (
        <div className="card-zoom-overlay" onClick={() => setStoneConfirm(null)}>
          <div className="synth-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="synth-confirm-title">카드를 성장시키시겠습니까?</div>
            <div className="synth-confirm-desc">
              {stoneConfirm.name} 성장 +{(growthMap[stoneConfirm.id] || 0) + 1}
            </div>
            <div className="synth-confirm-btns">
              <button className="synth-confirm-cancel" onClick={() => setStoneConfirm(null)}>취소</button>
              <button className="synth-confirm-ok" onClick={executeUseStone}>예</button>
            </div>
          </div>
        </div>
      )}
      <div className="bag-header">
        <div className="col-title">가방</div>
        <div className="col-count">인벤토리</div>
      </div>

      <div className="bag-section">
        <div className="bag-section-title">성장석</div>
        <div className="bag-section-hint">
          성장 던전 클리어 시 등급별 성장석을 획득합니다. 성장석을 탭하면 해당 등급 카드를 확인할 수 있어요.
        </div>
        <div className="bag-stones-grid">
          {GRADES.map(grade => (
            <div
              key={grade}
              className={`bag-stone-item bag-stone-clickable${selectedGrade === grade ? ' bag-stone-selected' : ''}`}
              onClick={() => setSelectedGrade(prev => prev === grade ? null : grade)}
            >
              <div
                className="bag-stone-icon"
                style={{
                  background: `${GRADE_COLOR[grade]}22`,
                  border: `2px solid ${selectedGrade === grade ? GRADE_COLOR[grade] : GRADE_COLOR[grade] + '88'}`,
                  boxShadow: selectedGrade === grade ? `0 0 8px ${GRADE_COLOR[grade]}66` : 'none',
                }}
              >
                <div className="bag-stone-gem" style={{ background: GRADE_COLOR[grade] }} />
              </div>
              <div className="bag-stone-grade" style={{ color: GRADE_COLOR[grade] }}>{GRADE_LABEL[grade]}</div>
              <div className="bag-stone-count">{stones[grade] || 0}<span className="bag-stone-unit">개</span></div>
            </div>
          ))}
        </div>

        {selectedGrade && (
          <div className="bag-stone-cards">
            <div className="bag-stone-cards-title">
              <span style={{ color: GRADE_COLOR[selectedGrade], fontWeight: 900 }}>{GRADE_LABEL[selectedGrade]}</span> 등급 보유 카드
              {(stones[selectedGrade] || 0) > 0 && (
                <span className="bag-stone-cards-hint"> · 탭하면 성장석 1개 소모 후 성장 +1</span>
              )}
            </div>
            {gradeCards.length === 0 ? (
              <div className="bag-stone-empty">{GRADE_LABEL[selectedGrade]} 등급 카드를 보유하고 있지 않아요</div>
            ) : (
              <div className="bag-stone-card-grid">
                {gradeCards.map(card => {
                  const myCards   = ownedCards.filter(c => c.id === card.id);
                  const growth    = growthMap[card.id] || 0;
                  const canUse    = (stones[selectedGrade] || 0) > 0;
                  return (
                    <div
                      key={card.id}
                      className={`bag-stone-card grade-${card.grade}${canUse ? ' bag-stone-card-usable' : ''}`}
                      onClick={() => canUse && useStone(card)}
                    >
                      <img src={`/${card.img}`} alt={card.name} loading="lazy" />
                      {growth > 0 && <div className="bag-stone-card-badge">성장+{growth}</div>}
                      <div className="bag-stone-card-footer">
                        <div className="bag-stone-card-name">{card.name}</div>
                        {myCards.length > 1 && <div className="bag-stone-card-dup">×{myCards.length}</div>}
                      </div>
                      <div className="bag-stone-card-dmg">{dmgRangeStr(card, ownedCards, growthMap)}</div>
                      {canUse && <div className="bag-stone-card-use">+1</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
