import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../state/gameStore.js';
import { BALL_TYPES } from '../state/config.js';
import { drawFigmaBall, drawBallAura } from '../scene/drawBall.js';
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
    desc: 'Set your BET, pick LINES (8–16) and RISK, then hit PLAY to drop a comet through the star field. Where it lands × your bet = your win.',
  },
  {
    id: 'features',
    title: 'THREE SPIN FEATURES',
    desc: 'Toggle one — or all three — feature stars below the board. Each one adds a new way the field can pay out bigger. They stack.',
  },
  {
    id: 'mult',
    title: 'MULTIPLIERS',
    desc: 'Up to 3 multiplier stars appear on the field. Passing through them boosts the ball’s final multiplier — they compound on a single drop.',
  },
  {
    id: 'respin',
    title: 'RESPIN CHANCE',
    desc: 'Up to 4 vortex slots replace regular slots. Landing in one grants you an extra free ball — without paying the bet again.',
  },
  {
    id: 'multball',
    title: 'MULTIPLIER BALL',
    desc: 'A chance to release a comet with a higher starting multiplier. Six colour tiers — rarer colour, bigger boost.',
  },
];

// =============================================================
// <Ball /> — canvas-rendered copy of the in-game comet (real
// Figma-ball gradients + aura). All sizes in CSS pixels.
// =============================================================
function Ball({ type = BALL_TYPES.gold, size = 36, aura = true, glowScale = 1 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const total = aura ? size * 3 : size * 1.2;
    canvas.width = total * dpr;
    canvas.height = total * dpr;
    canvas.style.width = total + 'px';
    canvas.style.height = total + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, total, total);
    const cx = total / 2, cy = total / 2;
    const r = size / 2;
    if (aura) drawBallAura(ctx, cx, cy, r, type, glowScale);
    drawFigmaBall(ctx, cx, cy, r, type);
  }, [type, size, aura, glowScale]);
  return <canvas ref={ref} className="introBall" />;
}

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
// SLIDE 0 — HOW TO PLAY
// Uses real chip + real PLAY button + a real gold Ball above PLAY
// =============================================================
function SlideHowToPlay() {
  return (
    <div className="slide playSlide">
      <div className="playStep">
        <div className="psN">1</div>
        <div className="psBody">
          <div className="fakeCtrl">
            <span className="fakeCtrlArrow l" />
            <span className="fakeCtrlVal">2.00</span>
            <span className="fakeCtrlArrow r" />
          </div>
        </div>
        <div className="psLbl">SET BET</div>
        <div className="psHint">Pick how much to wager per drop</div>
      </div>

      <div className="psArrow" />

      <div className="playStep">
        <div className="psN">2</div>
        <div className="psBody">
          <div className="fakeRiskRow">
            <img src={A('assets/svg/risk-flame.svg')}  className="fakeRiskIc lo" alt="" />
            <img src={A('assets/svg/risk-multi.svg')}  className="fakeRiskIc md" alt="" />
            <img src={A('assets/svg/risk-vortex.svg')} className="fakeRiskIc hi" alt="" />
          </div>
          <div className="fakeCtrl narrow">
            <span className="fakeCtrlArrow l" />
            <span className="fakeCtrlVal">12</span>
            <span className="fakeCtrlArrow r" />
          </div>
        </div>
        <div className="psLbl">RISK + LINES</div>
        <div className="psHint">LOW · MEDIUM · HIGH · 8–16 rows</div>
      </div>

      <div className="psArrow" />

      <div className="playStep">
        <div className="psN">3</div>
        <div className="psBody">
          <div className="fakePlayWrap">
            <div className="fakePlayBall"><Ball type={BALL_TYPES.gold} size={28} /></div>
            <div className="fakePlay">
              <div className="fakePlayDisc" />
              <div className="fakePlayText">PLAY</div>
            </div>
          </div>
        </div>
        <div className="psLbl">PRESS PLAY</div>
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
// SLIDE 2 — MULTIPLIERS: real peg field + three multiplier stars
// + a real Ball mid-flight on a trajectory
// =============================================================
function SlideMultipliers() {
  return (
    <div className="slide miniScene">
      <MiniBoard
        rows={10}
        mults={[
          { row: 3, col: 1, value: 2, color: '#FFE695' },
          { row: 5, col: 3, value: 3, color: '#FF8C42' },
          { row: 7, col: 2, value: 5, color: '#B946FF' },
        ]}
        trajectory="M50 -2 Q 42 18, 50 38 T 28 70"
        ballAt={{ x: 38, y: 50 }}
        ballType={BALL_TYPES.gold}
      />
    </div>
  );
}

// =============================================================
// SLIDE 3 — RESPIN CHANCE: dispenser + ball curve + vortex slot
// =============================================================
function SlideRespin() {
  return (
    <div className="slide miniScene">
      <MiniBoard
        rows={9}
        dispenser
        slotRow={{ count: 10, vortexIdx: 7 }}
        trajectory="M50 18 Q 38 38, 52 56 T 76 74"
        ballAt={{ x: 60, y: 60 }}
        ballType={BALL_TYPES.fire}
      />
    </div>
  );
}

// =============================================================
// SLIDE 4 — MULTIPLIER BALL: side ribbon of real balls + scattered
// real coloured balls on field
// =============================================================
const RIBBON_BALLS = [
  { type: { deep: '#5C3F08', glow: '#FFB347' }, label: '1x' },
  { type: { deep: '#0A3E5C', glow: '#2090FF' }, label: '2x' },
  { type: { deep: '#5C0A40', glow: '#B946FF' }, label: '4x' },
  { type: { deep: '#0A4020', glow: '#3FCB7C' }, label: '6x' },
  { type: { deep: '#3D0A5C', glow: '#E6A6FF' }, label: '8x' },
  { type: { deep: '#7A6008', glow: '#FFE695' }, label: '10x' },
];
function SlideMultBall() {
  return (
    <div className="slide multBallScene">
      <div className="ribbonPanel">
        {RIBBON_BALLS.map((b, i) => (
          <div key={i} className="ribbonRow">
            <Ball type={b.type} size={24} aura={false} />
            <span className="ribbonLbl" style={{ color: b.type.glow }}>{b.label}</span>
          </div>
        ))}
      </div>
      <MiniBoard
        rows={8}
        dispenser
        scatterBalls={[
          { row: 3, col: 1, type: RIBBON_BALLS[5].type },
          { row: 4, col: 3, type: RIBBON_BALLS[2].type },
          { row: 6, col: 2, type: RIBBON_BALLS[1].type },
        ]}
      />
    </div>
  );
}

// =============================================================
// <MiniBoard /> — composable plinko-board illustration.
// Pegs are gold stars, optional dispenser using dispenser.svg image,
// optional bottom slot row with a vortex marker, optional trajectory
// path, optional real <Ball /> rendered absolutely at SVG coords.
// =============================================================
function MiniBoard({ rows = 9, mults = [], dispenser = false, slotRow,
                     trajectory, ballAt, ballType, scatterBalls = [] }) {
  // SVG coordinate system: 100 × 86 (matches existing tutorial scale)
  const pegs = [];
  const topY = dispenser ? 23 : 8;
  const stepY = (slotRow ? 6 : 7);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      pegs.push({ x: 50 + (c - r / 2) * 5.6, y: topY + r * stepY, row: r, col: c });
    }
  }
  const isMult = (p) => mults.find(m => m.row === p.row && m.col === p.col);
  const scatter = (p) => scatterBalls.find(b => b.row === p.row && b.col === p.col);

  // Convert SVG coords (viewBox 100x86) to CSS px for <Ball> overlay
  const VBW = 100, VBH = 86;
  const boardRef = useRef(null);
  const [boardSize, setBoardSize] = useState({ w: 480, h: 412 });
  useEffect(() => {
    if (!boardRef.current) return;
    const update = () => {
      const r = boardRef.current.getBoundingClientRect();
      setBoardSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, []);
  const toPx = (x, y) => ({
    left: (x / VBW) * boardSize.w,
    top:  (y / VBH) * boardSize.h,
  });

  return (
    <div className="miniBoardWrap" ref={boardRef}>
      <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="xMidYMid meet" className="miniBoard">
        <defs>
          <radialGradient id="mb-peg" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0"    stopColor="#fff"    stopOpacity="1" />
            <stop offset="0.4"  stopColor="#FFE695" stopOpacity="0.8" />
            <stop offset="1"    stopColor="#D4AF37" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mb-vortex" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0"   stopColor="#FFE695" />
            <stop offset="0.7" stopColor="#FF8C42" />
            <stop offset="1"   stopColor="#7A1A04" />
          </radialGradient>
        </defs>

        {trajectory && (
          <path d={trajectory} fill="none" stroke="#FFE695"
            strokeWidth="0.5" strokeDasharray="1.6,1.4" opacity="0.6" />
        )}

        {pegs.map((p, i) => {
          if (isMult(p) || scatter(p)) return null; // drawn as DOM <Ball>
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="1.6" fill="url(#mb-peg)" opacity="0.5" />
              <circle cx={p.x} cy={p.y} r="0.65" fill="#FFE695" />
            </g>
          );
        })}

        {/* Multiplier star labels */}
        {mults.map((m, i) => {
          const p = pegs.find(pp => pp.row === m.row && pp.col === m.col);
          if (!p) return null;
          return (
            <g key={'m'+i}>
              <circle cx={p.x} cy={p.y} r="3.4" fill={m.color} opacity="0.25" />
              <circle cx={p.x} cy={p.y} r="2.2" fill={m.color} opacity="0.9" />
              <text x={p.x} y={p.y + 0.6} fill="#1A0F03" fontSize="2"
                fontWeight="700" textAnchor="middle" dominantBaseline="middle"
                fontFamily="Audiowide, sans-serif">{m.value}x</text>
            </g>
          );
        })}

        {/* Bottom slot row */}
        {slotRow && Array.from({ length: slotRow.count }).map((_, i) => {
          const x = 50 + (i - (slotRow.count - 1) / 2) * 5.4;
          const y = 78;
          const vortex = i === slotRow.vortexIdx;
          return (
            <g key={'s'+i}>
              <rect x={x - 2.4} y={y - 2.4} width="4.8" height="4.8" rx="0.5"
                fill={vortex ? 'url(#mb-vortex)' : 'rgba(212,175,55,0.1)'}
                stroke={vortex ? '#FFE695' : 'rgba(212,175,55,0.4)'}
                strokeWidth={vortex ? '0.5' : '0.25'} />
              {vortex && (
                <>
                  <circle cx={x} cy={y} r="1.6" fill="none" stroke="#FFE695" strokeWidth="0.35" />
                  <circle cx={x} cy={y} r="0.8" fill="none" stroke="#FFE695" strokeWidth="0.3" />
                  <text x={x} y={y + 0.4} fill="#1A0F03" fontSize="1.6"
                    fontWeight="700" textAnchor="middle" dominantBaseline="middle"
                    fontFamily="Audiowide, sans-serif">x2</text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Dispenser overlay — real PNG-ish SVG, centered on apex */}
      {dispenser && (
        <img
          className="miniDispenser"
          src={A('assets/svg/dispenser.svg')}
          alt=""
          style={{
            left:  toPx(50, 11).left  - boardSize.w * 0.075,
            top:   toPx(50, 11).top   - boardSize.h * 0.087,
            width: boardSize.w * 0.15,
          }}
        />
      )}

      {/* Real-rendered ball at trajectory tip */}
      {ballAt && ballType && (
        <div className="miniBallOverlay"
          style={{
            left: toPx(ballAt.x, ballAt.y).left,
            top:  toPx(ballAt.x, ballAt.y).top,
          }}>
          <Ball type={ballType} size={boardSize.w * 0.052} />
        </div>
      )}

      {/* Scattered real balls on pegs */}
      {scatterBalls.map((sb, i) => {
        const p = pegs.find(pp => pp.row === sb.row && pp.col === sb.col);
        if (!p) return null;
        const pos = toPx(p.x, p.y);
        return (
          <div key={'sb'+i} className="miniBallOverlay"
            style={{ left: pos.left, top: pos.top }}>
            <Ball type={sb.type} size={boardSize.w * 0.045} aura={true} glowScale={0.7} />
          </div>
        );
      })}
    </div>
  );
}
