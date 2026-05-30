import { Router } from 'express';
import { stmt } from '../db.js';
import { rollDrop, uniformFloat } from '../services/rng.js';
import { settleDrop, validateBet, pickBallType, computeCost } from '../services/casino.js';
import { executeDrop, HttpError } from '../services/ledger.js';
import { dropLimiter, requireSession } from '../middleware/index.js';

const r = Router();

// === POST /drops ====================================================
// The hot path. Server is authoritative for:
//   - bet validation + limits
//   - cost computation from features
//   - balance debit / payout credit (atomic ledger)
//   - RNG slot + bounce stream (private seed never leaves the server)
//   - nonce increment (race-safe)
//
// Idempotency: if the client retries the same idempotency_key, we
// return the original outcome without re-debiting. Safe for flaky
// connections.
r.post('/', requireSession, dropLimiter, (req, res, next) => {
  try {
    const session = stmt.getSession.get(req.sessionToken);
    if (!session) throw new HttpError(401, 'session not found');
    if (session.status !== 'active') throw new HttpError(409, `session ${session.status}`);

    const {
      rows, risk, features = {},
      bet_minor,
      idempotency_key,
    } = req.body || {};

    // Replay protection — return cached outcome if same idem key on
    // this session already produced one.
    if (idempotency_key) {
      const prior = stmt.getDropByIdem.get({
        session_id: session.id,
        idempotency_key: String(idempotency_key).slice(0, 80),
      });
      if (prior) {
        return res.json(formatDropResponse(session, prior, JSON.parse(prior.bounces_json), /*replay*/true));
      }
    }

    const errs = validateBet({ rows, risk, bet_minor, features });
    if (errs.length) throw new HttpError(400, errs.join('; '));

    const cost_minor = computeCost(bet_minor, features);
    if (session.balance_minor < cost_minor) throw new HttpError(402, 'insufficient balance');

    // Roll the slot + bounce stream from the session's secret seed.
    const { slot, bounces } = rollDrop({
      serverSeed: session.server_seed,
      clientSeed: session.client_seed,
      nonce: session.nonce,
      rows,
    });

    // Ball type is a separate cryptographic draw so its variance
    // doesn't correlate with the slot — keyed off "{nonce}-ball".
    const ballU = uniformFloat(session.server_seed, session.client_seed, `${session.nonce}-ball`);
    const ballType = pickBallType(ballU).id;

    const settled = settleDrop({ rows, risk, features, bet_minor, slot, ballType });

    const { drop_id, balance_minor } = executeDrop({
      session,
      idempotency_key: idempotency_key ? String(idempotency_key).slice(0, 80) : null,
      rows, risk, features,
      ball_type: ballType,
      bet_minor,
      cost_minor: settled.cost_minor,
      slot,
      slot_multiplier: settled.slot_multiplier,
      final_multiplier: settled.final_multiplier,
      payout_minor: settled.payout_minor,
      bounces,
    });

    res.json({
      replay: false,
      sessionId: session.id,
      nonce: session.nonce,
      drop_id,
      ball_type: ballType,
      rows, risk, features,
      bet_minor,
      cost_minor: settled.cost_minor,
      slot,
      slot_multiplier: settled.slot_multiplier,
      final_multiplier: settled.final_multiplier,
      payout_minor: settled.payout_minor,
      profit_minor: settled.profit_minor,
      balance_minor,
      bounces,                            // client uses these to bias physics
      server_hash: session.server_hash,   // for client-side display
    });
  } catch (e) { next(e); }
});

function formatDropResponse(session, drop, bounces, replay) {
  return {
    replay,
    sessionId: session.id,
    nonce: drop.nonce,
    drop_id: drop.id,
    ball_type: drop.ball_type,
    rows: drop.rows,
    risk: drop.risk,
    features: JSON.parse(drop.features_json),
    bet_minor: drop.bet_minor,
    cost_minor: drop.cost_minor,
    slot: drop.slot,
    slot_multiplier: drop.slot_multiplier,
    final_multiplier: drop.final_multiplier,
    payout_minor: drop.payout_minor,
    profit_minor: drop.profit_minor,
    balance_minor: session.balance_minor,
    bounces,
    server_hash: session.server_hash,
  };
}

export default r;
