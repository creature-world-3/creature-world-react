import { useState, useEffect, useRef } from 'react';
import { CARDS } from '../../data/cards.js';

const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND' };
const FLASH_LABEL = { sr: '💜 SUPER RARE!', ur: '✨ ULTRA RARE!', lg: '🌈 L E G E N D !' };
const SR_PLUS = CARDS.filter(c => ['sr', 'ur', 'lg'].includes(c.grade));
let _uid = 0;
const genUid = () => `${++_uid}_${Date.now()}`;

function randomCondition() {
  const r = Math.random();
  if (r < 0.02) return 10; if (r < 0.07) return 9; if (r < 0.20) return 8;
  if (r < 0.37) return 7;  if (r < 0.53) return 6; if (r < 0.65) return 5;
  if (r < 0.76) return 4;  if (r < 0.86) return 3; if (r < 0.93) return 2;
  return 1;
}

export default function ShopTab({ gs, setGs }) {
  const [toast, setToast]     = useState(null);
  const [flash, setFlash]     = useState(null);
  const [result, setResult]   = useState(null);   // { type:'card'|'tickets', ... }
  const [cardFlipped, setCardFlipped] = useState(false);
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

  const closeResult = () => { setResult(null); setCardFlipped(false); };

  const today    = new Date().toDateString();
  const testDone = gs?.testEventDate === today;
  const tickets  = gs?.tickets ?? 0;

  // ── 테스트 이벤트 ──
  const doTestEvent = () => {
    if (testDone) { showToast('오늘 이미 받았어요! 내일 다시 와요 😊'); return; }
    setGs(prev => ({ ...prev, tickets: prev.tickets + 100, testEventDate: today }));
    showToast('테스트 이벤트! 뽑기권 +100장 획득! 🎉');
  };

  // ── 프리미엄 뽑기 ──
  const doPremium = () => {
    if (tickets < 10) { showToast('뽑기권이 10장 이상 필요해요!'); return; }

    if (Math.random() < 0.20) {
      // 20% → SR이상 카드
      const card = SR_PLUS[Math.floor(Math.random() * SR_PLUS.length)];
      const cond = randomCondition();
      const isNew = !gs.ownedCards.some(c => c.id === card.id);
      setGs(prev => ({
        ...prev,
        tickets: prev.tickets - 10,
        ownedCards: [...prev.ownedCards, { uid: genUid(), id: card.id, condition: cond }],
      }));
      setResult({ type: 'card', card, cond, isNew });
      setCardFlipped(false);
      if (['ur', 'lg'].includes(card.grade)) setFlash(card.grade);
      else setFlash('sr');
    } else {
      // 80% → 뽑기권 1~15장
      const amount = Math.floor(Math.random() * 15) + 1;
      setGs(prev => ({ ...prev, tickets: prev.tickets - 10 + amount }));
      setResult({ type: 'tickets', amount });
      showToast(`프리미엄 결과! 뽑기권 +${amount}장`);
    }
  };

  return (
    <>
      {flash && (
        <div className={`grade-flash grade-flash-${flash}`}>
          <div className="grade-flash-text">{FLASH_LABEL[flash]}</div>
        </div>
      )}
      {toast && <div className="cw-toast">{toast}</div>}

      <div className="shop-wrap">
        {/* 헤더 */}
        <div className="shop-header">
          <div className="col-title">상점</div>
          <div className="col-count">보유 뽑기권 {tickets}장</div>
        </div>

        {/* ── 테스트 이벤트 ── */}
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

        {/* ── 프리미엄 뽑기 ── */}
        <div className="shop-item">
          <div className="shop-item-left">
            <div className="shop-card-preview">
              <div className="shop-card-back">
                <div className="shop-card-aurora" />
                <div className="shop-card-logo">PREMIUM</div>
                <div className="shop-card-star">?</div>
              </div>
            </div>
          </div>
          <div className="shop-item-right">
            <div className="shop-item-name">프리미엄 뽑기</div>
            <div className="shop-item-desc">
              뽑기권 10장으로 도전! 80%는 뽑기권 1~15장, 20%는 희귀 카드!
            </div>
            <div className="shop-item-rates">
              <span className="shop-rate shop-rate-ticket">뽑기권 80%</span>
              <span className="shop-rate shop-rate-sr">SR 15%</span>
              <span className="shop-rate shop-rate-ur">UR 4%</span>
              <span className="shop-rate shop-rate-lg">LG 1%</span>
            </div>
            <div className="shop-item-price">뽑기권 10장</div>
            <button
              className="shop-buy-btn"
              onClick={doPremium}
              disabled={tickets < 10}
            >
              {tickets < 10 ? `뽑기권 부족 (${tickets}장)` : '구매하기'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 결과 오버레이 ── */}
      {result && (
        <div className="card-zoom-overlay" onClick={closeResult}>
          <div className="shop-result-overlay-inner" onClick={e => e.stopPropagation()}>
            {result.type === 'tickets' ? (
              /* 뽑기권 결과 */
              <>
                <div className="shop-result-ticket-wrap">
                  <div style={{ fontSize: '4rem' }}>🎟️</div>
                  <div className="shop-result-ticket-num">+{result.amount}장</div>
                  <div className="shop-result-ticket-sub">뽑기권을 획득했어요!</div>
                </div>
                <button className="zoom-close" onClick={closeResult}>닫기</button>
              </>
            ) : (
              /* 카드 결과 — 클릭하면 뒤집기 */
              <>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                  {cardFlipped ? '' : '탭해서 카드 확인!'}
                </div>
                <div
                  className="shop-result-card-wrap"
                  onClick={() => setCardFlipped(true)}
                  style={{ cursor: cardFlipped ? 'default' : 'pointer' }}
                >
                  <div className={`shop-result-inner${cardFlipped ? ' flipped' : ''}`}>
                    {/* 뒷면 */}
                    <div className="shop-result-back">
                      <div className="shop-result-aurora" />
                      <div className="shop-back-logo">PREMIUM</div>
                      <div className="shop-back-star">?</div>
                    </div>
                    {/* 앞면 */}
                    <div className={`shop-result-front grade-${result.card.grade}`}>
                      <div className="card-header">
                        <span className="card-name">{result.card.name}</span>
                        <span className="grade-badge">{GRADE_LABEL[result.card.grade]}</span>
                      </div>
                      <div className="card-art">
                        <img src={`/${result.card.img}`} alt={result.card.name} />
                      </div>
                      <div className="card-footer-front">
                        <div className="card-sep" />
                        <div className="card-slogan">{result.card.slogan}</div>
                      </div>
                      <div className="card-aurora" />
                    </div>
                  </div>
                </div>
                {result.isNew && cardFlipped && (
                  <div className="new-badge" style={{ fontSize: '0.85rem', padding: '4px 14px' }}>NEW!</div>
                )}
                <button className="zoom-close" onClick={closeResult}>닫기</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
