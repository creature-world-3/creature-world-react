import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, deleteDoc, updateDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy, getDoc,
  runTransaction, increment,
} from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS } from '../../data/cards.js';

const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND', raid: 'RAID' };
const GRADE_COLOR = { n: '#888', r: '#4a9eff', sr: '#c084fc', ur: '#fbbf24', lg: '#ff6b6b', raid: '#ffd700' };
const MAX_MY_LISTINGS = 3;

let _tradeUid = 0;
const genCardUid = () => `t_${++_tradeUid}_${Date.now()}`;

export default function TradeTab({ gs, setGs, user }) {
  const [trades, setTrades]           = useState([]);
  const [gradeFilter, setGradeFilter]         = useState('all');
  const [formGradeFilter, setFormGradeFilter] = useState('all');
  const [showForm, setShowForm]               = useState(false);
  const [selectedCard, setSelectedCard]       = useState(null);
  const [price, setPrice]             = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [toast, setToast]             = useState(null);
  const [zoomTrade, setZoomTrade]     = useState(null);
  const toastRef = useRef(null);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // 내 활성 등록 수
  const myActive = trades.filter(t => t.uid === user?.uid && t.status === 'active');

  // 보상 수령 대상 (내가 판 카드 중 미수령)
  const pendingRewards = trades.filter(t => t.uid === user?.uid && t.status === 'sold' && !t.claimed);
  const pendingTotal   = pendingRewards.reduce((s, t) => s + t.price, 0);

  // 보유 카드 옵션 (개별 인스턴스 — uid 기준, 레이드 잠금 카드 제외)
  const lockedUid = gs?.raidCard?.uid;
  const ownedOptions = (gs?.ownedCards || [])
    .filter(oc => oc.uid !== lockedUid)
    .map(oc => {
      const card = CARDS.find(c => c.id === oc.id);
      return card ? { uid: oc.uid, condition: oc.condition, ...card } : null;
    }).filter(Boolean);

  // 전체 목록 필터 (active, 내 카드 제외)
  const filtered = trades.filter(t =>
    t.status === 'active' &&
    t.uid !== user?.uid &&
    (gradeFilter === 'all' || t.cardGrade === gradeFilter)
  );

  // ── 등록 ──
  const handleRegister = async () => {
    if (!selectedCard || !price || submitting) return;
    const priceNum = Math.max(1, parseInt(price) || 0);
    if (myActive.length >= MAX_MY_LISTINGS) {
      showToast(`최대 ${MAX_MY_LISTINGS}장까지 등록할 수 있어요`); return;
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
      showToast('카드가 등록됐어요! 🎉');
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
      const tradeRef  = doc(db, 'trades', trade.id);
      const buyerRef  = doc(db, 'users', user.uid);
      const sellerRef = doc(db, 'users', trade.uid);
      await runTransaction(db, async (t) => {
        const [tradeSnap, buyerSnap] = await Promise.all([t.get(tradeRef), t.get(buyerRef)]);
        if (!tradeSnap.exists() || tradeSnap.data().status !== 'active') throw new Error('already_sold');
        const buyerTickets = buyerSnap.data()?.tickets ?? 0;
        if (buyerTickets < trade.price) throw new Error('insufficient');
        const prevCards = buyerSnap.data()?.ownedCards ?? [];
        t.update(tradeRef,  { status: 'sold', soldAt: serverTimestamp(), claimed: true });
        t.update(buyerRef,  {
          tickets:    buyerTickets - trade.price,
          ownedCards: [...prevCards, { uid: newCardUid, id: trade.cardId, condition: trade.cardCondition }],
        });
        t.update(sellerRef, { tickets: increment(trade.price) });
      });
      setGs(prev => ({
        ...prev,
        tickets:    prev.tickets - trade.price,
        ownedCards: [...prev.ownedCards, { uid: newCardUid, id: trade.cardId, condition: trade.cardCondition }],
      }));
      showToast(`${trade.cardName} (${GRADE_LABEL[trade.cardGrade]}) 구매 완료! 🎉`);
    } catch (e) {
      if (e.message === 'already_sold') showToast('이미 판매된 카드예요!');
      else if (e.message === 'insufficient') showToast('뽑기권이 부족해요!');
      else { console.error(e); showToast('구매 중 오류가 발생했어요'); }
    }
    setSubmitting(false);
  };

  // ── 취소 ──
  const handleCancel = async (trade) => {
    try {
      await deleteDoc(doc(db, 'trades', trade.id));
      setGs(prev => ({
        ...prev,
        ownedCards: [...prev.ownedCards, { uid: trade.cardUid, id: trade.cardId, condition: trade.cardCondition }],
      }));
      showToast('등록이 취소됐어요. 카드가 돌아왔어요!');
    } catch (e) {
      console.error(e);
    }
  };

  // ── 보상 수령 ──
  const handleClaimRewards = async () => {
    if (!pendingRewards.length) return;
    try {
      await Promise.all(pendingRewards.map(t => updateDoc(doc(db, 'trades', t.id), { claimed: true })));
      setGs(prev => ({ ...prev, tickets: prev.tickets + pendingTotal }));
      showToast(`보상 수령 완료! +${pendingTotal}장 🎟️`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="trade-wrap">
      {toast && <div className="cw-toast">{toast}</div>}

      {/* ── 헤더 ── */}
      <div className="trade-header">
        <div className="col-title">거래소</div>
        <div className="trade-header-right">
          {pendingTotal > 0 && (
            <button className="trade-reward-btn" onClick={handleClaimRewards}>
              보상 수령 +{pendingTotal}장 🎟️
            </button>
          )}
          <button
            className={`trade-register-btn${showForm ? ' active' : ''}`}
            onClick={() => setShowForm(f => !f)}
            disabled={myActive.length >= MAX_MY_LISTINGS && !showForm}
            title={myActive.length >= MAX_MY_LISTINGS ? `최대 ${MAX_MY_LISTINGS}장까지 등록 가능` : ''}
          >
            {showForm ? '✕ 닫기' : `+ 카드 등록 (${myActive.length}/${MAX_MY_LISTINGS})`}
          </button>
        </div>
      </div>

      {/* ── 등록 폼 ── */}
      {showForm && (
        <div className="trade-form">
          <div className="trade-form-title">등록할 카드 선택</div>
          {ownedOptions.length === 0 ? (
            <p className="trade-form-empty">보유한 카드가 없어요. 뽑기를 먼저 해보세요!</p>
          ) : (
            <>
              {/* 등급 필터 */}
              <div className="trade-form-filter">
                {[['all','전체'],['n','N'],['r','R'],['sr','SR'],['ur','UR'],['lg','LG']].map(([val, label]) => (
                  <button
                    key={val}
                    className={`col-filter-pill${formGradeFilter === val ? ' active' : ''}`}
                    style={val !== 'all' ? { color: formGradeFilter === val ? 'white' : GRADE_COLOR[val] } : {}}
                    onClick={() => { setFormGradeFilter(val); setSelectedCard(null); }}
                  >{label}</button>
                ))}
              </div>
              <div className="trade-card-list">
                {(formGradeFilter === 'all' ? ownedOptions : ownedOptions.filter(c => c.grade === formGradeFilter))
                  .map(card => (
                  <div key={card.uid} className="trade-card-thumb-wrap">
                    <div
                      className={`trade-card-thumb grade-${card.grade}${selectedCard?.uid === card.uid ? ' selected' : ''}`}
                      onClick={() => setSelectedCard(selectedCard?.uid === card.uid ? null : card)}
                    >
                      <img src={`/${card.img}`} alt={card.name} />
                      <div className="trade-card-cond">{card.condition}</div>
                    </div>
                    <div className="trade-card-tooltip">
                      {card.name} · {GRADE_LABEL[card.grade]}
                    </div>
                  </div>
                ))}
                {(formGradeFilter !== 'all' && ownedOptions.filter(c => c.grade === formGradeFilter).length === 0) && (
                  <p className="trade-form-empty">해당 등급 카드가 없어요</p>
                )}
              </div>

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
                      <div className="trade-selected-cond">컨디션 {selectedCard.condition}</div>
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

      {/* ── 내 등록 카드 ── */}
      {myActive.length > 0 && (
        <div className="trade-my-section">
          <div className="trade-section-label">내 등록 카드</div>
          <div className="trade-list">
            {myActive.map(trade => (
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
                  <div className="trade-item-price">🎟️ {trade.price}장</div>
                </div>
                <button className="trade-cancel-btn" onClick={() => handleCancel(trade)}>취소</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 등급 필터 ── */}
      <div className="col-filter-row">
        {[['all','전체'], ['n','N'], ['r','R'], ['sr','SR'], ['ur','UR'], ['lg','LG']].map(([val, label]) => (
          <button
            key={val}
            className={`col-filter-pill${gradeFilter === val ? ' active' : ''}`}
            style={val !== 'all' ? { color: gradeFilter === val ? 'white' : GRADE_COLOR[val] } : {}}
            onClick={() => setGradeFilter(val)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 거래 목록 ── */}
      <div className="trade-list">
        {filtered.length === 0 ? (
          <div className="trade-empty">
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔄</div>
            등록된 카드가 없어요
          </div>
        ) : filtered.map(trade => (
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
                {trade.sellerPhotoURL && (
                  <img src={trade.sellerPhotoURL} className="trade-seller-avatar" referrerPolicy="no-referrer" alt="" />
                )}
                <span>{trade.sellerName}</span>
              </div>
              <div className="trade-item-price">🎟️ {trade.price}장</div>
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
              <div style={{ position:'absolute', bottom:10, right:10, width:26, height:26, borderRadius:'50%', background:'#444', color:'white', fontFamily:'Nunito,sans-serif', fontWeight:900, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid rgba(255,255,255,0.5)', zIndex:9 }}>
                {zoomTrade.cardCondition}
              </div>
            </div>
            <div style={{ color:'white', fontSize:'0.8rem', marginTop:8, textAlign:'center', opacity:0.7 }}>
              컨디션 {zoomTrade.cardCondition} · {GRADE_LABEL[zoomTrade.cardGrade]}
            </div>
            <button className="zoom-close" onClick={() => setZoomTrade(null)}>닫기 ✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
