import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, limit, query } from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS, COLLECTIBLE_IDS } from '../../data/cards.js';
import { getGrowth } from '../../utils/growth.js';

const GRADE_RANGE = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65] };
const GRADE_LABEL = { n:'N', r:'R', sr:'SR', ur:'UR', lg:'LEGEND', raid:'RAID' };
const GRADE_COLOR = { n:'#888', r:'#4a9eff', sr:'#c084fc', ur:'#fbbf24', lg:'#ff6b6b', raid:'#ffd700' };

const TOWER_NO_CARD = { id: 'unknown', name: '???', img: null, grade: 'n' };

const PODIUM_STYLE = {
  1: { bg:'rgba(255,215,0,0.18)',    border:'rgba(255,215,0,0.75)',   color:'#ffd700', blockH:100, cardW:114, cardH:152 },
  2: { bg:'rgba(192,192,192,0.15)', border:'rgba(192,192,192,0.65)', color:'#c0c0c0', blockH:72,  cardW:90,  cardH:120 },
  3: { bg:'rgba(205,127,50,0.15)',  border:'rgba(205,127,50,0.65)',  color:'#cd7f32', blockH:56,  cardW:78,  cardH:104 },
};

function getTowerWeekKey() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const monday = new Date(now);
  const diff = day === 0 ? -6 : 1 - day;
  monday.setUTCDate(monday.getUTCDate() + diff);
  if (day === 1 && hour < 9) monday.setUTCDate(monday.getUTCDate() - 7);
  return 'v2-' + monday.toISOString().slice(0, 10);
}

function calcScore(grade, cond, enh = 0, growth = 0) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  return Math.floor((Math.floor((mn + mx) / 2) + (cond || 1)) * (1 + enh * 0.1)) + growth;
}

function dmgRange(grade, cond, enh = 0, growth = 0) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  const m = 1 + enh * 0.1;
  return `${Math.floor((mn + (cond||1)) * m) + growth}~${Math.floor((mx + (cond||1)) * m) + growth}`;
}

function condStyle(grade, cond) {
  if (grade === 'lg' || grade === 'raid') return 'gold';
  if (grade === 'ur') return 'holo';
  if (cond >= 9) return 'gold';
  if (cond >= 6) return 'holo';
  return 'normal';
}

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

function getBestCard(ownedCards, cardBonusDmg = {}) {
  let best = null;
  for (const inst of (ownedCards || [])) {
    const card = CARDS.find(c => c.id === inst.id);
    if (!card) continue;
    const growth = getGrowth(cardBonusDmg, inst);
    const score = calcScore(card.grade, inst.condition || 1, inst.enhanceLevel || 0, growth);
    if (!best || score > best.score) best = { card, inst, score, growth };
  }
  return best;
}

// ── 카드 상세 모달 ──
function CardModal({ entry, onClose }) {
  if (!entry) return null;
  const { card, inst, nickname, growth = 0 } = entry;
  const enh   = inst.enhanceLevel || 0;
  const cond  = inst.condition || 1;
  const cs    = condStyle(card.grade, cond);
  const range = dmgRange(card.grade, cond, enh, growth);

  return (
    <div className="card-zoom-overlay" onClick={onClose}>
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
            {cs === 'gold' && <div className="cond-gold-overlay" />}
            {cs === 'holo' && <div className="cond-holo-overlay" />}
            <div className={`draw-cond-badge cond-badge-${cs}`}>{cond}</div>
          </div>
          <div className="modal-stat-panel">
            <div className="modal-stat-row">
              <span className="modal-stat-label">플레이어</span>
              <span className="modal-stat-value" style={{ fontSize:'0.82rem' }}>{nickname}</span>
            </div>
            <div className="modal-stat-row">
              <span className="modal-stat-label">데미지</span>
              <span className="modal-stat-value modal-stat-dmg">{range}</span>
            </div>
            {enh > 0 && (
              <div className="modal-stat-row">
                <span className="modal-stat-label">강화</span>
                <span className="modal-stat-value modal-stat-enhance">{enh}단계</span>
              </div>
            )}
            {growth > 0 && (
              <div className="modal-stat-row">
                <span className="modal-stat-label">성장</span>
                <span className="modal-stat-value modal-stat-enhance">+{growth}</span>
              </div>
            )}
            <div className="modal-stat-row">
              <span className="modal-stat-label">컨디션</span>
              <StarRating value={cond} />
            </div>
          </div>
        </div>
        <button className="zoom-close" onClick={onClose}>닫기 ✕</button>
      </div>
    </div>
  );
}

