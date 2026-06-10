import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS } from '../../data/cards.js';

let _mUid = 0;
const genUid = () => `mail_${++_mUid}_${Date.now()}`;

function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function MailboxTab({ gs, setGs, user }) {
  const [mails,       setMails]       = useState([]);
  const [claiming,    setClaiming]    = useState({});
  const [claimingAll, setClaimingAll] = useState(false);
  const [toast,       setToast]       = useState(null);
  const toastRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'mailbox'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q,
      snap => setMails(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('mailbox tab snapshot:', err),
    );
    return unsub;
  }, [user]);

  const showToast = (msg) => {
    clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  const isClaimed = (mailId) => !!(gs.claimedMails?.[mailId]);

  const applyReward = (prev, mail) => {
    const next = {
      ...prev,
      claimedMails: { ...(prev.claimedMails || {}), [mail.id]: true },
    };
    const r = mail.reward;
    if (r?.type === 'tickets') {
      next.tickets = (prev.tickets || 0) + (r.amount || 0);
    } else if (r?.type === 'card') {
      const cardId  = r.cardData?.id || r.cardId;
      const cond    = r.cardData?.condition ?? r.condition ?? 5;
      const enh     = r.cardData?.enhanceLevel ?? r.enhanceLevel ?? 0;
      const cardDef = CARDS.find(c => c.id === cardId);
      if (cardDef) {
        next.ownedCards = [...(prev.ownedCards || []), { uid: genUid(), id: cardId, condition: cond, enhanceLevel: enh }];
      }
    } else if (r?.type === 'enhanceStone') {
      const grade  = r.grade;
      const amount = r.amount || 1;
      next.enhanceStones = {
        ...(prev.enhanceStones || {}),
        [grade]: (prev.enhanceStones?.[grade] || 0) + amount,
      };
    }
    return next;
  };

  const handleClaim = async (mail) => {
    if (!user || claimingAll || claiming[mail.id] || isClaimed(mail.id)) return;
    setClaiming(prev => ({ ...prev, [mail.id]: true }));
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        [`claimedMails.${mail.id}`]: true,
      });
      setGs(prev => {
        const next = applyReward(prev, mail);
        const r = mail.reward;
        if (r?.type === 'tickets') {
          showToast(`뽑기권 ${r.amount}장 수령 완료!`);
        } else if (r?.type === 'card') {
          const cardId  = r.cardData?.id || r.cardId;
          const cardDef = CARDS.find(c => c.id === cardId);
          showToast(cardDef ? `${cardDef.name} 카드 수령 완료!` : '우편을 수령했습니다!');
        } else if (r?.type === 'enhanceStone') {
          const gl = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND' }[r.grade] || (r.grade || '').toUpperCase();
          showToast(`${gl} 성장석 ${r.amount || 1}개 수령 완료!`);
        } else {
          showToast('우편을 수령했습니다!');
        }
        return next;
      });
    } catch (e) {
      console.error('mail claim error:', e);
      showToast('오류가 발생했어요. 다시 시도해주세요.');
    } finally {
      setClaiming(prev => ({ ...prev, [mail.id]: false }));
    }
  };

  const handleClaimAll = async () => {
    if (!user || claimingAll) return;
    const unclaimed = visibleMails.filter(m => !isClaimed(m.id));
    if (!unclaimed.length) return;
    setClaimingAll(true);
    try {
      const claimUpdates = {};
      for (const m of unclaimed) {
        claimUpdates[`claimedMails.${m.id}`] = true;
      }
      await updateDoc(doc(db, 'users', user.uid), claimUpdates);

      setGs(prev => {
        let next = { ...prev };
        for (const m of unclaimed) {
          next = applyReward(next, m);
        }
        return next;
      });
      showToast(`우편 ${unclaimed.length}개 모두 수령 완료!`);
    } catch (e) {
      console.error('claim all error:', e);
      showToast('오류가 발생했어요. 다시 시도해주세요.');
    } finally {
      setClaimingAll(false);
    }
  };

  const visibleMails = mails.filter(m => !m.targetUid || m.targetUid === user?.uid);
  const unclaimedMails = visibleMails.filter(m => !isClaimed(m.id));
  const sorted = [...unclaimedMails].sort((a, b) => {
    const aT = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const bT = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return bT - aT;
  });

  const rewardLabel = (r) => {
    if (!r) return null;
    if (r.type === 'tickets') return `뽑기권 ${r.amount}장`;
    if (r.type === 'card') {
      const cardId  = r.cardData?.id || r.cardId;
      const cardDef = CARDS.find(c => c.id === cardId);
      return cardDef ? `${cardDef.name} 카드` : '카드';
    }
    if (r.type === 'enhanceStone') {
      const gl = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND' }[r.grade] || (r.grade || '').toUpperCase();
      return `${gl} 성장석 ${r.amount || 1}개`;
    }
    return null;
  };

  return (
    <div className="mailbox-wrap">
      {toast && <div className="cw-toast">{toast}</div>}
      <div className="mailbox-header">
        <div className="mailbox-header-row">
          <div>
            <div className="mailbox-title">우편함</div>
            <div className="mailbox-subtitle">
              {sorted.length > 0
                ? `미수령 우편 ${sorted.length}개`
                : '모든 우편을 수령했어요'}
            </div>
          </div>
          {sorted.length > 0 && (
            <button
              className="mailbox-claim-all-btn"
              onClick={handleClaimAll}
              disabled={claimingAll}
            >
              {claimingAll ? '수령 중...' : '모두 받기'}
            </button>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="mailbox-empty">받은 우편이 없어요.</div>
      ) : (
        <div className="mailbox-list">
          {sorted.map(mail => {
            const rLabel = rewardLabel(mail.reward);
            return (
              <div
                key={mail.id}
                className="mailbox-item mailbox-unclaimed"
                onClick={() => handleClaim(mail)}
              >
                <span className="mailbox-new-badge">NEW</span>
                <div className="mailbox-item-inner">
                  <div className="mailbox-item-top">
                    <div className="mailbox-item-title">{mail.title}</div>
                    <div className="mailbox-item-date">{formatDate(mail.createdAt)}</div>
                  </div>
                  <div className="mailbox-item-message">{mail.message}</div>
                  {rLabel && (
                    <div className="mailbox-reward-row">
                      <span className="mailbox-reward-icon">🎁</span>
                      <span className="mailbox-reward-label">{rLabel}</span>
                    </div>
                  )}
                  <div className="mailbox-claim-btn">
                    {claiming[mail.id] ? '수령 중...' : '수령하기'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
