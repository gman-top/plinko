import React, { useEffect, useState } from 'react';
import { useGame } from '../state/gameStore.js';
import * as Sounds from '../audio/sounds.js';

/**
 * Pre-game overlay with two acts:
 *   ACT 1 — loading: AIGO Studios mark + progress bar (~1.4s)
 *   ACT 2 — tutorial: 4-slide carousel mirroring the Figma tutorial
 *           (PLINKO GONE WILD header + MAX WIN 10,000X + per-slide
 *           diagram drawn from our own SVG assets + arrows / dots /
 *           START button). START sets phase = 'done' and persists.
 */
export default function IntroScreen() {
  const phase = useGame(s => s.introPhase);
  const setPhase = useGame(s => s.setIntroPhase);
  const [progress, setProgress] = useState(0);
  const [slide, setSlide] = useState(0); // 0..3

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

  if (phase === 'done') return null;

  const start = () => {
    Sounds.playClick();
    // Resume the audio context on this user gesture
    Sounds.setEnabled(useGame.getState().soundOn);
    setPhase('done');
  };
  const prev = () => { Sounds.playClick(); setSlide(s => (s + 3) % 4); };
  const next = () => { Sounds.playClick(); setSlide(s => (s + 1) % 4); };

  return (
    <div className={`intro ${phase}`}>
      <div className="introBg" />
      <div className="introGlow" />

      {phase === 'loading' && (
        <div className="introLoad">
          <div className="aigoMark">
            <div className="aigoDot a" />
            <div className="aigoDot b" />
            <div className="aigoDot c" />
          </div>
          <div className="aigoName">AIGO<span>STUDIOS</span></div>
          <div className="loadBar">
            <div className="loadFill" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
          </div>
          <div className="loadLbl">LOADING · {(progress * 100).toFixed(0)}%</div>
        </div>
      )}

      {phase === 'howto' && (
        <div className="howto">
          <div className="howtoLogoWrap">
            <img className="howtoLogo" src="/assets/svg/logo-plinko.svg" alt="PLINKO GONE WILD" />
          </div>
          <div className="maxWinBadge">
            <div className="maxWinTop">MAX WIN</div>
            <div className="maxWinBig">10,000<span>X</span></div>
          </div>

          <div className="howtoStage">
            {slide === 0 && <SlideFeatures />}
            {slide === 1 && <SlideMultipliers />}
            {slide === 2 && <SlideRespin />}
            {slide === 3 && <SlideMultBall />}
          </div>

          <div className="howtoTitle">
            {['THREE ACTIVATING SPIN FEATURES',
              'MULTIPLIERS',
              'RESPIN CHANCE',
              'MULTIPLIER BALL CHANCE'][slide]}
          </div>
          <div className="howtoDesc">
            {[
              'Three feature stars boost your run. Activate one — or all three — to push the field toward bigger payouts.',
              'Adds up to 3 multiplier stars to the field. Passing through them boosts the ball’s final multiplier — they compound on a single drop.',
              'Adds up to 4 vortex slots. Landing in one grants you an extra free ball — without paying the bet again.',
              'A chance to release a ball with a higher starting multiplier. Six tiers from gold to wild — the rarer the colour, the higher the boost.',
            ][slide]}
          </div>

          <div className="howtoNav">
            <button className="introArrow l" onClick={prev} aria-label="Previous" />
            <div className="introDots">
              {[0,1,2,3].map(i => (
                <span key={i} className={`introDot${i === slide ? ' on' : ''}`} onClick={() => { Sounds.playClick(); setSlide(i); }} />
              ))}
            </div>
            <button className="introArrow r" onClick={next} aria-label="Next" />
          </div>

          <button className="introStart" onClick={start}>
            <span>START</span>
          </button>

          <div className="introFoot">
            <span className="dot" /> AIGOSTUDIOS.COM
          </div>
        </div>
      )}
    </div>
  );
}

// === Slide 1 — Three triangle badges (features overview) =============
function SlideFeatures() {
  return (
    <div className="slide slideFeatures">
      <FeatureBadge label="MULTIPLIERS" small>
        <img src="/assets/svg/risk-multi.svg" alt="" />
      </FeatureBadge>
      <FeatureBadge big>
        <img src="/assets/svg/risk-vortex.svg" alt="" />
      </FeatureBadge>
      <FeatureBadge label="BALL CHANCE" small>
        <img src="/assets/svg/risk-flame.svg" alt="" />
      </FeatureBadge>
    </div>
  );
}
function FeatureBadge({ children, label, big, small }) {
  return (
    <div className={`featBadge${big ? ' big' : ''}${small ? ' small' : ''}`}>
      <svg className="featTri" viewBox="0 0 120 110" preserveAspectRatio="none">
        <polygon points="60,4 116,104 4,104"
          fill={big ? 'rgba(212,175,55,0.18)' : 'none'}
          stroke="url(#featTriG)"
          strokeWidth="2"
          strokeLinejoin="round" />
        <defs>
          <linearGradient id="featTriG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFF6D8" />
            <stop offset="1" stopColor="#D4AF37" />
          </linearGradient>
        </defs>
      </svg>
      <div className="featIcon">{children}</div>
      {label && <div className="featLbl">{label}</div>}
    </div>
  );
}

