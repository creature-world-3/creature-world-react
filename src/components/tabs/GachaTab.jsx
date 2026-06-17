import { useState, useEffect, useRef } from 'react';
import { CARDS } from '../../data/cards.js';
import { getGrowth, applyGrowthStone, calcBonus } from '../../utils/growth.js';
import DexTab from './DexTab.jsx';

const GRADE_WEIGHT = { n: 70, r: 22, sr: 6.9, ur: 1, lg: 0.1 };
const GRADE_LABEL  = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID' };
const FLASH_LABEL  = { sr: 'SUPER RARE!', ur: 'ULTRA RARE!', lg: 'L E G E N D !' };
const GRADE_RANGE  = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65] };
export const GRADE_BORDER = {
  n:    '/gacha/노말카드테두리.png',
  r:    '/gacha/레어카드테두리.png',
  sr:   '/gacha/슈퍼레어카드테두리.png',
  ur:   '/gacha/울트라레어카드테두리.png',
  lg:   '/gacha/레전드카드테두리.png',
  raid: '/gacha/레이드카드테두리.png',
};

const D10_AURORA = {
  sr:   'repeating-linear-gradient(120deg,rgba(192,132,252,0.35) 0%,rgba(100,180,255,0.25) 25%,rgba(255,100,200,0.25) 50%,rgba(192,132,252,0.35) 75%)',
  ur:   'repeating-linear-gradient(120deg,rgba(255,210,80,0.45) 0%,rgba(255,160,30,0.35) 25%,rgba(255,240,120,0.4) 50%,rgba(255,210,80,0.45) 75%)',
  lg:   'repeating-linear-gradient(120deg,rgba(255,80,80,0.3) 0%,rgba(255,200,50,0.3) 15%,rgba(80,220,120,0.3) 30%,rgba(80,160,255,0.3) 45%,rgba(180,80,255,0.3) 60%,rgba(255,80,80,0.3) 75%)',
  raid: 'repeating-linear-gradient(120deg,rgba(255,30,30,0.55) 0%,rgba(180,0,0,0.35) 20%,rgba(255,80,0,0.4) 40%,rgba(220,0,40,0.5) 60%,rgba(255,30,30,0.55) 80%)',
};
const D10_GRADE_BG  = { n:'rgba(80,80,80,0.9)', r:'#1a3a6a', sr:'#2d1b4e', ur:'#3a2800', lg:'linear-gradient(90deg,#ff6b6b,#4d96ff,#c77dff)' };
const D10_GRADE_COL = { n:'#ccc', r:'#7eb8ff', sr:'#d4a8ff', ur:'#ffd97a', lg:'#fff' };

function dmgRange(grade, cond, enhanceLevel = 0, bonus = 0) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  const mult = 1 + enhanceLevel * 0.1;
  return `${Math.floor((mn + (cond||1)) * mult) + bonus}~${Math.floor((mx + (cond||1)) * mult) + bonus}`;
}
function condStyle(grade, cond) {
  if (grade === 'lg' || grade === 'raid') return 'gold';
  if (grade === 'ur') return 'holo';
  if (cond >= 9) return 'gold';
  if (cond >= 6) return 'holo';
  return 'normal';
}
let _uid = 0;
const genUid = () => `${++_uid}_${Date.now()}`;
function randomCondition() {
  const r = Math.random();
  if (r < 0.02) return 10; if (r < 0.07) return 9; if (r < 0.20) return 8;
  if (r < 0.37) return 7;  if (r < 0.53) return 6; if (r < 0.65) return 5;
  if (r < 0.76) return 4;  if (r < 0.86) return 3; if (r < 0.93) return 2;
  return 1;
}
function randomCard() {
  const total = Object.values(GRADE_WEIGHT).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let grade = 'n';
  for (const [g, w] of Object.entries(GRADE_WEIGHT)) { r -= w; if (r <= 0) { grade = g; break; } }
  const pool = CARDS.filter(c => c.grade === grade && !c.raid && !c.special);
  return pool[Math.floor(Math.random() * pool.length)] ?? CARDS[0];
}

const STONE_GRADES = new Set(['n', 'r', 'sr', 'ur', 'lg', 'raid']);

