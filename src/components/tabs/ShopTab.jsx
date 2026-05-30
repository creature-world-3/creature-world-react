import { useState, useRef } from 'react';

export default function ShopTab({ gs, setGs }) {
  const [toast, setToast] = useState(null);
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
    if (testDone) { showToast('오늘 이미 받았어요! 내일 다시 와요 😊'); return; }
    setGs(prev => ({ ...prev, tickets: prev.tickets + 100, testEventDate: today }));
    showToast('테스트 이벤트! 뽑기권 +100장 획득! 🎉');
  };

  return (
    <>
      {toast && <div className="cw-toast">{toast}</div>}

      <div className="shop-wrap">
        <div className="shop-header">
          <div className="col-title">상점</div>
          <div className="col-count">보유 뽑기권 {tickets}장</div>
        </div>

        <div className="shop-item shop-item-event">
          <div className="shop-item-left">
            <div className="shop-card-preview shop-card-preview-event">
              <span className="shop-card-gift">🎁</span>
            </div>
          </div>
          <div className="shop-item-right">
            <div className="shop-item-name shop-item-name-event">🧪 테스트 이벤트</div>
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
