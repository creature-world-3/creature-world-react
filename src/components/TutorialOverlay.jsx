import { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config.js';

const STEPS = [
  {
    target: '[data-tut="gacha"]',
    text: '안녕! 나는 루미야. 크리처 월드에 온 걸 환영해! 먼저 카드를 뽑아볼까?',
  },
  {
    target: '[data-tut="tickets"]',
    text: '뽑기권으로 카드를 뽑을 수 있어. 매일 접속하면 뽑기권을 받을 수 있어!',
  },
  {
    target: '[data-tut="synth"]',
    text: '카드를 합성하고 강화해서 더 강하게 만들 수 있어!',
  },
  {
    target: '[data-tut="dungeon"]',
    text: '던전에서 카드를 성장시키고 뽑기권을 파밍할 수 있어!',
  },
  {
    target: '[data-tut="raid"]',
    text: '다른 플레이어들과 함께 레이드 보스에 도전해봐!',
  },
  {
    target: null,
    text: '자 이제 시작해볼까? 파이팅!',
    isReward: true,
  },
];

const PAD = 14;

async function markCompleted(user) {
  if (!user) return;
  try {
    await updateDoc(doc(db, 'users', user.uid), { tutorialCompleted: true });
  } catch (e) {
    console.error('[tutorial] save failed:', e);
  }
}

export default function TutorialOverlay({ user, onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  const updateRect = useCallback(() => {
    if (!current.target) { setRect(null); return; }
    const el = document.querySelector(current.target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 });
  }, [current.target]);

  useEffect(() => {
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, [updateRect]);

  const handleNext = () => {
    if (isLast) {
      markCompleted(user);
      onComplete(); // +50 tickets
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    markCompleted(user);
    onSkip();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }}>
      {/* 스포트라이트 오버레이 */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
        onClick={handleNext}
      >
        <defs>
          <mask id="tut-spotlight">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect x={rect.left} y={rect.top} width={rect.w} height={rect.h} rx={16} fill="black" />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.88)" mask="url(#tut-spotlight)" />
        {rect && (
          <rect
            x={rect.left} y={rect.top} width={rect.w} height={rect.h} rx={16}
            fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2.5}
            style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.4))' }}
          />
        )}
      </svg>

      {/* 말풍선 영역 */}
      <div
        style={{ position: 'absolute', bottom: 28, left: 16, right: 16, zIndex: 9001 }}
        onClick={e => e.stopPropagation()}
      >
        {/* 루미 이미지 */}
        <div style={{ paddingLeft: 10, marginBottom: -18, display: 'flex', alignItems: 'flex-end' }}>
          <img
            src="/튜토리얼여우.png"
            alt="루미"
            style={{ width: 88, height: 88, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }}
          />
        </div>

        {/* 말풍선 */}
        <div style={{ background: 'white', borderRadius: 22, padding: '18px 20px 16px', boxShadow: '0 8px 36px rgba(0,0,0,0.28)' }}>

          {/* 발신자 이름 */}
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f97316', marginBottom: 6, letterSpacing: '0.02em' }}>
            루미
          </div>

          {/* 대사 */}
          <div style={{ fontSize: '0.92rem', color: '#222', lineHeight: 1.7, marginBottom: 14, minHeight: 44 }}>
            {current.text}
          </div>

          {/* 보상 안내 (마지막 스텝) */}
          {current.isReward && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #fff7ed, #fef3c7)',
              border: '1.5px solid #fcd34d',
              borderRadius: 12, padding: '10px 14px', marginBottom: 14,
            }}>
              <span style={{ fontSize: '1.3rem' }}>🎁</span>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#d97706' }}>튜토리얼 완료 보상</div>
                <div style={{ fontSize: '0.78rem', color: '#92400e' }}>뽑기권 50장 지급!</div>
              </div>
            </div>
          )}

          {/* 진행 도트 */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: 14 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 22 : 6, height: 6, borderRadius: 3,
                background: i === step ? '#f97316' : '#e5e7eb',
                transition: 'all 0.25s',
              }} />
            ))}
          </div>

          {/* 버튼 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSkip} className="tut-btn-cancel">건너뛰기</button>
            <button onClick={handleNext} className="tut-btn-ok" style={{ flex: 2 }}>
              {isLast ? '시작하기! 🎉' : '다음 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
