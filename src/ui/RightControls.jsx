import React from 'react';
import { useGame } from '../state/gameStore.js';

const ROWS_OPTIONS = [8, 10, 12, 14, 16];
const RISKS = ['LOW', 'MEDIUM', 'HIGH'];

export default function RightControls() {
  const rows = useGame(s => s.rows);
  const risk = useGame(s => s.risk);
  const setRows = useGame(s => s.setRows);
  const setRisk = useGame(s => s.setRisk);

  const cycleRows = (dir) => {
    const i = ROWS_OPTIONS.indexOf(rows);
    const next = ROWS_OPTIONS[Math.max(0, Math.min(ROWS_OPTIONS.length - 1, i + dir))];
    setRows(next);
  };

  return (
    <>
      <div className="panel linesWrap">
        <div className="lbl">LINES</div>
        <div className="ctrl">
          <div className="arrow l" onClick={() => cycleRows(-1)} />
          <div className="val">{rows}</div>
          <div className="arrow r" onClick={() => cycleRows(+1)} />
        </div>
      </div>

      <div className="panel riskWrap">
        <div className="lbl">RISK LEVEL</div>
        <div className="riskIcons">
          {RISKS.map(r => (
            <div
              key={r}
              className={`ri${r === risk ? ' act' : ''}`}
              data-r={r}
              onClick={() => setRisk(r)}
              title={r}
            />
          ))}
        </div>
      </div>
    </>
  );
}
