// === Casino math primitives — used by both the live game and
// the `npm run rtp` audit script. No DOM, no globals — pure JS.

/**
 * Binomial PMF for a plinko triangle with `n` peg rows.
 *
 * If every peg bounce is a fair 50/50, the ball lands in slot `k`
 * (k = 0..n) with probability C(n,k) / 2^n. This is the theoretical
 * distribution every slot multiplier table is calibrated against.
 *
 * Returned as a Float array of length n+1, summing to 1.
 */
export function binomialPMF(n) {
  const probs = new Array(n + 1);
  const twoToN = Math.pow(2, n);
  // C(n,k) iteratively — n! overflows above 21, this stays exact.
  let c = 1;            // C(n,0)
  probs[0] = 1 / twoToN;
  for (let k = 1; k <= n; k++) {
    c = c * (n - k + 1) / k;
    probs[k] = c / twoToN;
  }
  return probs;
}

/**
 * Cumulative distribution. cdf[k] = P(slot ≤ k). Combined with a
 * uniform random in [0,1), gives a binomially-distributed slot.
 */
export function binomialCDF(n) {
  const pmf = binomialPMF(n);
  const cdf = new Array(n + 1);
  let acc = 0;
  for (let k = 0; k <= n; k++) {
    acc += pmf[k];
    cdf[k] = acc;
  }
  cdf[n] = 1;           // float drift defence
  return cdf;
}

/**
 * Pick a slot index given a CDF and a uniform random u ∈ [0,1).
 * Linear scan — n ≤ 16, no need for binary search.
 */
export function weightedPick(cdf, u) {
  for (let k = 0; k < cdf.length; k++) {
    if (u <= cdf[k]) return k;
  }
  return cdf.length - 1;
}

/**
 * Expected return on the SLOT-only step (ignores ball-type bonuses).
 *   RTP_slot = Σ P(slot_k) × mults_k
 * Industry casino RTPs sit in 95–99%. Below 90% is brutal for the
 * player; above 100% means the house loses money — also a problem.
 */
export function slotRTP(mults, n) {
  if (mults.length !== n + 1) {
    throw new Error(`mults length ${mults.length} != n+1 (${n + 1})`);
  }
  const pmf = binomialPMF(n);
  let r = 0;
  for (let k = 0; k <= n; k++) r += pmf[k] * mults[k];
  return r;
}

/**
 * Variance of slot payout per unit bet — the volatility knob. HIGH
 * risk should have notably higher variance than LOW even at equal
 * RTP. If LOW and HIGH have similar σ, the tiers aren't doing their
 * job.
 *   Var = Σ P(slot) × mult² − RTP²
 */
export function slotVariance(mults, n) {
  const pmf = binomialPMF(n);
  const ev = slotRTP(mults, n);
  let ev2 = 0;
  for (let k = 0; k <= n; k++) ev2 += pmf[k] * mults[k] * mults[k];
  return ev2 - ev * ev;
}

/**
 * Expected ball-type multiplier given a weighted ball roll.
 * BALL_TYPES is { id: { weight, payoutMul, ... } }.
 *
 *   E[ball_mult] = Σ (weight_i / Σweights) × payoutMul_i
 *
 * Final RTP = slotRTP × ballMul × (1 / cost_multiplier from features).
 */
export function ballTypeEV(ballTypes) {
  const entries = Object.values(ballTypes);
  const totalW = entries.reduce((s, b) => s + (b.weight ?? 0), 0);
  if (totalW <= 0) return 1;
  return entries.reduce((s, b) => s + ((b.weight ?? 0) / totalW) * (b.payoutMul ?? 1), 0);
}

/**
 * Combined effective RTP per drop.
 *   effective_rtp = slot_rtp × ball_ev / cost_multiplier
 * The cost_multiplier reflects feature toggles (mult / respin /
 * multi) raising the bet but, in this version, not directly raising
 * the slot payout. So toggles strictly increase the house edge
 * unless the features compensate (which respin partially does).
 */
export function effectiveRTP({ mults, n, ballTypes = null, costMultiplier = 1 }) {
  const sr = slotRTP(mults, n);
  const be = ballTypes ? ballTypeEV(ballTypes) : 1;
  return (sr * be) / costMultiplier;
}
