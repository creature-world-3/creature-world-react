import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS } from '../../data/cards.js';

const GRADE_RANGE = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65] };
const GRADE_LABEL = { n:'N', r:'R', sr:'SR', ur:'UR', lg:'LEGEND', raid:'RAID' };
const GRADE_COLOR = { n:'#888', r:'#4a9eff', sr:'#c084fc', ur:'#fbbf24', lg:'#ff6b6b', raid:'#ffd700' };

const PODIUM_STYLE = {
  1: { bg:'rgba(255,215,0,0.15)',    border:'rgba(255,215,0,0.6)',    color:'#ffd700', blockH:84, cardW:88,  cardH:118 },
  2: { bg:'rgba(192,192,192,0.12)', border:'rgba(192,192,192,0.5)', color:'#c0c0c0', blockH:62, cardW:70,  cardH:94  },
  3: { bg:'rgba(205,127,50,0.12)',  border:'rgba(205,127,50,0.5)',  color:'#cd7f32', blockH:50, cardW:64,  cardH:86  },
};

function calcScore(grade, cond, enh = 0) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  return Math.floor((Math.floor((mn + mx) / 2) + (cond || 1)) * (1 + enh * 0.1));
}

function dmgRange(grade, cond, enh = 0) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  const m = 1 + enh * 0.1;
  return `${Math.floor((mn + (cond||1)) * m)}~${Math.floor((mx + (cond||1)) * m)}`;
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

function getBestCard(ownedCards) {
  let best = null;
  for (const inst of (ownedCards || [])) {
    const card = CARDS.find(c => c.id === inst.id);
    if (!card) continue;
    const score = calcScore(card.grade, inst.condition || 1, inst.enhanceLevel || 0);
    if (!best || score > best.score) best = { card, inst, score };
  }
  return best;
}

