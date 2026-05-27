import React from 'react';
import { useGame } from '../state/gameStore.js';

export default function HistoryTable() {
  const history = useGame(s => s.history);
  return (
    <div className="statsTbl">
      <div className="head">
        <div>TIME</div><div>TOTAL BET</div><div>PAYOUT</div><div>PROFIT</div>
      </div>
      <div className="rows">
        {history.slice(0, 10).map((h, i) => {
          const net = h.payout - h.bet;
          const col = net >= 0
            ? (h.mult >= 10 ? '#FFB347' : h.mult >= 2 ? '#FFE695' : '#3FCB7C')
            : '#8A7A5E';
          return (
            <div className="r" key={i}>
              <div>{h.time}</div>
              <div>{h.bet.toFixed(2)} ETH</div>
              <div>{h.payout.toFixed(2)} ETH</div>
              <div className="pf" style={{ color: col }}>
                {net >= 0 ? '+' : ''}{net.toFixed(2)} ETH
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
