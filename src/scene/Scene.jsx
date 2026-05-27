import React, { useEffect, useRef } from 'react';
import { useGame } from '../state/gameStore.js';
import { BALL_TYPES } from '../state/config.js';

/**
 * Single-canvas Plinko renderer.
 *
 * The previous R3F + Rapier implementation was visually noisy and ran
 * slowly on the user's machine. This version is plain Canvas 2D with
 * Euler-integrated physics — orders of magnitude smaller bundle and
 * effectively zero startup cost, while keeping the premium look
 * (multi-stop radial gradients, peg-hit flashes, ball trails,
 * cinematic gold-comet rails, dispenser, particle sprays).
 *
 * The canvas fills its parent (.boardArea) which is itself full-flex,
 * so the game expands to fit ANY viewport. All geometry is recomputed
 * on resize so the pyramid always sits cleanly inside the safe zone
 * between the side panels and the bottom controls.
 */
export default function Scene() {
  const canvasRef = useRef(null);
  const stateRef  = useRef({
    dpr: 1,
    w: 0, h: 0,
    pegs: [], slots: [], slotMs: [],
    cx: 0, cy: 0, sp: 0,
    apex: { x: 0, y: 0 },
    baseL: { x: 0, y: 0 }, baseR: { x: 0, y: 0 },
    pegR: 6, ballR: 9,
    balls: [], particles: [], floats: [],
    lastT: performance.now(),
    rows: 12, risk: 'HIGH', features: { mult: true },
  });

  // ----- subscribe to store changes that affect layout / physics -----
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
          || s.features !== prev.features) {
        apply(s);
      }
    });
    return unsub;
  }, []);

  // ----- the canvas sizing + animation loop -----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const st = stateRef.current;
      st.dpr = dpr; st.w = w; st.h = h;
      computeGeometry();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let raf = 0;
    const loop = (now) => {
      const st = stateRef.current;
      const dt = Math.min(0.05, (now - st.lastT) / 1000);
      st.lastT = now;
      step(dt);
      draw(ctx, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // ----- drop listener (PlayButton dispatches a window event) -----
  useEffect(() => {
    const onDrop = (e) => spawn(e.detail.typeId, e.detail.bet);
    window.addEventListener('plinko-drop', onDrop);
    return () => window.removeEventListener('plinko-drop', onDrop);
  }, []);

  // ----- internal helpers (close over stateRef) -----
  function computeGeometry() {
    const st = stateRef.current;
    if (!st.w || !st.h) return;
    const r = st.rows;
    const topPegs    = 3;
    const bottomPegs = topPegs + r - 1;
    const slotCount  = bottomPegs - 1;

    // Safe zone: keep gap from the side panels + top/bottom UI rows
    const sideMargin   = Math.max(120, st.w * 0.16);
    const topMargin    = 100;
    const bottomMargin = 70;
    const availW = st.w - sideMargin * 2;
    const availH = st.h - topMargin - bottomMargin;

    const sp = Math.min(availW / bottomPegs, availH / (r + 1), 56);
    const cx = st.w / 2;

    const pyramidH = (r - 1) * sp;
    const apexY    = topMargin + (availH - pyramidH - sp) / 2;
    const slotRowY = apexY + pyramidH + sp * 0.55;

    st.sp = sp;
    st.cx = cx;
    st.cy = (apexY + slotRowY) / 2;
    st.pegR = Math.max(4, sp * 0.13);
    st.ballR = Math.max(7, sp * 0.22);

    // Pegs
    st.pegs = [];
    for (let i = 0; i < r; i++) {
      const pegs = topPegs + i;
      const rowW = (pegs - 1) * sp;
      const sx = cx - rowW / 2;
      const y = apexY + i * sp;
      for (let j = 0; j < pegs; j++) {
        st.pegs.push({ x: sx + j * sp, y, r: st.pegR, lastHit: -9999 });
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

    // Triangle rail anchor points
    const halfBase = (bottomPegs - 1) * sp / 2 + sp * 0.95;
    st.apex  = { x: cx, y: apexY - sp * 0.65 };
    st.baseL = { x: cx - halfBase, y: slotRowY + slotH * 0.6 };
    st.baseR = { x: cx + halfBase, y: slotRowY + slotH * 0.6 };

    // Dispenser position
    st.dispenser = { x: cx, y: apexY - sp * 1.5, r: Math.min(58, sp * 1.4) };
  }

  function spawn(typeId, bet) {
    const st = stateRef.current;
    const type = BALL_TYPES[typeId] || BALL_TYPES.gold;
    const x = st.cx + (Math.random() - 0.5) * 4;
    const y = st.dispenser ? st.dispenser.y + st.dispenser.r * 0.4 : st.apex.y;
    st.balls.push({
      id: Math.random().toString(36).slice(2),
      x, y, vx: (Math.random() - 0.5) * 60, vy: 0,
      r: st.ballR, type, bet, trail: [], settled: false, settleAt: 0,
    });
  }

  function step(dt) {
    const st = stateRef.current;
    const gravity = 1400;
    const drag = 0.999;
    // Sub-stepped integration for stable physics
    const SUB = 5;
    const sdt = dt / SUB;

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
          }
        }
        // Side rails — push back if escaping
        if (b.x < st.baseL.x + b.r * 0.5) {
          b.x = st.baseL.x + b.r * 0.5;
          b.vx = Math.abs(b.vx) * 0.6;
        }
        if (b.x > st.baseR.x - b.r * 0.5) {
          b.x = st.baseR.x - b.r * 0.5;
          b.vx = -Math.abs(b.vx) * 0.6;
        }
      }
    }

    // Trail bookkeeping + landing detection
    const now = performance.now();
    for (const b of st.balls) {
      if (b.settled) continue;
      b.trail.push({ x: b.x, y: b.y });
      while (b.trail.length > 16) b.trail.shift();
      if (b.y >= st.slotRowY + 6) {
        // pick slot index by x
        const sl = st.slots;
        let best = 0, bestD = Infinity;
        for (let i = 0; i < sl.length; i++) {
          const d = Math.abs(sl[i].x + sl[i].w / 2 - b.x);
          if (d < bestD) { bestD = d; best = i; }
        }
        sl[best].lastHit = now;
        b.settled = true;
        b.settleAt = now;
        // resolve in store
        const result = useGame.getState().resolveLanding(b.id, b.type, b.bet, best);
        // landing fx
        landingBurst(b.x, b.y, b.type.glow);
        addFloatNum(b.x, b.y, result.profit, result.mult);
        if (result.mult >= 5) screenShake();
        if (b.type.id === 'respin') {
          setTimeout(() => spawn('gold', b.bet), 700);
        }
      }
    }

    // Cleanup settled balls after a brief settle delay
    st.balls = st.balls.filter(b => !b.settled || (now - b.settleAt) < 200);

    // Particles
    for (const p of st.particles) {
      p.vy += 600 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
    }
    st.particles = st.particles.filter(p => p.life > 0);

    // Floats (DOM-emitted) — handled outside this loop
  }

  function sparkBurst(x, y, color, n) {
    const st = stateRef.current;
    for (let i = 0; i < n; i++) {
      st.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 220,
        vy: -40 - Math.random() * 180,
        r: 1.2 + Math.random() * 2,
        life: 1, decay: 1.8 + Math.random() * 2,
        color,
      });
    }
  }

  function landingBurst(x, y, color) {
    const st = stateRef.current;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 240;
      st.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        r: 1.5 + Math.random() * 3,
        life: 1, decay: 1 + Math.random() * 1.5,
        color,
      });
    }
  }

  function addFloatNum(x, y, profit, mult) {
    // Dispatch a window event consumed by the FloatNumbers DOM overlay
    window.dispatchEvent(new CustomEvent('plinko-float', {
      detail: { x, y, profit, mult },
    }));
  }

  function screenShake() {
    window.dispatchEvent(new CustomEvent('plinko-shake'));
  }

  // ----- main draw -----
  function draw(ctx, now) {
    const st = stateRef.current;
    if (!st.w || !st.h) return;
    ctx.clearRect(0, 0, st.w, st.h);

    drawBgGlow(ctx, st, now);
    drawTriangleRails(ctx, st, now);
    drawDispenser(ctx, st, now);
    drawPegs(ctx, st, now);
    drawSlots(ctx, st, now);
    drawParticles(ctx, st);
    drawBalls(ctx, st, now);
  }

  function drawBgGlow(ctx, st, now) {
    const cx = st.cx, cy = st.cy;
    // gentle radial spotlight (additive, doesn't paint a black rect)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(st.w, st.h) * 0.55);
    g.addColorStop(0, 'rgba(212,123,55,0.10)');
    g.addColorStop(0.55, 'rgba(92,63,8,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, st.w, st.h);
  }

  function drawTriangleRails(ctx, st, now) {
    const { apex, baseL, baseR } = st;
    // Underlay glow
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

    // Crisp gradient stroke per side
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
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
    };
    drawSide(apex, baseL);
    drawSide(apex, baseR);

    // Comet sweep — bright dot travels each rail on a 3s loop
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
      // Bright leading dot
      const dotG = ctx.createRadialGradient(ex, ey, 0, ex, ey, 10);
      dotG.addColorStop(0, 'rgba(255,255,255,1)');
      dotG.addColorStop(0.5, 'rgba(255,224,138,0.8)');
      dotG.addColorStop(1, 'rgba(255,224,138,0)');
      ctx.save();
      ctx.fillStyle = dotG;
      ctx.beginPath(); ctx.arc(ex, ey, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Apex + base corner glow
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
    // outer halo
    const ho = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    ho.addColorStop(0, 'rgba(255,167,71,0.35)');
    ho.addColorStop(0.5, 'rgba(212,123,55,0.12)');
    ho.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ho;
    ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI * 2); ctx.fill();

    // ring (breathing)
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

    // dark glass disc inside
    const dg = ctx.createRadialGradient(x, y, 0, x, y, r * 0.86);
    dg.addColorStop(0, '#1a120a');
    dg.addColorStop(1, '#050404');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(x, y, r * 0.84, 0, Math.PI * 2); ctx.fill();

    // ball cluster (12 small orange orbs, jiggling)
    const t = now / 1000;
    const cluster = [
      [-0.40,  0.05], [-0.20, -0.10], [ 0.00,  0.10], [ 0.22, -0.05], [ 0.40,  0.04],
      [-0.30,  0.25], [-0.05,  0.20], [ 0.20,  0.25], [ 0.38,  0.22],
      [-0.20, -0.30], [ 0.10, -0.32], [ 0.30, -0.28],
    ];
    for (let i = 0; i < cluster.length; i++) {
      const [ox, oy] = cluster[i];
      const phi = i * 0.7;
      const jx = Math.sin(t * 1.3 + phi) * 0.6;
      const jy = Math.cos(t * 1.5 + phi) * 0.6;
      const bx = x + (ox * r) + jx;
      const by = y + (oy * r) + jy;
      const br = r * 0.18;
      const bg = ctx.createRadialGradient(bx - br * 0.4, by - br * 0.45, 0.5, bx, by, br);
      bg.addColorStop(0, '#FFE695');
      bg.addColorStop(0.4, '#FA7909');
      bg.addColorStop(1, '#5C3F08');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      // tiny specular
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(bx - br * 0.35, by - br * 0.45, br * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    // drop chute
    ctx.fillStyle = '#050404';
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 1;
    const chW = r * 0.45, chH = r * 0.18;
    ctx.beginPath();
    ctx.rect(x - chW / 2, y + r * 0.78, chW, chH);
    ctx.fill(); ctx.stroke();
  }

  function drawPegs(ctx, st, now) {
    for (const p of st.pegs) {
      const age = (now - p.lastHit) / 280;
      const gl = Math.max(0, 1 - age);
      // halo
      const hr = p.r * (1.6 + gl * 2);
      const g = ctx.createRadialGradient(p.x, p.y, p.r * 0.5, p.x, p.y, hr);
      g.addColorStop(0, `rgba(255,230,149,${0.45 + gl * 0.55})`);
      g.addColorStop(1, 'rgba(255,230,149,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, hr, 0, Math.PI * 2); ctx.fill();
      // 3D-lit body
      const bg = ctx.createLinearGradient(p.x, p.y - p.r, p.x, p.y + p.r);
      bg.addColorStop(0, '#FFF6D8');
      bg.addColorStop(0.45, '#FFE695');
      bg.addColorStop(0.75, '#D4AF37');
      bg.addColorStop(1, gl > 0.2 ? '#FA7909' : '#7A5908');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      // specular
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.4, p.r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      // hit ring
      if (gl > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${gl * 0.65})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 10 * (1 - gl) + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawSlots(ctx, st, now) {
    if (!st.slots.length) return;
    // gold ribbon connecting all slot tops
    const first = st.slots[0], last = st.slots[st.slots.length - 1];
    const totalW = (last.x + last.w) - first.x;
    const ribbonY = first.y - 4;
    const rg = ctx.createLinearGradient(first.x, ribbonY, first.x + totalW, ribbonY);
    rg.addColorStop(0,   'rgba(212,123,55,0)');
    rg.addColorStop(0.1, 'rgba(212,123,55,0.8)');
    rg.addColorStop(0.5, '#FFE695');
    rg.addColorStop(0.9, 'rgba(212,123,55,0.8)');
    rg.addColorStop(1,   'rgba(212,123,55,0)');
    ctx.save();
    ctx.shadowColor = '#FFE695'; ctx.shadowBlur = 8;
    ctx.fillStyle = rg;
    ctx.fillRect(first.x, ribbonY, totalW, 1.6);
    ctx.restore();

    const slotMs = st.slotMs;
    for (let i = 0; i < st.slots.length; i++) {
      const sl = st.slots[i];
      const m = slotMs[i] ?? 0.5;
      const col = slotColor(m);
      const age = (now - sl.lastHit) / 700;
      const p = Math.max(0, 1 - age);
      const w = sl.w, h = sl.h + p * 8, y = sl.y - p * 4, x = sl.x;

      // drop shadow
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, x, y + 3, w, h, 6); ctx.fill();
      ctx.restore();

      // body
      ctx.save();
      ctx.shadowColor = col.bright; ctx.shadowBlur = 8 + p * 22;
      const sg = ctx.createLinearGradient(0, y, 0, y + h);
      sg.addColorStop(0, col.bright);
      sg.addColorStop(0.5, col.bright);
      sg.addColorStop(1, col.deep);
      ctx.fillStyle = sg;
      roundRect(ctx, x, y, w, h, 6); ctx.fill();

      // gloss top
      ctx.shadowBlur = 0;
      const gh = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
      gh.addColorStop(0, 'rgba(255,255,255,0.4)');
      gh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gh;
      roundRect(ctx, x + 1, y + 1, w - 2, h * 0.45, 5); ctx.fill();

      // stroke
      ctx.strokeStyle = col.bright; ctx.lineWidth = 1 + p * 1.5;
      roundRect(ctx, x, y, w, h, 6); ctx.stroke();
      ctx.restore();

      // multiplier value
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
      // trail
      for (let i = 0; i < b.trail.length; i++) {
        const tp = b.trail[i];
        const k = i / b.trail.length;
        const r = (b.r + 5) * (0.3 + k * 0.85);
        ctx.save();
        ctx.globalAlpha = 0.04 + k * 0.5;
        const tg = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r);
        tg.addColorStop(0, b.type.core);
        tg.addColorStop(1, b.type.glow + '00');
        ctx.fillStyle = tg;
        ctx.beginPath(); ctx.arc(tp.x, tp.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      drawFigmaBall(ctx, b.x, b.y, b.r, b.type);
    }
  }

  // 4-layer Figma-style ball
  function drawFigmaBall(ctx, x, y, r, t) {
    ctx.save();
    // outer glow ring
    const glowR = r * 2.4;
    const og = ctx.createRadialGradient(x, y, r, x, y, glowR);
    og.addColorStop(0, `${t.glow}cc`);
    og.addColorStop(1, `${t.glow}00`);
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    // Layer 1: black → dark radial (gives bottom-left shadow)
    const a1 = 114.341 * Math.PI / 180;
    const dx1 = Math.cos(a1) * r * 0.14, dy1 = -Math.sin(a1) * r * 0.22;
    const g1 = ctx.createRadialGradient(x + dx1, y + dy1, 0, x + dx1, y + dy1, r * 1.05);
    g1.addColorStop(0, '#000'); g1.addColorStop(1, t.deep);
    ctx.fillStyle = g1; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    // Layer 2: vivid tint radial
    const a2 = 56.385 * Math.PI / 180;
    const dx2 = Math.cos(a2) * r * -0.5, dy2 = Math.sin(a2) * r * -0.45;
    const g2 = ctx.createRadialGradient(x + dx2, y + dy2, 0, x + dx2, y + dy2, r * 1.3);
    g2.addColorStop(0, t.glow);
    g2.addColorStop(1, 'rgba(255,96,96,0)');
    ctx.fillStyle = g2; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    // Layer 3: white highlight top-right
    const a3 = 135.22 * Math.PI / 180;
    const dx3 = Math.cos(a3) * r * 0.67, dy3 = Math.sin(a3) * r * -0.52;
    const g3 = ctx.createRadialGradient(x + dx3, y + dy3, 0, x + dx3, y + dy3, r * 0.73);
    g3.addColorStop(0, '#fff'); g3.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g3; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    // Layer 4: gloss linear
    const g4 = ctx.createLinearGradient(x + r * 0.27, y - r * 0.72, x - r * 0.27, y + r * 0.46);
    g4.addColorStop(0, 'rgba(255,255,255,0.6)');
    g4.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g4; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  return <canvas ref={canvasRef} className="board-canvas" />;
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
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
