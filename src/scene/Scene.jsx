import React, { useEffect, useRef } from 'react';
import { useGame } from '../state/gameStore.js';
import { BALL_TYPES } from '../state/config.js';
import * as Sounds from '../audio/sounds.js';
import { drawFigmaBall } from './drawBall.js';

/**
 * PLINKO GONE COSMIC — single-canvas re-interpretation.
 *
 * - Pegs are TWINKLING STARS, each with its own phase and cross-flare.
 * - Behind them: a drifting nebula (3 large soft gradient clouds that
 *   slowly pan, hue-shifting between gold / amber / rose).
 * - Subtle constellation lines link nearby pegs (precomputed at
 *   build-time of the geometry, drawn with low alpha + flicker).
 * - Shooting stars cross the background every 8-14s.
 *
 *  NEW GAMEPLAY: MULTIPLIER STARS
 *  ------------------------------
 *  Every 6-10 seconds while you're playing, ONE random peg becomes
 *  a glowing ×2 / ×3 / ×5 multiplier star for 8 seconds. If the ball
 *  passes through it, the multiplier compounds with the slot value at
 *  landing. Multiple multiplier stars can chain on a single drop —
 *  hit ×2 then ×3 and you get a ×6 bonus on top of the slot.
 *
 *  The ball is now a cosmic comet with a stronger aura, and big wins
 *  emit a "supernova" burst in the centre of the slot row.
 */
