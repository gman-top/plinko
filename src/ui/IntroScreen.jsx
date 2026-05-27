import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../state/gameStore.js';
import * as Sounds from '../audio/sounds.js';

// Vite rewrites CSS url() to include the base path automatically, but
// JSX src="..." strings are passed through verbatim. So we have to
// prefix manually for the production build at /plinko/.
const B = import.meta.env.BASE_URL;
const A = (p) => `${B}${p.replace(/^\//, '')}`;

const SLIDES = [
  {
    id: 'play',
    title: 'HOW TO PLAY',
    desc: 'Pick LINES (8–16) and a RISK LEVEL. Set your BET, then hit PLAY to drop a comet through the star field. Wherever it lands, that slot’s multiplier × your bet is the payout.',
  },
  {
    id: 'features',
    title: 'THREE ACTIVATING SPIN FEATURES',
    desc: 'Toggle one — or all three — of the feature stars below the board. Each one adds a new way the field can pay out bigger. They stack.',
  },
  {
    id: 'mult',
    title: 'MULTIPLIERS',
    desc: 'Adds up to 3 multiplier stars to the field. Passing through them boosts the ball’s final multiplier — they compound on a single drop.',
  },
  {
    id: 'respin',
    title: 'RESPIN CHANCE',
    desc: 'Adds up to 4 vortex slots. Landing in one grants you an extra free ball — without paying the bet again.',
  },
  {
    id: 'multball',
    title: 'MULTIPLIER BALL CHANCE',
    desc: 'A chance to release a ball with a higher starting multiplier. Six colour tiers — the rarer the colour, the higher the boost.',
  },
];

