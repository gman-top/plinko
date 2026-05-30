// Server-side provably-fair RNG. Mirrors src/casino/rng.js semantics
// but uses Node's native `crypto` module instead of WebCrypto.
//
// Outcome chain:
//   serverSeed (secret, 32 random bytes)
//   serverHash = SHA256(serverSeed)              ← committed at session start
//   clientSeed (player-supplied)
//   nonce (incremented per drop, never reused)
//   raw_hmac = HMAC_SHA256(serverSeed, clientSeed + ':' + nonce)
//   uniform[0,1) = first 4 bytes of raw_hmac as uint32 / 2^32
//   slot = weightedPick(binomialCDF(rows), uniform)
//
// Two independent random streams per drop:
//   - the SLOT stream:    nonce = "N"
//   - the BOUNCES stream: nonce = "N-bounce-i"  for i = 0..rows-1
// keeping them on separate keys means leaking one doesn't leak the
// other (defence in depth).

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { binomialCDF, weightedPick } from '../../src/casino/math.js';

export function randomServerSeed() {
  return randomBytes(32).toString('hex');
}

export function sha256Hex(message) {
  return createHash('sha256').update(message).digest('hex');
}

function hmacBytes(serverSeedHex, message) {
  return createHmac('sha256', Buffer.from(serverSeedHex, 'hex')).update(message).digest();
}

export function uniformFloat(serverSeedHex, clientSeed, nonceLabel) {
  const sig = hmacBytes(serverSeedHex, `${clientSeed}:${nonceLabel}`);
  // First 4 bytes as uint32 → [0, 1).
  const u32 = (sig.readUInt32BE(0) >>> 0);
  return u32 / 0x100000000;
}

/**
 * Roll the slot index AND per-row physics-bias floats for one drop.
 * Used both at drop time (to compute the outcome) and at audit time
 * (to reproduce a past outcome from a revealed seed).
 */
export function rollDrop({ serverSeed, clientSeed, nonce, rows }) {
  const slot = weightedPick(binomialCDF(rows), uniformFloat(serverSeed, clientSeed, String(nonce)));
  const bounces = new Array(rows);
  for (let i = 0; i < rows; i++) {
    bounces[i] = uniformFloat(serverSeed, clientSeed, `${nonce}-bounce-${i}`);
  }
  return { slot, bounces, nonce, rows };
}

/**
 * Public-key style: given a revealed server seed and the same (client
 * seed, nonce) the auditor can reproduce the outcome exactly. We
 * expose a helper so the verify endpoint can run it server-side and
 * also so external tooling can import it.
 */
export function reproduceDrop({ revealedSeed, clientSeed, nonce, rows }) {
  return rollDrop({ serverSeed: revealedSeed, clientSeed, nonce, rows });
}