export default function Scene() {
  const canvasRef = useRef(null);
  const stateRef  = useRef({
    dpr: 1, w: 0, h: 0,
    pegs: [], slots: [], slotMs: [],
    constellations: [],         // [{a:peg, b:peg, brightness}]
    multStars: [],              // [{pegIndex, value, spawnedAt, ttl}]
    shootingStars: [],          // [{x,y,vx,vy,life,decay,len}]
    nebula: [],                 // [{x,y,vx,vy,r,hue}]
    cx: 0, cy: 0, sp: 0,
    apex: { x: 0, y: 0 },
    baseL: { x: 0, y: 0 }, baseR: { x: 0, y: 0 },
    pegR: 6, ballR: 9,
    balls: [], particles: [], floats: [],
    dispenserBalls: [],         // real-physics objects bouncing inside the bowl
    dispenserSig: '',           // cache key — re-init balls when bowl resizes
    nextDispKick: 0,
    pegCache: null,             // offscreen canvas for the static peg layer
    slotCache: null,            // offscreen canvas for the static slot body
    lastT: performance.now(),
    nextMultAt: performance.now() + 4000,
    nextShootAt: performance.now() + 5000,
    rows: 12, risk: 'HIGH', features: { mult: true },
  });

  useEffect(() => {
    const apply = (s) => {
      const st = stateRef.current;
      st.rows = s.rows;
      st.risk = s.risk;
      st.features = s.features;
      st.slotMs = s.slotMultipliers();
      computeGeometry();
    };
    apply(useGame.getState());
    const unsub = useGame.subscribe((s, prev) => {
      if (s.rows !== prev.rows || s.risk !== prev.risk
          || s.features !== prev.features) apply(s);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      // Cap DPR aggressively on mobile — render area scales with DPR²,
      // so a phone with DPR 3 renders 9× the pixels of a 1×. Cap at
      // 1.6 on phones, 2 on desktop.
      const isMobile = w <= 768;
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.6 : 2);
      canvas.width  = Math.ceil(w * dpr);
      canvas.height = Math.ceil(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const st = stateRef.current;
      st.dpr = dpr; st.w = w; st.h = h;
      st.pegCache = null;        // invalidate caches on resize
      st.slotCache = null;
      computeGeometry();
      initNebula();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let raf = 0;
    const loop = (now) => {
      const st = stateRef.current;
      const dt = Math.min(0.05, (now - st.lastT) / 1000);
      st.lastT = now;
      step(dt, now);
      draw(ctx, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    const onDrop = (e) => spawn(e.detail.typeId, e.detail.bet);
    window.addEventListener('plinko-drop', onDrop);
    return () => window.removeEventListener('plinko-drop', onDrop);
  }, []);

  // ---------- GEOMETRY -----------------------------------------------
  function computeGeometry() {
    const st = stateRef.current;
    if (!st.w || !st.h) return;
    const r = st.rows;
    const topPegs = 3;
    const bottomPegs = topPegs + r - 1;
    const slotCount = bottomPegs - 1;

    // On mobile (≤768px) side panels are hidden inside the drawer, so the
    // canvas can use almost the full width. On desktop we leave room for
    // the stats table (left) and legend / lines / risk (right).
    const isMobile = st.w <= 768;
    const sideMargin = isMobile
      ? Math.max(16, st.w * 0.04)
      : Math.max(140, st.w * 0.17);
    const bottomMargin = isMobile ? 50 : 70;
    const minTopMargin = isMobile ? 130 : 220;
    const availW = st.w - sideMargin * 2;

    // Two-pass sizing so the dispenser ALWAYS fits at the top:
    //   topMargin = 2*sp (apex above first peg row) + 2*dispR + 14 (clearance + top padding)
    //   sp = available height / (r + 0.65)
    // First pass assumes minTopMargin; second pass recomputes if the
    // dispenser needs more room than that.
    const sp_byW = availW / bottomPegs;
    let availH = st.h - minTopMargin - bottomMargin;
    let sp = Math.min(sp_byW, availH / (r + 0.65), 56);
    let dispR = Math.min(58, sp * 1.2);
    let topMargin = Math.max(minTopMargin, 2 * sp + 2 * dispR + 14);
    if (topMargin > minTopMargin) {
      availH = st.h - topMargin - bottomMargin;
      sp = Math.min(sp_byW, availH / (r + 0.65), 56);
      dispR = Math.min(58, sp * 1.2);
    }
    const cx = st.w / 2;
    const pyramidH = (r - 1) * sp;
    const apexY = topMargin + (availH - pyramidH - sp) / 2;
    const slotRowY = apexY + pyramidH + sp * 0.55;

    st.sp = sp; st.cx = cx; st.cy = (apexY + slotRowY) / 2;
    st.pegR = Math.max(4, sp * 0.13);
    st.ballR = Math.max(7, sp * 0.22);

    // Pegs (= stars) — give each its own twinkle phase
    // Pegs/slots layout is about to change — invalidate cached layers
    st.pegCache = null;
    st.slotCache = null;
    st.pegs = [];
    for (let i = 0; i < r; i++) {
      const pegs = topPegs + i;
      const rowW = (pegs - 1) * sp;
      const sx = cx - rowW / 2;
      const y = apexY + i * sp;
      for (let j = 0; j < pegs; j++) {
        st.pegs.push({
          x: sx + j * sp, y, r: st.pegR,
          lastHit: -9999,
          phase: Math.random() * Math.PI * 2,
          rate: 0.7 + Math.random() * 1.2,
          row: i, col: j,
        });
      }
    }

    // Slots
    st.slots = [];
    const slotsW = slotCount * sp;
    const sx0 = cx - slotsW / 2;
    const slotH = Math.min(sp * 1.1, 52);
    for (let i = 0; i < slotCount; i++) {
      st.slots.push({
        index: i, x: sx0 + i * sp, y: slotRowY,
        w: sp - 3, h: slotH, lastHit: -9999,
      });
    }
    st.slotRowY = slotRowY;

    // === Triangle that PROPERLY wraps every peg row + contains the slot row.
    //
    // Math: outermost peg at row i sits at x = (i+2)*sp/2 from centre. That
    // line has slope dx/dy = 0.5 (i.e. x grows by sp/2 per row of sp height).
    // For a rail from apex (cx, apex.y) down to a base corner to be tangent
    // to every outermost peg, we need:
    //   apex 2*sp above the first peg row, and
    //   base half-width = total triangle height / 2.
    // That way each peg sits flush against the inside of the rail.
    const slotRowBottom = slotRowY + slotH + 4;
    const apexUp = 2 * sp;
    st.apex = { x: cx, y: apexY - apexUp };
    const totalH = slotRowBottom - st.apex.y;
    const halfBase = totalH / 2;
    st.baseL = { x: cx - halfBase, y: slotRowBottom };
    st.baseR = { x: cx + halfBase, y: slotRowBottom };
    // Dispenser sits just above the rail apex, fully visible at the top
    // of the canvas. dispR was computed above when sizing topMargin.
    const dispenserCenterY = st.apex.y - dispR - 6;
    st.dispenser = { x: cx, y: dispenserCenterY, r: dispR };

    // Constellation links: for each peg, connect to its nearest 2-3
    // neighbours in the next row (so we draw faint diagonal lines that
    // look like real constellation strands without crossing chaos).
    st.constellations = [];
    const byRow = {};
    for (let i = 0; i < st.pegs.length; i++) {
      const p = st.pegs[i];
      (byRow[p.row] = byRow[p.row] || []).push({ ...p, idx: i });
    }
    Object.keys(byRow).forEach(rk => {
      const row = +rk;
      const nextRow = byRow[row + 1];
      if (!nextRow) return;
      for (const p of byRow[row]) {
        // sorted neighbours in the next row by distance, take closest 2
        const sorted = nextRow
          .map(q => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 2);
        for (const { q } of sorted) {
          st.constellations.push({
            a: { x: p.x, y: p.y }, b: { x: q.x, y: q.y },
            brightness: 0.10 + Math.random() * 0.10,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
    });
  }

  function initNebula() {
    const st = stateRef.current;
    if (st.nebula.length) return;
    const palette = [
      { h: 38,  s: 90, l: 55 },   // gold
      { h: 22,  s: 85, l: 50 },   // amber
      { h: 340, s: 75, l: 55 },   // rose
      { h: 270, s: 65, l: 50 },   // violet
      { h: 12,  s: 90, l: 55 },   // fire
    ];
    // Fewer, larger clouds on mobile — keeps the atmospheric feel but
    // halves the screen-blended gradient passes per frame.
    const cloudCount = st.w <= 768 ? 3 : 5;
    for (let i = 0; i < cloudCount; i++) {
      const p = palette[i % palette.length];
      st.nebula.push({
        x: Math.random() * st.w,
        y: Math.random() * st.h,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 6,
        r: 180 + Math.random() * 160,
        h: p.h, s: p.s, l: p.l,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ---------- DROP / PHYSICS -----------------------------------------
  function spawn(typeId, bet) {
    const st = stateRef.current;
    const type = BALL_TYPES[typeId] || BALL_TYPES.gold;
    const x = st.cx + (Math.random() - 0.5) * 4;
    // Spawn just below the dispenser drop chute so the ball reads as
    // coming OUT of the dispenser, and well below the rail apex where
    // the two diagonals converge (so it can't be eaten by the rail
    // collision the moment it appears).
    const y = st.dispenser
      ? st.dispenser.y + st.dispenser.r * 0.92
      : st.apex.y + st.sp * 0.6;
    st.balls.push({
      id: Math.random().toString(36).slice(2),
      x, y, vx: (Math.random() - 0.5) * 60, vy: 0,
      r: st.ballR, type, bet,
      trail: [], settled: false, settleAt: 0,
      bonusMult: 1,
      hitMultStars: new Set(),
    });
    Sounds.playDrop();
  }

  // ===== Dispenser physics =====
  // 15 balls live inside the dispenser bowl with real gravity, wall
  // collisions, and ball-ball collisions. The bowl ring itself doesn't
  // move, but a periodic random "kick" keeps the pile jostling so the
  // motion stays alive without simulating actual stirring forces.
  function initDispenserBalls() {
    const st = stateRef.current;
    if (!st.dispenser) return;
    const sig = `${st.dispenser.x.toFixed(0)}-${st.dispenser.y.toFixed(0)}-${st.dispenser.r.toFixed(0)}`;
    if (st.dispenserSig === sig && st.dispenserBalls.length === 15) return;
    st.dispenserSig = sig;

    const { x: cx, y: cy, r } = st.dispenser;
    const br = r * 0.20;
    // Starting layout (matches the visual pile we had) — physics will
    // settle them naturally afterwards.
    const start = [
      // bottom row
      { ox: -0.55, oy:  0.40, c: 'orange' },
      { ox: -0.22, oy:  0.50, c: 'red'    },
      { ox:  0.05, oy:  0.55, c: 'yellow' },
      { ox:  0.30, oy:  0.45, c: 'blue'   },
      { ox:  0.55, oy:  0.35, c: 'orange' },
      // mid rows
      { ox: -0.38, oy:  0.10, c: 'purple' },
      { ox: -0.10, oy:  0.18, c: 'orange' },
      { ox:  0.18, oy:  0.20, c: 'pink'   },
      { ox:  0.40, oy:  0.08, c: 'orange' },
      { ox: -0.25, oy: -0.15, c: 'orange' },
      { ox:  0.00, oy: -0.10, c: 'red'    },
      { ox:  0.25, oy: -0.18, c: 'yellow' },
      // upper
      { ox: -0.12, oy: -0.35, c: 'blue'   },
      { ox:  0.12, oy: -0.32, c: 'orange' },
      { ox:  0.00, oy: -0.50, c: 'purple' },
    ];
    st.dispenserBalls = start.map(s => ({
      x: cx + s.ox * r,
      y: cy + s.oy * r,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30,
      r: br,
      c: s.c,
    }));
    st.nextDispKick = performance.now() + 800;
  }

  function stepDispenser(dt, now) {
    const st = stateRef.current;
    if (!st.dispenser) return;
    initDispenserBalls();
    const { x: cx, y: cy, r: bowlR } = st.dispenser;
    const innerR = bowlR * 0.82;          // ball centres must stay inside this
    const gravity = 320;                  // gentle pull toward bottom of bowl
    const linDrag = 0.985;                // air friction
    const wallRest = 0.42;                // bowl wall bounciness
    const ballRest = 0.35;                // ball-ball bounciness
    const balls = st.dispenserBalls;

    // Sub-step for stability when balls are stacked. Mobile does 2,
    // desktop 3 — keeps the perceived motion smooth either way.
    const SUB = st.w <= 768 ? 2 : 3;
    const sdt = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      // Integrate gravity + position
      for (const b of balls) {
        b.vy += gravity * sdt;
        b.vx *= linDrag;
        b.vy *= linDrag;
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
      }
      // Bowl wall (circular boundary) — keep ball centre inside `innerR`
      for (const b of balls) {
        const dx = b.x - cx, dy = b.y - cy;
        const d  = Math.hypot(dx, dy);
        const maxD = innerR - b.r;
        if (d > maxD && d > 0.001) {
          const nx = dx / d, ny = dy / d;
          b.x = cx + nx * maxD;
          b.y = cy + ny * maxD;
          const vDot = b.vx * nx + b.vy * ny;
          if (vDot > 0) {
            b.vx -= (1 + wallRest) * vDot * nx;
            b.vy -= (1 + wallRest) * vDot * ny;
          }
        }
      }
      // Ball-ball collisions (O(n²), n=15 → 105 pairs, cheap)
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], b = balls[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const minD = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 < minD * minD && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d;
            const overlap = minD - d;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
            const relV = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (relV < 0) {
              const impulse = (1 + ballRest) * relV * 0.5;
              a.vx += impulse * nx;
              a.vy += impulse * ny;
              b.vx -= impulse * nx;
              b.vy -= impulse * ny;
            }
          }
        }
      }
    }

    // Periodic random kick — keeps the pile alive forever instead of
    // settling into a static stack after a couple of seconds.
    if (now > st.nextDispKick) {
      const b = balls[Math.floor(Math.random() * balls.length)];
      // Upward + sideways shove
      b.vx += (Math.random() - 0.5) * 220;
      b.vy -= 80 + Math.random() * 160;
      st.nextDispKick = now + 700 + Math.random() * 1400;
    }
  }

  function step(dt, now) {
    const st = stateRef.current;
    // ----- Dispenser ball physics (real gravity inside the bowl) -----
    stepDispenser(dt, now);
    const gravity = 1400;
    const drag = 0.999;
    const SUB = 5;
    const sdt = dt / SUB;

    // === Maybe spawn a new multiplier star ===
    if (now > st.nextMultAt && st.pegs.length && st.multStars.length < 3) {
      // Prefer middle-ish rows so the ball actually has a chance to hit
      const candidates = st.pegs.filter(p => p.row >= 2 && p.row <= st.rows - 3);
      if (candidates.length) {
        const peg = candidates[Math.floor(Math.random() * candidates.length)];
        const values = [2, 2, 2, 3, 3, 5]; // weighted toward 2/3
        const value = values[Math.floor(Math.random() * values.length)];
        st.multStars.push({
          pegIndex: st.pegs.indexOf(peg),
          x: peg.x, y: peg.y,
          value,
          spawnedAt: now,
          ttl: 9000 + Math.random() * 3000,
          claimed: false,
        });
      }
      st.nextMultAt = now + 5000 + Math.random() * 5000;
    }
    // Despawn expired multiplier stars
    st.multStars = st.multStars.filter(m =>
      (now - m.spawnedAt) < m.ttl
    );

    // === Maybe spawn a shooting star ===
    if (now > st.nextShootAt) {
      const fromLeft = Math.random() > 0.5;
      const y = 40 + Math.random() * (st.h * 0.5);
      st.shootingStars.push({
        x: fromLeft ? -50 : st.w + 50,
        y,
        vx: (fromLeft ? 1 : -1) * (440 + Math.random() * 260),
        vy: 110 + Math.random() * 80,
        life: 1, decay: 0.55,
        len: 90,
      });
      st.nextShootAt = now + 8000 + Math.random() * 8000;
    }
    for (const s of st.shootingStars) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= s.decay * dt;
    }
    st.shootingStars = st.shootingStars.filter(s => s.life > 0);

    // === Drift nebula clouds ===
    for (const n of st.nebula) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.phase += dt * 0.2;
      if (n.x < -n.r) n.x = st.w + n.r;
      if (n.x > st.w + n.r) n.x = -n.r;
      if (n.y < -n.r) n.y = st.h + n.r;
      if (n.y > st.h + n.r) n.y = -n.r;
    }

    // === Ball physics (sub-stepped) ===
    for (let s = 0; s < SUB; s++) {
      for (const b of st.balls) {
        if (b.settled) continue;
        b.vy += gravity * sdt;
        b.vx *= drag;
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        // peg collisions
        for (const p of st.pegs) {
          const dx = b.x - p.x, dy = b.y - p.y;
          const md = b.r + p.r;
          if (dx * dx + dy * dy < md * md) {
            const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
            const nx = dx / d, ny = dy / d;
            b.x = p.x + nx * md;
            b.y = p.y + ny * md;
            const dot = b.vx * nx + b.vy * ny;
            const e = 0.6;
            b.vx -= (1 + e) * dot * nx;
            b.vy -= (1 + e) * dot * ny;
            b.vx += (Math.random() - 0.5) * 28;
            p.lastHit = performance.now();
            sparkBurst(p.x, p.y, '#FFE695', 4);
            Sounds.playPeg();
          }
        }
        // Multiplier-star pass-through detection
        for (const m of st.multStars) {
          if (m.claimed) continue;
          if (b.hitMultStars.has(m)) continue;
          const dx = b.x - m.x, dy = b.y - m.y;
          const rr = (b.r + 24);
          if (dx * dx + dy * dy < rr * rr) {
            b.hitMultStars.add(m);
            b.bonusMult *= m.value;
            m.claimed = true;
            multStarBurst(m.x, m.y, m.value);
          }
        }
        // Angled rail collision (proper containment along the diagonal)
        reflectOffRail(b, st.apex, st.baseL, true);
        reflectOffRail(b, st.apex, st.baseR, false);
      }
    }

    // === Trail bookkeeping + landing ===
    for (const b of st.balls) {
      if (b.settled) continue;
      b.trail.push({ x: b.x, y: b.y });
      while (b.trail.length > 18) b.trail.shift();
      if (b.y >= st.slotRowY + 6) {
        const sl = st.slots;
        let best = 0, bestD = Infinity;
        for (let i = 0; i < sl.length; i++) {
          const d = Math.abs(sl[i].x + sl[i].w / 2 - b.x);
          if (d < bestD) { bestD = d; best = i; }
        }
        sl[best].lastHit = now;
        b.settled = true;
        b.settleAt = now;

        const slotM = st.slotMs[best] ?? 0.5;
        const finalMult = slotM * b.type.payoutMul * b.bonusMult;
        const finalBet = b.bet;
        // Manually resolve through the store, accounting for bonusMult
        const G = useGame.getState();
        const payout = finalBet * finalMult;
        const profit = payout - finalBet;
        const newStreak = profit > 0 ? G.streak + 1 : 0;
        useGame.setState({
          balance: G.balance + payout,
          totalWon: G.totalWon + payout,
          drops: G.drops + 1,
          biggestMult: Math.max(G.biggestMult, finalMult),
          history: [{
            time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
            bet: finalBet, payout, mult: finalMult, type: b.type.id,
          }, ...G.history].slice(0, 18),
          lastWin: { profit, mult: finalMult, type: b.type, slotIndex: best, bonusMult: b.bonusMult },
          streak: newStreak,
          lastWinTime: profit > 0 ? now : G.lastWinTime,
        });
        landingBurst(b.x, b.y, b.type.glow);
        addFloatNum(b.x, b.y, profit, finalMult, b.bonusMult);
        if (finalMult >= 5) {
          screenShake();
          supernova(sl[best].x + sl[best].w / 2, sl[best].y);
          Sounds.playBigWin();
        } else if (finalMult >= 1.5) {
          Sounds.playWin();
        } else if (profit > 0) {
          Sounds.playCoin();
        }
      }
    }
    const nowMs = performance.now();
    st.balls = st.balls.filter(b => !b.settled || (nowMs - b.settleAt) < 200);

    // === Particles ===
    for (const p of st.particles) {
      p.vy += (p.grav ?? 600) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
    }
    st.particles = st.particles.filter(p => p.life > 0);
  }

  function sparkBurst(x, y, color, n) {
    const st = stateRef.current;
    for (let i = 0; i < n; i++) {
      st.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 220,
        vy: -40 - Math.random() * 180,
        r: 1.2 + Math.random() * 2,
        life: 1, decay: 1.8 + Math.random() * 2, color,
      });
    }
  }
  function landingBurst(x, y, color) {
    const st = stateRef.current;
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 240;
      st.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        r: 1.5 + Math.random() * 3,
        life: 1, decay: 1 + Math.random() * 1.5, color,
      });
    }
  }
  function multStarBurst(x, y, value) {
    const st = stateRef.current;
    const col = value >= 5 ? '#FF2D2D' : value >= 3 ? '#FFB347' : '#9BC8FF';
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 200;
      st.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.6 + Math.random() * 2.4,
        life: 1, decay: 1.3 + Math.random() * 1.2, color: col, grav: 0,
      });
    }
  }
  function supernova(x, y) {
    const st = stateRef.current;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 200 + Math.random() * 320;
      st.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 2 + Math.random() * 4,
        life: 1, decay: 0.7 + Math.random() * 0.8,
        color: i % 2 ? '#FFE695' : '#FF8C42', grav: -80,
      });
    }
  }
  function addFloatNum(x, y, profit, mult, bonus) {
    window.dispatchEvent(new CustomEvent('plinko-float', {
      detail: { x, y, profit, mult, bonus },
    }));
  }
  function screenShake() {
    window.dispatchEvent(new CustomEvent('plinko-shake'));
  }

  // ---------- DRAW ---------------------------------------------------
  function draw(ctx, now) {
    const st = stateRef.current;
    if (!st.w || !st.h) return;
    ctx.clearRect(0, 0, st.w, st.h);

    drawNebula(ctx, st, now);
    drawShootingStars(ctx, st);
    drawTriangleRails(ctx, st, now);
    drawConstellations(ctx, st, now);
    drawStars(ctx, st, now);
    drawMultStars(ctx, st, now);
    drawDispenser(ctx, st, now);
    drawSlots(ctx, st, now);
    drawParticles(ctx, st);
    drawBalls(ctx, st, now);
  }

  function drawNebula(ctx, st, now) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const n of st.nebula) {
      const pulse = 0.85 + Math.sin(n.phase) * 0.15;
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * pulse);
      g.addColorStop(0,    `hsla(${n.h}, ${n.s}%, ${n.l}%, 0.20)`);
      g.addColorStop(0.45, `hsla(${n.h}, ${n.s}%, ${n.l - 10}%, 0.08)`);
      g.addColorStop(1,    `hsla(${n.h}, ${n.s}%, 20%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawShootingStars(ctx, st) {
    for (const s of st.shootingStars) {
      const tx = s.x - (s.vx / Math.hypot(s.vx, s.vy)) * s.len;
      const ty = s.y - (s.vy / Math.hypot(s.vx, s.vy)) * s.len;
      const g = ctx.createLinearGradient(tx, ty, s.x, s.y);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.6, `rgba(255,224,138,${0.7 * s.life})`);
      g.addColorStop(1, `rgba(255,255,255,${s.life})`);
      ctx.save();
      ctx.shadowColor = '#FFE695';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke();
      // head
      const dg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 8);
      dg.addColorStop(0, `rgba(255,255,255,${s.life})`);
      dg.addColorStop(1, 'rgba(255,224,138,0)');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawConstellations(ctx, st, now) {
    ctx.save();
    for (const c of st.constellations) {
      // Subtle alpha flicker per line
      const flick = 0.5 + Math.sin(now / 700 + c.phase) * 0.3;
      const alpha = c.brightness * flick;
      const g = ctx.createLinearGradient(c.a.x, c.a.y, c.b.x, c.b.y);
      g.addColorStop(0, `rgba(255,224,138,${alpha * 0.7})`);
      g.addColorStop(0.5, `rgba(255,224,138,${alpha})`);
      g.addColorStop(1, `rgba(255,224,138,${alpha * 0.7})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(c.a.x, c.a.y); ctx.lineTo(c.b.x, c.b.y); ctx.stroke();
    }
    ctx.restore();
  }

  // STAR pegs — base star (halo + cross flare + core) is rendered ONCE
  // to an offscreen canvas and just blit each frame. Per-frame work is
  // limited to twinkle / hit overlays for visible animation.
  function buildPegCache(st) {
    const cnv = document.createElement('canvas');
    cnv.width = Math.ceil(st.w * st.dpr);
    cnv.height = Math.ceil(st.h * st.dpr);
    const lc = cnv.getContext('2d');
    lc.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);

    for (const p of st.pegs) {
      const r = p.r;
      // Outer halo
      const hr = r * 2.4;
      const g = lc.createRadialGradient(p.x, p.y, 0, p.x, p.y, hr);
      g.addColorStop(0, 'rgba(255,230,149,0.45)');
      g.addColorStop(0.6, 'rgba(212,123,55,0.18)');
      g.addColorStop(1, 'rgba(255,230,149,0)');
      lc.fillStyle = g;
      lc.beginPath(); lc.arc(p.x, p.y, hr, 0, Math.PI * 2); lc.fill();
      // Cross flares (horizontal + vertical)
      const flareLen = r * 3;
      const fg = lc.createLinearGradient(p.x - flareLen, p.y, p.x + flareLen, p.y);
      fg.addColorStop(0, 'rgba(255,224,138,0)');
      fg.addColorStop(0.45, 'rgba(255,224,138,0.65)');
      fg.addColorStop(0.55, 'rgba(255,224,138,0.65)');
      fg.addColorStop(1, 'rgba(255,224,138,0)');
      lc.strokeStyle = fg;
      lc.lineWidth = 1;
      lc.beginPath();
      lc.moveTo(p.x - flareLen, p.y);
      lc.lineTo(p.x + flareLen, p.y);
      lc.stroke();
      const vg = lc.createLinearGradient(p.x, p.y - flareLen, p.x, p.y + flareLen);
      vg.addColorStop(0, 'rgba(255,224,138,0)');
      vg.addColorStop(0.45, 'rgba(255,224,138,0.65)');
      vg.addColorStop(0.55, 'rgba(255,224,138,0.65)');
      vg.addColorStop(1, 'rgba(255,224,138,0)');
      lc.strokeStyle = vg;
      lc.beginPath();
      lc.moveTo(p.x, p.y - flareLen);
      lc.lineTo(p.x, p.y + flareLen);
      lc.stroke();
      // Core
      const cg = lc.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.1);
      cg.addColorStop(0, '#FFFFFF');
      cg.addColorStop(0.35, '#FFE695');
      cg.addColorStop(0.85, '#D4AF37');
      cg.addColorStop(1, 'rgba(120,80,20,0)');
      lc.fillStyle = cg;
      lc.beginPath(); lc.arc(p.x, p.y, r * 1.05, 0, Math.PI * 2); lc.fill();
    }
    return cnv;
  }

  function drawStars(ctx, st, now) {
    if (!st.pegCache) st.pegCache = buildPegCache(st);
    // Single drawImage replaces ~400 gradient/fill ops per frame
    ctx.drawImage(st.pegCache, 0, 0, st.w, st.h);

    // Overlay: only the pegs that actually need animation right now
    // (recent hits + bright twinkle peaks). Skip everything else.
    for (const p of st.pegs) {
      const age = (now - p.lastHit) / 280;
      const hit = Math.max(0, 1 - age);
      const twRaw = Math.sin(now / 1000 * p.rate + p.phase);
      // Only draw twinkle overlay near the peak of the cycle
      const twBright = twRaw > 0.55 ? (twRaw - 0.55) * 2.2 : 0;
      if (hit < 0.05 && twBright < 0.1) continue;

      const r = p.r;
      if (twBright > 0) {
        const a = twBright * 0.45;
        const og = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
        og.addColorStop(0, `rgba(255,255,255,${a})`);
        og.addColorStop(1, 'rgba(255,224,138,0)');
        ctx.fillStyle = og;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2); ctx.fill();
      }
      if (hit > 0) {
        // Bright over-flash + expanding ring on recent hit
        const a = hit;
        const og = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.5);
        og.addColorStop(0, `rgba(255,255,255,${a * 0.85})`);
        og.addColorStop(0.4, `rgba(255,224,138,${a * 0.55})`);
        og.addColorStop(1, 'rgba(255,224,138,0)');
        ctx.fillStyle = og;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.7})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 10 * (1 - hit) + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawMultStars(ctx, st, now) {
    for (const m of st.multStars) {
      const age = (now - m.spawnedAt) / m.ttl;
      const fadeIn = Math.min(1, (now - m.spawnedAt) / 350);
      const fadeOut = Math.min(1, (m.ttl - (now - m.spawnedAt)) / 400);
      const a = Math.max(0, Math.min(1, fadeIn * fadeOut));
      const col = m.value >= 5 ? '#FF2D2D'
                : m.value >= 3 ? '#FFB347'
                : '#9BC8FF';
      const colDeep = m.value >= 5 ? '#7A0F0F'
                    : m.value >= 3 ? '#8B2500'
                    : '#1A4080';
      const pulse = 1 + Math.sin(now / 220 + m.x * 0.01) * 0.18;
      const radius = (st.pegR * 2.8) * pulse;

      // Outer glow
      ctx.save();
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, radius * 2.4);
      g.addColorStop(0, `${col}cc`);
      g.addColorStop(0.5, `${col}55`);
      g.addColorStop(1, `${col}00`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(m.x, m.y, radius * 2.4, 0, Math.PI * 2); ctx.fill();
      // 6-point star body
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(now / 1400);
      const points = 6;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const ang = (Math.PI / points) * i;
        const rr = i % 2 === 0 ? radius : radius * 0.45;
        const px = Math.cos(ang) * rr;
        const py = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      sg.addColorStop(0, '#fff');
      sg.addColorStop(0.4, col);
      sg.addColorStop(1, colDeep);
      ctx.fillStyle = sg;
      ctx.shadowColor = col;
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.restore();
      // Value label above
      ctx.font = '700 14px Audiowide, Inter';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.fillText(`×${m.value}`, m.x, m.y + 5);
      ctx.restore();
    }
  }

  function drawTriangleRails(ctx, st, now) {
    const { apex, baseL, baseR } = st;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = '#D47B37';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(212,123,55,0.45)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(baseL.x, baseL.y);
    ctx.lineTo(apex.x, apex.y);
    ctx.lineTo(baseR.x, baseR.y);
    ctx.stroke();
    ctx.restore();
    const drawSide = (a, b) => {
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0,    'rgba(255,240,191,0)');
      g.addColorStop(0.15, 'rgba(212,123,55,0.85)');
      g.addColorStop(0.5,  '#FFE695');
      g.addColorStop(0.85, 'rgba(212,123,55,0.85)');
      g.addColorStop(1,    'rgba(255,240,191,0)');
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
    };
    drawSide(apex, baseL); drawSide(apex, baseR);
    // Comet sweep
    const sweepLen = 110;
    const t = (now / 3000) % 1;
    for (const base of [baseL, baseR]) {
      const dx = base.x - apex.x, dy = base.y - apex.y;
      const len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      const head = t * (len + sweepLen) - sweepLen;
      const tail = head + sweepLen;
      const p1 = Math.min(Math.max(head, 0), len);
      const p2 = Math.min(Math.max(tail, 0), len);
      if (p2 - p1 < 4) continue;
      const sx = apex.x + ux * p1, sy = apex.y + uy * p1;
      const ex = apex.x + ux * p2, ey = apex.y + uy * p2;
      const sg = ctx.createLinearGradient(sx, sy, ex, ey);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,224,138,0.9)');
      sg.addColorStop(0.8, 'rgba(255,255,255,1)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.shadowColor = '#FFE695'; ctx.shadowBlur = 18;
      ctx.strokeStyle = sg; ctx.lineWidth = 4.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
      const dotG = ctx.createRadialGradient(ex, ey, 0, ex, ey, 10);
      dotG.addColorStop(0, 'rgba(255,255,255,1)');
      dotG.addColorStop(0.5, 'rgba(255,224,138,0.8)');
      dotG.addColorStop(1, 'rgba(255,224,138,0)');
      ctx.save();
      ctx.fillStyle = dotG;
      ctx.beginPath(); ctx.arc(ex, ey, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const p of [apex, baseL, baseR]) {
      ctx.save();
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 20);
      g.addColorStop(0, 'rgba(255,224,138,0.75)');
      g.addColorStop(1, 'rgba(255,224,138,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawDispenser(ctx, st, now) {
    if (!st.dispenser) return;
    const { x, y, r } = st.dispenser;
    const ho = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    ho.addColorStop(0, 'rgba(255,167,71,0.35)');
    ho.addColorStop(0.5, 'rgba(212,123,55,0.12)');
    ho.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ho;
    ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI * 2); ctx.fill();
    const breathe = 1 + Math.sin(now / 600) * 0.02;
    ctx.save();
    ctx.shadowColor = '#FFE695'; ctx.shadowBlur = 14;
    ctx.strokeStyle = '#FFE695';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(x, y, r * breathe, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(212,175,55,0.7)';
    ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    const dg = ctx.createRadialGradient(x, y, 0, x, y, r * 0.86);
    dg.addColorStop(0, '#1a120a');
    dg.addColorStop(1, '#050404');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(x, y, r * 0.84, 0, Math.PI * 2); ctx.fill();
    // === Render the physics-driven dispenser balls ===
    // Positions / velocities live in stateRef.current.dispenserBalls
    // (updated each frame by stepDispenser with real gravity, wall
    // bouncing, and ball-ball collisions). Drawing is just paint —
    // we render bottom→top so balls deeper in the pile read first.
    const COLS = {
      orange: ['#FFE695', '#FA7909', '#5C3F08'],
      yellow: ['#FFFFFF', '#FFE695', '#7A6008'],
      red:    ['#FFB347', '#FF2D2D', '#7A0F0F'],
      blue:   ['#B9DAFF', '#2090FF', '#0A3E5C'],
      purple: ['#E6A6FF', '#B946FF', '#3D0A5C'],
      pink:   ['#FFB6E0', '#E040A0', '#5C0A40'],
    };
    // Render order: low Y first (back of the pile) → high Y last (front)
    const sorted = [...st.dispenserBalls].sort((a, b) => a.y - b.y);
    for (let i = 0; i < sorted.length; i++) {
      const b = sorted[i];
      const [c0, c1, c2] = COLS[b.c];
      const bx = b.x, by = b.y, br = b.r;
      const bg = ctx.createRadialGradient(
        bx - br * 0.32, by - br * 0.38, br * 0.08,
        bx, by, br
      );
      bg.addColorStop(0,    c0);
      bg.addColorStop(0.55, c1);
      bg.addColorStop(1,    c2);
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      // Specular highlight follows the velocity direction — a ball
      // moving up-right shows its highlight up-right (looks like it's
      // rolling). Falls back to upper-left when nearly still.
      const speed = Math.hypot(b.vx, b.vy);
      let hox = -0.35, hoy = -0.4;
      if (speed > 20) {
        hox = -b.vx / speed * 0.36;
        hoy = -Math.abs(b.vy) / speed * 0.36 - 0.15;
      }
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(bx + hox * br, by + hoy * br, br * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#050404';
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 1;
    const chW = r * 0.45, chH = r * 0.18;
    ctx.beginPath();
    ctx.rect(x - chW / 2, y + r * 0.78, chW, chH);
    ctx.fill(); ctx.stroke();
  }

  function drawSlots(ctx, st, now) {
    if (!st.slots.length) return;
    const first = st.slots[0], last = st.slots[st.slots.length - 1];
    const totalW = (last.x + last.w) - first.x;
    const slotMs = st.slotMs;

    // === Top gold ribbon (entry edge — every slot lights up here) ===
    const ribbonY = first.y - 5;
    const rg = ctx.createLinearGradient(first.x, ribbonY, first.x + totalW, ribbonY);
    rg.addColorStop(0,   'rgba(212,123,55,0)');
    rg.addColorStop(0.08,'rgba(212,123,55,0.85)');
    rg.addColorStop(0.5, '#FFE695');
    rg.addColorStop(0.92,'rgba(212,123,55,0.85)');
    rg.addColorStop(1,   'rgba(212,123,55,0)');
    ctx.save();
    ctx.shadowColor = '#FFE695'; ctx.shadowBlur = 10;
    ctx.fillStyle = rg;
    ctx.fillRect(first.x - 4, ribbonY, totalW + 8, 2);
    ctx.restore();

    // === Per-slot chamber ===
    for (let i = 0; i < st.slots.length; i++) {
      const sl = st.slots[i];
      const m = slotMs[i] ?? 0.5;
      const col = slotColor(m);
      const age = (now - sl.lastHit) / 700;
      const hit = Math.max(0, 1 - age);
      // High-value slots breathe even at rest
      const pulse = m >= 50 ? 0.5 + 0.5 * Math.sin(now / 320 + i * 0.4)
                  : m >= 10 ? 0.3 + 0.3 * Math.sin(now / 460 + i * 0.5)
                  : 0;
      const k = Math.max(hit, pulse);

      const w = sl.w + k * 4, h = sl.h + k * 6;
      const x = sl.x - k * 2;
      const y = sl.y - k * 3;

      // 1. Drop shadow under chamber for depth
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, x, y + 5, w, h, 7); ctx.fill();
      ctx.restore();

      // 2. Outer body gradient
      ctx.save();
      ctx.shadowColor = col.bright;
      ctx.shadowBlur = 12 + k * 26;
      const bg = ctx.createLinearGradient(0, y, 0, y + h);
      bg.addColorStop(0,    col.bright);
      bg.addColorStop(0.55, col.bright);
      bg.addColorStop(1,    col.deep);
      ctx.fillStyle = bg;
      roundRect(ctx, x, y, w, h, 7); ctx.fill();
      ctx.restore();

      // 3. Inner illuminated chamber (radial glow from centre)
      ctx.save();
      const cxs = x + w / 2, cys = y + h / 2;
      const ig = ctx.createRadialGradient(cxs, cys, 0, cxs, cys, w * 0.65);
      ig.addColorStop(0, `rgba(255,255,255,${0.18 + k * 0.4})`);
      ig.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = ig;
      roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 6); ctx.fill();
      ctx.restore();

      // 4. Glossy upper highlight (top half lighter)
      ctx.save();
      const gh = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
      gh.addColorStop(0, 'rgba(255,255,255,0.42)');
      gh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gh;
      roundRect(ctx, x + 1.5, y + 1.5, w - 3, h * 0.5, 5); ctx.fill();
      ctx.restore();

      // 5. Side LED strips (thin gold lines on the inner edges)
      ctx.save();
      ctx.shadowColor = '#FFE695'; ctx.shadowBlur = 6;
      ctx.fillStyle = `rgba(255,230,149,${0.55 + k * 0.4})`;
      ctx.fillRect(x + 2.5, y + 3, 1, h - 6);
      ctx.fillRect(x + w - 3.5, y + 3, 1, h - 6);
      ctx.restore();

      // 6. Top emissive edge (bright LED bar across top of chamber)
      ctx.save();
      const teg = ctx.createLinearGradient(x, y, x + w, y);
      teg.addColorStop(0, 'rgba(255,224,138,0)');
      teg.addColorStop(0.5, `rgba(255,224,138,${0.9 + k * 0.1})`);
      teg.addColorStop(1, 'rgba(255,224,138,0)');
      ctx.fillStyle = teg;
      ctx.shadowColor = '#FFE695'; ctx.shadowBlur = 8;
      ctx.fillRect(x + 2, y + 1, w - 4, 1.5);
      ctx.restore();

      // 7. Outer stroke
      ctx.save();
      ctx.strokeStyle = col.bright;
      ctx.lineWidth = 1.2 + k * 1.8;
      roundRect(ctx, x, y, w, h, 7); ctx.stroke();
      ctx.restore();

      // 8. High-value danger flicker — tiny sparks on ×50+ slots
      if (m >= 50 && Math.random() < 0.06) {
        const sx = x + 4 + Math.random() * (w - 8);
        const sy = y + 4 + Math.random() * (h - 8);
        st.particles.push({
          x: sx, y: sy,
          vx: (Math.random() - 0.5) * 80,
          vy: -20 - Math.random() * 60,
          r: 1 + Math.random() * 1.4,
          life: 1, decay: 3, color: col.bright, grav: 200,
        });
      }

      // 9. Multiplier value text
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fontSize = Math.max(10, Math.min(14, sl.w * 0.32));
      ctx.font = `700 ${fontSize}px Audiowide, Inter`;
      ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
      let txt = '×' + (m >= 10 ? Math.round(m) : m.toFixed(1).replace('.0', ''));
      if (m >= 100) txt = '×' + Math.round(m);
      ctx.fillText(txt, x + w / 2, y + h / 2);
      ctx.restore();
    }

    // === Bottom edge frame (gold line below the slot row, connecting to rails) ===
    const bottomY = first.y + first.h + 2;
    ctx.save();
    const bg = ctx.createLinearGradient(st.baseL.x, bottomY, st.baseR.x, bottomY);
    bg.addColorStop(0,   'rgba(212,123,55,0)');
    bg.addColorStop(0.08,'rgba(212,123,55,0.85)');
    bg.addColorStop(0.5, '#FFE695');
    bg.addColorStop(0.92,'rgba(212,123,55,0.85)');
    bg.addColorStop(1,   'rgba(212,123,55,0)');
    ctx.fillStyle = bg;
    ctx.shadowColor = '#FFE695'; ctx.shadowBlur = 8;
    ctx.fillRect(st.baseL.x, bottomY, st.baseR.x - st.baseL.x, 1.5);
    ctx.restore();
  }

  function drawParticles(ctx, st) {
    for (const p of st.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawBalls(ctx, st, now) {
    for (const b of st.balls) {
      // cosmic trail (stardust)
      for (let i = 0; i < b.trail.length; i++) {
        const tp = b.trail[i];
        const k = i / b.trail.length;
        const r = (b.r + 6) * (0.3 + k * 0.95);
        ctx.save();
        ctx.globalAlpha = 0.04 + k * 0.55;
        const tg = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r);
        tg.addColorStop(0, b.type.core);
        tg.addColorStop(0.5, b.type.glow);
        tg.addColorStop(1, b.type.glow + '00');
        ctx.fillStyle = tg;
        ctx.beginPath(); ctx.arc(tp.x, tp.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // strong outer aura with bonus glow
      const bonusBoost = (b.bonusMult > 1 ? Math.log2(b.bonusMult) * 0.4 : 0);
      const auraR = (b.r * 3) * (1 + bonusBoost);
      ctx.save();
      const ag = ctx.createRadialGradient(b.x, b.y, b.r, b.x, b.y, auraR);
      ag.addColorStop(0, `${b.type.glow}d0`);
      ag.addColorStop(0.5, `${b.type.glow}55`);
      ag.addColorStop(1, `${b.type.glow}00`);
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(b.x, b.y, auraR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      drawFigmaBall(ctx, b.x, b.y, b.r, b.type);

      // If bonusMult > 1, render a small ×N tag above the ball
      if (b.bonusMult > 1) {
        ctx.save();
        ctx.font = '700 12px Audiowide, Inter';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#FFE695';
        ctx.shadowBlur = 8;
        ctx.fillText(`×${b.bonusMult}`, b.x, b.y - b.r - 8);
        ctx.restore();
      }
    }
  }
  return <canvas ref={canvasRef} className="board-canvas" />;
}

// Bounce a ball off an angled rail (line segment apex→base).
//
// Inward normal points toward the triangle centre.
// For the LEFT rail (tangent goes down-LEFT, tx<0 ty>0), the inward
// normal is the CW rotation of the tangent:    ( ty, -tx)  → (+, +)
// For the RIGHT rail (tangent goes down-RIGHT, tx>0 ty>0), the inward
// normal is the CCW rotation of the tangent:   (-ty,  tx)  → (-, +)
//
// We also clip to the segment range so balls above the apex (or
// past the base) aren't yanked back by an imaginary infinite line.
function reflectOffRail(b, apex, base, isLeft) {
  const dx = base.x - apex.x, dy = base.y - apex.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  const tx = dx / len, ty = dy / len;
  // Inward normal (correct sign — was inverted, sending balls outward)
  const nx = isLeft ?  ty : -ty;
  const ny = isLeft ? -tx :  tx;

  const px = b.x - apex.x, py = b.y - apex.y;

  // Segment-range check — only react if the ball's projection onto the
  // apex→base axis is inside [0, len].
  const along = px * tx + py * ty;
  if (along < -b.r || along > len + b.r) return;

  const signed = px * nx + py * ny;  // > 0 = inside the triangle
  if (signed >= b.r) return;
  const overlap = b.r - signed;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const vDot = b.vx * nx + b.vy * ny;
  if (vDot < 0) {
    const e = 0.55;
    b.vx -= (1 + e) * vDot * nx;
    b.vy -= (1 + e) * vDot * ny;
    b.vx += (Math.random() - 0.5) * 16;
  }
}

function slotColor(m) {
  if (m >= 50)  return { bright: '#FF2D2D', deep: '#7A0F0F' };
  if (m >= 10)  return { bright: '#FF6B1A', deep: '#8B2500' };
  if (m >= 3)   return { bright: '#FFB347', deep: '#5C3F08' };
  if (m >= 1)   return { bright: '#D4AF37', deep: '#5C3F08' };
  return            { bright: '#7A5908', deep: '#241A0F' };
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
