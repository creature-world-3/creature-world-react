import { useState } from 'react';
import { CARDS, CHARACTERS } from '../../data/cards.js';

const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID' };
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

// ── 공통 인스턴스 피커 바텀시트 ──
function InstanceSheet({ cardDef, instances, onSelect, onClose }) {
  return (
    <div className="card-zoom-overlay" onClick={onClose}>
      <div className="inst-sheet" onClick={e => e.stopPropagation()}>
        <div className="inst-sheet-title">
          {cardDef.name} &nbsp;<span className="inst-sheet-count">{instances.length}장 보유</span>
        </div>
        <div className="inst-list">
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

  const zoomCs = zoomCard ? condStyle(zoomCard.card.grade, zoomCard.best.condition) : null;

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
            {(zoomCard.best.enhanceLevel || 0) > 0 && (
              <div className="zoom-enhance-badge">+{zoomCard.best.enhanceLevel}</div>
            )}
          </div>
          <div className="zoom-info">
            {zoomCard.count > 1 && (
              <span className="zoom-detail-count">{zoomCard.count}개 보유</span>
            )}
            {(zoomCard.best.enhanceLevel || 0) > 0 && (
              <div className="zoom-enhance-info">강화 : {zoomCard.best.enhanceLevel}단계</div>
            )}
            <button className="zoom-close" onClick={() => setZoomCard(null)}>닫기 ✕</button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}
