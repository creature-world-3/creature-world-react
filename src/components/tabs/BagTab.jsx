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

// 특정 인스턴스 기준 데미지 범위
function instDmgRange(card, inst, growth) {
  const [mn, mx] = GRADE_RANGE[card.grade] || [1, 10];
  const mult = 1 + (inst.enhanceLevel || 0) * 0.1;
  const g = growth || 0;
  return `${Math.floor((mn + (inst.condition||1)) * mult) + g}~${Math.floor((mx + (inst.condition||1)) * mult) + g}`;
}

export default function BagTab({ gs, setGs }) {
  const [selectedGrade, setSelectedGrade]     = useState(null);
  const [stoneConfirm, setStoneConfirm]       = useState(null); // { card, inst }
  const [stoneInstPick, setStoneInstPick]     = useState(null); // card def — 복수 장일 때 인스턴스 선택
  const [toast, setToast]                     = useState(null);
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
    const insts = ownedCards.filter(c => c.id === card.id);
    if (insts.length > 1) { setStoneInstPick(card); return; }
    setStoneConfirm({ card, inst: insts[0] });
  };

  const executeUseStone = () => {
    const { card, inst } = stoneConfirm;
    setStoneConfirm(null);
    if ((stones[card.grade] || 0) <= 0) { showToast('성장석이 없습니다'); return; }
    setGs(prev => {
      const curStone  = prev.enhanceStones?.[card.grade] || 0;
      if (curStone <= 0) return prev;
      const newGrowth = (prev.cardBonusDmg?.[inst.uid] || 0) + 1;
      showToast(`${card.name} 성장 +${newGrowth} 달성!`);
      return {
        ...prev,
        enhanceStones: { ...prev.enhanceStones, [card.grade]: curStone - 1 },
        cardBonusDmg:  { ...(prev.cardBonusDmg || {}), [inst.uid]: newGrowth },
      };
    });
  };

  return (
    <div className="bag-wrap">
      {toast && <div className="cw-toast">{toast}</div>}

      {stoneInstPick && (
        <div className="card-zoom-overlay" onClick={() => setStoneInstPick(null)}>
          <div className="synth-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="synth-confirm-title">성장시킬 카드를 선택하세요</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', margin: '10px 0' }}>
              {ownedCards.filter(c => c.id === stoneInstPick.id).map((inst, i) => {
                const growth = growthMap[inst.uid] || 0;
                return (
                  <div key={inst.uid} style={{ textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => { setStoneInstPick(null); setStoneConfirm({ card: stoneInstPick, inst }); }}>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={`/${stoneInstPick.img}`} alt="" style={{ width: 54, height: 54, objectFit: 'contain', borderRadius: 8, border: '2px solid #e5e7eb' }} />
                      {inst.enhanceLevel > 0 && <div style={{ position: 'absolute', top: 2, right: 2, fontSize: '0.6rem', fontWeight: 900, color: '#f97316', background: 'rgba(255,255,255,0.9)', borderRadius: 4, padding: '0 3px' }}>+{inst.enhanceLevel}</div>}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginTop: 2 }}>#{i + 1}{growth > 0 ? ` 성장+${growth}` : ''}</div>
                  </div>
                );
              })}
            </div>
            <button className="synth-confirm-cancel" onClick={() => setStoneInstPick(null)} style={{ width: '100%' }}>취소</button>
          </div>
        </div>
      )}

      {stoneConfirm && (() => {
        const { card, inst } = stoneConfirm;
        const curGrowth = growthMap[inst.uid] || 0;
        const beforeDmg = instDmgRange(card, inst, curGrowth);
        const afterDmg  = instDmgRange(card, inst, curGrowth + 1);
        return (
        <div className="card-zoom-overlay" onClick={() => setStoneConfirm(null)}>
          <div className="synth-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="synth-confirm-title">카드를 성장시키시겠습니까?</div>
            <div className="bag-stone-confirm-card">
              <img src={`/${card.img}`} alt={card.name} className="bag-stone-confirm-img" />
              <div className="bag-stone-confirm-info">
                <div className="bag-stone-confirm-name">{card.name}</div>
                <div className="bag-stone-confirm-grade" style={{color: GRADE_COLOR[card.grade]}}>{GRADE_LABEL[card.grade]}</div>
                <div className="bag-stone-confirm-stat">
                  <span className="bag-stone-confirm-label">성장</span>
                  <span>{curGrowth} → <strong style={{color:'#7c3aed'}}>+{curGrowth + 1}</strong></span>
                </div>
                <div className="bag-stone-confirm-stat">
                  <span className="bag-stone-confirm-label">데미지</span>
                  <span style={{fontSize:'0.7rem'}}>{beforeDmg} → <strong style={{color:'#7c3aed'}}>{afterDmg}</strong></span>
                </div>
                {inst.enhanceLevel > 0 && (
                  <div className="bag-stone-confirm-stat">
                    <span className="bag-stone-confirm-label">강화</span>
                    <span>+{inst.enhanceLevel}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="synth-confirm-btns">
              <button className="synth-confirm-cancel" onClick={() => setStoneConfirm(null)}>취소</button>
              <button className="synth-confirm-ok" onClick={executeUseStone}>확인</button>
            </div>
          </div>
        </div>
        );
      })()}
      <div className="bag-header">
        <div className="col-title">가방</div>
        <div className="col-count">인벤토리</div>
      </div>

      <div className="bag-section">
        <div className="bag-section-title">성장석</div>
        <div className="bag-section-hint">
          파밍 던전 클리어 시 등급별 성장석을 획득할 수 있어요. 성장석을 탭하면 해당 등급 카드를 확인할 수 있어요.
        </div>
        <div className="bag-stones-grid">
          {GRADES.map(grade => {
            const count = stones[grade] || 0;
            const isSelected = selectedGrade === grade;
            return (
              <div
                key={grade}
                className={`bag-stone-card-item${isSelected ? ' selected' : ''}${count === 0 ? ' empty' : ''}`}
                style={{
                  '--stone-color': GRADE_COLOR[grade],
                  borderColor: isSelected ? GRADE_COLOR[grade] : 'transparent',
                  boxShadow: isSelected ? `0 0 14px ${GRADE_COLOR[grade]}55` : '0 2px 8px rgba(0,0,0,0.12)',
                }}
                onClick={() => setSelectedGrade(prev => prev === grade ? null : grade)}
              >
                <div className="bag-stone-card-header" style={{ color: GRADE_COLOR[grade] }}>
                  {GRADE_LABEL[grade]}
                </div>
                <div className="bag-stone-card-gem-wrap">
                  <div className="bag-stone-card-gem" style={{
                    background: `radial-gradient(circle at 35% 35%, white, ${GRADE_COLOR[grade]})`,
                    boxShadow: `0 0 12px ${GRADE_COLOR[grade]}88`,
                    opacity: count === 0 ? 0.3 : 1,
                  }} />
                </div>
                <div className="bag-stone-card-count" style={{ color: count === 0 ? '#aaa' : GRADE_COLOR[grade] }}>
                  {count}<span className="bag-stone-unit">개</span>
                </div>
              </div>
            );
          })}
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
                  const growth    = Math.max(...myCards.map(c => growthMap[c.uid] || 0), 0);
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
