import { create } from 'zustand';
import { MULT_TABLE } from './config.js';
import * as Sounds from '../audio/sounds.js';
import * as RNG from '../casino/rng.js';
import * as Api from '../api/casino.js';

// === RNG mode ===
// If VITE_CASINO_API is set, every drop is rolled by the server (real
// money path). Otherwise we use the in-browser provably-fair RNG
// suitable for the public GH Pages demo.
const SERVER_MODE = Api.isEnabled();

let _sessionPromise = null;
function localRngSession() {
  if (!_sessionPromise) _sessionPromise = RNG.loadOrCreateSession();
  return _sessionPromise;
}

// Bootstrap server session at module load so the first drop is fast.
let _serverSessionPromise = null;
function serverSession() {
  if (!_serverSessionPromise) {
    _serverSessionPromise = Api.ensureSession().catch(e => {
      console.warn('[casino-api] session bootstrap failed, falling back to local RNG:', e);
      return null;
    });
  }
  return _serverSessionPromise;
}
if (SERVER_MODE) serverSession();

const LS_SOUND = 'plinko-sound-v1';
const LS_INTRO = 'plinko-intro-v2';
const initialSoundOn = (() => {
  try { return localStorage.getItem(LS_SOUND) !== '0'; } catch { return true; }
})();
const initialIntroPhase = (() => {
  try { return localStorage.getItem(LS_INTRO) === '1' ? 'done' : 'loading'; }
  catch { return 'loading'; }
})();
Sounds.setEnabled(initialSoundOn);

