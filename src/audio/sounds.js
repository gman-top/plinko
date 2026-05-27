/**
 * PLINKO GONE WILD — premium sound layer (Web Audio API synthesis).
 *
 * No external samples — every sound is synthesised on the fly with
 * oscillators + filters. Two big wins:
 *   1. Zero bundle weight (no 200kb of mp3s to ship over GH Pages).
 *   2. Subtle randomisation per hit (slight pitch / brightness variation)
 *      so 200 peg pings in a row never feel like a stuck loop.
 *
 * Usage:
 *   import * as S from './audio/sounds.js';
 *   S.setEnabled(true);
 *   S.playPeg();    S.playDrop();   S.playClick();
 *   S.playWin();    S.playBigWin();
 *
 * Throttling: peg / click / drop are throttled internally so rapid
 * collisions don't pile up into noise.
 */

let ctx = null;
let master = null;
let enabled = false;
let initialised = false;

// Lazy init — must be triggered by a user gesture (browser policy)
function init() {
  if (initialised) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0.5;
    // Soft compressor on the master bus for a cleaner mix during big wins
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.1;
    master.connect(comp);
    comp.connect(ctx.destination);
    initialised = true;
  } catch (e) {
    // Audio context creation can fail in some embed contexts — silent fall-back
  }
}

function ensure() {
  if (!initialised) init();
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume();
  return enabled;
}

export function setEnabled(on) {
  enabled = !!on;
  if (on) init();
}
export function isEnabled() { return enabled; }

// --- helpers ---------------------------------------------------------
function envSweep(osc, gain, t0, dur, peak) {
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.04);
}

// === PEG PING — glassy short pluck ==================================
let lastPegT = 0;
export function playPeg() {
  if (!ensure()) return;
  const now = ctx.currentTime;
  // Throttle to avoid noise pile-ups when a ball grazes a row fast
  if (now - lastPegT < 0.022) return;
  lastPegT = now;

  const f = 1800 + Math.random() * 1400;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f, now);
  osc.frequency.exponentialRampToValueAtTime(f * 0.55, now + 0.10);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f;
  bp.Q.value = 10;

  const g = ctx.createGain();
  osc.connect(bp); bp.connect(g); g.connect(master);
  envSweep(osc, g, now, 0.13, 0.14);
}

// === DROP — descending whoosh ========================================
let lastDropT = 0;
export function playDrop() {
  if (!ensure()) return;
  const now = ctx.currentTime;
  if (now - lastDropT < 0.05) return;
  lastDropT = now;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.22);

  const g = ctx.createGain();
  osc.connect(g); g.connect(master);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.22, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
  osc.start(now); osc.stop(now + 0.3);
}

// === CLICK — tiny UI tick ===========================================
let lastClickT = 0;
export function playClick() {
  if (!ensure()) return;
  const now = ctx.currentTime;
  if (now - lastClickT < 0.04) return;
  lastClickT = now;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(960, now);
  osc.frequency.exponentialRampToValueAtTime(540, now + 0.04);
  const g = ctx.createGain();
  osc.connect(g); g.connect(master);
  g.gain.setValueAtTime(0.08, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  osc.start(now); osc.stop(now + 0.08);
}

// === TONE — single triangle note (helper for melodic stuff) ==========
function tone(f, when, dur, vol, type = 'triangle') {
  const t = when ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  const g = ctx.createGain();
  osc.connect(g); g.connect(master);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t); osc.stop(t + dur + 0.05);
}

// === WIN — short major chime (3-note arpeggio) =======================
export function playWin() {
  if (!ensure()) return;
  const t = ctx.currentTime;
  // E5, G#5, B5 — bright major triad, gentle decay
  tone(659.25, t + 0.00, 0.30, 0.16);
  tone(783.99, t + 0.06, 0.32, 0.15);
  tone(987.77, t + 0.12, 0.45, 0.18);
  // Add a high sparkle harmonic for casino sheen
  tone(1975.5, t + 0.14, 0.35, 0.08, 'sine');
}

// === BIG WIN — fanfare + bass thud + sparkle cascade ================
export function playBigWin() {
  if (!ensure()) return;
  const t = ctx.currentTime;

  // Sub-bass thud
  const bass = ctx.createOscillator();
  bass.type = 'sine';
  bass.frequency.setValueAtTime(90, t);
  bass.frequency.exponentialRampToValueAtTime(36, t + 0.55);
  const bg = ctx.createGain();
  bass.connect(bg); bg.connect(master);
  bg.gain.setValueAtTime(0.55, t);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  bass.start(t); bass.stop(t + 0.75);

  // Major arpeggio sweep up + repeat octave (C major: C, E, G, C, E, G)
  const scale = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
  scale.forEach((f, i) => {
    const wt = t + 0.05 + i * 0.07;
    tone(f, wt, 0.45, 0.16, 'triangle');
    tone(f * 2, wt, 0.30, 0.06, 'sine');         // octave shimmer
  });

  // Sparkle cascade — random highs scattered over 0.6s
  for (let i = 0; i < 12; i++) {
    const wt = t + 0.2 + Math.random() * 0.6;
    const f = 1600 + Math.random() * 2400;
    tone(f, wt, 0.18, 0.05, 'sine');
  }

  // Final bell tail
  tone(523.25, t + 0.7, 1.2, 0.12, 'triangle');
  tone(1046.5, t + 0.7, 1.0, 0.09, 'sine');
}

// === COIN — short metallic pickup (small wins) ======================
export function playCoin() {
  if (!ensure()) return;
  const t = ctx.currentTime;
  tone(1318.51, t,       0.18, 0.14);
  tone(1567.98, t + 0.04, 0.18, 0.12);
}
