import React from 'react';
import { LEGEND_BADGES } from '../state/config.js';

export default function Legend() {
  const rowA = LEGEND_BADGES.slice(0, 3);
  const rowB = LEGEND_BADGES.slice(3, 6);
  return (
    <div className="legend">
      <div className="banner">
        {rowA.map((b, i) => (
          <div className="lb" key={i}>
            <span className="dot" style={{ '--c1': b.color, '--c2': b.deep }} />
            {b.label}
          </div>
        ))}
      </div>
      <div className="banner">
        {rowB.map((b, i) => (
          <div className="lb" key={i}>
            <span className="dot" style={{ '--c1': b.color, '--c2': b.deep }} />
            {b.label}
          </div>
        ))}
      </div>
    </div>
  );
}
