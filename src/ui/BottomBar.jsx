import React, { useEffect, useRef } from 'react';
import { useGame } from '../state/gameStore.js';

const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ETH';

export default function BottomBar() {
  const balance = useGame(s => s.balance);
  const bet = useGame(s => s.bet);
  const cost = useGame(s => s.cost());
  const soundOn = useGame(s => s.soundOn);
  const toggleSound = useGame(s => s.toggleSound);
  const lastWin = useGame(s => s.lastWin);

  const balRef = useRef();
  useEffect(() => {
    if (!lastWin || !balRef.current) return;
    const el = balRef.current;
    el.classList.remove('gain', 'flash');
    void el.offsetWidth;
    el.classList.add(lastWin.profit >= 0 ? 'gain' : 'flash');
  }, [lastWin]);

  return (
    <div className="botbar">
      <div className="l">
        <div className="it" onClick={toggleSound} style={{ color: soundOn ? '#3FCB7C' : undefined }}>
          <span className="ic s" /> SOUND
        </div>
        <div className="it">
          <span className="ic m" /> MENU
        </div>
      </div>
      <div className="r">
        <div className="it">
          <span>BALANCE</span> <span className="v" ref={balRef}>{fmt(balance)}</span>
        </div>
        <div className="it">
          <span>BET AMOUNT</span> <span className="v">{fmt(cost)}</span>
        </div>
      </div>
    </div>
  );
}
