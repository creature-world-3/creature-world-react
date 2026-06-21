import { useState, useRef } from 'react';
import { CARDS } from '../../data/cards.js';
import { calcDmgRange } from '../../utils/cardDraw.js';

const GRADES = ['n', 'r', 'sr', 'ur', 'lg', 'raid'];
const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID', awakened: 'AWAKENED' };
const GRADE_COLOR = { n: '#aaa', r: '#4a9eff', sr: '#c084fc', ur: '#fbbf24', lg: '#ff6b6b', raid: '#ffd700', awakened: '#b347ff' };

function getBestInstance(instances) {
  if (!instances.length) return null;
  return instances.reduce((best, cur) => {
    if ((cur.enhanceLevel || 0) > (best.enhanceLevel || 0)) return cur;
    if ((cur.condition || 1) > (best.condition || 1)) return cur;
    return best;
  });
}

function calcMaxDmg(card, ownedCards, growthMap) {
  const instances = ownedCards.filter(c => c.id === card.id);
  const best = getBestInstance(instances);
  if (!best) return 0;
  const growth = growthMap[best.uid] || 0;
  const [, mx] = calcDmgRange(card.grade, best.condition || 1, best.enhanceLevel || 0, best.levelCount || 0, growth);
  return mx;
}

function dmgRangeStr(card, ownedCards, growthMap) {
  const instances = ownedCards.filter(c => c.id === card.id);
  const best = getBestInstance(instances);
  if (!best) return '0~0';
  const growth = growthMap[best.uid] || 0;
  const [mn, mx] = calcDmgRange(card.grade, best.condition || 1, best.enhanceLevel || 0, best.levelCount || 0, growth);
  return `${mn}~${mx}`;
}

function instDmgRange(card, inst, growth) {
  const [mn, mx] = calcDmgRange(card.grade, inst.condition || 1, inst.enhanceLevel || 0, inst.levelCount || 0, growth || 0);
  return `${mn}~${mx}`;
}

export default function BagTab({ gs, setGs }) {
  const [selectedGrade, setSelectedGrade]     = useState(null);
  const [showAwakened, setShowAwakened]       = useState(false);
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

  const awakenedOwnedCards = CARDS.filter(c => c.grade === 'awakened' && ownedCards.some(oc => oc.id === c.id));

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
                        {myCards.length > 1 ? <div className="bag-stone-card-dup">×{myCards.length}</div> : (myCards[0]?.levelCount > 0 ? <div className="bag-stone-card-dup" style={{ color: '#4ade80' }}>Lv.{myCards[0].levelCount}</div> : null)}
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

      {awakenedOwnedCards.length > 0 && (
        <div className="bag-section">
          <div className="bag-section-title" style={{ color: '#b347ff' }}>각성카드</div>
          <div className="bag-stone-card-grid">
            {awakenedOwnedCards.map(card => {
              const inst   = ownedCards.find(c => c.id === card.id);
              const growth = inst ? (growthMap[inst.uid] || 0) : 0;
              return (
                <div key={card.id} className={`bag-stone-card grade-awakened`}>
                  <img src={`/${card.img}`} alt={card.name} loading="lazy" onError={e => { e.target.style.opacity='0.3'; }} />
                  {growth > 0 && <div className="bag-stone-card-badge">성장+{growth}</div>}
                  <div className="bag-stone-card-footer">
                    <div className="bag-stone-card-name">{card.name}</div>
                  </div>
                  <div className="bag-stone-card-dmg">{dmgRangeStr(card, ownedCards, growthMap)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