// === Central game store (zustand) ===
// Keeps balance, bet, risk, rows, features, history, last win.
// 3D scene + UI subscribe to the slices they need.
export const useGame = create((set, get) => ({
  balance: 1000,
  bet: 2.0,
  rows: 12,
  risk: 'HIGH',
  auto: 1,
  ballsAmount: 1,
  features: { mult: true, respin: true, multi: false },

  drops: 0,
  totalWager: 0,
  totalWon: 0,
  biggestMult: 0,
  history: [],          // [{ time, bet, payout, mult, type }]
  lastWin: null,        // { profit, mult, type, slotIndex } | null
  streak: 0,
  lastWinTime: 0,
  soundOn: initialSoundOn,
  cinematic: null,      // { type: 'jackpot' | 'wild' | ... }
  menuOpen: false,      // mobile bottom drawer visibility
  introPhase: initialIntroPhase, // 'loading' | 'howto' | 'done'

  // --- derived ---
  cost: () => {
    const s = get();
    let m = 1;
    if (s.features.mult) m += 0.25;
    if (s.features.respin) m += 0.15;
    if (s.features.multi) m += 0.30;
    return s.bet * m;
  },

  slotMultipliers: () => {
    const s = get();
    const tbl = MULT_TABLE[s.risk][s.rows] || MULT_TABLE[s.risk][12];
    if (!s.features.mult) {
      return tbl.map(v => Math.max(0.5, Math.min(2.5, v * 0.4 + 0.6)));
    }
    return tbl;
  },

  // --- mutations ---
  setBet:   (v) => set({ bet: Math.max(0.5, Math.min(100, +v.toFixed(2))) }),
  setRows:  (v) => set({ rows: v }),
  setRisk:  (v) => set({ risk: v }),
  setAuto:  (v) => set({ auto: Math.max(1, Math.min(100, v)) }),
  setBalls: (v) => set({ ballsAmount: Math.max(1, Math.min(10, v)) }),
  toggleFeature: (k) => set(s => ({ features: { ...s.features, [k]: !s.features[k] } })),
  toggleSound: () => set(s => {
    const next = !s.soundOn;
    Sounds.setEnabled(next);
    try { localStorage.setItem(LS_SOUND, next ? '1' : '0'); } catch {}
    return { soundOn: next };
  }),
  toggleMenu:  () => set(s => ({ menuOpen: !s.menuOpen })),
  closeMenu:   () => set({ menuOpen: false }),
  setIntroPhase: (p) => {
    if (p === 'done') {
      try { localStorage.setItem(LS_INTRO, '1'); } catch {}
    }
    set({ introPhase: p });
  },

  setCinematic: (cin) => set({ cinematic: cin }),

  // Called by Ball when it lands. Computes payout, updates balance / history.
  resolveLanding: (ballId, type, betVal, slotIndex) => {
    const s = get();
    const slotMs = s.slotMultipliers();
    const slotM = slotMs[slotIndex] ?? 0.5;
    const mult = slotM * type.payoutMul;
    const payout = betVal * mult;
    const profit = payout - betVal;
    const now = performance.now();
    const newStreak = profit > 0 && (now - s.lastWinTime < 5000) ? s.streak + 1
                    : profit > 0 ? 1 : 0;

    const hist = {
      time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      bet: betVal,
      payout,
      mult,
      type: type.id,
    };

    set({
      balance: s.balance + payout,
      totalWon: s.totalWon + payout,
      drops: s.drops + 1,
      biggestMult: Math.max(s.biggestMult, mult),
      history: [hist, ...s.history].slice(0, 18),
      lastWin: { profit, mult, type, slotIndex },
      streak: newStreak,
      lastWinTime: profit > 0 ? now : s.lastWinTime,
    });

    return { mult, payout, profit };
  },

  chargeBet: (cost) => {
    const s = get();
    if (s.balance < cost) return false;
    set({ balance: s.balance - cost, totalWager: s.totalWager + cost });
    return true;
  },

  // === Provably-fair roll ============================================
  // In SERVER_MODE the server is authoritative — it debits the bet,
  // rolls the slot, credits the payout and returns the bounce stream
  // for client-side physics biasing. The returned shape stays the same
  // either way so the Scene doesn't need to know which mode is active.
  //
  // Returns `{ slot, bounces, nonce, server }` where `server` carries
  // the fully-resolved drop record from the API (slot_multiplier,
  // final_multiplier, payout_minor, balance_minor, …). When that is
  // present, the Scene must NOT re-debit / re-credit through the
  // local resolveLanding path — instead it just animates and reads
  // the cash result from `server`.
  rollDrop: async () => {
    const s = get();
    if (SERVER_MODE) {
      const sess = await serverSession();
      if (sess) {
        try {
          const idempotency_key = crypto.randomUUID();
          const out = await Api.dropOne({
            rows: s.rows,
            risk: s.risk,
            bet_minor: Math.round(s.bet * 100),       // USD-style minor unit
            features: s.features,
            idempotency_key,
          });
          // Reflect server balance back into the store (cents → ETH-ish display)
          set({ balance: out.balance_minor / 100 });
          return {
            slot: out.slot,
            bounces: out.bounces,
            nonce: out.nonce,
            server: out,
          };
        } catch (e) {
          console.warn('[casino-api] drop failed, falling back to local RNG for this drop:', e);
          // fall through to local
        }
      }
    }
    const session = await localRngSession();
    const out = await RNG.nextDrop(session, s.rows);
    return { ...out, server: null };
  },

  // Reveal the current session for player audit. In SERVER_MODE this
  // reads from the live server; otherwise the local LS session.
  rngSummary: async () => {
    if (SERVER_MODE) {
      const sess = await serverSession();
      if (sess) {
        return {
          mode: 'server',
          sessionId: sess.sessionId,
          serverHash: sess.serverHash,
          clientSeed: sess.clientSeed,
          nonce: sess.nonce,
          balance_minor: sess.balance_minor,
        };
      }
    }
    const session = await localRngSession();
    return {
      mode: 'local',
      serverHash: session.serverHash,
      clientSeed: session.clientSeed,
      nonce: session.nonce,
    };
  },

  rotateRng: async () => {
    if (SERVER_MODE) {
      const out = await Api.rotateSession();
      _serverSessionPromise = Promise.resolve(out.fresh);
      return { mode: 'server', ...out.revealed };
    }
    const session = await localRngSession();
    const { revealed, fresh } = await RNG.rotateSession(session);
    _sessionPromise = Promise.resolve(fresh);
    return { mode: 'local', ...revealed };
  },

  setClientSeed: async (clientSeed) => {
    if (SERVER_MODE) {
      const updated = await Api.setClientSeed(clientSeed);
      _serverSessionPromise = Promise.resolve(updated);
      return updated;
    }
    // local mode: rotate to bake in the new clientSeed
    const session = await localRngSession();
    session.clientSeed = clientSeed;
    RNG.persistSession(session);
    return session;
  },

  // Exposed so the Verify panel can render its mode badge.
  serverMode: SERVER_MODE,
}));
