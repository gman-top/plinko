import React from 'react';
import { useGame } from '../state/gameStore.js';
import HistoryTable from './HistoryTable.jsx';
import Legend from './Legend.jsx';
import RightControls from './RightControls.jsx';
import BottomControls from './BottomControls.jsx';

/**
 * Mobile bottom drawer + hamburger button.
 *
 * On viewports ≤ 768px, the side panels (stats, legend, lines/risk,
 * bet/balls/auto/buy-features) are hidden from the main layout via
 * CSS and re-rendered inside this drawer. Tap the hamburger top-right
 * to slide it up; tap the backdrop or close button to dismiss.
 *
 * On desktop, the hamburger + drawer are display:none.
 */
export default function MobileMenu() {
  const open = useGame(s => s.menuOpen);
  const toggle = useGame(s => s.toggleMenu);
  const close = useGame(s => s.closeMenu);

  return (
    <>
      <button
        className="mobileMenuBtn"
        onClick={toggle}
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? '✕' : '☰'}
      </button>

      <div className={`mobileDrawer${open ? ' open' : ''}`}>
        <div className="drawerBackdrop" onClick={close} />
        <div className="drawerPanel">
          <div className="drawerHandle" />
          <div className="drawerTitle">PLINKO GONE WILD</div>

          <div className="drawerGrid">
            <RightControls />
            <BottomControls />
          </div>

          <div className="drawerSection">
            <div className="drawerSectionTitle">MULTIPLIERS LEGEND</div>
            <Legend />
          </div>

          <div className="drawerSection">
            <div className="drawerSectionTitle">RECENT HISTORY</div>
            <HistoryTable />
          </div>
        </div>
      </div>
    </>
  );
}