// ── 카드 상세 모달 ──
function CardModal({ entry, onClose }) {
  if (!entry) return null;
  const { card, inst, nickname } = entry;
  const enh   = inst.enhanceLevel || 0;
  const cond  = inst.condition || 1;
  const cs    = condStyle(card.grade, cond);
  const range = dmgRange(card.grade, cond, enh);

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
            <div className="card-footer-front">
              <div className="card-sep" />
              <div className="card-slogan">{card.slogan}</div>
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
function PodiumSlot({ entry, rank, onCardClick }) {
  const ps    = PODIUM_STYLE[rank];
  const enh   = entry ? (entry.inst.enhanceLevel || 0) : 0;
  const cond  = entry ? (entry.inst.condition || 1) : 1;
  const range = entry ? dmgRange(entry.card.grade, cond, enh) : '';

  return (
    <div className={`podium-slot podium-rank-${rank}`}>
      <div className="podium-player">
        {entry ? (
          <>
            <div
              className={`podium-card grade-${entry.card.grade}`}
              style={{
                width: ps.cardW, height: ps.cardH,
                borderColor: ps.border,
                boxShadow: `0 0 22px ${ps.border}, 0 8px 20px rgba(0,0,0,0.4)`,
              }}
              onClick={() => onCardClick(entry)}
            >
              <img src={`/${entry.card.img}`} alt={entry.card.name} />
              {enh > 0 && <div className="podium-enh-badge">+{enh}</div>}
            </div>
            <div className="podium-nickname">{entry.nickname}</div>
            <div className="podium-dmg" style={{ color: ps.color }}>{range}</div>
          </>
        ) : (
          <div
            className="podium-empty-card"
            style={{ width: ps.cardW, height: ps.cardH }}
          />
        )}
      </div>
      <div
        className="podium-block"
        style={{ height: ps.blockH, background: ps.bg, borderColor: ps.border }}
      >
        <span className="podium-rank-num" style={{ color: ps.color }}>{rank}</span>
      </div>
    </div>
  );
}

export default function RankingTab() {
  const [entries,     setEntries]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [modalEntry,  setModalEntry]  = useState(null);
  const [loadError,   setLoadError]   = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      console.log('[Ranking] users 컬렉션 조회 시작...');
      const snap = await getDocs(collection(db, 'users'));
      console.log('[Ranking] 문서 수:', snap.size);

      const rows = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        // 첫 번째 문서의 전체 구조 확인
        if (rows.length === 0) {
          console.log('[Ranking] 첫 문서 ID:', docSnap.id);
          console.log('[Ranking] 필드 목록:', Object.keys(data));
          console.log('[Ranking] ownedCards 타입:', typeof data.ownedCards, Array.isArray(data.ownedCards) ? `(배열 ${data.ownedCards.length}개)` : '');
          if (Array.isArray(data.ownedCards) && data.ownedCards.length > 0) {
            console.log('[Ranking] ownedCards[0] 샘플:', JSON.stringify(data.ownedCards[0]));
          }
          console.log('[Ranking] nickname:', data.nickname);
        }

        const owned = data.ownedCards ?? data.cards ?? data.cardList ?? [];
        const best  = getBestCard(owned);
        if (!best) {
          console.log('[Ranking] 스킵 (카드 없음):', docSnap.id, '| ownedCards 길이:', owned?.length ?? 0);
          return;
        }
        rows.push({
          uid:      docSnap.id,
          nickname: data.nickname || '유저',
          card:     best.card,
          inst:     best.inst,
          score:    best.score,
        });
      });

      console.log('[Ranking] 유효 유저 수:', rows.length);
      rows.sort((a, b) => b.score - a.score);
      const top10 = rows.slice(0, 10);
      console.log('[Ranking] 상위 10개:', top10.map(r => `${r.nickname}(${r.score})`));
      setEntries(top10);
      setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }));
    } catch (e) {
      console.error('[Ranking] 오류 코드:', e.code);
      console.error('[Ranking] 오류 메시지:', e.message);
      console.error('[Ranking] 전체 오류:', e);
      setLoadError(`${e.code ?? '오류'}: ${e.message}`);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const rest = entries.slice(3);

  return (
    <>
      {modalEntry && <CardModal entry={modalEntry} onClose={() => setModalEntry(null)} />}

      <div className="ranking-wrap">
        <div className="ranking-header">
          <div className="ranking-title">랭킹</div>
          <button className="ranking-refresh-btn" onClick={load} disabled={loading}>
            {loading ? '...' : '↻ 새로고침'}
          </button>
        </div>
        <div className="ranking-sub">
          최고 데미지 카드 기준
          {lastUpdated && <span className="ranking-updated"> · {lastUpdated} 기준</span>}
        </div>

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
              <PodiumSlot entry={entries[1] ?? null} rank={2} onCardClick={setModalEntry} />
              <PodiumSlot entry={entries[0] ?? null} rank={1} onCardClick={setModalEntry} />
              <PodiumSlot entry={entries[2] ?? null} rank={3} onCardClick={setModalEntry} />
            </div>

            {/* ── 4~10등 리스트 ── */}
            {rest.length > 0 && (
              <div className="ranking-list">
                {rest.map((entry, i) => {
                  const rank  = i + 4;
                  const enh   = entry.inst.enhanceLevel || 0;
                  const cond  = entry.inst.condition || 1;
                  const range = dmgRange(entry.card.grade, cond, enh);
                  return (
                    <div
                      key={entry.uid}
                      className="ranking-item"
                      onClick={() => setModalEntry(entry)}
                    >
                      <div className="ranking-rank">#{rank}</div>
                      <div className={`ranking-card-img grade-${entry.card.grade}`}>
                        <img src={`/${entry.card.img}`} alt={entry.card.name} loading="lazy" />
                        {enh > 0 && <div className="ranking-enhance-badge">+{enh}</div>}
                      </div>
                      <div className="ranking-info">
                        <div className="ranking-nickname">{entry.nickname}</div>
                        <div className="ranking-card-name">
                          {entry.card.name}
                          <span className="ranking-grade" style={{ color: GRADE_COLOR[entry.card.grade] }}>
                            &nbsp;{GRADE_LABEL[entry.card.grade]}
                          </span>
                        </div>
                        <div className="ranking-dmg-range">{range}</div>
                      </div>
                      <div className="ranking-score">{entry.score}</div>
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
