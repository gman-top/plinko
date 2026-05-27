import React, { useEffect, useRef } from 'react';
import { useGame } from '../state/gameStore.js';
import * as Sounds from '../audio/sounds.js';

const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ETH';

export default function BottomBar() {
  const balance = useGame(s => s.balance);
  const bet = useGame(s => s.bet);
  const cost = useGame(s => s.cost());
  const soundOn = useGame(s => s.soundOn);
  const toggleSound = useGame(s => s.toggleSound);
  const setIntroPhase = useGame(s => s.setIntroPhase);
  const lastWin = useGame(s => s.lastWin);

  const balRef = useRef();
  useEffect(() => {
    if (!lastWin || !balRef.current) return;
    const el = balRef.current;
    el.classList.remove('gain', 'flash');
    void el.offsetWidth;
    el.classList.add(lastWin.profit >= 0 ? 'gain' : 'flash');
  }, [lastWin]);

  const openHowTo = () => { Sounds.playClick(); setIntroPhase('howto'); };

  return (
    <div className="botbar">
      <div className="l">
        <div className="it" onClick={() => { Sounds.playClick(); toggleSound(); }} title={soundOn ? 'Sound on' : 'Sound off'}>
          <span className={`ic ${soundOn ? 's' : 'so'}`} /> SOUND
        </div>
        <div className="it" onClick={openHowTo} title="How to play">
          <span className="ic i" /> INFO
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
