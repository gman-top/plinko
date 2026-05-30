// All balance mutations go through here. NEVER call
// db.prepare(`UPDATE sessions SET balance_minor = ...`) directly —
// because then no ledger row is written and a regulator can't audit
// the change.

import { db, stmt } from '../db.js';

/**
 * Append a ledger entry and atomically update the session balance.
 * All in one transaction — partial state is impossible.
 *
 *   type:      'signup' | 'bet' | 'payout' | 'adjust' | 'deposit' | 'withdrawal'
 *   amount_minor: signed integer (negative debits, positive credits)
 *   dropId:    drop FK if this entry is tied to a game round
 *   note:      free-text justification (operator visible only)
 *
 * Returns the new balance, throws if balance would go negative on bet.
 */
export function applyLedgerEntry({ sessionId, type, amount_minor, drop_id = null, note = null, allowNegative = false }) {
  const now = Date.now();
  return db.transaction(() => {
    const sess = stmt.getSession.get(sessionId);
    if (!sess) throw new HttpError(404, 'session not found');
    if (sess.status !== 'active') throw new HttpError(409, `session is ${sess.status}`);
    const next = sess.balance_minor + amount_minor;
    if (!allowNegative && next < 0) throw new HttpError(402, 'insufficient balance');
    // Update sessions.balance_minor in place; ledger row is the immutable trail.
    db.prepare(`UPDATE sessions SET balance_minor = ? WHERE id = ?`).run(next, sessionId);
    stmt.insertLedger.run({
      session_id: sessionId,
      type,
      amount_minor,
      balance_after_minor: next,
      drop_id,
      note,
      created_at: now,
    });
    return next;
  })();
}

/**
 * The hot path: charge cost, append bet ledger, insert the drop,
 * append payout ledger, and bump the session nonce — all atomically.
 * If anything throws, the whole transaction rolls back.
 */
export function executeDrop({
  session,
  idempotency_key,
  rows, risk, features,
  ball_type,
  bet_minor, cost_minor,
  slot, slot_multiplier, final_multiplier, payout_minor,
  bounces,
}) {
  const now = Date.now();
  return db.transaction(() => {
    // Optimistic nonce bump — fails if another request raced past us.
    const newBalance = session.balance_minor - cost_minor + payout_minor;
    const bumped = stmt.bumpSessionNonce.run({
      id: session.id,
      now,
      balance_minor: newBalance,
      expected_nonce: session.nonce,
    });
    if (bumped.changes !== 1) throw new HttpError(409, 'concurrent drop in flight');

    const dropRow = stmt.insertDrop.run({
      session_id: session.id,
      nonce: session.nonce,
      idempotency_key,
      rows, risk,
      features_json: JSON.stringify(features ?? {}),
      ball_type,
      bet_minor, cost_minor,
      slot,
      slot_multiplier,
      final_multiplier,
      payout_minor,
      profit_minor: payout_minor - cost_minor,
      bounces_json: JSON.stringify(bounces),
      server_seed_hash: session.server_hash,
      created_at: now,
    });
    const drop_id = dropRow.lastInsertRowid;

    // Ledger: bet debit, then payout credit. Two rows so each side
    // is visible to auditors. Use the running balance from above as
    // the snapshot — we already computed it.
    stmt.insertLedger.run({
      session_id: session.id,
      type: 'bet',
      amount_minor: -cost_minor,
      balance_after_minor: session.balance_minor - cost_minor,
      drop_id,
      note: null,
      created_at: now,
    });
    if (payout_minor > 0) {
      stmt.insertLedger.run({
        session_id: session.id,
        type: 'payout',
        amount_minor: payout_minor,
        balance_after_minor: newBalance,
        drop_id,
        note: null,
        created_at: now,
      });
    }
    return { drop_id, balance_minor: newBalance };
  })();
}

// Re-export so routes can throw structured errors.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
