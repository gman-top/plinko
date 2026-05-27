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
import FloatNumbers from './ui/FloatNumbers.jsx';
import MobileMenu from './ui/MobileMenu.jsx';
import MobileQuickControls from './ui/MobileQuickControls.jsx';

/**
 * Full-viewport flex layout — no fixed 1440x1024 frame.
 *   #stage         flex column, fills viewport
 *     .boardArea   flex:1, holds the canvas + UI overlays
 *     .bottomArea  fixed-height row with PLAY + flanking controls
 */
export default function App() {
  const bottomRef = useRef(null);

  // Screen shake (dispatched by Scene on big wins)
  useEffect(() => {
    const onShake = () => {
      if (!bottomRef.current) return;
      bottomRef.current.classList.remove('shake');
      void bottomRef.current.offsetWidth;
      bottomRef.current.classList.add('shake');
    };
    window.addEventListener('plinko-shake', onShake);
    return () => window.removeEventListener('plinko-shake', onShake);
  }, []);

  return (
    <div id="stage">
      <div className="boardArea">
        <Scene />
        <FloatNumbers />
        {/* Side-panel UI — hidden on mobile via CSS, mirrored in <MobileMenu /> */}
        <div className="desktopOnly">
          <Logo />
          <HistoryTable />
          <Legend />
          <RightControls />
        </div>
      </div>
      <div className="bottomArea" ref={bottomRef}>
        <MobileQuickControls />
        <WinBar />
        <div className="desktopOnly">
          <BottomControls />
        </div>
        <PlayButton />
        <BottomBar />
      </div>
      <MobileMenu />
      <Cinematic />
    </div>
  );
}
