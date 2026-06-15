import { useEffect, useState } from 'react';

const BUTTONS = [
  { id: 'gacha',   img: '/home/뽑기도감탭.png', big: false, side: 'left',  offset: '6%'  },
  { id: 'synth',   img: '/home/공방탭.png',     big: false, side: 'right', offset: '4%'  },
  { id: 'dungeon', img: '/home/던전탭.png',     big: true,  side: 'left',  offset: '20%' },
  { id: 'bag',     img: '/home/가방탭.png',     big: false, side: 'right', offset: '10%' },
  { id: 'raid',    img: '/home/레이드탭.png',   big: true,  side: 'left',  offset: '5%'  },
  { id: 'more',    img: '/home/더보기탭.png',   big: false, side: 'right', offset: '8%'  },
];

export default function HomeScreen({ phase, onSplashTouch, onNavigate }) {
  const [btnsActive, setBtnsActive] = useState(false);

  useEffect(() => {
    if (phase === 'home') {
      const id = requestAnimationFrame(() => setBtnsActive(true));
      return () => cancelAnimationFrame(id);
    }
    setBtnsActive(false);
  }, [phase]);

  return (
    <div className="home-wrap">
      <img src="/home/메인홈.png" className="home-bg-img" alt="" />

      {phase === 'splash' && (
        <div className="splash-overlay" onClick={onSplashTouch}>
          <img src="/home/크리처월드로고.png" className="splash-logo" alt="크리처 월드" />
          <span className="splash-touch-text">Touch to Play</span>
        </div>
      )}

      {phase === 'home' && (
        <div className="home-btns-wrap">
          {BUTTONS.map((btn, i) => (
            <button
              key={btn.id}
              className={`home-btn home-btn-${btn.side}${btn.big ? ' home-btn-big' : ' home-btn-normal'}${btnsActive ? ' home-btn-active' : ''}`}
              style={{
                '--hb-delay': `${i * 0.075}s`,
                [btn.side === 'left' ? 'marginLeft' : 'marginRight']: btn.offset,
              }}
              onClick={() => onNavigate(btn.id)}
            >
              <img src={btn.img} alt="" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
