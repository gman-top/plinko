import React, { useEffect, useState } from 'react';
import { useGame } from '../state/gameStore.js';

export default function WinBar() {
  const lastWin = useGame(s => s.lastWin);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!lastWin) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 3500);
    return () => clearTimeout(t);
  }, [lastWin]);

  const cls = on
    ? `on ${lastWin && lastWin.mult >= 50 ? 'mega' : lastWin && lastWin.mult >= 10 ? 'big' : lastWin && lastWin.profit < 0 ? 'loss' : 'win'}`
    : '';

  const label = !lastWin ? 'LAST'
    : lastWin.profit < 0 ? 'LAST'
    : lastWin.mult >= 50 ? 'JACKPOT'
    : lastWin.mult >= 10 ? 'MEGA WIN'
    : lastWin.mult >= 2 ? 'WIN'
    : 'LAST';

  const numText = !lastWin ? '— ETH'
    : `${lastWin.profit >= 0 ? '+' : ''}${lastWin.profit.toFixed(2)} ETH`;

  return (
    <div className={`winBar ${cls}`}>
      <div className="lbl">{label}</div>
      <div className="num">{numText}</div>
    </div>
  );
}
