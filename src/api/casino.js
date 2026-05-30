// Client wrapper for the casino server. If VITE_CASINO_API is unset,
// every call returns null so the store can fall back to local-RNG mode
// (suitable for the GH Pages demo, never for real money).
//
// Token persistence: the bearer is the opaque sessionId issued by the
// server. We keep it in localStorage under LS_TOKEN. Calls auto-send
// it as `Authorization: Bearer <token>`.

const API_BASE = import.meta.env.VITE_CASINO_API || null;
export const isEnabled = () => !!API_BASE;

const LS_TOKEN = 'plinko-server-session-v1';

function readToken() {
  try { return localStorage.getItem(LS_TOKEN); } catch { return null; }
}
function writeToken(t) {
  try { t ? localStorage.setItem(LS_TOKEN, t) : localStorage.removeItem(LS_TOKEN); } catch {}
}

async function req(method, path, body) {
  if (!API_BASE) throw new Error('casino API not configured');
  const token = readToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = new Error(data?.error || `HTTP ${res.status}`);
    e.status = res.status;
    e.body = data;
    throw e;
  }
  return data;
}

/** Get or create a session. Persists the token on first creation. */
export async function ensureSession({ currency, clientSeed, playerRef } = {}) {
  if (!API_BASE) return null;
  // Try resuming an existing session token first.
  const existing = readToken();
  if (existing) {
    try { return await req('GET', '/sessions/me'); } catch (e) {
      if (e.status !== 401) throw e;
      writeToken(null);   // server doesn't know us — fall through to create
    }
  }
  const fresh = await req('POST', '/sessions', { currency, clientSeed, player_ref: playerRef });
  writeToken(fresh.sessionId);
  return fresh;
}

export async function setClientSeed(clientSeed) {
  return req('POST', '/sessions/me/client-seed', { clientSeed });
}

export async function rotateSession() {
  const out = await req('POST', '/sessions/me/rotate', {});
  // The server already minted a new sessionId; switch the bearer.
  if (out?.fresh?.sessionId) writeToken(out.fresh.sessionId);
  return out;
}

/**
 * Execute one drop. The server is authoritative — it debits, rolls,
 * credits and returns the per-row bounce stream the client uses to
 * bias physics toward the predetermined slot.
 *
 * `idempotency_key` should be a UUID v4 generated on the client so
 * a flaky connection can safely retry.
 */
export async function dropOne({ rows, risk, bet_minor, features, idempotency_key }) {
  return req('POST', '/drops', { rows, risk, bet_minor, features, idempotency_key });
}

export async function publicAudit(sessionId) {
  return req('GET', `/sessions/${encodeURIComponent(sessionId)}/audit`);
}

export async function verifyDrop({ sessionId, nonce, rows, clientSeed, revealedSeed }) {
  return req('POST', `/sessions/${encodeURIComponent(sessionId)}/verify-drop`,
    { nonce, rows, clientSeed, revealedSeed });
}

export function currentSessionId() { return readToken(); }
export function clearLocalSession() { writeToken(null); }
