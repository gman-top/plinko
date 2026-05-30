# Plinko Gone Wild — Casino Server

Provably-fair server for the Plinko game. Production-grade:

- **HMAC-SHA256** outcome chain. Server seed is committed via SHA-256
  hash before play, revealed on rotation.
- **Atomic ledger**. Every balance change is an immutable row. No
  in-place balance updates outside a wrapping transaction.
- **Idempotent drops**. Client supplies an `idempotency_key`; retries
  return the original outcome without re-debiting.
- **RTP self-audit endpoint**. `GET /api/rtp` returns the live RTP per
  (risk, rows) cell — for the regulator's automated checks.
- **Audit endpoint**. `GET /api/sessions/:id/audit` returns every drop
  in a session. After rotation, the revealed seed is included so a
  player or auditor can reproduce every outcome client-side.
- **Sharing math with the client**. The server imports
  `src/casino/math.js` and `src/state/config.js` directly — same
  `MULT_TABLE`, same `binomialCDF`, no fork drift.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/sessions` | none | Create a new session. Returns `{ sessionId, serverHash, clientSeed, balance_minor }`. |
| `GET`  | `/api/sessions/me` | Bearer | Read your own session. |
| `POST` | `/api/sessions/me/client-seed` | Bearer | Change your clientSeed **before** the first drop. |
| `POST` | `/api/sessions/me/rotate` | Bearer | Reveal the current server seed, return full drop history, mint a fresh session inheriting balance. |
| `GET`  | `/api/sessions/:id/audit` | none | Public read-only audit. Reveals seed only if session is rotated. |
| `POST` | `/api/sessions/:id/verify-drop` | none | Re-derive a single outcome from a revealed seed. |
| `POST` | `/api/drops` | Bearer | The hot path. Validates, debits, rolls, credits, returns outcome + bounce stream for the client physics layer. |
| `GET`  | `/api/health` | none | Liveness probe. |
| `GET`  | `/api/rtp` | none | Live RTP per (risk, rows). Used by regulator integration. |
| `GET`  | `/api/stats` | none | Operator dashboard read — no seed exposure. |

Authentication uses an opaque bearer token equal to `sessionId`.
Replace with operator JWT verification in `middleware/index.js`
when integrating with SoftSwiss / EveryMatrix / OneTouch / etc.

## Architecture

```
client ─── POST /api/drops { bet, rows, risk, features, idempotency_key }
            │ Authorization: Bearer <sessionId>
            ▼
   ┌──────────────┐
   │  middleware  │  cors, helmet, rate limit, auth
   └──────┬───────┘
          │
          ▼
   ┌──────────────────────────────┐
   │ services/casino.js           │  validate bet, compute cost
   ├──────────────────────────────┤
   │ services/rng.js              │  HMAC_SHA256(serverSeed, …) → slot
   ├──────────────────────────────┤
   │ services/casino.js settle()  │  slot × multiplier × payout cap
   ├──────────────────────────────┤
   │ services/ledger.executeDrop()│  atomic txn:
   │                              │   - bump session.nonce
   │                              │   - insert drop
   │                              │   - ledger row (bet debit)
   │                              │   - ledger row (payout credit)
   │                              │   - update balance
   └──────┬───────────────────────┘
          │
          ▼
       SQLite (WAL, FK on, NORMAL sync)
```

The schema lives in `db.js`. Every column the regulator needs to
audit a drop is captured (server seed hash, nonce, idempotency key,
bet, cost, slot, multiplier, payout, profit, timestamp, IP hash).

## Running locally

```bash
cd server
cp .env.example .env
npm install
npm run dev      # node --watch index.js
# → http://localhost:4000/api/health
```

Then in the project root:

```bash
echo "VITE_CASINO_API=http://localhost:4000/api" >> .env.local
npm run dev
```

The client auto-switches to server-side outcomes when `VITE_CASINO_API`
is set. Without it, the client falls back to its local provably-fair
RNG (suitable for the GH Pages demo, not for real money).

## Deploying

### Render / Railway / Fly

All three deploy from the Dockerfile directly. The container expects
a persistent volume mounted at `/data`. Single env vars need setting:

| Env | Purpose |
|-----|---------|
| `ALLOWED_ORIGINS` | Front-end domain(s), comma-separated |
| `OPERATOR_ID` / `OPERATOR_BRAND` | Stamped on every drop |
| `SIGNUP_BONUS_MINOR` | Demo balance (set to `0` for real wallets) |
| `MIN_BET_MINOR` / `MAX_BET_MINOR` | Bet limits |
| `MAX_DROPS_PER_SEED` | Auto-rotation cadence |
| `DATABASE_PATH` | Must point at the persistent volume |

For Postgres / Supabase, swap `better-sqlite3` with a Postgres driver
inside `db.js` — the query shapes stay the same. (SQLite is fine for
single-region operations up to ~10⁷ drops.)

### Real-money checklist

Before flipping the switch, the following items typically come up
during licensing (Curaçao, MGA, UKGC):

- [ ] **RNG certification.** Submit `services/rng.js` + `scripts/rtp.mjs`
      output to iTech Labs / GLI / BMM. The deterministic test vectors
      they ask for: `HMAC_SHA256(seed, "clientSeed:nonce")` → fixed bytes.
- [ ] **AML / KYC** integration in front of `POST /api/sessions`.
      Replace anonymous bearer with operator JWT.
- [ ] **Wallet integration.** Swap `applyLedgerEntry({ type: 'signup' })`
      bonus with `operator.wallet.debit(player, bet)` and
      `operator.wallet.credit(player, payout)` calls. The ledger
      remains the canonical drop-side history; operator wallet
      remains canonical for cashier.
- [ ] **Responsible gambling.** Add session loss / time limits in
      `middleware/index.js`. Block drops past those limits.
- [ ] **GDPR.** IP is already hashed at rest. Add a `DELETE /sessions/:id`
      endpoint that nulls out PII while preserving the audit chain
      (seed + outcomes stay; identifiers go).
- [ ] **Regulator reporting.** Subscribe to ledger appends and push
      to the operator's data lake.
- [ ] **Hot/cold seed split.** For very large operators, the master
      server seed sits in an HSM and only its HMAC sub-keys live on
      the game server.

## Audit reproduction

Once a session is rotated, anyone in the world can reproduce every
outcome it ever paid:

```javascript
// Given the rotation reveal {revealedSeed, clientSeed, drops}
import { createHmac } from 'node:crypto';
import { binomialCDF, weightedPick } from './src/casino/math.js';

for (const d of drops) {
  const sig = createHmac('sha256', Buffer.from(revealedSeed, 'hex'))
    .update(`${clientSeed}:${d.nonce}`).digest();
  const u = sig.readUInt32BE(0) / 0x100000000;
  const reproducedSlot = weightedPick(binomialCDF(d.rows), u);
  console.assert(reproducedSlot === d.slot,
    `mismatch on nonce ${d.nonce}: ${reproducedSlot} != ${d.slot}`);
}
```

If any drop doesn't match, the operator's seed was tampered with —
the audit caught it.
