import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db, stmt } from '../db.js';
import { config } from '../config.js';
import { randomServerSeed, sha256Hex, reproduceDrop } from '../services/rng.js';
import { applyLedgerEntry, HttpError } from '../services/ledger.js';
import { sessionLimiter, requireSession, ipHash } from '../middleware/index.js';
import { slotMultipliers } from '../services/casino.js';

const r = Router();

function newSessionId() {
  // 128-bit opaque token, base64url. Long enough that brute-forcing
  // it is infeasible. Used as the bearer token by the client.
  return randomBytes(24).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function publicSession(s) {
  return {
    sessionId: s.id,
    serverHash: s.server_hash,
    clientSeed: s.client_seed,
    nonce: s.nonce,
    currency: s.currency,
    balance_minor: s.balance_minor,
    status: s.status,
  };
}

// === POST /sessions =================================================
// Create a new provably-fair session. Optionally accepts a player-
// chosen clientSeed and an operator-supplied player_ref. Issues a
// signup bonus from config.signupBonusMinor.
r.post('/', sessionLimiter, (req, res, next) => {
  try {
    const { clientSeed, currency, player_ref } = req.body || {};
    const cur = (currency || config.defaultCurrency).toUpperCase();
    if (!config.currencies[cur]) throw new HttpError(400, `unknown currency ${cur}`);

    const id = newSessionId();
    const serverSeed = randomServerSeed();
    const serverHash = sha256Hex(serverSeed);
    const cleanedClientSeed = (clientSeed && String(clientSeed).slice(0, 64)) || randomBytes(8).toString('hex');
    const now = Date.now();

    // Rate limit per-IP session creation (defence in depth on top of
    // express-rate-limit which is per-IP for /sessions already).
    const recent = stmt.countRecentSessionsByIp.get(ipHash(req), now - 60_000);
    if (recent && recent.n >= config.rateLimit.sessionsPerMinute) {
      throw new HttpError(429, 'too many sessions from this IP');
    }

    db.transaction(() => {
      stmt.insertSession.run({
        id,
        server_seed: serverSeed,
        server_hash: serverHash,
        client_seed: cleanedClientSeed,
        currency: cur,
        balance_minor: 0,                  // signup bonus applied via ledger below
        operator_id: config.operator.id,
        operator_brand: config.operator.brand,
        player_ref: player_ref ? String(player_ref).slice(0, 128) : null,
        ip_hash: ipHash(req),
        user_agent: (req.get('User-Agent') || '').slice(0, 256),
        created_at: now,
      });
      if (config.signupBonusMinor > 0) {
        applyLedgerEntry({
          sessionId: id,
          type: 'signup',
          amount_minor: config.signupBonusMinor,
          note: 'demo signup bonus',
        });
      }
    })();

    const sess = stmt.getSession.get(id);
    res.json(publicSession(sess));
  } catch (e) { next(e); }
});

// === GET /sessions/me ==============================================
// Read the current session as the player sees it. Server seed stays
// hidden until rotation.
r.get('/me', requireSession, (req, res, next) => {
  try {
    const s = stmt.getSession.get(req.sessionToken);
    if (!s) throw new HttpError(401, 'session not found');
    res.json(publicSession(s));
  } catch (e) { next(e); }
});

// === POST /sessions/me/client-seed =================================
// Player rotates their own client seed BEFORE any drops have been
// made on the current server seed. After the first drop, locked.
r.post('/me/client-seed', requireSession, (req, res, next) => {
  try {
    const { clientSeed } = req.body || {};
    if (!clientSeed || typeof clientSeed !== 'string') throw new HttpError(400, 'clientSeed required');
    const update = stmt.setClientSeed.run({
      id: req.sessionToken,
      client_seed: clientSeed.slice(0, 64),
    });
    if (update.changes !== 1) throw new HttpError(409, 'cannot change clientSeed after first drop');
    const s = stmt.getSession.get(req.sessionToken);
    res.json(publicSession(s));
  } catch (e) { next(e); }
});

// === POST /sessions/me/rotate ======================================
// Reveal the current server seed, hand back the entire drop history
// so the player can reproduce every outcome client-side, and mint a
// fresh session with a new committed hash. The old session is
// preserved in the DB for future audit.
r.post('/me/rotate', requireSession, (req, res, next) => {
  try {
    const old = stmt.getSession.get(req.sessionToken);
    if (!old) throw new HttpError(401, 'session not found');
    if (old.status !== 'active') throw new HttpError(409, 'session already rotated');

    const now = Date.now();
    const dropsRows = stmt.getDropsForSession.all(old.id);
    const drops = dropsRows.map(d => ({
      nonce: d.nonce,
      rows: d.rows,
      risk: d.risk,
      bet_minor: d.bet_minor,
      cost_minor: d.cost_minor,
      slot: d.slot,
      slot_multiplier: d.slot_multiplier,
      final_multiplier: d.final_multiplier,
      payout_minor: d.payout_minor,
      ball_type: d.ball_type,
      features: JSON.parse(d.features_json),
      created_at: d.created_at,
    }));

    // Mint the new session — carry the balance, currency, and operator
    // metadata across so the player keeps their wallet.
    const newId = newSessionId();
    const newSeed = randomServerSeed();
    const newHash = sha256Hex(newSeed);

    db.transaction(() => {
      stmt.insertRotation.run({
        session_id: old.id,
        revealed_seed: old.server_seed,
        server_hash: old.server_hash,
        client_seed: old.client_seed,
        final_nonce: old.nonce,
        drops_count: dropsRows.length,
        rotated_at: now,
        next_session_id: newId,
      });
      stmt.closeSessionForRotate.run({ id: old.id, now });
      stmt.insertSession.run({
        id: newId,
        server_seed: newSeed,
        server_hash: newHash,
        client_seed: old.client_seed,
        currency: old.currency,
        balance_minor: old.balance_minor,
        operator_id: old.operator_id,
        operator_brand: old.operator_brand,
        player_ref: old.player_ref,
        ip_hash: ipHash(req),
        user_agent: (req.get('User-Agent') || '').slice(0, 256),
        created_at: now,
      });
    })();

    res.json({
      revealed: {
        serverSeed: old.server_seed,
        serverHash: old.server_hash,
        clientSeed: old.client_seed,
        finalNonce: old.nonce,
        drops,
      },
      fresh: publicSession(stmt.getSession.get(newId)),
    });
  } catch (e) { next(e); }
});

// === GET /sessions/:id/audit =======================================
// Public audit endpoint — works without a bearer token because
// players need to verify ROTATED sessions even if they no longer
// hold the session id as a token. Only returns the seed once the
// session is rotated (otherwise it'd defeat the commit).
r.get('/:id/audit', (req, res, next) => {
  try {
    const s = stmt.getSession.get(req.params.id);
    if (!s) throw new HttpError(404, 'session not found');
    const drops = stmt.getDropsForSession.all(s.id);
    res.json({
      sessionId: s.id,
      serverHash: s.server_hash,
      clientSeed: s.client_seed,
      nonce: s.nonce,
      status: s.status,
      revealedSeed: s.status === 'rotated' ? s.server_seed : null,
      drops: drops.map(d => ({
        nonce: d.nonce,
        rows: d.rows,
        risk: d.risk,
        features: JSON.parse(d.features_json),
        ball_type: d.ball_type,
        bet_minor: d.bet_minor,
        cost_minor: d.cost_minor,
        slot: d.slot,
        slot_multiplier: d.slot_multiplier,
        final_multiplier: d.final_multiplier,
        payout_minor: d.payout_minor,
        created_at: d.created_at,
      })),
    });
  } catch (e) { next(e); }
});

// === POST /sessions/:id/verify-drop ================================
// Independent reproduction of one drop given the (now revealed) seed.
// Lets a player paste in a nonce + seed and check the slot matches.
// Doesn't require auth because the seed is already public after
// rotation.
r.post('/:id/verify-drop', (req, res, next) => {
  try {
    const { nonce, rows, clientSeed, revealedSeed } = req.body || {};
    if (typeof nonce !== 'number' || typeof rows !== 'number'
        || !clientSeed || !revealedSeed) {
      throw new HttpError(400, 'nonce, rows, clientSeed, revealedSeed required');
    }
    const out = reproduceDrop({ revealedSeed, clientSeed, nonce, rows });
    res.json(out);
  } catch (e) { next(e); }
});

export default r;
