import React, { useCallback, useEffect } from 'react';
import { useGame } from '../state/gameStore.js';
import { rollBallType, BALL_TYPES } from '../state/config.js';

export default function PlayButton() {
  const cost = useGame(s => s.cost());
  const balance = useGame(s => s.balance);
  const ballsAmount = useGame(s => s.ballsAmount);
  const chargeBet = useGame(s => s.chargeBet);
  const spawnBall = useGame(s => s.spawnBall);
  const setCinematic = useGame(s => s.setCinematic);

  const drop = useCallback(() => {
    if (balance < cost) return;
    const type = rollBallType();
    if (!chargeBet(cost)) return;
    if (type.cinematic) {
      setCinematic({ type: type.id, name: type.name });
      setTimeout(() => {
        spawnBall(type.id, cost);
        setCinematic(null);
      }, 900);
    } else {
      spawnBall(type.id, cost);
    }
  }, [balance, cost, chargeBet, spawnBall, setCinematic]);

  const click = useCallback(() => {
    for (let i = 0; i < ballsAmount; i++) {
      setTimeout(drop, i * 220);
    }
  }, [ballsAmount, drop]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [click]);

  const disabled = balance < cost;

  return (
    <div
      className={`playWrap${disabled ? ' disabled' : ''}`}
      onClick={click}
      role="button"
      title="Drop ball (Space)"
    >
      <div className="playDisc" />
      <div className="playText">PLAY</div>
    </div>
  );
}
