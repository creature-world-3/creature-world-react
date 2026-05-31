import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS } from '../../data/cards.js';

const GRADE_RANGE = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65] };
const GRADE_LABEL = { n:'N', r:'R', sr:'SR', ur:'UR', lg:'LEGEND', raid:'RAID' };
const GRADE_COLOR = { n:'#888', r:'#4a9eff', sr:'#c084fc', ur:'#fbbf24', lg:'#ff6b6b', raid:'#ffd700' };

function calcScore(grade, cond, enhanceLevel = 0) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  const mid = Math.floor((mn + mx) / 2);
  return Math.floor((mid + (cond || 1)) * (1 + enhanceLevel * 0.1));
}

function dmgRange(grade, cond, enhanceLevel = 0) {
  const [mn, mx] = GRADE_RANGE[grade] || [1, 10];
  const mult = 1 + enhanceLevel * 0.1;
  return `${Math.floor((mn + (cond||1)) * mult)}~${Math.floor((mx + (cond||1)) * mult)}`;
}

function getBestCard(ownedCards) {
  let best = null;
  for (const inst of (ownedCards || [])) {
    const card = CARDS.find(c => c.id === inst.id);
    if (!card) continue;
    const score = calcScore(card.grade, inst.condition || 1, inst.enhanceLevel || 0);
    if (!best || score > best.score) {
      best = { card, inst, score };
    }
  }
  return best;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function RankingTab() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const rows = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const best = getBestCard(data.ownedCards);
        if (!best) return;
        rows.push({
          uid:      docSnap.id,
          nickname: data.nickname || '유저',
          card:     best.card,
          inst:     best.inst,
          score:    best.score,
        });
      });
      rows.sort((a, b) => b.score - a.score);
      setEntries(rows.slice(0, 10));
      setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('ranking load error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="ranking-wrap">
      <div className="ranking-header">
        <div className="ranking-title">랭킹</div>
        <button className={`ranking-refresh-btn${loading ? ' refreshing' : ''}`} onClick={load} disabled={loading}>
          {loading ? '...' : '↻ 새로고침'}
        </button>
      </div>
      <div className="ranking-sub">
        최고 데미지 카드 기준 · 상위 10명
        {lastUpdated && <span className="ranking-updated"> · {lastUpdated} 기준</span>}
      </div>

      {loading ? (
        <div className="ranking-loading">불러오는 중...</div>
      ) : entries.length === 0 ? (
        <div className="ranking-empty">아직 랭킹 데이터가 없어요!</div>
      ) : (
        <div className="ranking-list">
          {entries.map((entry, i) => {
            const rank    = i + 1;
            const enh     = entry.inst.enhanceLevel || 0;
            const cond    = entry.inst.condition || 1;
            const range   = dmgRange(entry.card.grade, cond, enh);
            const isTop3  = rank <= 3;
            return (
              <div key={entry.uid} className={`ranking-item${isTop3 ? ` ranking-top-${rank}` : ''}`}>
                <div className="ranking-rank">
                  {isTop3 ? MEDAL[rank - 1] : `#${rank}`}
                </div>
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
    </div>
  );
}
