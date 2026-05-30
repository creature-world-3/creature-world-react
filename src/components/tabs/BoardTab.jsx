import { useState, useEffect } from 'react';
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { CARDS } from '../../data/cards.js';

const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND' };
const GRADE_BG    = { n: 'rgba(80,80,80,0.9)', r: '#1a3a6a', sr: '#2d1b4e', ur: '#3a2800', lg: 'linear-gradient(90deg,#ff6b6b,#4d96ff,#c77dff)' };
const GRADE_COLOR = { n: '#ccc', r: '#7eb8ff', sr: '#d4a8ff', ur: '#ffd97a', lg: '#fff' };
const MAX_TEXT = 50;

function condStyle(grade, cond) {
  if (grade === 'lg') return 'gold';
  if (grade === 'ur') return 'holo';
  if (cond >= 9) return 'gold';
  if (cond >= 6) return 'holo';
  return 'normal';
}

function timeAgo(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (sec < 60)    return '방금 전';
  if (sec < 3600)  return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
}

function CardBack({ small }) {
  return (
    <div className="comm-card-back">
      <span className={`comm-card-back-logo${small ? ' comm-card-back-logo-sm' : ''}`}>
        CREATURE<br />WORLD
      </span>
    </div>
  );
}

export default function BoardTab({ gs, user }) {
  const [posts, setPosts]               = useState([]);
  const [showForm, setShowForm]         = useState(false);
  const [text, setText]                 = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [detailPost, setDetailPost]     = useState(null);
  const [nicknames, setNicknames]       = useState({});

  // 보유 카드 (중복 제거) + 각 카드 타입의 최고 컨디션 포함
  const ownedCards = CARDS.filter(
    c => (gs?.ownedCards || []).some(o => o.id === c.id)
  ).filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
  .map(c => {
    const instances = (gs?.ownedCards || []).filter(o => o.id === c.id);
    const best = instances.reduce((a, b) => b.condition > a.condition ? b : a, instances[0]);
    return { ...c, bestCondition: best?.condition ?? null };
  });

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // 게시글 작성자 uid → Firestore nickname 캐시
  useEffect(() => {
    if (!posts.length) return;
    const missing = [...new Set(posts.map(p => p.uid).filter(Boolean))]
      .filter(uid => nicknames[uid] === undefined);
    if (!missing.length) return;
    Promise.all(
      missing.map(uid =>
        getDoc(doc(db, 'users', uid))
          .then(snap => [uid, snap.data()?.nickname ?? null])
          .catch(() => [uid, null])
      )
    ).then(pairs => {
      setNicknames(prev => {
        const next = { ...prev };
        pairs.forEach(([uid, name]) => { next[uid] = name; });
        return next;
      });
    });
  }, [posts.map(p => p.uid).join(',')]);

  const handleSubmit = async () => {
    if (!text.trim() || !user || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'posts'), {
        uid:       user.uid,
        author:    gs.nickname || user.displayName,
        photoURL:  user.photoURL || null,
        text:      text.trim(),
        createdAt: serverTimestamp(),
        ...(selectedCard ? {
          cardId:        selectedCard.id,
          cardImg:       selectedCard.img,
          cardName:      selectedCard.name,
          cardGrade:     selectedCard.grade,
          cardCondition: selectedCard.bestCondition,
        } : {}),
      });
      setText('');
      setSelectedCard(null);
      setShowForm(false);
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  const handleDelete = async (postId) => {
    await deleteDoc(doc(db, 'posts', postId)).catch(console.error);
    setDetailPost(null);
  };

  // 상세 모달용 shimmer
  const detailCs = detailPost?.cardImg
    ? condStyle(detailPost.cardGrade, detailPost.cardCondition)
    : null;

  return (
    <div className="board-wrap">

      {/* ── 헤더 ── */}
      <div className="board-header">
        <div className="col-title">게시판</div>
        <button
          className={`board-write-btn${showForm ? ' active' : ''}`}
          onClick={() => setShowForm(f => !f)}
        >
          {showForm ? '✕ 닫기' : '+ 글쓰기'}
        </button>
      </div>

      {/* ── 글쓰기 폼 ── */}
      {showForm && (
        <div className="board-form">
          {ownedCards.length > 0 && (
            <div className="board-card-select">
              <div className="board-card-select-label">자랑할 카드 선택 (선택 안 해도 됨)</div>
              <div className="post-card-grid">
                {ownedCards.map(card => (
                  <div
                    key={card.id}
                    className={`post-card-item grade-${card.grade}${selectedCard?.id === card.id ? ' selected' : ''}`}
                    onClick={() => setSelectedCard(selectedCard?.id === card.id ? null : card)}
                    title={card.name}
                  >
                    <img src={`/${card.img}`} alt={card.name} />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="board-text-wrap">
            <textarea
              className="board-textarea"
              placeholder="한마디 남기기! (최대 50자)"
              value={text}
              onChange={e => setText(e.target.value.slice(0, MAX_TEXT))}
              rows={3}
            />
            <div className={`board-char-count${text.length >= MAX_TEXT ? ' over' : ''}`}>
              {text.length} / {MAX_TEXT}
            </div>
          </div>
          <button
            className="board-submit-btn"
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
          >
            {submitting ? '올리는 중...' : '올리기'}
          </button>
        </div>
      )}

      {/* ── 글 목록 (5열 그리드) ── */}
      <div className="community-list">
        {posts.length === 0 ? (
          <div className="comm-empty">아직 글이 없어요! 첫 번째로 글을 남겨봐요 ✍️</div>
        ) : posts.map(post => {
          const cs = post.cardImg
            ? condStyle(post.cardGrade, post.cardCondition)
            : null;
          return (
            <div key={post.id} className="comm-post" onClick={() => setDetailPost(post)}>
              {post.cardImg ? (
                <div className="comm-post-card">
                  <img src={`/${post.cardImg}`} alt={post.cardName} />
                  {cs === 'gold' && <div className="cond-gold-overlay" />}
                  {cs === 'holo' && <div className="cond-holo-overlay" />}
                  {post.cardCondition != null && (
                    <div className="comm-post-cond">{post.cardCondition}</div>
                  )}
                </div>
              ) : (
                <div className="comm-post-card comm-post-card-empty">
                  <CardBack small />
                </div>
              )}
              <div className="comm-post-body">
                {post.cardGrade && (
                  <span
                    className="comm-post-grade"
                    style={{ background: GRADE_BG[post.cardGrade], color: GRADE_COLOR[post.cardGrade] }}
                  >
                    {GRADE_LABEL[post.cardGrade]}
                  </span>
                )}
                <div className="comm-post-nickname">{nicknames[post.uid] || post.author || post.nickname}</div>
                <div className="comm-post-text">{post.text}</div>
                <div className="comm-post-time">{timeAgo(post.createdAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 상세 모달 ── */}
      {detailPost && (
        <div className="card-zoom-overlay" onClick={() => setDetailPost(null)}>
          <div className="post-modal-wrap" onClick={e => e.stopPropagation()}>
            <div className="post-detail-card-wrap">
              {detailPost.cardImg ? (
                <>
                  <img src={`/${detailPost.cardImg}`} alt={detailPost.cardName} />
                  {detailCs === 'gold' && <div className="cond-gold-overlay" />}
                  {detailCs === 'holo' && <div className="cond-holo-overlay" />}
                </>
              ) : (
                <CardBack />
              )}
            </div>
            {detailPost.cardGrade && (
              <div style={{ textAlign: 'center', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span
                  className="comm-post-grade"
                  style={{
                    background: GRADE_BG[detailPost.cardGrade],
                    color: GRADE_COLOR[detailPost.cardGrade],
                    fontSize: '0.78rem',
                    padding: '3px 10px',
                  }}
                >
                  {GRADE_LABEL[detailPost.cardGrade]}
                </span>
                {detailPost.cardCondition != null && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>
                    컨디션 {detailPost.cardCondition}
                  </span>
                )}
              </div>
            )}
            <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 8 }}>
              {(detailPost.uid ? nicknames[detailPost.uid] : null) || detailPost.author || detailPost.nickname}
            </div>
            <div style={{ fontSize: '0.88rem', color: '#444', lineHeight: 1.6, marginBottom: 10, wordBreak: 'break-all' }}>
              {detailPost.text}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 16 }}>
              {timeAgo(detailPost.createdAt)}
            </div>
            {detailPost.uid === user?.uid && (
              <button className="board-delete-modal-btn" onClick={() => handleDelete(detailPost.id)}>
                삭제하기
              </button>
            )}
            <button className="modal-close" onClick={() => setDetailPost(null)}>닫기</button>
          </div>
        </div>
      )}

    </div>
  );
}
