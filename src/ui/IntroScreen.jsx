import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../state/gameStore.js';
import * as Sounds from '../audio/sounds.js';

// Vite rewrites CSS url() to include the base path automatically, but
// JSX src="..." strings are passed through verbatim. So we have to
// prefix manually for the production build at /plinko/.
const B = import.meta.env.BASE_URL;
const ASSET = (p) => `${B}${p.replace(/^\//, '')}`;

const SLIDES = [
  {
    id: 'play',
    title: 'HOW TO PLAY',
    desc: 'Pick LINES (8–16), RISK LEVEL, and your BET. Hit PLAY to drop a cosmic comet through the star field — wherever it lands, that slot’s multiplier × your bet is your payout.',
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
    desc: 'A chance to release a ball with a higher starting multiplier. Six tiers from gold to wild — the rarer the colour, the higher the boost.',
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

  // Reset slide to first whenever the howto phase re-opens
  useEffect(() => {
    if (phase === 'howto') setSlide(0);
  }, [phase]);

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
          <img className="loadLogo" src={ASSET('assets/svg/logo-plinko.svg')} alt="PLINKO GONE WILD" />
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
          {/* Edge-positioned carousel arrows */}
          <button className="introArrow l" onClick={prev} aria-label="Previous" />
          <button className="introArrow r" onClick={next} aria-label="Next" />
          {/* Close button — players who re-open from INFO need a way out */}
          <button className="introClose" onClick={start} aria-label="Close">✕</button>

          <div className="howto">
            <div className="howtoHeader">
              <div className="slideCount">
                {String(slide + 1).padStart(2, '0')}
                <span className="slideCountSep">/</span>
                {String(N).padStart(2, '0')}
              </div>
              <div className="howtoLogoWrap">
                <img className="howtoLogo" src={ASSET('assets/svg/logo-plinko.svg')} alt="PLINKO GONE WILD" />
              </div>
              <div className="maxWinBadge">
                <div className="maxWinTop">MAX WIN</div>
                <div className="maxWinBig">10,000<span>X</span></div>
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
// Three-step diagram: BET → RISK / LINES → PLAY
// =============================================================
function SlideHowToPlay() {
  return (
    <div className="slide slideSteps">
      <Step n="1" title="SET BET" hint="Choose how much to wager">
        <div className="stepCoin" />
      </Step>
      <StepDivider />
      <Step n="2" title="PICK RISK + LINES" hint="LOW · MED · HIGH · 8-16">
        <div className="stepDials">
          <span className="stepDial g" />
          <span className="stepDial a" />
          <span className="stepDial r" />
        </div>
      </Step>
      <StepDivider />
      <Step n="3" title="PRESS PLAY" hint="Drop the comet">
        <div className="stepPlay">PLAY</div>
      </Step>
    </div>
  );
}
function Step({ n, title, hint, children }) {
  return (
    <div className="step">
      <div className="stepHead">
        <div className="stepN">{n}</div>
        <div className="stepArt">{children}</div>
      </div>
      <div className="stepTitle">{title}</div>
      <div className="stepHint">{hint}</div>
    </div>
  );
}
function StepDivider() {
  return <div className="stepDiv" />;
}

// =============================================================
// SLIDE 1 — Three triangle feature badges
// =============================================================
function SlideFeatures() {
  return (
    <div className="slide slideFeatures">
      <FeatureBadge label="MULTIPLIERS">
        <img src={ASSET('assets/svg/risk-multi.svg')} alt="" />
      </FeatureBadge>
      <FeatureBadge big>
        <img src={ASSET('assets/svg/risk-vortex.svg')} alt="" />
      </FeatureBadge>
      <FeatureBadge label="BALL CHANCE">
        <img src={ASSET('assets/svg/risk-flame.svg')} alt="" />
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
// SLIDE 2 — Plinko triangle with multiplier stars highlighted
// =============================================================
function SlideMultipliers() {
  const rows = 8;
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      pegs.push({ x: 50 + (c - r / 2) * 6.2, y: 12 + r * 7.5, row: r, col: c });
    }
  }
  const mults = [
    { row: 3, col: 1, label: '2x', color: '#FFE695' },
    { row: 5, col: 2, label: '3x', color: '#FF8C42' },
    { row: 6, col: 5, label: '5x', color: '#B946FF' },
  ];
  const isMult = (p) => mults.find(m => m.row === p.row && m.col === p.col);

  return (
    <div className="slide slideMini">
      <svg viewBox="0 0 100 80" preserveAspectRatio="xMidYMid meet" className="miniBoard">
        {pegs.map((p, i) => {
          const m = isMult(p);
          if (m) {
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="3.2" fill={m.color} opacity="0.3" />
                <circle cx={p.x} cy={p.y} r="2.0" fill={m.color} />
                <text x={p.x} y={p.y + 5.6} fill={m.color} fontSize="2.4"
                  textAnchor="middle" fontFamily="Audiowide, sans-serif">{m.label}</text>
              </g>
            );
          }
          return <circle key={i} cx={p.x} cy={p.y} r="0.9" fill="#FFE695" opacity="0.55" />;
        })}
      </svg>
    </div>
  );
}

// =============================================================
// SLIDE 3 — Dispenser + curved trajectory → vortex slot
// =============================================================
function SlideRespin() {
  const rows = 8;
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      pegs.push({ x: 50 + (c - r / 2) * 6.2, y: 22 + r * 6.4 });
    }
  }
  const slots = [];
  for (let i = 0; i < 9; i++) {
    slots.push({ x: 50 + (i - 4) * 6.2, y: 75, vortex: i === 6 });
  }

  return (
    <div className="slide slideMini">
      <svg viewBox="0 0 100 84" preserveAspectRatio="xMidYMid meet" className="miniBoard">
        <circle cx="50" cy="10" r="6.5" fill="rgba(212,175,55,0.18)" stroke="#D4AF37" strokeWidth="0.6" />
        <circle cx="50" cy="10" r="4" fill="#1A0F03" stroke="#FFE695" strokeWidth="0.3" />
        {[0,1,2,3,4].map(i => (
          <circle key={i} cx={48 + (i%3)*1.5} cy={8.5 + Math.floor(i/3)*1.5} r="0.9"
            fill={['#FFB347','#FFE695','#FF6B1A','#B946FF','#4A9EFF'][i]} />
        ))}
        <path d="M50 17 Q 35 38, 50 60 T 71 73" fill="none"
          stroke="#FFE695" strokeWidth="0.5" strokeDasharray="1.5,1.2" opacity="0.7" />
        {pegs.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="0.9" fill="#FFE695" opacity="0.5" />)}
        {slots.map((s, i) => (
          s.vortex ? (
            <g key={i}>
              <rect x={s.x - 2.4} y={s.y - 2.4} width="4.8" height="4.8"
                fill="rgba(255,140,66,0.25)" stroke="#FF8C42" strokeWidth="0.4" />
              <circle cx={s.x} cy={s.y} r="1.8" fill="none" stroke="#FFE695" strokeWidth="0.4" />
              <circle cx={s.x} cy={s.y} r="0.9" fill="none" stroke="#FFE695" strokeWidth="0.3" />
              <circle cx={s.x} cy={s.y} r="0.3" fill="#FFE695" />
            </g>
          ) : (
            <rect key={i} x={s.x - 2.4} y={s.y - 2.4} width="4.8" height="4.8"
              fill="rgba(212,175,55,0.08)" stroke="rgba(212,175,55,0.4)" strokeWidth="0.3" />
          )
        ))}
      </svg>
    </div>
  );
}

