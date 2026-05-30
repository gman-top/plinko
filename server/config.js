// Single source of truth for runtime configuration. Everything that
// changes between environments lives here, behind env vars.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Casino integration metadata — when this server is mounted under an
// operator (SoftSwiss / EveryMatrix / OneTouch / etc), the operator
// passes their own brand identifier through env vars. Logged on every
// drop for compliance reporting.
export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // CORS — comma-separated list of origins allowed to call the API.
  // For prod casinos these are the operator front-end domains.
  allowedOrigins: (process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://localhost:4173,https://gman-top.github.io'
  ).split(',').map(s => s.trim()).filter(Boolean),

  // Where SQLite lives. For a single-region operator this can be a
  // mounted volume. For multi-region, swap the driver layer in db.js.
  databasePath: process.env.DATABASE_PATH || resolve(__dirname, 'data', 'casino.sqlite'),

  // Currency configuration. The minor unit is the integer the ledger
  // stores (cents for USD, satoshis for BTC, wei for ETH but capped).
  // To add a new currency, drop another entry in here.
  currencies: {
    USD: { code: 'USD', minorPerUnit: 100,        decimals: 2 },
    EUR: { code: 'EUR', minorPerUnit: 100,        decimals: 2 },
    ETH: { code: 'ETH', minorPerUnit: 1_000_000n, decimals: 6 }, // micro-ETH
    BTC: { code: 'BTC', minorPerUnit: 100_000_000n, decimals: 8 },
    USDT:{ code: 'USDT',minorPerUnit: 1_000_000n, decimals: 6 },
  },
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',

  // Player onboarding default — the demo balance handed out to a new
  // anonymous session. Operator integration will override this from
  // the operator's player wallet API instead.
  signupBonusMinor: parseInt(process.env.SIGNUP_BONUS_MINOR || '100000', 10),

  // Bet limits per game round, in minor units of the session currency.
  bet: {
    minMinor: parseInt(process.env.MIN_BET_MINOR || '50', 10),       // 0.50
    maxMinor: parseInt(process.env.MAX_BET_MINOR || '10000', 10),    // 100.00
    maxPayoutMultiplier: 10000,                                       // hard cap
  },

  // Session lifecycle.
  session: {
    // After how many drops we auto-rotate the server seed. Lower =
    // more frequent audit checkpoints; higher = less work. 10000 is
    // a common Stake-like default.
    maxDropsBeforeRotate: parseInt(process.env.MAX_DROPS_PER_SEED || '10000', 10),
    // Idle expiry — sessions older than this without activity are
    // marked closed (their seed is still recoverable for audit).
    idleExpiryMs: 24 * 60 * 60 * 1000,
  },

  // Per-IP and per-session rate limits.
  rateLimit: {
    windowMs: 60 * 1000,
    dropsPerMinute: parseInt(process.env.DROPS_PER_MINUTE || '300', 10),
    sessionsPerMinute: parseInt(process.env.SESSIONS_PER_MINUTE || '10', 10),
  },

  // Operator integration — propagated into every drop record so the
  // operator's reporting pipeline can group by partner / brand.
  operator: {
    id:    process.env.OPERATOR_ID    || 'aigostudios-self',
    brand: process.env.OPERATOR_BRAND || 'PLINKO GONE WILD',
  },
};

if (!existsSync(dirname(config.databasePath))) {
  // Create the data directory lazily — DB initialiser will mkdir.
  // Just a heads-up at boot if the path looks wrong.
  console.log(`[config] DB directory will be created on first init: ${dirname(config.databasePath)}`);
}
