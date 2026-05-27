import { create } from 'zustand';
import { MULT_TABLE } from './config.js';

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
  soundOn: false,
  cinematic: null,      // { type: 'jackpot' | 'wild' | ... }

  // Currently-dropped balls live in this array — Ball.jsx subscribes
  // to render their 3D meshes. Each entry: { id, type, bet, startedAt }
  liveBalls: [],

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
  toggleSound: () => set(s => ({ soundOn: !s.soundOn })),

  spawnBall: (type, betValue) => {
    const id = Math.random().toString(36).slice(2, 9);
    set(s => ({
      liveBalls: [...s.liveBalls, { id, type, bet: betValue, startedAt: performance.now() }],
    }));
    return id;
  },

  removeBall: (id) => set(s => ({
    liveBalls: s.liveBalls.filter(b => b.id !== id),
  })),

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
}));
