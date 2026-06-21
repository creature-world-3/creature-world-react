import { useState, useEffect, useRef } from 'react';
import { CARDS, CHARACTERS, AWAKENED_CARD_MAP } from '../../data/cards.js';
import { getGrowth, applyGrowthStone, calcBonus } from '../../utils/growth.js';
import { addCardOrLevelUp, genDrawUid, calcDmgRange } from '../../utils/cardDraw.js';
import DexTab from './DexTab.jsx';

const GRADE_WEIGHT = { n: 70, r: 22, sr: 6.9, ur: 1, lg: 0.1 };
const GRADE_LABEL  = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID', awakened: 'AWAKENED' };
const FLASH_LABEL  = { sr: 'SUPER RARE!', ur: 'ULTRA RARE!', lg: 'L E G E N D !', awakened: 'A W A K E N E D !' };
const GRADE_COLOR  = { n: '#888', r: '#4a9eff', sr: '#c084fc', ur: '#fbbf24', lg: '#ff6b6b', raid: '#ffd700', awakened: '#b347ff' };
const AWAKEN_COST  = 100;
const AWAKEN_FRAG_TO_CARD = 10000;

function condColor(cond) {
  if (cond >= 9) return '#d97706';
  if (cond >= 6) return '#7c3aed';
  return '#888';
}
function condStyle(grade, cond) {
  if (grade === 'lg' || grade === 'raid' || grade === 'awakened') return 'gold';
  if (grade === 'ur') return 'holo';
  if (cond >= 9) return 'gold';
  if (cond >= 6) return 'holo';
  return 'normal';
}
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
  const pool = CARDS.filter(c => c.grade === grade && !c.raid && !c.special && !c.awakened);
  return pool[Math.floor(Math.random() * pool.length)] ?? CARDS[0];
}