// ── 시상대 슬롯 ──
function PodiumSlot({ entry, rank, onCardClick, mode }) {
  const ps   = PODIUM_STYLE[rank];
  const isTower = mode === 'tower';
  const enh  = entry && !isTower ? (entry.inst.enhanceLevel || 0) : 0;
  const cond = entry && !isTower ? (entry.inst.condition || 1) : 1;
  const range = entry && !isTower ? dmgRange(entry.card.grade, cond, enh, entry.growth || 0) : '';

  return (
    <div className={`podium-slot podium-rank-${rank}`}>
      <div className="podium-card-area">
        {entry ? (
          <div
            className={`podium-card grade-${entry.card.grade}`}
            style={{
              width: ps.cardW, height: ps.cardH,
              borderColor: ps.border,
              boxShadow: `0 0 24px ${ps.border}, 0 10px 24px rgba(0,0,0,0.5)`,
            }}
            onClick={() => !isTower && onCardClick(entry)}
          >
            {entry.card.img
              ? <img src={`/${entry.card.img}`} alt={entry.card.name} />
              : <div className="ranking-no-card-placeholder">?</div>}
            {!isTower && enh > 0 && <div className="podium-enh-badge">+{enh}</div>}
          </div>
        ) : (
          <div className="podium-empty-card" style={{ width: ps.cardW, height: ps.cardH }} />
        )}
      </div>

      <div
        className="podium-block"
        style={{ height: ps.blockH, background: ps.bg, borderColor: ps.border }}
      >
        <span className="podium-rank-num" style={{ color: ps.color }}>{rank}</span>
      </div>

      <div className="podium-info">
        {entry ? (
          <>
            <div className="podium-nickname">{entry.nickname}</div>
            {isTower ? (
              <>
                <div className="podium-card-name">{entry.card.name}</div>
                <div className="podium-dmg" style={{ color: ps.color }}>
                  {`${entry.floor}층`}
                </div>
              </>
            ) : mode === 'damage' ? (
              <>
                <div className="podium-card-name">{entry.card.name}</div>
                <div className="podium-dmg" style={{ color: ps.color }}>{range}</div>
              </>
            ) : (
              <div className="podium-dmg" style={{ color: ps.color }}>{entry.cardCount}개</div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function RankingTab() {
  const [dmgEntries,     setDmgEntries]     = useState([]);
  const [collectEntries, setCollectEntries] = useState([]);
  const [towerEntries,   setTowerEntries]   = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [lastUpdated,    setLastUpdated]    = useState(null);
  const [modalEntry,     setModalEntry]     = useState(null);
  const [loadError,      setLoadError]      = useState(null);
  const [category,       setCategory]       = useState('damage'); // 'damage' | 'collect' | 'tower'
  const unsubRef = useRef(null);

  const processSnap = (snap) => {
    const weekKey = getTowerWeekKey();
    const dmgRows   = [];
    const collectRows = [];
    const towerRows = [];

    snap.forEach(docSnap => {
      const data     = docSnap.data();
      const rawOwned = data.ownedCards ?? data.cards ?? data.cardList ?? null;
      const owned    = Array.isArray(rawOwned) ? rawOwned : [];
      const best     = getBestCard(owned, data.cardBonusDmg || {});

      if (best) {
        const cardCount = new Set(owned.map(c => c.id).filter(id => COLLECTIBLE_IDS.has(id))).size;
        const base = {
          uid:       docSnap.id,
          nickname:  data.nickname || '유저',
          card:      best.card,
          inst:      best.inst,
          score:     best.score,
          growth:    best.growth,
          cardCount,
        };
        dmgRows.push(base);
        collectRows.push(base);
      }

      const tb = data.towerBest;
      if (tb?.weekKey === weekKey && tb.floor > 0) {
        const towerCard = CARDS.find(c => c.id === tb.cardId) || TOWER_NO_CARD;
        towerRows.push({
          uid:      docSnap.id,
          nickname: data.nickname || '탐험가',
          floor:    tb.floor,
          hidden:   tb.hidden || false,
          card:     towerCard,
        });
      }
    });

    dmgRows.sort((a, b) => b.score - a.score);
    collectRows.sort((a, b) => b.cardCount - a.cardCount);
    towerRows.sort((a, b) => b.floor - a.floor);

    setDmgEntries(dmgRows.slice(0, 10));
    setCollectEntries(collectRows.slice(0, 10));
    setTowerEntries(towerRows.slice(0, 10));
    setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }));
    setLoading(false);
  };

  const subscribe = () => {
    if (unsubRef.current) unsubRef.current();
    setLoading(true);
    setLoadError(null);
    unsubRef.current = onSnapshot(
      query(collection(db, 'users'), limit(200)),
      snap => processSnap(snap),
      e => {
        console.error('[Ranking] 오류:', e);
        setLoadError(`${e.code ?? '오류'}: ${e.message}`);
        setLoading(false);
      }
    );
  };

  useEffect(() => {
    subscribe();
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, []); // eslint-disable-line

  const entries = category === 'damage' ? dmgEntries : category === 'collect' ? collectEntries : towerEntries;
  const rest    = entries.slice(3);

  return (
    <>
      {modalEntry && <CardModal entry={modalEntry} onClose={() => setModalEntry(null)} />}

      <div className="ranking-wrap">
        <div className="ranking-header">
          <div className="ranking-title">랭킹</div>
          <button className="ranking-refresh-btn" onClick={subscribe} disabled={loading}>
            {loading ? '...' : '↻ 새로고침'}
          </button>
        </div>

        {/* 카테고리 탭 */}
        <div className="ranking-category-tabs">
          <button
            className={`ranking-cat-btn${category === 'damage' ? ' active' : ''}`}
            onClick={() => setCategory('damage')}
          >
            데미지
          </button>
          <button
            className={`ranking-cat-btn${category === 'collect' ? ' active' : ''}`}
            onClick={() => setCategory('collect')}
          >
            카드 수집
          </button>
          <button
            className={`ranking-cat-btn${category === 'tower' ? ' active' : ''}`}
            onClick={() => setCategory('tower')}
          >
            도전의 탑
          </button>
        </div>

        {lastUpdated && (
          <div className="ranking-sub">
            <span className="ranking-updated">{lastUpdated} 기준</span>
          </div>
        )}

        {loading ? (
          <div className="ranking-loading">불러오는 중...</div>
        ) : loadError ? (
          <div className="ranking-empty" style={{ color:'#f87171', fontSize:'0.78rem', lineHeight:1.7 }}>
            데이터를 불러오지 못했습니다.<br />
            <span style={{ opacity:0.7 }}>{loadError}</span><br />
            <span style={{ opacity:0.5 }}>Firestore 보안 규칙을 확인해주세요.</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="ranking-empty">아직 랭킹 데이터가 없어요!</div>
        ) : (
          <>
            {/* ── 시상대 (1~3등) ── */}
            <div className="podium-wrap">
              <PodiumSlot entry={entries[1] ?? null} rank={2} onCardClick={setModalEntry} mode={category} />
              <PodiumSlot entry={entries[0] ?? null} rank={1} onCardClick={setModalEntry} mode={category} />
              <PodiumSlot entry={entries[2] ?? null} rank={3} onCardClick={setModalEntry} mode={category} />
            </div>

            {/* ── 4~10등 리스트 ── */}
            {rest.length > 0 && (
              <div className="ranking-list">
                {rest.map((entry, i) => {
                  const rank  = i + 4;
                  const isTower = category === 'tower';
                  const enh   = !isTower ? (entry.inst.enhanceLevel || 0) : 0;
                  const cond  = !isTower ? (entry.inst.condition || 1) : 1;
                  const range = !isTower ? dmgRange(entry.card.grade, cond, enh, entry.growth || 0) : '';
                  return (
                    <div
                      key={entry.uid}
                      className="ranking-item"
                      onClick={() => !isTower && setModalEntry(entry)}
                    >
                      <div className="ranking-rank">#{rank}</div>
                      <div className={`ranking-card-img grade-${entry.card.grade}`}>
                        {entry.card.img
                          ? <img src={`/${entry.card.img}`} alt={entry.card.name} loading="lazy" />
                          : <div className="ranking-no-card-placeholder">?</div>}
                        {!isTower && enh > 0 && <div className="ranking-enhance-badge">+{enh}</div>}
                      </div>
                      <div className="ranking-info">
                        <div className="ranking-nickname">{entry.nickname}</div>
                        {isTower ? (
                          <div className="ranking-card-name">
                            {entry.card.name}
                            <span className="ranking-grade" style={{ color: GRADE_COLOR[entry.card.grade] }}>
                              &nbsp;{GRADE_LABEL[entry.card.grade]}
                            </span>
                          </div>
                        ) : category === 'damage' ? (
                          <>
                            <div className="ranking-card-name">
                              {entry.card.name}
                              <span className="ranking-grade" style={{ color: GRADE_COLOR[entry.card.grade] }}>
                                &nbsp;{GRADE_LABEL[entry.card.grade]}
                              </span>
                            </div>
                            <div className="ranking-dmg-range">{range}</div>
                          </>
                        ) : (
                          <div className="ranking-dmg-range">{entry.cardCount}개</div>
                        )}
                      </div>
                      <div className="ranking-score">
                        {isTower
                          ? `${entry.floor}층`
                          : category === 'damage' ? entry.score : entry.cardCount}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