export default function IntroScreen() {
  const phase = useGame(s => s.introPhase);
  const setPhase = useGame(s => s.setIntroPhase);
  const [progress, setProgress] = useState(0);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (phase !== 'loading') return;
    let raf;
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1400;
      const p = Math.min(1, t);
      setProgress(1 - Math.pow(1 - p, 2.5));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setPhase('howto'), 200);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, setPhase]);

  useEffect(() => { if (phase === 'howto') setSlide(0); }, [phase]);

  if (phase === 'done') return null;

  const start = () => {
    Sounds.playClick();
    Sounds.setEnabled(useGame.getState().soundOn);
    setPhase('done');
  };
  const N = SLIDES.length;
  const prev = () => { Sounds.playClick(); setSlide(s => (s + N - 1) % N); };
  const next = () => { Sounds.playClick(); setSlide(s => (s + 1) % N); };

  const cur = SLIDES[slide];

  return createPortal((
    <div className={`intro ${phase}`}>
      <div className="introBg" />
      <div className="introGlow" />

      {phase === 'loading' && (
        <div className="introLoad">
          <img className="loadLogo" src={A('assets/svg/logo-plinko.svg')} alt="PLINKO GONE WILD" />
          <div className="loadBar">
            <div className="loadFill" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
          </div>
          <div className="loadLbl">LOADING · {(progress * 100).toFixed(0)}%</div>
          <div className="loadFoot">
            <div className="aigoMark sm">
              <div className="aigoDot a" />
              <div className="aigoDot b" />
              <div className="aigoDot c" />
            </div>
            <div className="aigoName sm">AIGO<span>STUDIOS</span></div>
          </div>
        </div>
      )}

      {phase === 'howto' && (
        <>
          <button className="introArrow l" onClick={prev} aria-label="Previous" />
          <button className="introArrow r" onClick={next} aria-label="Next" />
          <button className="introClose" onClick={start} aria-label="Close">✕</button>

          <div className="howto">
            <div className="howtoTop">
              <img className="howtoLogo" src={A('assets/svg/logo-plinko.svg')} alt="PLINKO GONE WILD" />
              <div className="maxWinBadge">
                <div className="maxWinTop">MAX WIN</div>
                <div className="maxWinBig">10,000<span>X</span></div>
              </div>
              <div className="slideCount">
                {String(slide + 1).padStart(2, '0')}
                <span className="slideCountSep">/</span>
                {String(N).padStart(2, '0')}
              </div>
            </div>

            <div className="howtoStage" key={cur.id}>
              {cur.id === 'play'     && <SlideHowToPlay />}
              {cur.id === 'features' && <SlideFeatures />}
              {cur.id === 'mult'     && <SlideMultipliers />}
              {cur.id === 'respin'   && <SlideRespin />}
              {cur.id === 'multball' && <SlideMultBall />}
            </div>

            <div className="howtoText">
              <div className="howtoTitle">{cur.title}</div>
              <div className="howtoDesc">{cur.desc}</div>
            </div>

            <div className="howtoFooter">
              <div className="introDots">
                {SLIDES.map((_, i) => (
                  <span key={i}
                    className={`introDot${i === slide ? ' on' : ''}`}
                    onClick={() => { Sounds.playClick(); setSlide(i); }} />
                ))}
              </div>
              <button className="introStart" onClick={start}>
                <span>START PLAYING</span>
              </button>
              <div className="introFoot">
                <span className="dot" /> AIGOSTUDIOS.COM
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  ), document.body);
}

// =============================================================
// SLIDE 0 — HOW TO PLAY (basics)
// Uses the actual chip + PLAY button styling from the game so the
// tutorial reads as a screenshot, not an abstract icon set.
// =============================================================
function SlideHowToPlay() {
  return (
    <div className="slide playSlide">
      <div className="playStep">
        <div className="psHead">
          <div className="psN">1</div>
          <div className="psLbl">SET BET</div>
        </div>
        <div className="psBody">
          <div className="fakeCtrl">
            <span className="fakeCtrlArrow l" />
            <span className="fakeCtrlVal">2.00</span>
            <span className="fakeCtrlArrow r" />
          </div>
        </div>
        <div className="psHint">Choose how much to wager per drop</div>
      </div>

      <div className="psSep" />

      <div className="playStep">
        <div className="psHead">
          <div className="psN">2</div>
          <div className="psLbl">RISK + LINES</div>
        </div>
        <div className="psBody">
          <div className="fakeRiskRow">
            <img src={A('assets/svg/risk-flame.svg')} alt="" className="fakeRiskIc lo" />
            <img src={A('assets/svg/risk-multi.svg')} alt="" className="fakeRiskIc md" />
            <img src={A('assets/svg/risk-vortex.svg')} alt="" className="fakeRiskIc hi" />
          </div>
          <div className="fakeCtrl narrow">
            <span className="fakeCtrlArrow l" />
            <span className="fakeCtrlVal">12</span>
            <span className="fakeCtrlArrow r" />
          </div>
        </div>
        <div className="psHint">LOW · MEDIUM · HIGH · 8–16 lines</div>
      </div>

      <div className="psSep" />

      <div className="playStep">
        <div className="psHead">
          <div className="psN">3</div>
          <div className="psLbl">PRESS PLAY</div>
        </div>
        <div className="psBody">
          <div className="fakePlay">
            <div className="fakePlayDisc" />
            <div className="fakePlayText">PLAY</div>
          </div>
        </div>
        <div className="psHint">Watch the comet bounce to a slot</div>
      </div>
    </div>
  );
}

// =============================================================
// SLIDE 1 — Three triangle feature badges
// =============================================================
function SlideFeatures() {
  return (
    <div className="slide slideFeatures">
      <FeatureBadge label="MULTIPLIERS">
        <img src={A('assets/svg/risk-multi.svg')} alt="" />
      </FeatureBadge>
      <FeatureBadge big>
        <img src={A('assets/svg/risk-vortex.svg')} alt="" />
      </FeatureBadge>
      <FeatureBadge label="BALL CHANCE">
        <img src={A('assets/svg/risk-flame.svg')} alt="" />
      </FeatureBadge>
    </div>
  );
}
function FeatureBadge({ children, label, big }) {
  return (
    <div className={`featBadge${big ? ' big' : ''}`}>
      <svg className="featTri" viewBox="0 0 120 110" preserveAspectRatio="none">
        <defs>
          <linearGradient id="featTriG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFF6D8" />
            <stop offset="1" stopColor="#D4AF37" />
          </linearGradient>
        </defs>
        <polygon points="60,4 116,104 4,104"
          fill={big ? 'rgba(212,175,55,0.18)' : 'none'}
          stroke="url(#featTriG)"
          strokeWidth="2"
          strokeLinejoin="round" />
      </svg>
      <div className="featIcon">{children}</div>
      {label && <div className="featLbl">{label}</div>}
    </div>
  );
}

// =============================================================
// SLIDE 2 — Plinko board with multiplier stars
// Drawn to look like the actual cosmic peg field
// =============================================================
function SlideMultipliers() {
  const rows = 10;
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      pegs.push({ x: 50 + (c - r / 2) * 5.2, y: 10 + r * 6.4, row: r, col: c });
    }
  }
  const mults = [
    { row: 3, col: 1, label: '2x', color: '#FFE695' },
    { row: 5, col: 3, label: '3x', color: '#FF8C42' },
    { row: 7, col: 2, label: '5x', color: '#B946FF' },
  ];
  const isMult = (p) => mults.find(m => m.row === p.row && m.col === p.col);

  return (
    <div className="slide slideMini">
      <svg viewBox="0 0 100 80" preserveAspectRatio="xMidYMid meet" className="miniBoard">
        <defs>
          <radialGradient id="pegGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.4" stopColor="#FFE695" stopOpacity="0.8" />
            <stop offset="1" stopColor="#D4AF37" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Comet trail hint */}
        <path d="M50 0 Q 40 20, 50 40 T 30 70" fill="none"
          stroke="#FFE695" strokeWidth="0.4" strokeDasharray="1.5,1.5" opacity="0.45" />
        {pegs.map((p, i) => {
          const m = isMult(p);
          if (m) {
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="3.4" fill={m.color} opacity="0.25" />
                <circle cx={p.x} cy={p.y} r="2.2" fill={m.color} opacity="0.85" />
                <text x={p.x} y={p.y + 0.7} fill="#1A0F03" fontSize="1.7"
                  fontWeight="bold" textAnchor="middle" fontFamily="Audiowide, sans-serif"
                  dominantBaseline="middle">{m.label}</text>
              </g>
            );
          }
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="1.8" fill="url(#pegGlow)" opacity="0.5" />
              <circle cx={p.x} cy={p.y} r="0.7" fill="#FFE695" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// =============================================================
// SLIDE 3 — Dispenser + curved trajectory → vortex slot
// =============================================================
function SlideRespin() {
  const rows = 9;
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      pegs.push({ x: 50 + (c - r / 2) * 5.2, y: 22 + r * 5.4 });
    }
  }
  const slots = [];
  for (let i = 0; i < 10; i++) {
    slots.push({ x: 50 + (i - 4.5) * 5.2, y: 76, vortex: i === 7 });
  }

  return (
    <div className="slide slideMini">
      <svg viewBox="0 0 100 86" preserveAspectRatio="xMidYMid meet" className="miniBoard">
        <defs>
          <radialGradient id="rDisp" cx="0.5" cy="0.4" r="0.5">
            <stop offset="0" stopColor="#FFF6D8" />
            <stop offset="0.5" stopColor="#D4AF37" />
            <stop offset="1" stopColor="#5C3F08" />
          </radialGradient>
          <radialGradient id="rVortex" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFE695" />
            <stop offset="0.7" stopColor="#FF8C42" />
            <stop offset="1" stopColor="#7A1A04" />
          </radialGradient>
        </defs>

        {/* Dispenser bowl */}
        <circle cx="50" cy="10" r="7" fill="url(#rDisp)" stroke="#FFE695" strokeWidth="0.4" />
        {/* Balls inside */}
        {[
          ['#FFB347',49,9],['#FFE695',51,9.3],['#FF6B1A',50,11],
          ['#B946FF',48.5,10.7],['#4A9EFF',51.5,10.7],
        ].map((b, i) => (
          <circle key={i} cx={b[1]} cy={b[2]} r="1.1" fill={b[0]} opacity="0.95" />
        ))}

        {/* Trajectory hint */}
        <path d="M50 18 Q 38 38, 52 56 T 76 73" fill="none"
          stroke="#FFE695" strokeWidth="0.45" strokeDasharray="1.6,1.3" opacity="0.65" />

        {/* Pegs */}
        {pegs.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="1.4" fill="#FFE695" opacity="0.35" />
            <circle cx={p.x} cy={p.y} r="0.6" fill="#FFE695" />
          </g>
        ))}

        {/* Slot row */}
        {slots.map((s, i) => (
          <g key={i}>
            <rect x={s.x - 2.3} y={s.y - 2.3} width="4.6" height="4.6"
              rx="0.4"
              fill={s.vortex ? 'url(#rVortex)' : 'rgba(212,175,55,0.1)'}
              stroke={s.vortex ? '#FFE695' : 'rgba(212,175,55,0.4)'}
              strokeWidth={s.vortex ? '0.5' : '0.25'} />
            {s.vortex && (
              <>
                <circle cx={s.x} cy={s.y} r="1.5" fill="none" stroke="#FFE695" strokeWidth="0.35" />
                <circle cx={s.x} cy={s.y} r="0.7" fill="none" stroke="#FFE695" strokeWidth="0.3" />
                <text x={s.x} y={s.y + 0.4} fill="#1A0F03" fontSize="1.6" fontWeight="bold"
                  textAnchor="middle" dominantBaseline="middle" fontFamily="Audiowide, sans-serif">x2</text>
              </>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// =============================================================
// SLIDE 4 — Multiplier-ball ribbon + coloured balls on field
// =============================================================
function SlideMultBall() {
  const rows = 8;
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      pegs.push({ x: 50 + (c - r / 2) * 5.8, y: 24 + r * 6.4, row: r, col: c });
    }
  }
  const ribbon = [
    { c: '#FA7909',  hi: '#FFB347', label: '1x' },
    { c: '#2AB8FF',  hi: '#9BC8FF', label: '2x' },
    { c: '#E040A0',  hi: '#FFE695', label: '4x' },
    { c: '#3FCB7C',  hi: '#9CFFC1', label: '6x' },
    { c: '#B946FF',  hi: '#E6A6FF', label: '8x' },
    { c: '#FFE695',  hi: '#FFF6D8', label: '10x' },
  ];
  const placedBalls = [
    { row: 3, col: 1, c: '#FFE695', hi: '#FFF6D8' },
    { row: 4, col: 3, c: '#FF8C42', hi: '#FFB347' },
    { row: 6, col: 2, c: '#B946FF', hi: '#E6A6FF' },
  ];

  return (
    <div className="slide slideMini multBallSlide">
      <div className="multBallSide">
        {ribbon.map((b, i) => (
          <div key={i} className="ribChip">
            <span className="ribDot" style={{
              background: `radial-gradient(circle at 35% 30%, ${b.hi} 0%, ${b.c} 60%, rgba(0,0,0,0.4) 100%)`,
              boxShadow: `0 0 8px ${b.c}`,
            }} />
            <span className="ribLbl" style={{ color: b.hi }}>{b.label}</span>
          </div>
        ))}
      </div>

      <svg viewBox="0 0 100 86" preserveAspectRatio="xMidYMid meet" className="miniBoard">
        <defs>
          <radialGradient id="mbDisp" cx="0.5" cy="0.4" r="0.5">
            <stop offset="0" stopColor="#FFF6D8" />
            <stop offset="0.5" stopColor="#D4AF37" />
            <stop offset="1" stopColor="#5C3F08" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="11" r="7.5" fill="url(#mbDisp)" stroke="#FFE695" strokeWidth="0.5" />
        {[
          ['#FFB347',48,10],['#FFE695',51,10.4],['#FF6B1A',50,12.2],
          ['#B946FF',48,12.5],['#4A9EFF',52,11.6],
        ].map((b, i) => (
          <circle key={i} cx={b[1]} cy={b[2]} r="1.2" fill={b[0]} opacity="0.95" />
        ))}

        {pegs.map((p, i) => {
          const pb = placedBalls.find(b => b.row === p.row && b.col === p.col);
          if (pb) {
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="2.8" fill={pb.c} opacity="0.25" />
                <circle cx={p.x} cy={p.y} r="1.8" fill={pb.c} />
                <circle cx={p.x - 0.5} cy={p.y - 0.6} r="0.5" fill={pb.hi} />
              </g>
            );
          }
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="1.2" fill="#FFE695" opacity="0.35" />
              <circle cx={p.x} cy={p.y} r="0.55" fill="#FFE695" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
