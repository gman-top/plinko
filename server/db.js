// SQLite schema, migrations, and prepared statements.
//
// Schema is designed for casino audit compliance:
//   - sessions: opaque session_id (public) + server_seed (private until
//     rotation) + server_hash (public commit) + client_seed + nonce.
//   - drops:    one row per game round, including the FULL set of inputs
//     and outputs the auditor needs to reproduce. References its session.
//   - ledger:   every balance mutation (bet debit, payout credit, signup
//     bonus, manual adjustment). Each row is immutable; balance is the
//     running sum, never mutated in-place.
//   - seed_rotations: each (revealed) server seed is recorded with its
//     final nonce so the historical chain can be re-verified months later.
//
// All bet/balance amounts are stored as INTEGERS in the currency's
// minor unit (cents/satoshis/etc). NEVER floats — float drift in money
// columns is how casinos lose their licence.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');         // crash-safe concurrent reads
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// === MIGRATIONS ====================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  );
  INSERT OR IGNORE INTO schema_version (version) VALUES (0);

  CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    server_seed     TEXT NOT NULL,                       -- 32-byte hex, kept secret
    server_hash     TEXT NOT NULL,                       -- SHA-256(server_seed), public commit
    client_seed     TEXT NOT NULL,
    nonce           INTEGER NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL,
    balance_minor   INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'active',      -- active | rotated | closed
    operator_id     TEXT,
    operator_brand  TEXT,
    player_ref      TEXT,                                -- external player id when operator-integrated
    ip_hash         TEXT,                                -- SHA-256(ip) — never raw IP, GDPR
    user_agent      TEXT,
    created_at      INTEGER NOT NULL,
    last_drop_at    INTEGER,
    closed_at       INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_status     ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_player_ref ON sessions(player_ref);

  CREATE TABLE IF NOT EXISTS drops (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    nonce           INTEGER NOT NULL,
    idempotency_key TEXT,                                -- client-supplied, dedupes retries
    rows            INTEGER NOT NULL,
    risk            TEXT NOT NULL,
    features_json   TEXT NOT NULL,
    ball_type       TEXT NOT NULL,
    bet_minor       INTEGER NOT NULL,
    cost_minor      INTEGER NOT NULL,                    -- bet × feature cost multiplier
    slot            INTEGER NOT NULL,
    slot_multiplier REAL NOT NULL,
    final_multiplier REAL NOT NULL,
    payout_minor    INTEGER NOT NULL,
    profit_minor    INTEGER NOT NULL,                    -- payout - cost
    bounces_json    TEXT NOT NULL,                       -- per-row biases for client physics
    server_seed_hash TEXT NOT NULL,                      -- copy of commit for tamper proof
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    UNIQUE (session_id, nonce)
  );
  CREATE INDEX IF NOT EXISTS idx_drops_session    ON drops(session_id);
  CREATE INDEX IF NOT EXISTS idx_drops_created_at ON drops(created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_drops_idem
    ON drops(session_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

  CREATE TABLE IF NOT EXISTS ledger (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    type            TEXT NOT NULL,        -- signup | bet | payout | adjust | deposit | withdrawal
    amount_minor    INTEGER NOT NULL,     -- signed: negative = debit
    balance_after_minor INTEGER NOT NULL, -- snapshot post-mutation
    drop_id         INTEGER,
    note            TEXT,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (drop_id) REFERENCES drops(id)
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_session ON ledger(session_id);
  CREATE INDEX IF NOT EXISTS idx_ledger_type    ON ledger(type);

  CREATE TABLE IF NOT EXISTS seed_rotations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    revealed_seed   TEXT NOT NULL,
    server_hash     TEXT NOT NULL,
    client_seed     TEXT NOT NULL,
    final_nonce     INTEGER NOT NULL,
    drops_count     INTEGER NOT NULL,
    rotated_at      INTEGER NOT NULL,
    next_session_id TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
  CREATE INDEX IF NOT EXISTS idx_rotations_session ON seed_rotations(session_id);
`);

// === Prepared statements (hot paths) ===============================
export const stmt = {
  insertSession: db.prepare(`
    INSERT INTO sessions (
      id, server_seed, server_hash, client_seed, nonce, currency,
      balance_minor, operator_id, operator_brand, player_ref,
      ip_hash, user_agent, created_at
    ) VALUES (
      @id, @server_seed, @server_hash, @client_seed, 0, @currency,
      @balance_minor, @operator_id, @operator_brand, @player_ref,
      @ip_hash, @user_agent, @created_at
    )
  `),
  getSession: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  bumpSessionNonce: db.prepare(`
    UPDATE sessions
       SET nonce = nonce + 1, last_drop_at = @now, balance_minor = @balance_minor
     WHERE id = @id AND nonce = @expected_nonce AND status = 'active'
  `),
  setClientSeed: db.prepare(`
    UPDATE sessions SET client_seed = @client_seed
     WHERE id = @id AND nonce = 0 AND status = 'active'
  `),
  closeSessionForRotate: db.prepare(`
    UPDATE sessions SET status = 'rotated', closed_at = @now WHERE id = @id
  `),

  insertDrop: db.prepare(`
    INSERT INTO drops (
      session_id, nonce, idempotency_key, rows, risk, features_json,
      ball_type, bet_minor, cost_minor, slot, slot_multiplier,
      final_multiplier, payout_minor, profit_minor, bounces_json,
      server_seed_hash, created_at
    ) VALUES (
      @session_id, @nonce, @idempotency_key, @rows, @risk, @features_json,
      @ball_type, @bet_minor, @cost_minor, @slot, @slot_multiplier,
      @final_multiplier, @payout_minor, @profit_minor, @bounces_json,
      @server_seed_hash, @created_at
    )
  `),
  getDropByIdem: db.prepare(`
    SELECT * FROM drops WHERE session_id = @session_id AND idempotency_key = @idempotency_key
  `),
  getDropsForSession: db.prepare(`
    SELECT * FROM drops WHERE session_id = ? ORDER BY nonce ASC
  `),
  countDropsForSession: db.prepare(`
    SELECT COUNT(*) AS n FROM drops WHERE session_id = ?
  `),

  insertLedger: db.prepare(`
    INSERT INTO ledger (
      session_id, type, amount_minor, balance_after_minor,
      drop_id, note, created_at
    ) VALUES (
      @session_id, @type, @amount_minor, @balance_after_minor,
      @drop_id, @note, @created_at
    )
  `),

  insertRotation: db.prepare(`
    INSERT INTO seed_rotations (
      session_id, revealed_seed, server_hash, client_seed,
      final_nonce, drops_count, rotated_at, next_session_id
    ) VALUES (
      @session_id, @revealed_seed, @server_hash, @client_seed,
      @final_nonce, @drops_count, @rotated_at, @next_session_id
    )
  `),

  countRecentSessionsByIp: db.prepare(`
    SELECT COUNT(*) AS n FROM sessions
     WHERE ip_hash = ? AND created_at > ?
  `),
};
