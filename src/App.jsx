import React, { useEffect, useRef } from 'react';
import Scene from './scene/Scene.jsx';
import Logo from './ui/Logo.jsx';
import HistoryTable from './ui/HistoryTable.jsx';
import Legend from './ui/Legend.jsx';
import RightControls from './ui/RightControls.jsx';
import BottomControls from './ui/BottomControls.jsx';
import PlayButton from './ui/PlayButton.jsx';
import WinBar from './ui/WinBar.jsx';
import BottomBar from './ui/BottomBar.jsx';
import Cinematic from './ui/Cinematic.jsx';

/**
 * Top-level orchestrator. Lays out:
 *   #stage          — fixed full-viewport, holds the Figma bg image
 *     #game         — pixel-perfect 1440x1024 design, css-scaled to viewport
 *       .logo
 *       .statsTbl   (left)
 *       <Scene>     (the 3D Plinko canvas)
 *       .legend     (right, 6-colour ball legend)
 *       LINES / RISK (right)
 *       BUY / BALLS / BET / AUTO (bottom flanking)
 *       PLAY        (centre bottom)
 *       WIN bar     (below PLAY)
 *       .botbar     (sound/menu + balance/bet)
 */
export default function App() {
  const gameRef = useRef(null);

  // Fit the fixed 1440×1024 design into any viewport
  useEffect(() => {
    const fit = () => {
      const vv = window.visualViewport;
      const w = vv ? vv.width : window.innerWidth;
      const h = vv ? vv.height : window.innerHeight;
      const s = Math.min(w / 1440, h / 1024) * 0.98;
      if (gameRef.current) {
        gameRef.current.style.transform = `translate(-50%, -50%) scale(${s})`;
      }
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    window.addEventListener('load', fit);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', fit);
      window.visualViewport.addEventListener('scroll', fit);
    }
    // Run twice on next frames so fonts/layout settle before measuring
    requestAnimationFrame(() => requestAnimationFrame(fit));
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      window.removeEventListener('load', fit);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', fit);
        window.visualViewport.removeEventListener('scroll', fit);
      }
    };
  }, []);

  return (
    <div id="stage">
      <div id="game" ref={gameRef}>
        <Logo />
        <HistoryTable />
        <Scene />
        <Legend />
        <RightControls />
        <BottomControls />
        <PlayButton />
        <WinBar />
        <BottomBar />
        <div className="hint">SPACE drop · F features · I info · ESC close</div>
      </div>
      <Cinematic />
    </div>
  );
}
