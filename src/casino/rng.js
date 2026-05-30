// === Provably-fair RNG for the live game.
//
// Cryptographic outcome chain — every drop is reproducible from a
// (serverSeed, clientSeed, nonce) triplet, and the server seed is
// SHA-256-committed BEFORE play so the operator cannot rewrite
// history mid-session.
//
// Verification protocol (the player can run this client-side):
//   1. At session start, server publishes serverHash = SHA256(serverSeed).
//   2. Player optionally sets clientSeed (otherwise a default is used).
//   3. Each drop uses an incrementing nonce.
//   4. At session end (or rotation), server reveals serverSeed.
//   5. Player verifies: SHA256(serverSeed) === serverHash. If yes, the
//      seed wasn't swapped. Player can now recompute every past slot:
//          slot = weightedPick(binomialCDF(rows), uniformFromHmac(...))
//
// Slot RNG: HMAC-SHA256(serverSeed, clientSeed + ':' + nonce). First
// 4 bytes interpreted as a uint32 / 2^32 give a uniform float in [0,1).
// Combined with the binomial CDF, this yields a binomially-distributed
// slot — matching what natural plinko physics would produce, but
// auditable.

import { binomialCDF, weightedPick } from './math.js';

const LS_KEY = 'plinko-rng-session-v1';

// --- byte / hex helpers ---------------------------------------------
function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
  return a;
}

// --- primitives -----------------------------------------------------
export function randomServerSeed() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}
export async function sha256Hex(message) {
  const enc = new TextEncoder().encode(message);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return bytesToHex(buf);
}
async function hmacSHA256(keyBytes, messageString) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(messageString),
  );
  return new Uint8Array(sig);
}

// --- the actual rolls -----------------------------------------------

/**
 * One uniform float in [0,1) from (serverSeed, clientSeed, nonce).
 * Deterministic — same inputs always produce the same output. That's
 * the entire fairness guarantee.
 */
export async function rollUniform(serverSeed, clientSeed, nonce) {
  const sig = await hmacSHA256(hexToBytes(serverSeed), `${clientSeed}:${nonce}`);
  const u32 = ((sig[0] << 24 | sig[1] << 16 | sig[2] << 8 | sig[3]) >>> 0);
  return u32 / 0x100000000;
}

/**
 * Roll a slot index (0..rows) per the binomial distribution for the
 * given row count. The slot is what the ball MUST land in.
 */
export async function rollSlot(serverSeed, clientSeed, nonce, rows) {
  const u = await rollUniform(serverSeed, clientSeed, nonce);
  return weightedPick(binomialCDF(rows), u);
}

/**
 * Pre-roll the per-peg-row left/right decisions that get the ball
 * from slot 0 to the target slot. Used by the physics layer to bias
 * peg bounces so the visual play converges to the predetermined slot
 * without any visible snapping.
 *
 * Returns an array of (rows) floats in [0,1) plus the target. Uses
 * a second HMAC keyed off `${nonce}-bounce-${i}` so the bounce stream
 * is independent of the slot pick.
 */
export async function rollDrop(serverSeed, clientSeed, nonce, rows) {
  const slot = await rollSlot(serverSeed, clientSeed, nonce, rows);
  const bounces = new Array(rows);
  for (let i = 0; i < rows; i++) {
    bounces[i] = await rollUniform(serverSeed, clientSeed, `${nonce}-bounce-${i}`);
  }
  return { slot, bounces, nonce, rows };
}

// --- session management --------------------------------------------

/**
 * Create a fresh provably-fair session. Persists to localStorage so
 * the audit chain survives reloads.
 */
export async function createSession({ clientSeed = 'plinko-default' } = {}) {
  const serverSeed = randomServerSeed();
  const serverHash = await sha256Hex(serverSeed);
  return { serverSeed, serverHash, clientSeed, nonce: 0, createdAt: Date.now() };
}

export async function loadOrCreateSession() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.serverSeed && s.serverHash) return s;
    }
  } catch {}
  const s = await createSession();
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
  return s;
}

export function persistSession(session) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(session)); } catch {}
}

/**
 * Roll the next drop and advance the nonce. Returns { slot, bounces,
 * nonce } for this drop. Caller should persist the session afterwards
 * if it lives outside the closure.
 */
export async function nextDrop(session, rows) {
  const out = await rollDrop(session.serverSeed, session.clientSeed, session.nonce, rows);
  session.nonce += 1;
  persistSession(session);
  return out;
}

/**
 * Rotate to a fresh server seed. The OLD seed should be revealed to
 * the player so they can audit every drop in the previous chain.
 */
export async function rotateSession(session) {
  const revealed = {
    serverSeed: session.serverSeed,
    serverHash: session.serverHash,
    clientSeed: session.clientSeed,
    finalNonce: session.nonce,
  };
  const fresh = await createSession({ clientSeed: session.clientSeed });
  persistSession(fresh);
  return { revealed, fresh };
}
