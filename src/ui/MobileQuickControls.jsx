import React from 'react';
import { useGame } from '../state/gameStore.js';

const ROWS_OPTS = [8, 10, 12, 14, 16];
const RISKS = ['LOW', 'MEDIUM', 'HIGH'];
const BET_STEP = 0.5;

/**
 * Always-visible compact controls strip for mobile, sitting just
 * above the PLAY button. Three chips: LINES, RISK LEVEL, BET AMOUNT —
 * each with left/right arrows that cycle through values.
 *
 * Hidden on desktop (CSS media query) because the same controls are
 * already present in the side panels.
 */
export default function MobileQuickControls() {
  const rows = useGame(s => s.rows);
  const risk = useGame(s => s.risk);
  const bet  = useGame(s => s.bet);
  const setRows = useGame(s => s.setRows);
  const setRisk = useGame(s => s.setRisk);
  const setBet  = useGame(s => s.setBet);

  const cycleRows = (dir) => {
    const i = ROWS_OPTS.indexOf(rows);
    const ni = Math.max(0, Math.min(ROWS_OPTS.length - 1, i + dir));
    setRows(ROWS_OPTS[ni]);
  };
  const cycleRisk = (dir) => {
    const i = RISKS.indexOf(risk);
    const ni = ((i + dir) % RISKS.length + RISKS.length) % RISKS.length;
    setRisk(RISKS[ni]);
  };
  const stepBet = (dir) => setBet(bet + dir * BET_STEP);

  const riskColor =
    risk === 'HIGH' ? 'var(--wildHi)' :
    risk === 'MEDIUM' ? 'var(--goldHi)' :
    'var(--green)';

  return (
    <div className="mobileQuick">
      <div className="mq">
        <div className="mq-arrow l" onClick={() => cycleRows(-1)} />
        <div className="mq-mid">
          <div className="mq-lbl">LINES</div>
          <div className="mq-val">{rows}</div>
        </div>
        <div className="mq-arrow r" onClick={() => cycleRows(+1)} />
      </div>

      <div className="mq">
        <div className="mq-arrow l" onClick={() => cycleRisk(-1)} />
        <div className="mq-mid">
          <div className="mq-lbl">RISK</div>
          <div
            className="mq-risk-icon"
            style={{
              backgroundColor: riskColor,
              filter: `drop-shadow(0 0 6px ${riskColor})`,
            }}
          />
        </div>
        <div className="mq-arrow r" onClick={() => cycleRisk(+1)} />
      </div>

      <div className="mq">
        <div className="mq-arrow l" onClick={() => stepBet(-1)} />
        <div className="mq-mid">
          <div className="mq-lbl">BET</div>
          <div className="mq-val">{bet.toFixed(2)}</div>
        </div>
        <div className="mq-arrow r" onClick={() => stepBet(+1)} />
      </div>
    </div>
  );
}