// =============================================================
// SLIDE 4 — Multiplier-ball ribbon + coloured balls on pegs
// =============================================================
function SlideMultBall() {
  const rows = 7;
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      pegs.push({ x: 50 + (c - r / 2) * 7, y: 22 + r * 7 });
    }
  }
  const ribbon = [
    { c: '#FFE695', label: '1x' },
    { c: '#FF8C42', label: '2x' },
    { c: '#FF2D2D', label: '3x' },
    { c: '#4A9EFF', label: '4x' },
  ];
  const colourBalls = [
    { row: 2, col: 1, c: '#FFE695' },
    { row: 3, col: 0, c: '#FF8C42' },
    { row: 3, col: 3, c: '#B946FF' },
    { row: 4, col: 2, c: '#4A9EFF' },
    { row: 5, col: 1, c: '#FF2D2D' },
    { row: 5, col: 4, c: '#FFB347' },
    { row: 6, col: 3, c: '#3FCB7C' },
  ];

  return (
    <div className="slide slideMini">
      <svg viewBox="0 0 100 84" preserveAspectRatio="xMidYMid meet" className="miniBoard">
        <circle cx="50" cy="10" r="6.5" fill="rgba(212,175,55,0.18)" stroke="#D4AF37" strokeWidth="0.6" />
        <circle cx="50" cy="10" r="4" fill="#1A0F03" stroke="#FFE695" strokeWidth="0.3" />
        {[0,1,2,3,4].map(i => (
          <circle key={i} cx={48 + (i%3)*1.5} cy={8.5 + Math.floor(i/3)*1.5} r="0.9"
            fill={['#FFB347','#FFE695','#FF6B1A','#B946FF','#4A9EFF'][i]} />
        ))}
        <g transform="translate(8 22)">
          {ribbon.map((b, i) => (
            <g key={i} transform={`translate(${i * 6.5} 0)`}>
              <circle cx="2" cy="2" r="2" fill={b.c} opacity="0.9" />
              <text x="2" y="6.6" fill={b.c} fontSize="2"
                textAnchor="middle" fontFamily="Audiowide, sans-serif">{b.label}</text>
            </g>
          ))}
        </g>
        {pegs.map((p, i) => {
          const cb = colourBalls.find(b =>
            Math.abs(b.row - Math.round((p.y - 22) / 7)) < 0.5 &&
            Math.abs(b.col - Math.round((p.x - 50) / 7 + Math.round((p.y - 22) / 7) / 2)) < 0.5
          );
          if (cb) {
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="2" fill={cb.c} opacity="0.4" />
                <circle cx={p.x} cy={p.y} r="1.3" fill={cb.c} />
              </g>
            );
          }
          return <circle key={i} cx={p.x} cy={p.y} r="0.9" fill="#FFE695" opacity="0.45" />;
        })}
      </svg>
    </div>
  );
}
