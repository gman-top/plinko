#!/usr/bin/env node
// RTP audit — print Return-To-Player for every (risk, rows) combo
// in the live multiplier table, plus ball-type EV and the slot
// probability × payout breakdown for one default config.
//
// Run with:  npm run rtp
//
// Green = within casino target band (95–99.5%).
// Yellow = below band (too tight for the player).
// Red = above 100% (player has positive edge — broken).

import { MULT_TABLE, BALL_TYPES } from '../src/state/config.js';
import { binomialPMF, slotRTP, slotVariance, ballTypeEV } from '../src/casino/math.js';

const RISKS = ['LOW', 'MEDIUM', 'HIGH'];
const TARGET_MIN = 0.95;
const TARGET_MAX = 0.995;

const C = {
  reset:  '\x1b[0m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  mag:    '\x1b[35m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
};

function colourFor(rtp) {
  if (rtp > 1.0) return C.red;
  if (rtp < TARGET_MIN) return C.yellow;
  if (rtp <= TARGET_MAX) return C.green;
  return C.yellow;        // above band but ≤ 1.0
}

function rule(width = 78) {
  return '─'.repeat(width);
}

console.log(`\n${C.bold}${rule()}${C.reset}`);
console.log(`${C.bold} PLINKO RTP AUDIT${C.reset}  ${C.dim}target band: ${(TARGET_MIN * 100).toFixed(1)}%–${(TARGET_MAX * 100).toFixed(1)}%${C.reset}`);
console.log(`${C.bold}${rule()}${C.reset}\n`);

// === Per (risk, rows) breakdown ====================================
const flags = [];
for (const risk of RISKS) {
  console.log(`${C.cyan}${C.bold}${risk}${C.reset}`);
  for (const key of Object.keys(MULT_TABLE[risk]).sort((a, b) => +a - +b)) {
    const rows = +key;
    const mults = MULT_TABLE[risk][key];
    const rtp = slotRTP(mults, rows);
    const sd  = Math.sqrt(slotVariance(mults, rows));
    const houseEdge = (1 - rtp) * 100;
    const col = colourFor(rtp);
    const tag =
      rtp > 1.0           ? ' ← above 100%, fix immediately' :
      rtp < TARGET_MIN    ? ' ← below target band' :
      rtp > TARGET_MAX    ? ' ← above target band' : '';
    console.log(
      `  ${key.padStart(2)} rows  RTP ${col}${(rtp * 100).toFixed(2).padStart(6)}%${C.reset}` +
      `  edge ${houseEdge.toFixed(2).padStart(5)}%   σ ${sd.toFixed(2).padStart(6)}${C.dim}${tag}${C.reset}`
    );
    if (tag) flags.push({ risk, rows, rtp });
  }
  console.log('');
}

// === Ball type EV ==================================================
const ev = ballTypeEV(BALL_TYPES);
console.log(`${C.mag}${C.bold}BALL TYPE BONUS${C.reset}`);
const totalW = Object.values(BALL_TYPES).reduce((s, b) => s + (b.weight ?? 0), 0);
for (const b of Object.values(BALL_TYPES)) {
  const p = (b.weight ?? 0) / totalW;
  console.log(
    `  ${b.id.padEnd(10)}` +
    ` ×${String(b.payoutMul).padStart(4)}` +
    `  weight ${(p * 100).toFixed(2).padStart(5)}%` +
    `  contributes ${(p * b.payoutMul).toFixed(4)}`
  );
}
console.log(`  ${C.dim}Σ weights normalised: ${totalW}${C.reset}`);
console.log(`  ${C.bold}E[ball multiplier] = ${ev.toFixed(4)} (×${(ev * 100).toFixed(2)}%)${C.reset}\n`);

// === Effective combined RTP (slot × ball EV) =======================
console.log(`${C.bold}EFFECTIVE RTP (slot × ball-type EV)${C.reset}  ${C.dim}— this is what the player actually gets per drop${C.reset}`);
for (const risk of RISKS) {
  const parts = [];
  for (const key of Object.keys(MULT_TABLE[risk]).sort((a, b) => +a - +b)) {
    const rows = +key;
    const rtp = slotRTP(MULT_TABLE[risk][key], rows);
    const eff = rtp * ev;
    const col = colourFor(eff);
    parts.push(`${key}r ${col}${(eff * 100).toFixed(1)}%${C.reset}`);
  }
  console.log(`  ${C.cyan}${risk.padEnd(7)}${C.reset} ${parts.join('   ')}`);
}
console.log('');

// === Probability × payout breakdown for a default config ===========
const showRisk = 'MEDIUM', showRows = 12;
console.log(`${C.bold}DISTRIBUTION — ${showRisk} ${showRows} rows${C.reset}\n`);
const pmf = binomialPMF(showRows);
const mults = MULT_TABLE[showRisk][showRows];
const maxP = Math.max(...pmf);
const W = 32;
for (let k = 0; k <= showRows; k++) {
  const p = pmf[k];
  const m = mults[k];
  const bar = '█'.repeat(Math.round((p / maxP) * W));
  const evK = p * m;
  console.log(
    `  slot ${String(k).padStart(2)}  ×${String(m).padStart(5)}  ` +
    `${C.dim}${bar.padEnd(W)}${C.reset}  P ${(p * 100).toFixed(2).padStart(5)}%` +
    `   EV ${(evK * 100).toFixed(2).padStart(5)}%`
  );
}
console.log('');

// === Summary =======================================================
if (flags.length === 0) {
  console.log(`${C.green}${C.bold}✓ all slot RTPs are inside the ${(TARGET_MIN * 100).toFixed(0)}–${(TARGET_MAX * 100).toFixed(1)}% target band.${C.reset}\n`);
} else {
  console.log(`${C.yellow}${C.bold}⚠ ${flags.length} table(s) outside target band:${C.reset}`);
  for (const f of flags) {
    console.log(`  ${f.risk} ${f.rows} rows → ${(f.rtp * 100).toFixed(2)}%`);
  }
  console.log('');
}

const effRange = RISKS.flatMap(risk =>
  Object.keys(MULT_TABLE[risk]).map(k =>
    slotRTP(MULT_TABLE[risk][k], +k) * ev
  )
);
const effMin = Math.min(...effRange);
const effMax = Math.max(...effRange);
const tone = effMax > 1.0 ? C.red : effMin < TARGET_MIN ? C.yellow : C.green;
console.log(`${C.bold}Effective RTP range: ${tone}${(effMin * 100).toFixed(2)}% – ${(effMax * 100).toFixed(2)}%${C.reset}\n`);

process.exit(flags.length === 0 ? 0 : 1);
