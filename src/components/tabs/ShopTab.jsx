import { useState, useRef } from 'react';
import { CARDS } from '../../data/cards.js';

const WESTERN_POOL = CARDS.filter(c => c.special === 'western');
const WESTERN_COST = 30;

function genUid() {
  return `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ShopTab({ gs, setGs }) {
  const [toast, setToast]           = useState(null);
  const [westernResult, setWesternResult] = useState(null); // 뽑기 결과 카드
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const today    = new Date().toDateString();
  const testDone = gs?.testEventDate === today;
  const tickets  = gs?.tickets ?? 0;

  const doTestEvent = () => {
    if (testDone) { showToast('오늘 이미 받았어요! 내일 다시 와요'); return; }
    setGs(prev => ({ ...prev, tickets: prev.tickets + 100, testEventDate: today }));
    showToast('테스트 이벤트! 뽑기권 +100장 획득!');
  };

  const doWesternDraw = () => {
    if (tickets < WESTERN_COST) { showToast(`뽑기권이 부족해요! ${WESTERN_COST}장이 필요해요`); return; }
    const card = WESTERN_POOL[Math.floor(Math.random() * WESTERN_POOL.length)];
    const condition = Math.floor(Math.random() * 10) + 1;
    const newInst = { uid: genUid(), id: card.id, condition, enhanceLevel: 0 };
    setGs(prev => ({
      ...prev,
      tickets: prev.tickets - WESTERN_COST,
      ownedCards: [...(prev.ownedCards || []), newInst],
    }));
    setWesternResult({ card, condition });
  };

  return (
    <>
      {toast && <div className="cw-toast">{toast}</div>}

      {/* 서부 시리즈 뽑기 결과 오버레이 */}
      {westernResult && (
        <div className="card-zoom-overlay" onClick={() => setWesternResult(null)}>
          <div className="shop-result-wrap" onClick={e => e.stopPropagation()}>
            <div className="shop-result-label">서부 시리즈 뽑기 결과!</div>
            <div className={`shop-result-front grade-${westernResult.card.grade}`}>
              <img src={`/${westernResult.card.img}`} alt={westernResult.card.name} />
              <div className="shop-result-front-aurora card-aurora" />
              <div className="shop-result-grade-tag">SR</div>
            </div>
            <div className="shop-result-card-name">{westernResult.card.name}</div>
            <div className="shop-result-card-slogan">{westernResult.card.slogan}</div>
            <div className="shop-result-cond">컨디션 {westernResult.condition}</div>
            <button className="shop-result-close-btn" onClick={() => setWesternResult(null)}>확인</button>
          </div>
        </div>
      )}

      <div className="shop-wrap">
        <div className="shop-header">
          <div className="col-title">상점</div>
          <div className="col-count">보유 뽑기권 {tickets}장</div>
        </div>

        {/* 서부 시리즈 뽑기 */}
        <div className="shop-item shop-item-western">
          <div className="shop-item-left">
            <div className="shop-card-preview shop-card-preview-western">
              <div className="shop-western-cards">
                {WESTERN_POOL.slice(0, 3).map(c => (
                  <img key={c.id} src={`/${c.img}`} alt={c.name} className="shop-western-thumb" />
                ))}
              </div>
              <span className="shop-card-western-label">서부 시리즈</span>
            </div>
          </div>
          <div className="shop-item-right">
            <div className="shop-item-name">서부 시리즈 뽑기</div>
            <div className="shop-item-desc">
              서부 테마 SR 카드 6종 중 1장을 랜덤으로 획득합니다.<br />
              일반 뽑기에서는 등장하지 않는 한정 카드예요!
            </div>
            <div className="shop-item-pool">
              {WESTERN_POOL.map(c => (
                <img key={c.id} src={`/${c.img}`} alt={c.name} className="shop-item-pool-thumb" title={c.name} />
              ))}
            </div>
            <div className="shop-item-price">뽑기권 {WESTERN_COST}장</div>
            <button
              className="shop-buy-btn shop-buy-btn-western"
              onClick={doWesternDraw}
              disabled={tickets < WESTERN_COST}
            >
              {tickets < WESTERN_COST ? `뽑기권 부족 (${tickets}/${WESTERN_COST})` : `뽑기 (${WESTERN_COST}장)`}
            </button>
          </div>
        </div>

        {/* 테스트 이벤트 */}
        <div className="shop-item shop-item-event">
          <div className="shop-item-left">
            <div className="shop-card-preview shop-card-preview-event">
              <span className="shop-card-gift"></span>
              <span className="shop-card-event-label">EVENT</span>
            </div>
          </div>
          <div className="shop-item-right">
            <div className="shop-item-name shop-item-name-event">테스트 이벤트</div>
            <div className="shop-item-desc">테스트 서버 한정! 뽑기권 100장을 드려요. 하루 1회.</div>
            <div className="shop-item-price shop-item-price-event">무료 (하루 1회)</div>
            <button
              className="shop-buy-btn shop-buy-btn-event"
              onClick={doTestEvent}
              disabled={testDone}
            >
              {testDone ? '오늘 받았어요 ✓' : '받기'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