function StarRating({ value }) {
  const full  = Math.floor(value / 2);
  const half  = (value % 2) === 1 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <div className="modal-stars">
      {Array.from({ length: full  }).map((_, i) => <span key={`f${i}`} className="star-full">★</span>)}
      {half === 1 && <span className="star-half">★</span>}
      {Array.from({ length: empty }).map((_, i) => <span key={`e${i}`} className="star-empty">☆</span>)}
    </div>
  );
}

function CardDetailModal({ item, gs, setGs, onClose }) {
  const [localGrowth, setLocalGrowth] = useState(item?.growthBonus || 0);
  useEffect(() => {
    setLocalGrowth(item ? getGrowth(gs?.cardBonusDmg, { uid: item.uid, id: item.card?.id }) : 0);
  }, [item, gs]);
  if (!item) return null;
  const { card, cond, count } = item;
  const cs     = condStyle(card.grade, cond);
  const enhLvl = item.enhanceLevel || 0;
  const stoneCount  = gs?.enhanceStones?.[card.grade] || 0;
  const canUseStone = stoneCount > 0 && STONE_GRADES.has(card.grade);
  const handleUseStone = () => {
    if (!canUseStone || !item.uid) return;
    const inst = { uid: item.uid, id: item.card?.id };
    setGs(prev => {
      const curStone = prev.enhanceStones?.[card.grade] || 0;
      if (curStone <= 0) return prev;
      const { newMap } = applyGrowthStone(prev.cardBonusDmg, inst);
      return { ...prev, enhanceStones: { ...prev.enhanceStones, [card.grade]: curStone - 1 }, cardBonusDmg: newMap };
    });
    setLocalGrowth(g => g + 1);
  };
  return (
    <div className="card-zoom-overlay card-detail-overlay" onClick={onClose}>
      <div className="card-zoom-inner" onClick={e => e.stopPropagation()}>
        <div className="modal-card-main">
          <div className={`zoom-card grade-${card.grade}`}>
            <div className="card-header">
              <span className="card-name">{card.name}</span>
              <span className="grade-badge">{GRADE_LABEL[card.grade]}</span>
            </div>
            <div className="card-art">
              <img src={`/${card.img}`} alt={card.name} />
            </div>
            {GRADE_BORDER[card.grade] && <img src={GRADE_BORDER[card.grade]} className="grade-border-overlay" alt="" />}
            <div className="card-aurora" />
            <div className={`draw-cond-badge cond-badge-${cs}`}>{cond}</div>
          </div>
          <div className="modal-stat-panel">
            <div className="modal-stat-row">
              <span className="modal-stat-label">데미지</span>
              <span className="modal-stat-value modal-stat-dmg">{dmgRange(card.grade, cond, enhLvl, localGrowth)}</span>
            </div>
            {enhLvl > 0 && (
              <div className="modal-stat-row">
                <span className="modal-stat-label">강화</span>
                <span className="modal-stat-value modal-stat-enhance">{enhLvl}단계</span>
              </div>
            )}
            {localGrowth > 0 && (
              <div className="modal-stat-row">
                <span className="modal-stat-label">성장</span>
                <span className="modal-stat-value modal-stat-enhance">+{localGrowth}</span>
              </div>
            )}
            <div className="modal-stat-row">
              <span className="modal-stat-label">컨디션</span>
              <StarRating value={cond} />
            </div>
            {count > 1 && (
              <div className="modal-stat-row">
                <span className="modal-stat-label">보유</span>
                <span className="modal-stat-value">{count}장</span>
              </div>
            )}
          </div>
        </div>
        {canUseStone && (
          <button className="stone-use-btn" onClick={handleUseStone}>
            {GRADE_LABEL[card.grade]} 성장석 사용 (성장 +1) · {gs?.enhanceStones?.[card.grade] || 0}개 보유
          </button>
        )}
        <button className="zoom-close" onClick={onClose}>닫기 ✕</button>
      </div>
    </div>
  );
}

