import React, { useCallback, useEffect } from 'react';
import { useGame } from '../state/gameStore.js';
import { rollBallType } from '../state/config.js';
import * as Sounds from '../audio/sounds.js';

/**
 * Drops one or more balls. The Scene component owns physics, so we
 * just dispatch a `plinko-drop` event with the chosen ball type + bet.
 * Cinematic ball types (fire/electric/wild/jackpot) show a banner
 * overlay for 900ms before the drop fires.
 */
export default function PlayButton() {
  const cost = useGame(s => s.cost());
  const balance = useGame(s => s.balance);
  const ballsAmount = useGame(s => s.ballsAmount);
  const chargeBet = useGame(s => s.chargeBet);
  const setCinematic = useGame(s => s.setCinematic);

  const rollDrop = useGame(s => s.rollDrop);

  const dropOne = useCallback(async () => {
    if (balance < cost) return;
    const type = rollBallType();
    if (!chargeBet(cost)) return;
    // Provably-fair roll BEFORE physics: predetermined slot + per-row
    // bounce decisions. Scene biases peg collisions toward these so the
    // visible path lands the ball in the rolled slot.
    let casino;
    try {
      casino = await rollDrop();
    } catch (e) {
      // Fall through with no biasing; Scene falls back to fair-physics
      console.warn('RNG roll failed, falling back to fair physics:', e);
      casino = null;
    }
    const dispatch = () => {
      window.dispatchEvent(new CustomEvent('plinko-drop', {
        detail: { typeId: type.id, bet: cost, casino },
      }));
    };
    if (type.cinematic) {
      setCinematic({ type: type.id, name: type.name });
      setTimeout(() => {
        dispatch();
        setCinematic(null);
      }, 900);
    } else {
      dispatch();
    }
  }, [balance, cost, chargeBet, setCinematic, rollDrop]);

  const click = useCallback(() => {
    Sounds.playClick();
    for (let i = 0; i < ballsAmount; i++) {
      setTimeout(dropOne, i * 220);
    }
  }, [ballsAmount, dropOne]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space') { e.preventDefault(); click(); }
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
