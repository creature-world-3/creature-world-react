import { useState, useEffect, useRef } from 'react';
import { CARDS, CHARACTERS } from '../../data/cards.js';

const GRADE_WEIGHT = { n: 70, r: 22, sr: 6.9, ur: 1, lg: 0.1 };
const GRADE_LABEL  = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND' };
const FLASH_LABEL  = { sr: '💜 SUPER RARE!', ur: '✨ ULTRA RARE!', lg: '🌈 L E G E N D !' };
const GRADE_COLOR  = { n: '#888', r: '#4a9eff', sr: '#c084fc', ur: '#fbbf24', lg: '#ff6b6b' };
const CARDS_PER_PAGE = 6;
let _uid = 0;
const genUid = () => `${++_uid}_${Date.now()}`;

function randomCondition() {
  const r = Math.random();
  if (r < 0.02) return 10; if (r < 0.07) return 9; if (r < 0.20) return 8;
  if (r < 0.37) return 7;  if (r < 0.53) return 6; if (r < 0.65) return 5;
  if (r < 0.76) return 4;  if (r < 0.86) return 3; if (r < 0.93) return 2;
  return 1;
}
function condStyle(grade, cond) {
  if (grade === 'lg') return 'gold';
  if (grade === 'ur') return 'holo';
  if (cond >= 9) return 'gold';
  if (cond >= 6) return 'holo';
  return 'normal';
}
function randomCard() {
  const total = Object.values(GRADE_WEIGHT).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let grade = 'n';
  for (const [g, w] of Object.entries(GRADE_WEIGHT)) { r -= w; if (r <= 0) { grade = g; break; } }
  const pool = CARDS.filter(c => c.grade === grade && !c.raid);
  return pool[Math.floor(Math.random() * pool.length)] ?? CARDS[0];
}

const D10_AURORA = {
  sr: 'repeating-linear-gradient(120deg,rgba(192,132,252,0.35) 0%,rgba(100,180,255,0.25) 25%,rgba(255,100,200,0.25) 50%,rgba(192,132,252,0.35) 75%)',
  ur: 'repeating-linear-gradient(120deg,rgba(255,210,80,0.45) 0%,rgba(255,160,30,0.35) 25%,rgba(255,240,120,0.4) 50%,rgba(255,210,80,0.45) 75%)',
  lg: 'repeating-linear-gradient(120deg,rgba(255,80,80,0.3) 0%,rgba(255,200,50,0.3) 15%,rgba(80,220,120,0.3) 30%,rgba(80,160,255,0.3) 45%,rgba(180,80,255,0.3) 60%,rgba(255,80,80,0.3) 75%)',
};
const D10_GRADE_BG  = { n:'rgba(80,80,80,0.9)', r:'#1a3a6a', sr:'#2d1b4e', ur:'#3a2800', lg:'linear-gradient(90deg,#ff6b6b,#4d96ff,#c77dff)' };
const D10_GRADE_COL = { n:'#ccc', r:'#7eb8ff', sr:'#d4a8ff', ur:'#ffd97a', lg:'#fff' };

// ── 카드 상세 모달 (10뽑 + 수집북 공용) ──
function CardDetailModal({ item, onClose }) {
  if (!item) return null;
  const { card, cond, count } = item;
  const cs = condStyle(card.grade, cond);
  return (
    <div className="card-zoom-overlay" onClick={onClose}>
      <div className="card-zoom-inner" onClick={e => e.stopPropagation()}>
        <div className={`zoom-card grade-${card.grade}`}>
          <div className="card-header">
            <span className="card-name">{card.name}</span>
            <span className="grade-badge">{GRADE_LABEL[card.grade]}</span>
          </div>
          <div className="card-art">
            <img src={`/${card.img}`} alt={card.name} />
          </div>
          <div className="card-footer-front">
            <div className="card-sep" />
            <div className="card-slogan">{card.slogan}</div>
          </div>
          <div className="card-aurora" />
          <div className={`draw-cond-badge cond-badge-${cs}`}>{cond}</div>
        </div>
        <div className="zoom-info">
          {count > 1 && (
            <span className="zoom-detail-count">{count}개 보유</span>
          )}
          <button className="zoom-close" onClick={onClose}>닫기 ✕</button>
        </div>
      </div>
    </div>
  );
}