// === Slide 2 — Plinko triangle with multiplier stars highlighted =====
function SlideMultipliers() {
  // Generate a plinko triangle (rows of pegs) + 3 highlighted multiplier
  // stars sitting on real peg positions
  const rows = 8;
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      pegs.push({
        x: 50 + (c - r / 2) * 6.2,
        y: 12 + r * 7.5,
        row: r, col: c,
      });
    }
  }
  // Pick three pegs to be multiplier stars
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
                <circle cx={p.x} cy={p.y} r="2.8" fill={m.color} opacity="0.35" />
                <circle cx={p.x} cy={p.y} r="1.8" fill={m.color} />
                <text x={p.x} y={p.y + 5.2} fill={m.color} fontSize="2.4"
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

// === Slide 3 — Dispenser → vortex slot (respin chance) ==============
function SlideRespin() {
  const rows = 8;
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      pegs.push({ x: 50 + (c - r / 2) * 6.2, y: 22 + r * 6.4 });
    }
  }
  // Slot row indicators (one is a vortex)
  const slots = [];
  for (let i = 0; i < 9; i++) {
    slots.push({ x: 50 + (i - 4) * 6.2, y: 75, vortex: i === 6 });
  }

  return (
    <div className="slide slideMini">
      <svg viewBox="0 0 100 84" preserveAspectRatio="xMidYMid meet" className="miniBoard">
        {/* Dispenser at apex */}
        <circle cx="50" cy="10" r="6.5" fill="rgba(212,175,55,0.18)" stroke="#D4AF37" strokeWidth="0.6" />
        <circle cx="50" cy="10" r="4" fill="#1A0F03" stroke="#FFE695" strokeWidth="0.3" />
        {[0,1,2,3,4].map(i => (
          <circle key={i} cx={48 + (i%3)*1.5} cy={8.5 + Math.floor(i/3)*1.5} r="0.9"
            fill={['#FFB347','#FFE695','#FF6B1A','#B946FF','#4A9EFF'][i]} />
        ))}

        {/* Falling-ball curve hint */}
        <path d="M50 17 Q 35 38, 50 60 T 71 73" fill="none"
          stroke="#FFE695" strokeWidth="0.5" strokeDasharray="1.5,1.2" opacity="0.7" />

        {/* Pegs */}
        {pegs.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="0.9" fill="#FFE695" opacity="0.5" />)}

        {/* Slot row */}
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

// === Slide 4 — Multiplier ball chance (coloured balls badge) ========
function SlideMultBall() {
  const rows = 7;
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) {
      pegs.push({ x: 50 + (c - r / 2) * 7, y: 22 + r * 7 });
    }
  }
  // Multiplier ball ribbon: colour-coded
  const ribbon = [
    { c: '#FFE695', label: '1x' },
    { c: '#FF8C42', label: '2x' },
    { c: '#FF2D2D', label: '3x' },
    { c: '#4A9EFF', label: '4x' },
  ];
  // Coloured balls scattered on pegs
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
        {/* Dispenser */}
        <circle cx="50" cy="10" r="6.5" fill="rgba(212,175,55,0.18)" stroke="#D4AF37" strokeWidth="0.6" />
        <circle cx="50" cy="10" r="4" fill="#1A0F03" stroke="#FFE695" strokeWidth="0.3" />
        {[0,1,2,3,4].map(i => (
          <circle key={i} cx={48 + (i%3)*1.5} cy={8.5 + Math.floor(i/3)*1.5} r="0.9"
            fill={['#FFB347','#FFE695','#FF6B1A','#B946FF','#4A9EFF'][i]} />
        ))}

        {/* Ribbon: multiplier ball legend (left of board) */}
        <g transform="translate(8 22)">
          {ribbon.map((b, i) => (
            <g key={i} transform={`translate(${i * 6.5} 0)`}>
              <circle cx="2" cy="2" r="2" fill={b.c} opacity="0.9" />
              <text x="2" y="6.6" fill={b.c} fontSize="2"
                textAnchor="middle" fontFamily="Audiowide, sans-serif">{b.label}</text>
            </g>
          ))}
        </g>

        {/* Pegs */}
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