export default function GachaTab({ gs, setGs, isGuest, onBack }) {
  const [screen, setScreen]             = useState('gacha');
  const [flipped, setFlipped]           = useState(false);
  const [drawn, setDrawn]               = useState(null);
  const [flash, setFlash]               = useState(null);
  const [toast, setToast]               = useState(null);
  const [draw10Results, setDraw10Results] = useState(null);
  const [draw10Key, setDraw10Key]       = useState(0);
  const [zoomItem, setZoomItem]         = useState(null);
  const toastTimer = useRef(null);

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

  const doDraw = () => {
    if (gs.tickets <= 0) { showToast('뽑기권이 없어요'); return; }
    if (flipped) return;
    const card = randomCard();
    const cond = randomCondition();
    const isNew = !gs.ownedCards.some(c => c.id === card.id);
    setGs(prev => ({
      ...prev,
      tickets: prev.tickets - 1,
      ownedCards: [...prev.ownedCards, { uid: genUid(), id: card.id, condition: cond }],
    }));
    setDrawn({ card, cond });
    showToast((isNew ? 'NEW! ' : '') + card.name + ' 획득!');
    if (['sr', 'ur', 'lg'].includes(card.grade)) {
      setFlash(card.grade);
      setTimeout(() => setFlipped(true), 400);
    } else {
      setFlipped(true);
    }
  };

  const resetDraw = () => { setFlipped(false); setDrawn(null); };

  const doDraw10 = () => {
    if (gs.tickets < 10) { showToast('뽑기권이 부족해요! 10장이 필요해요'); return; }
    const results = [];
    const newOwned = [...gs.ownedCards];
    for (let i = 0; i < 10; i++) {
      const card = randomCard();
      const cond = randomCondition();
      results.push({ card, cond });
      newOwned.push({ uid: genUid(), id: card.id, condition: cond });
    }
    setGs(prev => ({ ...prev, tickets: prev.tickets - 10, ownedCards: newOwned }));
    setDraw10Key(k => k + 1);
    setDraw10Results(results);
  };

  const getBurstStyle = (idx) => {
    const col = idx % 5, row = Math.floor(idx / 5);
    const cx = col - 2, cy = row - 0.5;
    return {
      '--bx': `${Math.round(-cx * 220)}px`,
      '--by': `${Math.round(-cy * 280)}px`,
      '--br': `${Math.round(cx * 18)}deg`,
      animation: `cardBurst 0.55s cubic-bezier(.17,.67,.35,1.2) ${idx * 80}ms forwards`,
    };
  };

  return (
    <div className="gacha-screen">
      <img src="/gacha/카드_도감화면.png" className="gacha-bg-img" alt="" />

      {flash && (
        <div className={`grade-flash grade-flash-${flash}`}>
          <div className="grade-flash-text">{FLASH_LABEL[flash]}</div>
        </div>
      )}
      {toast && <div className="cw-toast">{toast}</div>}

      {/* 카드 상세 모달 (10뽑용) */}
      <CardDetailModal item={zoomItem} gs={gs} setGs={setGs} onClose={() => setZoomItem(null)} />

      {/* 10연속 결과 */}
      {draw10Results && (
        <div className="card-zoom-overlay" onClick={() => setDraw10Results(null)}>
          <div className="draw10-wrap" onClick={e => e.stopPropagation()}>
            <div className="draw10-title">10뽑 결과!</div>
            <div className="draw10-grid" key={draw10Key}>
              {draw10Results.map(({ card, cond }, idx) => {
                const cs = condStyle(card.grade, cond);
                const hasAurora = ['sr','ur','lg'].includes(card.grade);
                const auroraAnim = card.grade === 'lg' ? '2s' : '3s';
                return (
                  <div key={idx} className={`draw10-card grade-${card.grade}`} style={getBurstStyle(idx)}
                    onClick={e => { e.stopPropagation(); setZoomItem({ card, cond }); }}>
                    <img src={`/${card.img}`} alt={card.name} loading="lazy" />
                    {GRADE_BORDER[card.grade] && <img src={GRADE_BORDER[card.grade]} className="grade-border-overlay" alt="" />}
                    <div className="d10-header">
                      <span className="d10-name">{card.name}</span>
                      <span className="d10-grade" style={{ background: D10_GRADE_BG[card.grade], color: D10_GRADE_COL[card.grade] }}>
                        {GRADE_LABEL[card.grade]}
                      </span>
                    </div>
                    {hasAurora && (
                      <div className="d10-aurora" style={{
                        background: D10_AURORA[card.grade],
                        backgroundSize: '200% 200%',
                        animation: `colAuroraSR ${auroraAnim} ease-in-out infinite`,
                      }} />
                    )}
                    <div className={`d10-cond${cs === 'gold' ? ' cond-badge-gold' : ''}`}
                      style={{
                        background: cs === 'gold' ? undefined : cs === 'holo' ? 'linear-gradient(135deg,#c084fc,#4d96ff)' : '#444',
                        color: cs === 'gold' ? '#7a4a00' : 'white',
                      }}>{cond}</div>
                  </div>
                );
              })}
            </div>
            <div className="draw10-btn-row">
              <button className="draw10-btn-again" onClick={doDraw10} disabled={gs.tickets < 10}>
                한번 더 ({gs.tickets}장)
              </button>
              <button className="draw10-btn-close" onClick={() => setDraw10Results(null)}>닫기 ✕</button>
            </div>
          </div>
        </div>
      )}

      {/* 본문 */}
      <div className="gacha-content">
        {/* 네브바 */}
        <div className="gacha-navbar">
          <button className="gacha-nav-btn" onClick={screen === 'dex' ? () => setScreen('gacha') : onBack}>
            ← 뒤로
          </button>
          <span className="gacha-nav-title">
            {screen === 'dex' ? '도감' : `뽑기권 ${gs.tickets}장`}
          </span>
          {screen === 'gacha' ? (
            <button className="gacha-dex-tab-btn" onClick={() => setScreen('dex')}>
              <img src="/gacha/도감탭.png" alt="도감" className="gacha-dex-tab-img" />
            </button>
          ) : (
            <div style={{ width: 60 }} />
          )}
        </div>

        {screen === 'gacha' ? (
          <div className="gacha-main">
            <div className="gacha-card-center">
              {/* 플립 카드 */}
              <div
                className={`gacha-draw-wrap${!flipped && gs.tickets <= 0 ? ' empty' : ''}`}
                onClick={() => { if (!flipped && gs.tickets > 0 && !isGuest) doDraw(); else if (flipped) resetDraw(); }}
              >
                <div className={`draw-card-inner${flipped ? ' flipped' : ''}`}>
                  {/* 뒷면: 카드 뒷면 이미지 */}
                  <div className="draw-face gacha-flip-back">
                    <img src="/gacha/카드 뒷면.png" alt="카드 뒷면" className="gacha-card-back-img-real" />
                    <div className="gacha-tap-hint-on-card">
                      {isGuest ? '로그인 필요' : gs.tickets > 0 ? '탭해서 뽑기' : '뽑기권 없음'}
                    </div>
                  </div>
                  {/* 앞면: 뽑힌 카드 */}
                  {(() => {
                    const dc = drawn?.card;
                    const cs = drawn ? condStyle(drawn.card.grade, drawn.cond) : 'normal';
                    return (
                      <div className={`draw-face draw-front${dc ? ` grade-${dc.grade}` : ''}`}>
                        {dc && (
                          <>
                            <div className="card-header">
                              <span className="card-name">{dc.name}</span>
                              <span className="grade-badge">{GRADE_LABEL[dc.grade]}</span>
                            </div>
                            <div className="card-art">
                              <img src={`/${dc.img}`} alt={dc.name} />
                            </div>
                            {GRADE_BORDER[dc.grade] && <img src={GRADE_BORDER[dc.grade]} className="grade-border-overlay" alt="" />}
                            <div className="card-aurora" />
                            <div className={`draw-cond-badge cond-badge-${cs}`}>{drawn.cond}</div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {flipped && (
                <div className="gacha-tap-hint" style={{ marginTop: 12 }}>탭해서 다음 뽑기</div>
              )}
            </div>
            <div className="gacha-actions">
              {isGuest ? (
                <div className="gacha-guest-msg">로그인이 필요합니다</div>
              ) : flipped ? (
                <button className="gacha-next-btn gacha-next-btn-bar" onClick={resetDraw}>다음 뽑기 →</button>
              ) : (
                <>
                  <button
                    className={`gacha-img-btn${gs.tickets <= 0 ? ' disabled' : ''}`}
                    onClick={doDraw} disabled={gs.tickets <= 0}
                  >
                    <img src="/gacha/1장뽑기.png" alt="1장 뽑기" className="gacha-btn-img" />
                  </button>
                  <button
                    className={`gacha-img-btn${gs.tickets < 10 ? ' disabled' : ''}`}
                    onClick={doDraw10} disabled={gs.tickets < 10}
                  >
                    <img src="/gacha/10장뽑기.png" alt="10장 뽑기" className="gacha-btn-img" />
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="gacha-dex-wrap">
            <DexTab gs={gs} setGs={setGs} />
          </div>
        )}
      </div>
    </div>
  );
}
