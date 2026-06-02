import { useState, useRef, useEffect } from 'react';
import { CARDS, CHARACTERS } from '../../data/cards.js';

const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID' };
const GRADE_COLOR = { n: '#888', r: '#4a9eff', sr: '#c084fc', ur: '#fbbf24', lg: '#ff6b6b', raid: '#ffd700' };
const RAID_CARDS   = CARDS.filter(c => c.raid === true || c.grade === 'raid' || c.grade === 'RAID');
const NORMAL_CARDS = CARDS.filter(c => !c.raid && c.grade !== 'raid' && c.grade !== 'RAID');

const GRADE_TABS = [
  { key: 'all',  label: '전체'   },
  { key: 'n',    label: 'N'      },
  { key: 'r',    label: 'R'      },
  { key: 'sr',   label: 'SR'     },
  { key: 'ur',   label: 'UR'     },
  { key: 'lg',   label: 'LEGEND' },
  { key: 'raid', label: 'RAID'   },
];

const GRADE_RANGE  = { n:[1,10], r:[11,20], sr:[21,30], ur:[31,40], lg:[51,60], raid:[56,65] };
const BONUS_MULT   = { n:0.5, r:1, sr:2, ur:3, lg:5, raid:10 };
function calcBonus(ownedCards) {
  let b = 0;
  const seen = new Set();
  for (const o of ownedCards) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    const c = CARDS.find(x => x.id === o.id);
    if (c) b += BONUS_MULT[c.grade] || 0;
  }
  return Math.floor(b);
}
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

function condColor(cond) {
  if (cond >= 9) return '#d97706';
  if (cond >= 6) return '#7c3aed';
  return '#888';
}

function CardItem({ card, ownedCards, onSingle, onMulti }) {
  const myCards = ownedCards.filter(c => c.id === card.id);
  const owned   = myCards.length > 0;
  const best    = owned ? myCards.reduce((a, b) => b.condition > a.condition ? b : a) : null;
  const cs      = best ? condStyle(card.grade, best.condition) : 'normal';

  const handleClick = () => {
    if (!owned || !best) return;
    if (myCards.length > 1) {
      onMulti({ card, instances: myCards });
    } else {
      onSingle({ card, best, count: 1 });
    }
  };

  return (
    <div
      className={`col-card grade-${card.grade}${owned ? '' : ' dex-locked'}`}
      onClick={handleClick}
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
      {!owned && (card.raid || card.grade === 'raid') && (
        <div className="dex-raid-lock-overlay">
          <span className="dex-raid-lock-text">RAID</span>
        </div>
      )}
      {owned && myCards.length > 1 && <div className="dup">×{myCards.length}</div>}
    </div>
  );
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

// ── 공통 인스턴스 피커 바텀시트 ──
const INST_SCROLL = 76 * 3;

function InstanceSheet({ cardDef, instances, onSelect, onClose }) {
  const listRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd,   setAtEnd]   = useState(false);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 2);
  };

  useEffect(() => {
    const el = listRef.current;
    if (el) setAtEnd(el.scrollWidth <= el.clientWidth + 2);
  }, [instances]);

  const scroll = (dir) => listRef.current?.scrollBy({ left: dir * INST_SCROLL, behavior: 'smooth' });
  const showArrows = instances.length > 4;

  return (
    <div className="card-zoom-overlay" onClick={onClose}>
      <div className="inst-sheet" onClick={e => e.stopPropagation()}>
        <div className="inst-sheet-title">
          {cardDef.name} &nbsp;<span className="inst-sheet-count">{instances.length}장 보유</span>
        </div>
        <div className="inst-list-wrap">
          {showArrows && <button className="inst-scroll-btn" disabled={atStart} onClick={() => scroll(-1)}>‹</button>}
          <div className="inst-list" ref={listRef} onScroll={onScroll}>
            {instances.map((inst, i) => {
              const lvl = inst.enhanceLevel || 0;
              const cond = inst.condition || 1;
              return (
                <div
                  key={inst.uid}
                  className="inst-item"
                  style={{ animationDelay: `${i * 50}ms` }}
                  onClick={() => onSelect(inst)}
                >
                  <div className="inst-item-img">
                    <img src={`/${cardDef.img}`} alt={cardDef.name} />
                    {lvl > 0 && <div className="inst-item-badge">+{lvl}</div>}
                  </div>
                  <div className="inst-item-meta" style={{ color: condColor(cond) }}>
                    컨디션 {cond}
                  </div>
                </div>
              );
            })}
          </div>
          {showArrows && <button className="inst-scroll-btn" disabled={atEnd} onClick={() => scroll(1)}>›</button>}
        </div>
        <button className="zoom-close" onClick={onClose}>닫기 ✕</button>
      </div>
    </div>
  );
}