const D10_AURORA = {
  sr:   'repeating-linear-gradient(120deg,rgba(192,132,252,0.35) 0%,rgba(100,180,255,0.25) 25%,rgba(255,100,200,0.25) 50%,rgba(192,132,252,0.35) 75%)',
  ur:   'repeating-linear-gradient(120deg,rgba(255,210,80,0.45) 0%,rgba(255,160,30,0.35) 25%,rgba(255,240,120,0.4) 50%,rgba(255,210,80,0.45) 75%)',
  lg:   'repeating-linear-gradient(120deg,rgba(255,80,80,0.3) 0%,rgba(255,200,50,0.3) 15%,rgba(80,220,120,0.3) 30%,rgba(80,160,255,0.3) 45%,rgba(180,80,255,0.3) 60%,rgba(255,80,80,0.3) 75%)',
  awakened: 'repeating-linear-gradient(120deg,rgba(179,71,255,0.5) 0%,rgba(80,160,255,0.4) 25%,rgba(255,80,200,0.4) 50%,rgba(179,71,255,0.5) 75%)',
};
const D10_GRADE_BG  = { n:'rgba(80,80,80,0.9)', r:'#1a3a6a', sr:'#2d1b4e', ur:'#3a2800', lg:'linear-gradient(90deg,#ff6b6b,#4d96ff,#c77dff)', awakened:'linear-gradient(90deg,#6a00cc,#b347ff)' };
const D10_GRADE_COL = { n:'#ccc', r:'#7eb8ff', sr:'#d4a8ff', ur:'#ffd97a', lg:'#fff', awakened:'#fff' };

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
  const [localGrowth, setLocalGrowth] = useState(0);

  useEffect(() => {
    if (!item) return;
    setLocalGrowth(item.uid ? (gs?.cardBonusDmg?.[item.uid] || 0) : 0);
  }, [item, gs]);

  if (!item) return null;
  const { card, cond, levelCount, levelProgress } = item;
  const cs     = condStyle(card.grade, cond);
  const enhLvl = item.enhanceLevel || 0;
  const lvl    = levelCount || 0;
  const cardBonus = calcBonus(gs?.ownedCards || []);

  const [dmgMin, dmgMax] = calcDmgRange(card.grade, cond, enhLvl, lvl, localGrowth + cardBonus);

  const stoneCount  = gs?.enhanceStones?.[card.grade] || 0;
  const canUseStone = stoneCount > 0 && item.uid;

  const handleUseStone = () => {
    if (!canUseStone) return;
    const inst = { uid: item.uid, id: card?.id };
    setGs(prev => {
      const curStone = prev.enhanceStones?.[card.grade] || 0;
      if (curStone <= 0) return prev;
      const { newMap } = applyGrowthStone(prev.cardBonusDmg, inst);
      return {
        ...prev,
        enhanceStones: { ...prev.enhanceStones, [card.grade]: curStone - 1 },
        cardBonusDmg:  newMap,
      };
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
            <div className="card-aurora" />
            <div className={`draw-cond-badge cond-badge-${cs}`}>{cond}</div>
          </div>
          <div className="modal-stat-panel">
            <div className="modal-stat-row">
              <span className="modal-stat-label">데미지</span>
              <span className="modal-stat-value modal-stat-dmg">{dmgMin}~{dmgMax}</span>
            </div>
            {enhLvl > 0 && (
              <div className="modal-stat-row">
                <span className="modal-stat-label">강화</span>
                <span className="modal-stat-value modal-stat-enhance">{enhLvl}단계</span>
              </div>
            )}
            {lvl > 0 && (
              <div className="modal-stat-row">
                <span className="modal-stat-label">카드 레벨</span>
                <span className="modal-stat-value" style={{ color: '#4ade80' }}>Lv.{lvl}</span>
              </div>
            )}
            {(levelProgress || 0) > 0 && (
              <div className="modal-stat-row">
                <span className="modal-stat-label">레벨 진행도</span>
                <span className="modal-stat-value">{levelProgress}/100</span>
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

// ── 일반 뽑기 탭 ──
function NormalGachaSubTab({ gs, setGs, isGuest }) {
  const [flipped, setFlipped]   = useState(false);
  const [drawn, setDrawn]       = useState(null);
  const [flash, setFlash]       = useState(null);
  const [toast, setToast]       = useState(null);
  const [floats, setFloats]     = useState([]);
  const [draw10Results, setDraw10Results] = useState(null);
  const [draw10Key, setDraw10Key]         = useState(0);
  const [zoomItem, setZoomItem] = useState(null);
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
    if (gs.tickets <= 0) { showToast('도토리가 없어요'); return; }
    if (flipped) return;
    const card = randomCard();
    const cond = randomCondition();
    const { newOwned, isNew, isDupe, leveledUp, progress, level } = addCardOrLevelUp(gs.ownedCards, card, cond);
    setGs(prev => ({ ...prev, tickets: prev.tickets - 1, ownedCards: newOwned }));
    setDrawn({ card, cond, isDupe, leveledUp, progress, level });
    if (isNew) showToast('NEW! ' + card.name + ' 획득!');
    else if (leveledUp) showToast(`${card.name} Lv.${level} 달성!`);
    else showToast(`${card.name} 진행도 ${progress}/100`);
    if (['sr', 'ur', 'lg'].includes(card.grade)) {
      setFlash(card.grade);
      setTimeout(() => setFlipped(true), 400);
    } else {
      setFlipped(true);
    }
  };
  const resetDraw = () => { setFlipped(false); setDrawn(null); };

  const doDraw10 = () => {
    if (gs.tickets < 10) { showToast('도토리가 부족해요! 10장이 필요해요'); return; }
    const results = [];
    let currentOwned = [...gs.ownedCards];
    for (let i = 0; i < 10; i++) {
      const card = randomCard();
      const cond = randomCondition();
      const r = addCardOrLevelUp(currentOwned, card, cond);
      currentOwned = r.newOwned;
      results.push({ card, cond, isNew: r.isNew, isDupe: r.isDupe, leveledUp: r.leveledUp, progress: r.progress, level: r.level });
    }
    setGs(prev => ({ ...prev, tickets: prev.tickets - 10, ownedCards: currentOwned }));
    setDraw10Key(k => k + 1);
    setDraw10Results(results);
  };

  const handleClick = (e) => {
    if (gs.clickDone) { showToast('오늘 클릭 뽑기는 이미 완료했어요!'); return; }
    const fid = Date.now() + Math.random();
    setFloats(prev => [...prev, { id: fid, x: e.clientX, y: e.clientY }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== fid)), 800);
    setGs(prev => {
      const newCount = (prev.clickCount || 0) + 1;
      if (newCount % 100 === 0) {
        const newRound = (prev.clickRound || 0) + 1;
        const done = newRound >= 10;
        setTimeout(() => showToast(
          done ? '오늘 클릭 뽑기 완료! 총 10장 획득!' : `${newRound}번째 100클릭 달성! 도토리 +1장!`
        ), 0);
        return { ...prev, tickets: prev.tickets + 1, clickCount: newCount, clickRound: newRound, clickDone: done };
      }
      return { ...prev, clickCount: newCount };
    });
  };

  const doAttendance = () => {
    const today = new Date().toDateString();
    if (gs.attendDate === today) { showToast('오늘 이미 출석했어요! 내일 다시 와요'); return; }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = gs.attendDate === yesterday.toDateString();
    const newStreak = wasYesterday ? (gs.attendStreak || 0) + 1 : 1;
    const amount = Math.floor(Math.random() * 11) + 5;
    const bonus  = newStreak === 7 ? 100 : 0;
    const finalStreak = newStreak >= 7 ? 0 : newStreak;
    setGs(prev => ({
      ...prev,
      tickets: prev.tickets + amount + bonus,
      attendDate: today,
      attendStreak: finalStreak,
    }));
    showToast(`출석 완료! 도토리 ${amount}장 획득!${bonus ? ' 7일 개근 달성 +100장!' : ''}`);
  };

  const today        = new Date().toDateString();
  const attendDone   = gs.attendDate === today;
  const clickProgress = (gs.clickCount || 0) % 100;

  const dc = drawn?.card;
  const cs = drawn ? condStyle(drawn.card.grade, drawn.cond) : 'normal';

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
    <>
      <CardDetailModal item={zoomItem} gs={gs} setGs={setGs} onClose={() => setZoomItem(null)} />

      {draw10Results && (
        <div className="card-zoom-overlay" onClick={() => setDraw10Results(null)}>
          <div className="draw10-wrap" onClick={e => e.stopPropagation()}>
            <div className="draw10-title">10뽑 결과!</div>
            <div className="draw10-grid" key={draw10Key}>
              {draw10Results.map(({ card, cond, isDupe, leveledUp, progress, level }, idx) => {
                const cs2 = condStyle(card.grade, cond);
                const hasAurora = ['sr','ur','lg'].includes(card.grade);
                const auroraAnim = card.grade === 'lg' ? '2s' : '3s';
                const ownedInst = gs.ownedCards.find(c => c.id === card.id);
                return (
                  <div
                    key={idx}
                    className={`draw10-card grade-${card.grade}${isDupe ? ' draw10-dupe' : ''}`}
                    style={{ ...getBurstStyle(idx), opacity: isDupe ? 0.85 : 1 }}
                    onClick={e => {
                      e.stopPropagation();
                      setZoomItem(ownedInst ? { card, cond: ownedInst.condition, uid: ownedInst.uid, enhanceLevel: ownedInst.enhanceLevel, levelCount: ownedInst.levelCount, levelProgress: ownedInst.levelProgress } : { card, cond });
                    }}
                  >
                    <img src={`/${card.img}`} alt={card.name} loading="lazy" />
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
                    {isDupe ? (
                      <div className="d10-cond" style={{ background: leveledUp ? '#d97706' : '#5a2090', color: '#fff' }}>
                        {leveledUp ? `Lv.${level}!` : `진행도 ${progress}/100`}
                      </div>
                    ) : (
                      <div
                        className={`d10-cond${cs2 === 'gold' ? ' cond-badge-gold' : ''}`}
                        style={{
                          background: cs2 === 'gold' ? undefined : cs2 === 'holo' ? 'linear-gradient(135deg,#c084fc,#4d96ff)' : '#444',
                          color: cs2 === 'gold' ? '#7a4a00' : 'white',
                        }}
                      >{cond}</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="draw10-btn-row">
              <button className="draw10-btn-again" onClick={doDraw10} disabled={gs.tickets < 10}>
                한번 더 뽑기 ({gs.tickets}장)
              </button>
              <button className="draw10-btn-close" onClick={() => setDraw10Results(null)}>닫기 ✕</button>
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div className={`grade-flash grade-flash-${flash}`}>
          <div className="grade-flash-text">{FLASH_LABEL[flash]}</div>
        </div>
      )}
      {toast && <div className="cw-toast">{toast}</div>}
      {floats.map(f => (
        <div key={f.id} className="float-num" style={{ left: f.x - 15, top: f.y - 20 }}>+1</div>
      ))}

      <div className="tab-content">
        <div className="draw-section">
          <div className="draw-col-left">
            <div className="draw-title">카드 뽑기</div>
            <div
              className={`draw-card-wrap${gs.tickets <= 0 && !flipped ? ' empty' : ''}`}
              onClick={() => { if (!flipped && gs.tickets > 0) doDraw(); }}
            >
              <div className={`draw-card-inner${flipped ? ' flipped' : ''}`}>
                <div className="draw-face draw-back">
                  <div className="draw-back-logo">CREATURE WORLD</div>
                  <div className="draw-back-hint">
                    {gs.tickets > 0 ? '탭해서 뽑기' : '도토리 없음'}
                  </div>
                </div>
                <div className={`draw-face draw-front${dc ? ` grade-${dc.grade}` : ''}`}>
                  {dc && (
                    <>
                      <div className="card-header">
                        <span className="card-name">{dc.name}</span>
                        <span className="grade-badge">{GRADE_LABEL[dc.grade]}</span>
                      </div>
                      <div className="card-art"><img src={`/${dc.img}`} alt={dc.name} /></div>
                      <div className="card-aurora" />
                      <div className={`draw-cond-badge cond-badge-${cs}`}>{drawn.cond}</div>
                      {drawn.isDupe && (
                        <div style={{ position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: drawn.leveledUp ? '#fbbf24' : '#c084fc', background: 'rgba(0,0,0,0.55)', padding: '3px 0' }}>
                          {drawn.leveledUp ? `Lv.${drawn.level} 달성!` : `진행도 ${drawn.progress}/100`}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="draw-actions">
              {isGuest ? (
                <div className="guest-action-block">
                  <div className="guest-action-msg">로그인이 필요합니다</div>
                </div>
              ) : !flipped ? (
                <button className="draw-btn primary" onClick={doDraw} disabled={gs.tickets <= 0}>
                  {gs.tickets > 0 ? `도토리 사용 (${gs.tickets}장 보유)` : '도토리가 없어요'}
                </button>
              ) : (
                <button className="draw-btn secondary" onClick={resetDraw}>다음 뽑기 →</button>
              )}
              {!isGuest && (
                <button className="draw-btn draw-btn-10" disabled={gs.tickets < 10} onClick={doDraw10}>
                  10뽑 (10장)
                </button>
              )}
            </div>
          </div>

          <div className="draw-col-right">
            <div className="click-section">
              <div className="click-label">클릭 뽑기 (100번마다 +1장 · 하루 최대 10회)</div>
              <button className="click-btn" onClick={handleClick} disabled={gs.clickDone || isGuest}>🐾</button>
              <div className="click-count-text">
                {gs.clickDone ? (
                  <span style={{ color: '#4a9eff', fontWeight: 700 }}>오늘 완료 ✓</span>
                ) : (
                  <span>{clickProgress} / 100 &nbsp;({gs.clickRound || 0}/10회 완료)</span>
                )}
              </div>
              <div className="prog-track">
                <div className="prog-fill" style={{ width: gs.clickDone ? '100%' : `${clickProgress}%` }} />
              </div>
            </div>

            <div className="click-section">
              <div className="click-label">출석체크 (하루 1회 · 5~15장 지급)</div>
              <button
                className="draw-btn primary"
                onClick={doAttendance}
                disabled={attendDone || isGuest}
                style={{ fontSize: '0.82rem' }}
              >
                {isGuest ? '로그인이 필요합니다' : attendDone ? '오늘 출석 완료 ✓' : '출석체크 하기'}
              </button>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 6, textAlign: 'center' }}>
                {(gs.attendStreak || 0) > 0
                  ? `${gs.attendStreak}일 연속 출석 중`
                  : '7일 개근하면 보너스 100장!'}
              </div>
            </div>
          </div>
        </div>

        <div className="collection-section">
          <DexTab gs={gs} setGs={setGs} />
        </div>
      </div>
    </>
  );
}

// ── 각성 뽑기 탭 ──
function AwakenGachaSubTab({ gs, setGs, isGuest }) {
  const [selectedChar, setSelectedChar] = useState(null);
  const [toast, setToast]   = useState(null);
  const [result, setResult] = useState(null); // { type:'awakened'|'fragments', charId, amount?, card? }
  const [flash, setFlash]   = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const fragments = gs?.awakeningFragments || {};

  const doAwakenDraw = () => {
    if (!selectedChar) { showToast('캐릭터를 선택해주세요'); return; }
    if ((gs.tickets || 0) < AWAKEN_COST) { showToast(`도토리가 부족해요! ${AWAKEN_COST}장이 필요해요`); return; }

    const awCardId = AWAKENED_CARD_MAP[selectedChar.id];
    const awCard = CARDS.find(c => c.id === awCardId);

    if (Math.random() < 0.0001) {
      // 0.01% - 각성카드 직접 획득
      const alreadyOwns = gs.ownedCards.some(c => c.id === awCardId);
      let newOwned = gs.ownedCards;
      if (!alreadyOwns && awCard) {
        newOwned = [...newOwned, {
          uid: genDrawUid(), id: awCardId, condition: 10,
          enhanceLevel: 0, levelCount: 0, levelProgress: 0,
        }];
      }
      setGs(prev => ({
        ...prev,
        tickets: prev.tickets - AWAKEN_COST,
        ownedCards: newOwned,
      }));
      setFlash('awakened');
      setResult({ type: 'awakened', charId: selectedChar.id, card: awCard, alreadyOwned: alreadyOwns });
    } else {
      // 10~50개 조각 획득
      const fragAmount = Math.floor(Math.random() * 41) + 10;
      const charId = selectedChar.id;
      setGs(prev => ({
        ...prev,
        tickets: prev.tickets - AWAKEN_COST,
        awakeningFragments: {
          ...prev.awakeningFragments,
          [charId]: ((prev.awakeningFragments || {})[charId] || 0) + fragAmount,
        },
      }));
      setResult({ type: 'fragments', charId, amount: fragAmount });
    }
  };

  const doExchange = (charId) => {
    const curFrag = (fragments[charId] || 0);
    if (curFrag < AWAKEN_FRAG_TO_CARD) { showToast(`각성조각이 부족해요! ${AWAKEN_FRAG_TO_CARD}개 필요`); return; }
    const awCardId = AWAKENED_CARD_MAP[charId];
    const awCard = CARDS.find(c => c.id === awCardId);
    const alreadyOwns = gs.ownedCards.some(c => c.id === awCardId);
    let newOwned = gs.ownedCards;
    if (!alreadyOwns && awCard) {
      newOwned = [...newOwned, {
        uid: genDrawUid(), id: awCardId, condition: 10,
        enhanceLevel: 0, levelCount: 0, levelProgress: 0,
      }];
    }
    setGs(prev => ({
      ...prev,
      ownedCards: newOwned,
      awakeningFragments: {
        ...prev.awakeningFragments,
        [charId]: curFrag - AWAKEN_FRAG_TO_CARD,
      },
    }));
    setFlash('awakened');
    setResult({ type: 'awakened', charId, card: awCard, alreadyOwned: alreadyOwns });
  };

  return (
    <>
      {flash && (
        <div className={`grade-flash grade-flash-awakened`} style={{ background: 'radial-gradient(circle,rgba(179,71,255,0.9) 0%,rgba(80,0,160,0.95) 100%)' }}>
          <div className="grade-flash-text" style={{ color: '#fff', textShadow: '0 0 24px #b347ff' }}>
            {FLASH_LABEL.awakened}
          </div>
        </div>
      )}
      {toast && <div className="cw-toast">{toast}</div>}

      {/* 결과 오버레이 */}
      {result && (
        <div className="card-zoom-overlay" onClick={() => setResult(null)}>
          <div className="awaken-result-wrap" onClick={e => e.stopPropagation()}>
            {result.type === 'awakened' ? (
              <>
                <div className="awaken-result-title" style={{ color: '#b347ff' }}>각성카드 획득!</div>
                {result.card && (
                  <div className={`awaken-result-card grade-awakened`}>
                    <img src={`/${result.card.img}`} alt={result.card.name} onError={e => { e.target.style.opacity='0.3'; }} />
                    <div className="card-aurora" />
                  </div>
                )}
                <div className="awaken-result-name">{result.card?.name || '각성카드'}</div>
                {result.alreadyOwned && (
                  <div style={{ color: '#aaa', fontSize: '0.8rem', marginTop: 4 }}>이미 보유 중인 카드입니다</div>
                )}
              </>
            ) : (
              <>
                <div className="awaken-result-title">각성조각 획득!</div>
                <div className="awaken-result-frag-char">
                  {CHARACTERS.find(c => c.id === result.charId)?.name || result.charId}
                </div>
                <div className="awaken-result-frag-amount">+{result.amount} 조각</div>
                <div className="awaken-result-frag-total">
                  총 보유: {(fragments[result.charId] || 0) + 0}개 / {AWAKEN_FRAG_TO_CARD}개
                </div>
              </>
            )}
            <button className="shop-result-close-btn" onClick={() => setResult(null)}>확인</button>
          </div>
        </div>
      )}

      <div className="awaken-wrap">
        <div className="awaken-header">
          <div className="col-title">각성 뽑기</div>
          <div className="awaken-header-desc" style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
            0.01% 확률로 각성카드 직접 획득 · 나머지는 각성조각 10~50개 획득
          </div>
        </div>

        <div className="awaken-char-grid">
          {CHARACTERS.map(char => {
            const fragCount = fragments[char.id] || 0;
            const awCardId  = AWAKENED_CARD_MAP[char.id];
            const owns      = gs.ownedCards.some(c => c.id === awCardId);
            const canExch   = fragCount >= AWAKEN_FRAG_TO_CARD;
            const isSelected = selectedChar?.id === char.id;
            return (
              <div
                key={char.id}
                className={`awaken-char-card${isSelected ? ' selected' : ''}${owns ? ' owns-awakened' : ''}`}
                onClick={() => setSelectedChar(isSelected ? null : char)}
              >
                <div className="awaken-char-name">{char.name}</div>
                <div className="awaken-char-species" style={{ color: 'var(--muted)', fontSize: '0.65rem' }}>{char.species}</div>
                <div className="awaken-char-frag" style={{ color: canExch ? '#b347ff' : 'var(--muted)', fontWeight: canExch ? 700 : 400, fontSize: '0.75rem', marginTop: 4 }}>
                  {fragCount.toLocaleString()} / {AWAKEN_FRAG_TO_CARD.toLocaleString()}
                </div>
                <div className="awaken-frag-bar">
                  <div className="awaken-frag-fill" style={{ width: `${Math.min(100, (fragCount / AWAKEN_FRAG_TO_CARD) * 100)}%` }} />
                </div>
                {owns && <div className="awaken-owns-badge">각성 보유</div>}
                {canExch && !owns && (
                  <button
                    className="awaken-exchange-btn"
                    onClick={e => { e.stopPropagation(); doExchange(char.id); }}
                    disabled={isGuest}
                  >
                    교환
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="awaken-draw-panel">
          {selectedChar ? (
            <>
              <div className="awaken-selected-name" style={{ color: '#b347ff', fontWeight: 700 }}>
                {selectedChar.name} 각성 뽑기
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 8 }}>
                보유 도토리: {gs.tickets}장
              </div>
            </>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12 }}>
              위에서 캐릭터를 선택하세요
            </div>
          )}
          <button
            className="draw-btn primary"
            style={{ background: 'linear-gradient(135deg,#6a00cc,#b347ff)', borderColor: '#b347ff' }}
            onClick={doAwakenDraw}
            disabled={!selectedChar || isGuest || (gs.tickets || 0) < AWAKEN_COST}
          >
            {isGuest ? '로그인이 필요합니다' : `각성 뽑기 (${AWAKEN_COST}장)`}
          </button>
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 6, textAlign: 'center' }}>
            각성조각 {AWAKEN_FRAG_TO_CARD.toLocaleString()}개 모으면 각성카드와 교환 가능
          </div>
        </div>
      </div>
    </>
  );
}

// ── 메인 탭 ──
export default function GachaTab({ gs, setGs, isGuest }) {
  const [subTab, setSubTab] = useState('normal');

  return (
    <>
      <div className="subtab-bar">
        <button
          className={`subtab-btn${subTab === 'normal' ? ' active' : ''}`}
          onClick={() => setSubTab('normal')}
        >
          일반 뽑기
        </button>
        <button
          className={`subtab-btn${subTab === 'awaken' ? ' active' : ''}`}
          onClick={() => setSubTab('awaken')}
        >
          각성 뽑기
        </button>
      </div>
      <div className="subtab-content">
        {subTab === 'normal' && <NormalGachaSubTab gs={gs} setGs={setGs} isGuest={isGuest} />}
        {subTab === 'awaken' && <AwakenGachaSubTab gs={gs} setGs={setGs} isGuest={isGuest} />}
      </div>
    </>
  );
}
