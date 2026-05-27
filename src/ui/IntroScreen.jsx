import React, { useEffect, useState } from 'react';
import { useGame } from '../state/gameStore.js';
import * as Sounds from '../audio/sounds.js';

/**
 * Two-phase pre-game overlay:
 *   1. loading — AIGO Studios mark + progress bar (~1.6s)
 *   2. howto   — PLINKO GONE WILD logo + 3 instruction cards + START
 *
 * After START, persists "seen" flag so returning users skip straight
 * to gameplay (controlled by gameStore.introPhase, which inits from
 * localStorage).
 */
export default function IntroScreen() {
  const phase = useGame(s => s.introPhase);
  const setPhase = useGame(s => s.setIntroPhase);
  const [progress, setProgress] = useState(0);

  // Loading bar progression
  useEffect(() => {
    if (phase !== 'loading') return;
    let raf;
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1600;
      const p = Math.min(1, t);
      // Ease-out so it lingers near 100%
      setProgress(1 - Math.pow(1 - p, 2.5));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setPhase('howto'), 220);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, setPhase]);

  if (phase === 'done') return null;

  const onStart = () => {
    Sounds.playClick();
    // Resume audio context (browser policy requires gesture)
    Sounds.setEnabled(useGame.getState().soundOn);
    setPhase('done');
  };

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
        <div className="introHowto">
          <div className="introLogoBig">
            <div className="introLogoLine top">PLINKO</div>
            <div className="introLogoSub">GONE WILD</div>
          </div>

          <div className="howCards">
            <div className="howCard">
              <div className="howNum">01</div>
              <div className="howTitle">PICK YOUR RISK</div>
              <div className="howText">
                Choose LINES (8–16) and RISK (LOW · MEDIUM · HIGH).
                Higher risk = bigger multipliers, rarer hits.
              </div>
            </div>
            <div className="howCard">
              <div className="howNum">02</div>
              <div className="howTitle">DROP THE BALL</div>
              <div className="howText">
                Set your BET and press PLAY. Watch the cosmic comet
                bounce through the star-pegs toward the multiplier slots.
              </div>
            </div>
            <div className="howCard">
              <div className="howNum">03</div>
              <div className="howTitle">CHASE MULTIPLIERS</div>
              <div className="howText">
                Hit glowing ×2 / ×3 / ×5 multiplier stars on the way
                down — they STACK with the slot for jackpot supernovas.
              </div>
            </div>
          </div>

          <button className="introStart" onClick={onStart}>
            <span>START PLAYING</span>
          </button>

          <div className="introFoot">
            <span className="dot" /> AIGOSTUDIOS.COM
          </div>
        </div>
      )}
    </div>
  );
}
