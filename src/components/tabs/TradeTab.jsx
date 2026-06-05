import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy, where,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS } from '../../data/cards.js';

const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID' };
const GRADE_COLOR = { n: '#888', r: '#4a9eff', sr: '#c084fc', ur: '#fbbf24', lg: '#ff6b6b', raid: '#ffd700' };
const MAX_MY_LISTINGS = 3;

let _tradeUid = 0;
const genCardUid = () => `t_${++_tradeUid}_${Date.now()}`;

export default function TradeTab({ gs, setGs, user }) {
  const [mainTab, setMainTab] = useState('sell'); // 'sell' | 'buy'

  // ── 판매 상태 ──
  const [trades, setTrades]                   = useState([]);
  const [gradeFilter, setGradeFilter]         = useState('all');
  const [formGradeFilter, setFormGradeFilter] = useState('all');
  const [showForm, setShowForm]               = useState(false);
  const [selectedCard, setSelectedCard]       = useState(null);
  const [tradePicker, setTradePicker]         = useState(null);
  const [price, setPrice]                     = useState('');

  // ── 구매 요청 상태 ──
  const [buyOrders, setBuyOrders]             = useState([]);
  const [buyGradeFilter, setBuyGradeFilter]   = useState('all');
  const [buyFormGradeFilter, setBuyFormGradeFilter] = useState('all');
  const [showBuyForm, setShowBuyForm]         = useState(false);
  const [buySelectedCard, setBuySelectedCard] = useState(null);
  const [buyPrice, setBuyPrice]               = useState('');
  const [sellPicker, setSellPicker]           = useState(null); // { buyOrder, instances }

  // ── 공통 ──
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]           = useState(null);
  const [zoomTrade, setZoomTrade]   = useState(null);
  const toastRef = useRef(null);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    const q1 = query(collection(db, 'trades'),    orderBy('createdAt', 'desc'));
    const q2 = query(collection(db, 'buyOrders'), where('status', '==', 'active'));
    const u1 = onSnapshot(q1, snap => setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(q2, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      setBuyOrders(docs);
    });
    return () => { u1(); u2(); };
  }, []);

  const myActiveSell = trades.filter(t => t.uid === user?.uid && t.status === 'active');
  const pendingRewards = trades.filter(t => t.uid === user?.uid && t.status === 'sold' && !t.claimed);
  const pendingTotal   = pendingRewards.reduce((s, t) => s + t.price, 0);
  const myActiveBuy    = buyOrders.filter(o => o.uid === user?.uid && o.status === 'active');

  const lockedUid  = gs?.raidCard?.uid;
  const availInsts = (gs?.ownedCards || []).filter(oc => oc.uid !== lockedUid);

  // 판매 폼용 (보유 카드 타입)
  const sellCardTypes = CARDS.filter(
    c => c.grade !== 'raid' && availInsts.some(oc => oc.id === c.id)
  );

  // 구매 폼용 (전체 카드 타입, RAID 제외)
  const allCardTypes = CARDS.filter(c => c.grade !== 'raid');

  const handleTradeCardTypeClick = (cardDef) => {
    const instances = availInsts.filter(oc => oc.id === cardDef.id);
    if (instances.length === 1) {
      setSelectedCard({ uid: instances[0].uid, condition: instances[0].condition, enhanceLevel: instances[0].enhanceLevel, ...cardDef });
      setTradePicker(null);
    } else {
      setTradePicker({ cardDef, instances });
    }
  };

  // ── 판매 등록 ──
  const handleRegister = async () => {
    if (!selectedCard || !price || submitting) return;
    const priceNum = Math.max(1, parseInt(price) || 0);
    if (myActiveSell.length >= MAX_MY_LISTINGS) {
      showToast(`최대 ${MAX_MY_LISTINGS}개까지 등록할 수 있어요`); return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'trades'), {
        uid:            user.uid,
        sellerName:     gs.nickname || user.displayName,
        sellerPhotoURL: user.photoURL || null,
        cardUid:        selectedCard.uid,
        cardId:         selectedCard.id,
        cardImg:        selectedCard.img,
        cardName:       selectedCard.name,
        cardGrade:      selectedCard.grade,
        cardCondition:  selectedCard.condition,
        cardEnhance:    selectedCard.enhanceLevel || 0,
        price:          priceNum,
        createdAt:      serverTimestamp(),
        status:         'active',
        claimed:        false,
      });
      setGs(prev => ({
        ...prev,
        ownedCards: prev.ownedCards.filter(c => c.uid !== selectedCard.uid),
      }));
      setSelectedCard(null);
      setPrice('');
      setShowForm(false);
      showToast('카드가 등록됐어요!');
    } catch (e) {
      console.error(e);
      showToast('등록 중 오류가 발생했어요');
    }
    setSubmitting(false);
  };

  // ── 구매 (트랜잭션) ──
  const handleBuy = async (trade) => {
    if (!user || submitting) return;
    if ((gs?.tickets ?? 0) < trade.price) { showToast('뽑기권이 부족해요!'); return; }
    setSubmitting(true);
    const newCardUid = genCardUid();
    try {
      const tradeRef = doc(db, 'trades', trade.id);
      const buyerRef = doc(db, 'users', user.uid);

      await runTransaction(db, async (tx) => {
        const [tradeSnap, buyerSnap] = await Promise.all([tx.get(tradeRef), tx.get(buyerRef)]);
        if (!tradeSnap.exists()) throw new Error('already_sold');
        const tradeData = tradeSnap.data();
        if (tradeData.status !== 'active') throw new Error('already_sold');
        const buyerData    = buyerSnap.exists() ? (buyerSnap.data() || {}) : {};
        const buyerTickets = typeof buyerData.tickets === 'number' ? buyerData.tickets : 0;
        if (buyerTickets < trade.price) throw new Error('insufficient');
        const prevCards = Array.isArray(buyerData.ownedCards) ? buyerData.ownedCards : [];
        const newCard   = { uid: newCardUid, id: trade.cardId, condition: trade.cardCondition, enhanceLevel: trade.cardEnhance || 0 };
        tx.update(tradeRef, { status: 'sold', soldAt: serverTimestamp(), claimed: false });
        tx.update(buyerRef, { tickets: buyerTickets - trade.price, ownedCards: [...prevCards, newCard] });
      });

      setGs(prev => ({
        ...prev,
        tickets:    prev.tickets - trade.price,
        ownedCards: [...prev.ownedCards, { uid: newCardUid, id: trade.cardId, condition: trade.cardCondition, enhanceLevel: trade.cardEnhance || 0 }],
      }));
      showToast(`${trade.cardName} (${GRADE_LABEL[trade.cardGrade]}) 구매 완료!`);
    } catch (e) {
      if (e.message === 'already_sold')  showToast('이미 판매된 카드예요!');
      else if (e.message === 'insufficient') showToast('뽑기권이 부족해요!');
      else { console.error(e); showToast('구매 중 오류가 발생했어요'); }
    }
    setSubmitting(false);
  };

  // ── 판매 취소 ──
  const handleCancel = async (trade) => {
    try {
      await deleteDoc(doc(db, 'trades', trade.id));
      setGs(prev => ({
        ...prev,
        ownedCards: [...prev.ownedCards, { uid: trade.cardUid, id: trade.cardId, condition: trade.cardCondition, enhanceLevel: trade.cardEnhance || 0 }],
      }));
      showToast('등록이 취소됐어요. 카드가 돌아왔어요!');
    } catch (e) { console.error(e); }
  };

  // ── 보상 수령 ──
  const handleClaimRewards = async () => {
    if (!pendingRewards.length || !user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const currentTickets = userSnap.exists() ? (userSnap.data()?.tickets ?? 0) : 0;
        tx.update(userRef, { tickets: currentTickets + pendingTotal });
        pendingRewards.forEach(t => tx.delete(doc(db, 'trades', t.id)));
      });
      setGs(prev => ({ ...prev, tickets: prev.tickets + pendingTotal }));
      showToast(`보상 수령 완료! +${pendingTotal}장`);
    } catch (e) {
      console.error('[claim]', e);
      showToast('보상 수령 중 오류가 발생했어요');
    }
  };

  // ── 구매 요청 등록 ──
  const handlePostBuyOrder = async () => {
    if (!buySelectedCard || !buyPrice || submitting) return;
    const priceNum = Math.max(1, parseInt(buyPrice) || 0);
    if ((gs?.tickets ?? 0) < priceNum) { showToast('뽑기권이 부족해요!'); return; }
    if (myActiveBuy.length >= MAX_MY_LISTINGS) {
      showToast(`최대 ${MAX_MY_LISTINGS}개까지 등록할 수 있어요`); return;
    }
    setSubmitting(true);
    try {
      const userRef    = doc(db, 'users', user.uid);
      const orderRef   = doc(collection(db, 'buyOrders'));
      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const cur = userSnap.exists() ? (userSnap.data()?.tickets ?? 0) : 0;
        if (cur < priceNum) throw new Error('insufficient');
        tx.update(userRef, { tickets: cur - priceNum });
        tx.set(orderRef, {
          uid:            user.uid,
          buyerName:      gs.nickname || user.displayName,
          buyerPhotoURL:  user.photoURL || null,
          cardId:         buySelectedCard.id,
          cardImg:        buySelectedCard.img,
          cardName:       buySelectedCard.name,
          cardGrade:      buySelectedCard.grade,
          price:          priceNum,
          createdAt:      serverTimestamp(),
          status:         'active',
        });
      });
      setGs(prev => ({ ...prev, tickets: prev.tickets - priceNum }));
      setBuySelectedCard(null);
      setBuyPrice('');
      setShowBuyForm(false);
      showToast('구매 요청이 등록됐어요!');
    } catch (e) {
      if (e.message === 'insufficient') showToast('뽑기권이 부족해요!');
      else { console.error(e); showToast('등록 중 오류가 발생했어요'); }
    }
    setSubmitting(false);
  };

  // ── 구매 요청 취소 (뽑기권 환불) ──
  const handleCancelBuyOrder = async (order) => {
    try {
      const userRef  = doc(db, 'users', user.uid);
      const orderRef = doc(db, 'buyOrders', order.id);
      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const cur = userSnap.exists() ? (userSnap.data()?.tickets ?? 0) : 0;
        tx.update(userRef, { tickets: cur + order.price });
        tx.delete(orderRef);
      });
      setGs(prev => ({ ...prev, tickets: prev.tickets + order.price }));
      showToast(`구매 요청이 취소됐어요. 뽑기권 ${order.price}장이 돌아왔어요!`);
    } catch (e) {
      console.error(e);
      showToast('취소 중 오류가 발생했어요');
    }
  };

  // ── 판매하기 (구매 요청 체결) ──
  const handleSellToBuyer = async (buyOrder, cardInst) => {
    if (!user || submitting) return;
    setSubmitting(true);
    const newCardUid = genCardUid();
    try {
      const orderRef  = doc(db, 'buyOrders', buyOrder.id);
      const sellerRef = doc(db, 'users', user.uid);
      const buyerRef  = doc(db, 'users', buyOrder.uid);

      await runTransaction(db, async (tx) => {
        const [orderSnap, sellerSnap, buyerSnap] = await Promise.all([
          tx.get(orderRef), tx.get(sellerRef), tx.get(buyerRef),
        ]);
        if (!orderSnap.exists() || orderSnap.data().status !== 'active') throw new Error('already_filled');
        const sellerData   = sellerSnap.exists() ? sellerSnap.data() : {};
        const buyerData    = buyerSnap.exists()  ? buyerSnap.data()  : {};
        const newCard      = { uid: newCardUid, id: buyOrder.cardId, condition: cardInst.condition, enhanceLevel: cardInst.enhanceLevel || 0 };
        const newSellerCards = (sellerData.ownedCards || []).filter(c => c.uid !== cardInst.uid);
        const newBuyerCards  = [...(buyerData.ownedCards || []), newCard];
        tx.update(sellerRef, { ownedCards: newSellerCards, tickets: (sellerData.tickets || 0) + buyOrder.price });
        tx.update(buyerRef,  { ownedCards: newBuyerCards });
        tx.delete(orderRef);
      });

      setGs(prev => ({
        ...prev,
        tickets:    prev.tickets + buyOrder.price,
        ownedCards: prev.ownedCards.filter(c => c.uid !== cardInst.uid),
      }));
      setSellPicker(null);
      showToast(`판매 완료! 뽑기권 ${buyOrder.price}장을 받았어요!`);
    } catch (e) {
      if (e.message === 'already_filled') showToast('이미 체결된 요청이에요!');
      else { console.error(e); showToast('판매 중 오류가 발생했어요'); }
    }
    setSubmitting(false);
  };

  const handleSellPickerOpen = (buyOrder) => {
    const instances = availInsts.filter(oc => oc.id === buyOrder.cardId);
    if (instances.length === 0) return;
    if (instances.length === 1) {
      handleSellToBuyer(buyOrder, instances[0]);
    } else {
      setSellPicker({ buyOrder, instances });
    }
  };

  // 필터된 목록
  const filteredSell = trades.filter(t =>
    t.status === 'active' && t.uid !== user?.uid &&
    (gradeFilter === 'all' || t.cardGrade === gradeFilter)
  );
  const filteredBuy = buyOrders.filter(o =>
    o.status === 'active' && o.uid !== user?.uid &&
    (buyGradeFilter === 'all' || o.cardGrade === buyGradeFilter)
  );

  const GRADE_FILTERS = [['all','전체'],['n','N'],['r','R'],['sr','SR'],['ur','UR'],['lg','LG']];

  return (
    <div className="trade-wrap">
      {toast && <div className="cw-toast">{toast}</div>}

      {/* ── 메인 탭 ── */}
      <div className="trade-main-tabs">
        <button
          className={`trade-main-tab-btn${mainTab === 'sell' ? ' active' : ''}`}
          onClick={() => setMainTab('sell')}
        >
          팝니다
        </button>
        <button
          className={`trade-main-tab-btn${mainTab === 'buy' ? ' active buy' : ''}`}
          onClick={() => setMainTab('buy')}
        >
          삽니다
        </button>
      </div>

      {/* ════════════════ 팝니다 탭 ════════════════ */}
      {mainTab === 'sell' && (
        <>
          <div className="trade-header">
            <div className="col-title">팝니다</div>
            <div className="trade-header-right">
              {pendingTotal > 0 && (
                <button className="trade-reward-btn" onClick={handleClaimRewards}>
                  보상 수령 +{pendingTotal}장
                </button>
              )}
              <button
                className={`trade-register-btn${showForm ? ' active' : ''}`}
                onClick={() => setShowForm(f => !f)}
                disabled={myActiveSell.length >= MAX_MY_LISTINGS && !showForm}
                title={myActiveSell.length >= MAX_MY_LISTINGS ? `최대 ${MAX_MY_LISTINGS}개까지 등록 가능` : ''}
              >
                {showForm ? '✕ 닫기' : `+ 카드 등록 (${myActiveSell.length}/${MAX_MY_LISTINGS})`}
              </button>
            </div>
          </div>

          {/* 판매 등록 폼 */}
          {showForm && (
            <div className="trade-form">
              <div className="trade-form-title">등록할 카드 선택</div>
              {sellCardTypes.length === 0 ? (
                <p className="trade-form-empty">보유한 카드가 없어요. 뽑기를 먼저 해보세요!</p>
              ) : (
                <>
                  <div className="trade-form-filter">
                    {GRADE_FILTERS.map(([val, label]) => (
                      <button
                        key={val}
                        className={`col-filter-pill${formGradeFilter === val ? ' active' : ''}`}
                        style={val !== 'all' ? { color: formGradeFilter === val ? 'white' : GRADE_COLOR[val] } : {}}
                        onClick={() => { setFormGradeFilter(val); setSelectedCard(null); setTradePicker(null); }}
                      >{label}</button>
                    ))}
                  </div>
                  <div className="trade-card-list">
                    {(formGradeFilter === 'all' ? sellCardTypes : sellCardTypes.filter(c => c.grade === formGradeFilter))
                      .map(cardDef => {
                        const instances  = availInsts.filter(oc => oc.id === cardDef.id);
                        const isSelected = selectedCard?.id === cardDef.id;
                        return (
                          <div key={cardDef.id} className="trade-card-thumb-wrap">
                            <div
                              className={`trade-card-thumb grade-${cardDef.grade}${isSelected ? ' selected' : ''}`}
                              onClick={() => isSelected ? (setSelectedCard(null), setTradePicker(null)) : handleTradeCardTypeClick(cardDef)}
                            >
                              <img src={`/${cardDef.img}`} alt={cardDef.name} />
                              {instances.length > 1 && <div className="trade-card-cond">×{instances.length}</div>}
                            </div>
                            <div className="trade-card-tooltip">{cardDef.name} · {GRADE_LABEL[cardDef.grade]}</div>
                          </div>
                        );
                      })}
                    {formGradeFilter !== 'all' && sellCardTypes.filter(c => c.grade === formGradeFilter).length === 0 && (
                      <p className="trade-form-empty">해당 등급 카드가 없어요</p>
                    )}
                  </div>

                  {tradePicker && (
                    <div className="trade-inst-panel">
                      <div className="trade-inst-label">
                        {tradePicker.cardDef.name} {tradePicker.instances.length}장 — 등록할 카드를 선택하세요
                      </div>
                      <div className="inst-list">
                        {tradePicker.instances.map((inst, i) => {
                          const lvl  = inst.enhanceLevel || 0;
                          const cond = inst.condition || 1;
                          const cc   = cond >= 9 ? '#d97706' : cond >= 6 ? '#7c3aed' : '#888';
                          return (
                            <div
                              key={inst.uid}
                              className={`inst-item${selectedCard?.uid === inst.uid ? ' selected' : ''}`}
                              style={{ animationDelay: `${i * 50}ms` }}
                              onClick={() => {
                                setSelectedCard({ uid: inst.uid, condition: inst.condition, enhanceLevel: inst.enhanceLevel, ...tradePicker.cardDef });
                                setTradePicker(null);
                              }}
                            >
                              <div className="inst-item-img">
                                <img src={`/${tradePicker.cardDef.img}`} alt={tradePicker.cardDef.name} />
                                {lvl > 0 && <div className="inst-item-badge">+{lvl}</div>}
                              </div>
                              <div className="inst-item-meta" style={{ color: cc }}>컨디션 {cond}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedCard && (
                    <div className="trade-price-row">
                      <div className="trade-selected-info">
                        <div className={`trade-selected-img grade-${selectedCard.grade}`}>
                          <img src={`/${selectedCard.img}`} alt={selectedCard.name} />
                        </div>
                        <div>
                          <div className="trade-selected-name">{selectedCard.name}</div>
                          <span className="trade-grade-badge" style={{ color: GRADE_COLOR[selectedCard.grade] }}>
                            {GRADE_LABEL[selectedCard.grade]}
                          </span>
                          <div className="trade-selected-cond">
                            컨디션 {selectedCard.condition}
                            {(selectedCard.enhanceLevel || 0) > 0 && (
                              <span className="trade-enhance-tag">+{selectedCard.enhanceLevel}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="trade-price-input-wrap">
                        <span className="trade-price-label">원하는 뽑기권</span>
                        <div className="trade-price-field">
                          <input
                            type="number"
                            className="trade-price-input"
                            value={price}
                            onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="0"
                            min="1" max="9999"
                          />
                          <span className="trade-price-unit">장</span>
                        </div>
                        <button
                          className="trade-submit-btn"
                          onClick={handleRegister}
                          disabled={!price || submitting}
                        >
                          {submitting ? '등록 중...' : '등록하기'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 내 판매 등록 카드 */}
          {myActiveSell.length > 0 && (
            <div className="trade-my-section">
              <div className="trade-section-label">내 등록 카드</div>
              <div className="trade-list">
                {myActiveSell.map(trade => (
                  <div key={trade.id} className="trade-item">
                    <div className={`trade-card-img grade-${trade.cardGrade}`}>
                      <img src={`/${trade.cardImg}`} alt={trade.cardName} />
                    </div>
                    <div className="trade-item-info">
                      <div className="trade-item-name">
                        {trade.cardName}
                        <span className="trade-grade-badge" style={{ color: GRADE_COLOR[trade.cardGrade] }}>
                          &nbsp;{GRADE_LABEL[trade.cardGrade]}
                        </span>
                      </div>
                      <div className="trade-item-cond">컨디션 {trade.cardCondition}</div>
                      <div className="trade-item-price">뽑기권 {trade.price}장</div>
                    </div>
                    <button className="trade-cancel-btn" onClick={() => handleCancel(trade)}>취소</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 등급 필터 */}
          <div className="col-filter-row">
            {GRADE_FILTERS.map(([val, label]) => (
              <button
                key={val}
                className={`col-filter-pill${gradeFilter === val ? ' active' : ''}`}
                style={val !== 'all' ? { color: gradeFilter === val ? 'white' : GRADE_COLOR[val] } : {}}
                onClick={() => setGradeFilter(val)}
              >{label}</button>
            ))}
          </div>

          {/* 판매 목록 */}
          <div className="trade-list">
            {filteredSell.length === 0 ? (
              <div className="trade-empty">
                <div style={{ fontSize: '1rem', marginBottom: 8 }}>-</div>
                등록된 카드가 없어요
              </div>
            ) : filteredSell.map(trade => (
              <div key={trade.id} className="trade-item">
                <div
                  className={`trade-card-img grade-${trade.cardGrade}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setZoomTrade(trade)}
                >
                  <img src={`/${trade.cardImg}`} alt={trade.cardName} />
                </div>
                <div className="trade-item-info">
                  <div className="trade-item-name">
                    {trade.cardName}
                    <span className="trade-grade-badge" style={{ color: GRADE_COLOR[trade.cardGrade] }}>
                      &nbsp;{GRADE_LABEL[trade.cardGrade]}
                    </span>
                  </div>
                  <div className="trade-item-cond">컨디션 {trade.cardCondition}</div>
                  <div className="trade-seller">
                    <span>{trade.sellerName}</span>
                  </div>
                  <div className="trade-item-price">뽑기권 {trade.price}장</div>
                </div>
                <button
                  className="trade-buy-btn"
                  onClick={() => handleBuy(trade)}
                  disabled={submitting || (gs?.tickets ?? 0) < trade.price}
                  title={(gs?.tickets ?? 0) < trade.price ? `뽑기권 부족 (보유 ${gs?.tickets ?? 0}장)` : ''}
                >
                  {(gs?.tickets ?? 0) >= trade.price ? '구매' : '부족'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ════════════════ 삽니다 탭 ════════════════ */}
      {mainTab === 'buy' && (
        <>
          <div className="trade-header">
            <div className="col-title">삽니다</div>
            <div className="trade-header-right">
              <button
                className={`trade-register-btn trade-buy-order-btn${showBuyForm ? ' active' : ''}`}
                onClick={() => setShowBuyForm(f => !f)}
                disabled={myActiveBuy.length >= MAX_MY_LISTINGS && !showBuyForm}
                title={myActiveBuy.length >= MAX_MY_LISTINGS ? `최대 ${MAX_MY_LISTINGS}개까지 등록 가능` : ''}
              >
                {showBuyForm ? '✕ 닫기' : `+ 구매 요청 (${myActiveBuy.length}/${MAX_MY_LISTINGS})`}
              </button>
            </div>
          </div>

          {/* 구매 요청 등록 폼 */}
          {showBuyForm && (
            <div className="trade-form">
              <div className="trade-form-title">원하는 카드 선택</div>
              <div className="trade-buy-form-hint">
                뽑기권을 미리 내고 구매 요청을 올리면, 해당 카드를 가진 유저가 판매할 수 있어요.
              </div>
              <div className="trade-form-filter">
                {GRADE_FILTERS.map(([val, label]) => (
                  <button
                    key={val}
                    className={`col-filter-pill${buyFormGradeFilter === val ? ' active' : ''}`}
                    style={val !== 'all' ? { color: buyFormGradeFilter === val ? 'white' : GRADE_COLOR[val] } : {}}
                    onClick={() => { setBuyFormGradeFilter(val); setBuySelectedCard(null); }}
                  >{label}</button>
                ))}
              </div>
              <div className="trade-card-list">
                {(buyFormGradeFilter === 'all' ? allCardTypes : allCardTypes.filter(c => c.grade === buyFormGradeFilter))
                  .map(cardDef => {
                    const isSelected = buySelectedCard?.id === cardDef.id;
                    return (
                      <div key={cardDef.id} className="trade-card-thumb-wrap">
                        <div
                          className={`trade-card-thumb grade-${cardDef.grade}${isSelected ? ' selected' : ''}`}
                          onClick={() => setBuySelectedCard(isSelected ? null : cardDef)}
                        >
                          <img src={`/${cardDef.img}`} alt={cardDef.name} />
                        </div>
                        <div className="trade-card-tooltip">{cardDef.name} · {GRADE_LABEL[cardDef.grade]}</div>
                      </div>
                    );
                  })}
              </div>

              {buySelectedCard && (
                <div className="trade-price-row">
                  <div className="trade-selected-info">
                    <div className={`trade-selected-img grade-${buySelectedCard.grade}`}>
                      <img src={`/${buySelectedCard.img}`} alt={buySelectedCard.name} />
                    </div>
                    <div>
                      <div className="trade-selected-name">{buySelectedCard.name}</div>
                      <span className="trade-grade-badge" style={{ color: GRADE_COLOR[buySelectedCard.grade] }}>
                        {GRADE_LABEL[buySelectedCard.grade]}
                      </span>
                    </div>
                  </div>
                  <div className="trade-price-input-wrap">
                    <span className="trade-price-label">제시할 뽑기권 (선불)</span>
                    <div className="trade-price-field">
                      <input
                        type="number"
                        className="trade-price-input"
                        value={buyPrice}
                        onChange={e => setBuyPrice(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="0"
                        min="1" max="9999"
                      />
                      <span className="trade-price-unit">장</span>
                    </div>
                    <button
                      className="trade-submit-btn"
                      onClick={handlePostBuyOrder}
                      disabled={!buyPrice || submitting}
                    >
                      {submitting ? '등록 중...' : '요청 등록'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 내 구매 요청 */}
          {myActiveBuy.length > 0 && (
            <div className="trade-my-section">
              <div className="trade-section-label">내 구매 요청</div>
              <div className="trade-list">
                {myActiveBuy.map(order => (
                  <div key={order.id} className="trade-item">
                    <div className={`trade-card-img grade-${order.cardGrade}`}>
                      <img src={`/${order.cardImg}`} alt={order.cardName} />
                    </div>
                    <div className="trade-item-info">
                      <div className="trade-item-name">
                        {order.cardName}
                        <span className="trade-grade-badge" style={{ color: GRADE_COLOR[order.cardGrade] }}>
                          &nbsp;{GRADE_LABEL[order.cardGrade]}
                        </span>
                      </div>
                      <div className="trade-item-price">뽑기권 {order.price}장 제시 중</div>
                    </div>
                    <button className="trade-cancel-btn" onClick={() => handleCancelBuyOrder(order)}>취소</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 등급 필터 */}
          <div className="col-filter-row">
            {GRADE_FILTERS.map(([val, label]) => (
              <button
                key={val}
                className={`col-filter-pill${buyGradeFilter === val ? ' active' : ''}`}
                style={val !== 'all' ? { color: buyGradeFilter === val ? 'white' : GRADE_COLOR[val] } : {}}
                onClick={() => setBuyGradeFilter(val)}
              >{label}</button>
            ))}
          </div>

          {/* 구매 요청 목록 */}
          <div className="trade-list">
            {filteredBuy.length === 0 ? (
              <div className="trade-empty">
                <div style={{ fontSize: '1rem', marginBottom: 8 }}>-</div>
                구매 요청이 없어요
              </div>
            ) : filteredBuy.map(order => {
              const canSell = availInsts.some(oc => oc.id === order.cardId);
              return (
                <div key={order.id} className="trade-item">
                  <div
                    className={`trade-card-img grade-${order.cardGrade}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setZoomTrade({ ...order, cardCondition: null })}
                  >
                    <img src={`/${order.cardImg}`} alt={order.cardName} />
                  </div>
                  <div className="trade-item-info">
                    <div className="trade-item-name">
                      {order.cardName}
                      <span className="trade-grade-badge" style={{ color: GRADE_COLOR[order.cardGrade] }}>
                        &nbsp;{GRADE_LABEL[order.cardGrade]}
                      </span>
                    </div>
                    <div className="trade-seller">
                      <span>{order.buyerName}</span>
                    </div>
                    <div className="trade-item-price trade-buy-order-price">뽑기권 {order.price}장 제시</div>
                  </div>
                  {canSell ? (
                    <button
                      className="trade-sell-btn"
                      onClick={() => handleSellPickerOpen(order)}
                      disabled={submitting}
                    >
                      판매
                    </button>
                  ) : (
                    <span className="trade-no-card-label">카드 없음</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── 카드 확대 모달 ── */}
      {zoomTrade && (
        <div className="card-zoom-overlay card-detail-overlay" onClick={() => setZoomTrade(null)}>
          <div className="card-zoom-inner" onClick={e => e.stopPropagation()}>
            <div className={`zoom-card grade-${zoomTrade.cardGrade}`} style={{ width: 200, height: 300 }}>
              <img src={`/${zoomTrade.cardImg}`} alt={zoomTrade.cardName} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center 30%' }} />
              <div className="card-header" style={{ position:'absolute', top:0, left:0, right:0, padding:'8px 10px', background:'linear-gradient(to bottom,rgba(0,0,0,0.65),transparent)', display:'flex', alignItems:'center', justifyContent:'space-between', borderRadius:'18px 18px 0 0' }}>
                <span style={{ fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:14, color:'white', textShadow:'0 1px 4px rgba(0,0,0,0.8)' }}>{zoomTrade.cardName}</span>
                <span className="grade-badge" style={{ fontSize:11, fontWeight:900, padding:'2px 8px', borderRadius:99 }}>{GRADE_LABEL[zoomTrade.cardGrade]}</span>
              </div>
              {zoomTrade.cardCondition != null && (
                <div style={{ position:'absolute', bottom:10, right:10, width:26, height:26, borderRadius:'50%', background:'#444', color:'white', fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid rgba(255,255,255,0.5)', zIndex:9 }}>
                  {zoomTrade.cardCondition}
                </div>
              )}
            </div>
            <div style={{ color:'white', fontSize:'0.8rem', marginTop:8, textAlign:'center', opacity:0.7 }}>
              {zoomTrade.cardCondition != null
                ? `컨디션 ${zoomTrade.cardCondition} · ${GRADE_LABEL[zoomTrade.cardGrade]}`
                : GRADE_LABEL[zoomTrade.cardGrade]}
            </div>
            <button className="zoom-close" onClick={() => setZoomTrade(null)}>닫기 ✕</button>
          </div>
        </div>
      )}

      {/* ── 판매하기 인스턴스 피커 ── */}
      {sellPicker && (
        <div className="card-zoom-overlay" onClick={() => setSellPicker(null)}>
          <div className="inst-sheet" onClick={e => e.stopPropagation()}>
            <div className="inst-sheet-title">
              {sellPicker.buyOrder.cardName} — 판매할 카드를 선택하세요
              <span className="inst-sheet-count">{sellPicker.instances.length}장 보유</span>
            </div>
            <div className="inst-list-wrap">
              <div className="inst-list">
                {sellPicker.instances.map((inst, i) => {
                  const lvl  = inst.enhanceLevel || 0;
                  const cond = inst.condition || 1;
                  const cc   = cond >= 9 ? '#d97706' : cond >= 6 ? '#7c3aed' : '#888';
                  return (
                    <div
                      key={inst.uid}
                      className="inst-item"
                      style={{ animationDelay: `${i * 50}ms` }}
                      onClick={() => handleSellToBuyer(sellPicker.buyOrder, inst)}
                    >
                      <div className="inst-item-img">
                        <img src={`/${sellPicker.buyOrder.cardImg}`} alt={sellPicker.buyOrder.cardName} />
                        {lvl > 0 && <div className="inst-item-badge">+{lvl}</div>}
                      </div>
                      <div className="inst-item-meta" style={{ color: cc }}>컨디션 {cond}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <button className="zoom-close" onClick={() => setSellPicker(null)}>닫기 ✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