export default function GachaTab({ gs, setGs }) {
  const [flipped, setFlipped]       = useState(false);
  const [drawn, setDrawn]           = useState(null);
  const [flash, setFlash]           = useState(null);
  const [toast, setToast]           = useState(null);
  const [floats, setFloats]         = useState([]);
  const [draw10Results, setDraw10Results] = useState(null);
  const [charF, setCharF]           = useState('all');
  const [gradeF, setGradeF]         = useState('all');
  const [page, setPage]             = useState(0);
  const [zoomItem, setZoomItem]     = useState(null);
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

  // ── 뽑기 ──
  const doDraw = () => {
    if (gs.tickets <= 0) { showToast('뽑기권이 없어요 😢'); return; }
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
    showToast((isNew ? 'NEW! 🎉 ' : '✨ ') + card.name + ' 획득!');
    if (['sr', 'ur', 'lg'].includes(card.grade)) {
      setFlash(card.grade);
      setTimeout(() => setFlipped(true), 400);
    } else {
      setFlipped(true);
    }
  };
  const resetDraw = () => { setFlipped(false); setDrawn(null); };

  // ── 10연속 뽑기 ──
  const doDraw10 = () => {
    if (gs.tickets < 10) { showToast('뽑기권이 부족해요! 10장이 필요해요 😢'); return; }
    const results = [];
    const newOwned = [...gs.ownedCards];
    for (let i = 0; i < 10; i++) {
      const card = randomCard();
      const cond = randomCondition();
      results.push({ card, cond });
      newOwned.push({ uid: genUid(), id: card.id, condition: cond });
    }
    setGs(prev => ({ ...prev, tickets: prev.tickets - 10, ownedCards: newOwned }));
    setDraw10Results(results);
  };

  // ── 클릭 뽑기 ──
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
          done ? '오늘 클릭 뽑기 완료! 총 10장 획득!' : `${newRound}번째 100클릭 달성! 뽑기권 +1장!`
        ), 0);
        return { ...prev, tickets: prev.tickets + 1, clickCount: newCount, clickRound: newRound, clickDone: done };
      }
      return { ...prev, clickCount: newCount };
    });
  };

  // ── 출석체크 ──
  const doAttendance = () => {
    const today = new Date().toDateString();
    if (gs.attendDate === today) { showToast('오늘 이미 출석했어요! 내일 다시 와요 😊'); return; }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = gs.attendDate === yesterday.toDateString();
    const newStreak = wasYesterday ? (gs.attendStreak || 0) + 1 : 1;
    const amount = Math.floor(Math.random() * 11) + 5;
    const bonus  = newStreak % 7 === 0 ? 100 : 0;
    setGs(prev => ({
      ...prev,
      tickets: prev.tickets + amount + bonus,
      attendDate: today,
      attendStreak: newStreak,
    }));
    showToast(`출석 완료! 뽑기권 ${amount}장 획득!${bonus ? ' 🎉 7일 개근 +100장!' : ''}`);
  };

  // ── 수집북 필터/페이지 ──
  let filtered = CARDS;
  if (charF !== 'all') filtered = filtered.filter(c => c.id.startsWith(charF));
  if (gradeF !== 'all') filtered = filtered.filter(c => c.grade === gradeF);
  const ownedIds  = new Set(gs.ownedCards.map(c => c.id));
  const sorted    = [
    ...filtered.filter(c =>  ownedIds.has(c.id)),
    ...filtered.filter(c => !ownedIds.has(c.id)),
  ];
  const totalPages = Math.max(1, Math.ceil(sorted.length / CARDS_PER_PAGE));
  const safePage   = Math.min(page, totalPages - 1);
  const pageCards  = sorted.slice(safePage * CARDS_PER_PAGE, (safePage + 1) * CARDS_PER_PAGE);
  const uniqueOwned = ownedIds.size;

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
      {/* 카드 상세 모달 */}
      <CardDetailModal item={zoomItem} onClose={() => setZoomItem(null)} />

      {/* 10연속 결과 오버레이 */}
      {draw10Results && (
        <div className="card-zoom-overlay" onClick={() => setDraw10Results(null)}>
          <div className="draw10-wrap" onClick={e => e.stopPropagation()}>
            <div className="draw10-title">✨ 10뽑 결과!</div>
            <div className="draw10-grid">
              {draw10Results.map(({ card, cond }, idx) => {
                const cs = condStyle(card.grade, cond);
                const hasAurora = ['sr','ur','lg'].includes(card.grade);
                const auroraAnim = card.grade === 'lg' ? '2s' : '3s';
                return (
                  <div
                    key={idx}
                    className={`draw10-card grade-${card.grade}`}
                    style={getBurstStyle(idx)}
                    onClick={(e) => { e.stopPropagation(); setZoomItem({ card, cond }); }}
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
                    <div
                      className={`d10-cond${cs === 'gold' ? ' cond-badge-gold' : ''}`}
                      style={{
                        background: cs === 'gold' ? undefined : cs === 'holo' ? 'linear-gradient(135deg,#c084fc,#4d96ff)' : '#444',
                        color: cs === 'gold' ? '#7a4a00' : 'white',
                      }}
                    >{cond}</div>
                  </div>
                );
              })}
            </div>
            <button className="zoom-close" onClick={() => setDraw10Results(null)}>닫기 ✕</button>
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
        {/* ── 왼쪽 패널 ── */}
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
                  {gs.tickets > 0 ? '탭해서 뽑기' : '뽑기권 없음'}
                </div>
              </div>
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
                    <div className="card-footer-front">
                      <div className="card-sep" />
                      <div className="card-slogan">{dc.slogan}</div>
                    </div>
                    <div className="card-aurora" />
                    <div className={`draw-cond-badge cond-badge-${cs}`}>{drawn.cond}</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="draw-actions">
            {!flipped ? (
              <button className="draw-btn primary" onClick={doDraw} disabled={gs.tickets <= 0}>
                {gs.tickets > 0 ? `뽑기권 사용 (${gs.tickets}장 보유)` : '뽑기권이 없어요'}
              </button>
            ) : (
              <button className="draw-btn secondary" onClick={resetDraw}>
                다음 뽑기 →
              </button>
            )}
            <button className="draw-btn draw-btn-10" disabled={gs.tickets < 10} onClick={doDraw10}>
              ✨ 10뽑 (10장)
            </button>
          </div>
          </div>

          <div className="draw-col-right">
          <div className="click-section">
            <div className="click-label">클릭 뽑기 (100번마다 +1장 · 하루 최대 10회)</div>
            <button className="click-btn" onClick={handleClick} disabled={gs.clickDone}>🐾</button>
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
              disabled={attendDone}
              style={{ fontSize: '0.82rem' }}
            >
              {attendDone ? '오늘 출석 완료 ✓' : '✅ 출석체크 하기'}
            </button>
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 6, textAlign: 'center' }}>
              {(gs.attendStreak || 0) > 0
                ? `🔥 ${gs.attendStreak}일 연속 출석 중`
                : '7일 개근하면 보너스 100장!'}
            </div>
          </div>
          </div>
        </div>

        {/* ── 오른쪽: 수집북 ── */}
        <div className="collection-section">
          <div className="col-header">
            <div className="col-title">수집북</div>
            <div className="col-count">{uniqueOwned} / {CARDS.length}</div>
          </div>

          <div className="col-filters-wrap">
            <div className="col-filter-row">
              {[{ id: 'all', name: '전체' }, ...CHARACTERS].map(c => (
                <button
                  key={c.id}
                  className={`col-filter-pill${charF === c.id ? ' active' : ''}`}
                  onClick={() => { setCharF(c.id); setPage(0); }}
                >{c.name}</button>
              ))}
            </div>
            <div className="col-filter-row">
              {[['all','전체',''],['n','N',GRADE_COLOR.n],['r','R',GRADE_COLOR.r],
                ['sr','SR',GRADE_COLOR.sr],['ur','UR',GRADE_COLOR.ur],['lg','LEGEND',GRADE_COLOR.lg]
              ].map(([val, label, color]) => (
                <button
                  key={val}
                  className={`col-filter-pill${gradeF === val ? ' active' : ''}`}
                  style={color ? { color } : {}}
                  onClick={() => { setGradeF(val); setPage(0); }}
                >{label}</button>
              ))}
            </div>
          </div>

          <div className="card-grid">
            {pageCards.length === 0 ? (
              <div className="col-empty">아직 카드가 없어요!<br />뽑기권을 사용해보세요</div>
            ) : pageCards.map(card => {
              const lockedRaidUid = gs?.raidCard?.uid;
              const myCards = gs.ownedCards.filter(c => c.id === card.id);
              const locked  = myCards.length === 0;
              const best    = locked ? null : myCards.reduce((a, b) => b.condition > a.condition ? b : a);
              const cstyle  = best ? condStyle(card.grade, best.condition) : 'normal';
              const isRaidLocked = !locked && lockedRaidUid && myCards.some(c => c.uid === lockedRaidUid);
              return (
                <div
                  key={card.id}
                  className={`col-card grade-${card.grade}${locked ? ' locked' : ''}${isRaidLocked ? ' raid-locked' : ''}`}
                  onClick={() => !locked && best && setZoomItem({ card, cond: best.condition, count: myCards.length })}
                >
                  {!locked && (
                    <>
                      <img src={`/${card.img}`} alt={card.name} loading="lazy" />
                      {cstyle === 'gold' && <div className="cond-gold-overlay" />}
                      {cstyle === 'holo' && <div className="cond-holo-overlay" />}
                      <div className="col-card-footer">
                        <div className="col-name">{card.name}</div>
                        <span className="col-grade">{GRADE_LABEL[card.grade]}</span>
                      </div>
                      {myCards.length > 1 && <div className="dup">×{myCards.length}</div>}
                      {isRaidLocked && <div className="raid-lock-badge">⚔️</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-arrow" onClick={() => setPage(p => p - 1)} disabled={safePage === 0}>← 이전</button>
              <span className="page-info">{safePage + 1} / {totalPages}</span>
              <button className="page-arrow" onClick={() => setPage(p => p + 1)} disabled={safePage >= totalPages - 1}>다음 →</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
