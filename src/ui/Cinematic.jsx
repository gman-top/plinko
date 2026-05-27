import React from 'react';
import { useGame } from '../state/gameStore.js';

export default function Cinematic() {
  const cinematic = useGame(s => s.cinematic);
  const cls = `cinema${cinematic ? ` on ${cinematic.type}` : ''}`;
  return (
    <div className={cls}>
      {cinematic && (
        <div className="banner">
          <div className="sub">SPECIAL BALL TRIGGERED</div>
          <div className="big">{cinematic.name}</div>
        </div>
      )}
    </div>
  );
}
