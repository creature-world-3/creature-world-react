import { useState } from 'react';
import { CARDS, CHARACTERS } from '../../data/cards.js';

const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID' };
const RAID_CARDS = CARDS.filter(c => c.raid);

function condStyle(grade, cond) {
  if (grade === 'lg' || grade === 'raid') return 'gold';
  if (grade === 'ur') return 'holo';
  if (cond >= 9) return 'gold';
  if (cond >= 6) return 'holo';
  return 'normal';
}

export default function DexTab({ gs }) {
  const [zoomCard, setZoomCard] = useState(null); // { card, best, count }

  const ownedCards  = gs?.ownedCards || [];
  const ownedIds    = new Set(ownedCards.map(c => c.id));
  const uniqueOwned = ownedIds.size;

  const zoomCs = zoomCard ? condStyle(zoomCard.card.grade, zoomCard.best.condition) : null;

  return (
  <>
    <div className="dex-tab">
      <div className="col-header">
        <span className="col-title">도감</span>
        <span className="col-count">{uniqueOwned} / 30</span>
      </div>

      {CHARACTERS.map(char => (
        <div key={char.id} className="dex-character-group">
          <div className="dex-char-name">{char.name}</div>
          <div className="card-grid">
            {CARDS.filter(c => c.id.startsWith(char.id) && !c.raid).map(card => {
              const owned   = ownedIds.has(card.id);
              const myCards = owned ? ownedCards.filter(c => c.id === card.id) : [];
              const best    = myCards.length ? myCards.reduce((a, b) => b.condition > a.condition ? b : a) : null;
              const cs      = best ? condStyle(card.grade, best.condition) : 'normal';

              return (
                <div
                  key={card.id}
                  className={`col-card grade-${card.grade}${owned ? '' : ' dex-locked'}`}
                  onClick={() => owned && best && setZoomCard({ card, best, count: myCards.length })}
                >
                  <img src={`/${card.img}`} alt={card.name} loading="lazy" />
                  {owned && cs === 'gold' && <div className="cond-gold-overlay" />}
                  {owned && cs === 'holo' && <div className="cond-holo-overlay" />}
                  {owned && (
                    <div className="col-card-footer">
                      <div className="col-name">{card.name}</div>
                      <span className="col-grade">{GRADE_LABEL[card.grade]}</span>
                    </div>
                  )}
                  {owned && myCards.length > 1 && <div className="dup">×{myCards.length}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── RAID 한정 카드 섹션 ── */}
      <div className="dex-character-group dex-raid-group">
        <div className="dex-char-name dex-raid-title">
          ⚔️ RAID 한정
          <span className="dex-raid-hint">레이드 보상으로만 획득 가능</span>
        </div>
        <div className="card-grid">
          {RAID_CARDS.map(card => {
            const myCards = ownedCards.filter(c => c.id === card.id);
            const owned   = myCards.length > 0;
            const best    = owned ? myCards.reduce((a, b) => b.condition > a.condition ? b : a) : null;
            const cs      = best ? condStyle(card.grade, best.condition) : 'normal';
            return (
              <div
                key={card.id}
                className={`col-card grade-${card.grade}${owned ? '' : ' dex-locked'}`}
                onClick={() => owned && best && setZoomCard({ card, best, count: myCards.length })}
              >
                <img src={`/${card.img}`} alt={card.name} loading="lazy" />
                {owned && cs === 'gold' && <div className="cond-gold-overlay" />}
                {owned && cs === 'holo' && <div className="cond-holo-overlay" />}
                {owned && (
                  <div className="col-card-footer">
                    <div className="col-name">{card.name}</div>
                    <span className="col-grade" style={{ color: '#ff6b6b' }}>RAID</span>
                  </div>
                )}
                {!owned && (
                  <div className="dex-raid-lock-overlay">
                    <span className="dex-raid-lock-icon">⚔️</span>
                    <span className="dex-raid-lock-text">RAID</span>
                  </div>
                )}
                {owned && myCards.length > 1 && <div className="dup">×{myCards.length}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {zoomCard && (
      <div className="card-zoom-overlay" onClick={() => setZoomCard(null)}>
        <div className="card-zoom-inner" onClick={e => e.stopPropagation()}>
          <div className={`zoom-card grade-${zoomCard.card.grade}`}>
            <div className="card-header">
              <span className="card-name">{zoomCard.card.name}</span>
              <span className="grade-badge">{GRADE_LABEL[zoomCard.card.grade]}</span>
            </div>
            <div className="card-art">
              <img src={`/${zoomCard.card.img}`} alt={zoomCard.card.name} />
            </div>
            <div className="card-footer-front">
              <div className="card-sep" />
              <div className="card-slogan">{zoomCard.card.slogan}</div>
            </div>
            <div className="card-aurora" />
            {zoomCs === 'gold' && <div className="cond-gold-overlay" />}
            {zoomCs === 'holo' && <div className="cond-holo-overlay" />}
            <div className={`draw-cond-badge cond-badge-${zoomCs}`}>
              {zoomCard.best.condition}
            </div>
          </div>
          <div className="zoom-info">
            {zoomCard.count > 1 && (
              <span className="zoom-detail-count">{zoomCard.count}개 보유</span>
            )}
            <button className="zoom-close" onClick={() => setZoomCard(null)}>닫기 ✕</button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}
