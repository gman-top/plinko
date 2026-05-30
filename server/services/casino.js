// Game rules — kept on the server because the client cannot be
// trusted to enforce bet limits, cost multipliers, or table lookups.
//
// MULT_TABLE is imported from the shared src/state/config.js — same
// source the RTP audit script verifies. Don't fork it here, because
// then auditors would have to validate two copies.

import { MULT_TABLE, BALL_TYPES } from '../../src/state/config.js';
import { config } from '../config.js';

const RISK_VALUES = new Set(['LOW', 'MEDIUM', 'HIGH']);
const ROW_VALUES  = new Set([8, 10, 12, 14, 16]);

export function validateBet({ rows, risk, bet_minor, features }) {
  const errs = [];
  if (!ROW_VALUES.has(rows))  errs.push('rows must be 8/10/12/14/16');
  if (!RISK_VALUES.has(risk)) errs.push('risk must be LOW/MEDIUM/HIGH');
  if (!Number.isInteger(bet_minor) || bet_minor < config.bet.minMinor) errs.push(`bet below minimum ${config.bet.minMinor}`);
  if (bet_minor > config.bet.maxMinor) errs.push(`bet above maximum ${config.bet.maxMinor}`);
  if (features && typeof features !== 'object') errs.push('features must be an object');
  return errs;
}

export function costMultiplier(features = {}) {
  // Mirrors gameStore.cost(). Server is authoritative.
  let m = 1;
  if (features.mult)   m += 0.25;
  if (features.respin) m += 0.15;
  if (features.multi)  m += 0.30;
  return m;
}

export function computeCost(bet_minor, features = {}) {
  // Round to nearest integer minor unit. Casino convention: round in
  // the house's favour (ceil) on bet cost.
  return Math.ceil(bet_minor * costMultiplier(features));
}

/**
 * The "Multipliers" feature (`mult: true`) opens the standard
 * MULT_TABLE. When disabled, payouts are flattened toward the centre.
 * Mirror of gameStore.slotMultipliers().
 */
export function slotMultipliers(risk, rows, features = {}) {
  const tbl = (MULT_TABLE[risk] || MULT_TABLE.HIGH)[rows]
           || MULT_TABLE[risk][12];
  if (!features.mult) {
    return tbl.map(v => Math.max(0.5, Math.min(2.5, v * 0.4 + 0.6)));
  }
  return tbl;
}

/**
 * Weighted ball-type draw. Independent of the slot RNG to keep their
 * variance streams uncorrelated — but still cryptographically derived
 * so audit reproduction is exact. We feed a separate "ball" nonce.
 *
 * Returns one of the BALL_TYPES keys.
 */
export function pickBallType(uniform01) {
  const types = Object.values(BALL_TYPES);
  const total = types.reduce((s, t) => s + t.weight, 0);
  let r = uniform01 * total;
  for (const t of types) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return BALL_TYPES.gold;
}

/**
 * Resolve a drop end-to-end given the predetermined slot and ball
 * type. Returns the numbers the ledger needs.
 *
 * Payout cap: every payout is capped at bet * config.bet.maxPayoutMultiplier
 * regardless of slot multiplier — defence against a misconfigured
 * MULT_TABLE accidentally paying 10⁶× the bet.
 */
export function settleDrop({ rows, risk, features, bet_minor, slot, ballType }) {
  const mults = slotMultipliers(risk, rows, features);
  const slotM = mults[slot] ?? 0.5;
  const finalMult = slotM * (BALL_TYPES[ballType]?.payoutMul ?? 1);
  const cost_minor = computeCost(bet_minor, features);
  const cappedMult = Math.min(finalMult, config.bet.maxPayoutMultiplier);
  // Casino convention: round payout DOWN to favour the house on fractions.
  const payout_minor = Math.floor(bet_minor * cappedMult);
  return {
    cost_minor,
    slot_multiplier: slotM,
    final_multiplier: finalMult,
    payout_minor,
    profit_minor: payout_minor - cost_minor,
  };
}