export default function DexTab({ gs }) {
  const [gradeTab,   setGradeTab]   = useState('all');
  const [zoomCard,   setZoomCard]   = useState(null);
  const [pickerCard, setPickerCard] = useState(null); // { card, instances }

  const ownedCards  = gs?.ownedCards || [];
  const ownedIds    = new Set(ownedCards.map(c => c.id));
  const uniqueOwned = ownedIds.size;

  const zoomCs    = zoomCard ? condStyle(zoomCard.card.grade, zoomCard.best.condition) : null;
  const zoomBonus = calcBonus(ownedCards);

  const filteredNormal = gradeTab !== 'all' && gradeTab !== 'raid'
    ? NORMAL_CARDS.filter(c => c.grade === gradeTab)
    : [];

  const handleSingle = (data)   => { setZoomCard(data); setPickerCard(null); };
  const handleMulti  = (data)   => { setPickerCard(data); };
  const handleInstSelect = (inst) => {
    setZoomCard({ card: pickerCard.card, best: inst, count: pickerCard.instances.length });
    setPickerCard(null);
  };

  return (
  <>
    <div className="dex-tab">
      <div className="col-header">
        <span className="col-title">도감</span>
        <span className="col-count">{uniqueOwned} / {CARDS.length}</span>
      </div>

      <div className="dex-grade-tabs">
        {GRADE_TABS.map(tab => (
          <button
            key={tab.key}
            className={`dex-grade-tab dex-grade-tab-${tab.key}${gradeTab === tab.key ? ' active' : ''}`}
            onClick={() => setGradeTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {gradeTab === 'all' && (
        <>
          {CHARACTERS.map(char => (
            <div key={char.id} className="dex-character-group">
              <div className="dex-char-name">{char.name}</div>
              <div className="card-grid">
                {NORMAL_CARDS.filter(c => c.id.startsWith(char.id)).map(card => (
                  <CardItem key={card.id} card={card} ownedCards={ownedCards} onSingle={handleSingle} onMulti={handleMulti} />
                ))}
              </div>
            </div>
          ))}
          {RAID_CARDS.length > 0 && (
            <div className="dex-raid-group">
              <div className="dex-char-name dex-raid-title">
                RAID 한정<span className="dex-raid-hint">레이드 보상으로만 획득 가능</span>
              </div>
              <div className="card-grid">
                {RAID_CARDS.map(card => (
                  <CardItem key={card.id} card={card} ownedCards={ownedCards} onSingle={handleSingle} onMulti={handleMulti} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {gradeTab !== 'all' && gradeTab !== 'raid' && (
        <div className="card-grid dex-grade-grid">
          {filteredNormal.map(card => (
            <CardItem key={card.id} card={card} ownedCards={ownedCards} onSingle={handleSingle} onMulti={handleMulti} />
          ))}
        </div>
      )}

      {gradeTab === 'raid' && (
        <div className="dex-raid-group">
          <div className="dex-char-name dex-raid-title">
            RAID 한정<span className="dex-raid-hint">레이드 보상으로만 획득 가능</span>
          </div>
          {RAID_CARDS.length === 0 ? (
            <div className="col-empty">RAID 카드 데이터가 없습니다</div>
          ) : (
            <div className="card-grid">
              {RAID_CARDS.map(card => (
                <CardItem key={card.id} card={card} ownedCards={ownedCards} onSingle={handleSingle} onMulti={handleMulti} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    {/* 인스턴스 피커 바텀시트 */}
    {pickerCard && (
      <InstanceSheet
        cardDef={pickerCard.card}
        instances={pickerCard.instances}
        onSelect={handleInstSelect}
        onClose={() => setPickerCard(null)}
      />
    )}

    {/* 카드 줌 모달 */}
    {zoomCard && (
      <div className="card-zoom-overlay" onClick={() => setZoomCard(null)}>
        <div className="card-zoom-inner" onClick={e => e.stopPropagation()}>
          <div className="modal-card-main">
            {/* 왼쪽: 카드 이미지 */}
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
            {/* 오른쪽: 스탯 패널 */}
            <div className="modal-stat-panel">
              <div className="modal-stat-row">
                <span className="modal-stat-label">데미지</span>
                <span className="modal-stat-value modal-stat-dmg">
                  {dmgRange(zoomCard.card.grade, zoomCard.best.condition, zoomCard.best.enhanceLevel || 0, zoomBonus)}
                </span>
              </div>
              {(zoomCard.best.enhanceLevel || 0) > 0 && (
                <div className="modal-stat-row">
                  <span className="modal-stat-label">강화</span>
                  <span className="modal-stat-value modal-stat-enhance">{zoomCard.best.enhanceLevel}단계</span>
                </div>
              )}
              {zoomBonus > 0 && (
                <div className="modal-stat-row">
                  <span className="modal-stat-label">보너스</span>
                  <span className="modal-stat-value modal-stat-enhance">+{zoomBonus}</span>
                </div>
              )}
              <div className="modal-stat-row">
                <span className="modal-stat-label">컨디션</span>
                <StarRating value={zoomCard.best.condition} />
              </div>
              {zoomCard.count > 1 && (
                <div className="modal-stat-row">
                  <span className="modal-stat-label">보유</span>
                  <span className="modal-stat-value">{zoomCard.count}장</span>
                </div>
              )}
            </div>
          </div>
          <button className="zoom-close" onClick={() => setZoomCard(null)}>닫기 ✕</button>
        </div>
      </div>
    )}
  </>
  );
}
