import { Router } from 'express';
import { MULT_TABLE, BALL_TYPES } from '../../src/state/config.js';
import { slotRTP, ballTypeEV } from '../../src/casino/math.js';
import { config } from '../config.js';
import { db } from '../db.js';

const r = Router();

// Plain health check — used by Render/Railway/Fly readiness probes.
r.get('/health', (req, res) => res.json({ ok: true }));

// Self-audit: returns the RTP for every (risk, rows) cell the server
// will pay out on. Lets a regulator's automated job pull the numbers
// without re-running scripts/rtp.mjs locally. CI gates green only if
// every cell is inside the configured band.
r.get('/rtp', (req, res) => {
  const ev = ballTypeEV(BALL_TYPES);
  const cells = {};
  let outside = 0;
  for (const risk of Object.keys(MULT_TABLE)) {
    cells[risk] = {};
    for (const rows of Object.keys(MULT_TABLE[risk])) {
      const r = slotRTP(MULT_TABLE[risk][rows], +rows);
      cells[risk][rows] = +r.toFixed(6);
      if (r < 0.95 || r > 0.995) outside++;
    }
  }
  res.json({
    ballTypeEV: +ev.toFixed(6),
    cells,
    targetBand: [0.95, 0.995],
    outsideBand: outside,
    operator: config.operator,
  });
});

// Read-only summary of session / drop totals — for the operator's
// reporting dashboard. NO seed exposure.
r.get('/stats', (req, res) => {
  const summary = {
    sessions_active:  db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE status='active'`).get().n,
    sessions_rotated: db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE status='rotated'`).get().n,
    drops_total:      db.prepare(`SELECT COUNT(*) AS n FROM drops`).get().n,
    wagered_minor:    db.prepare(`SELECT COALESCE(SUM(cost_minor),0) AS s FROM drops`).get().s,
    paid_out_minor:   db.prepare(`SELECT COALESCE(SUM(payout_minor),0) AS s FROM drops`).get().s,
    biggest_payout_minor: db.prepare(`SELECT COALESCE(MAX(payout_minor),0) AS s FROM drops`).get().s,
  };
  summary.realised_rtp = summary.wagered_minor > 0
    ? +(summary.paid_out_minor / summary.wagered_minor).toFixed(6)
    : null;
  res.json(summary);
});

export default r;
