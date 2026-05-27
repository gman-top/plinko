/**
 * Canvas-2D ball renderer used by both the live Scene and the
 * IntroScreen tutorial. Keeping the rendering in one place means
 * tutorial balls render with identical gradient stops and highlight
 * geometry as the in-game cosmic comets.
 *
 * `type` is a BALL_TYPES entry — needs .deep, .glow.
 * `withAura: true` adds the outer halo seen in-game.
 */
export function drawFigmaBall(ctx, x, y, r, t) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  const a1 = 114.341 * Math.PI / 180;
  const dx1 = Math.cos(a1) * r * 0.14, dy1 = -Math.sin(a1) * r * 0.22;
  const g1 = ctx.createRadialGradient(x + dx1, y + dy1, 0, x + dx1, y + dy1, r * 1.05);
  g1.addColorStop(0, '#000'); g1.addColorStop(1, t.deep);
  ctx.fillStyle = g1; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const a2 = 56.385 * Math.PI / 180;
  const dx2 = Math.cos(a2) * r * -0.5, dy2 = Math.sin(a2) * r * -0.45;
  const g2 = ctx.createRadialGradient(x + dx2, y + dy2, 0, x + dx2, y + dy2, r * 1.3);
  g2.addColorStop(0, t.glow); g2.addColorStop(1, 'rgba(255,96,96,0)');
  ctx.fillStyle = g2; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const a3 = 135.22 * Math.PI / 180;
  const dx3 = Math.cos(a3) * r * 0.67, dy3 = Math.sin(a3) * r * -0.52;
  const g3 = ctx.createRadialGradient(x + dx3, y + dy3, 0, x + dx3, y + dy3, r * 0.73);
  g3.addColorStop(0, '#fff'); g3.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g3; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const g4 = ctx.createLinearGradient(x + r * 0.27, y - r * 0.72, x - r * 0.27, y + r * 0.46);
  g4.addColorStop(0, 'rgba(255,255,255,0.6)');
  g4.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g4; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/**
 * Outer aura (gradient halo). Drawn before the ball body for proper
 * stacking. `intensity` 0..1 lets the caller dim or boost the glow.
 */
export function drawBallAura(ctx, x, y, r, t, intensity = 1) {
  ctx.save();
  const ag = ctx.createRadialGradient(x, y, r, x, y, r * 3);
  const alpha = Math.round(Math.min(1, intensity) * 208).toString(16).padStart(2, '0');
  const alphaMid = Math.round(Math.min(1, intensity) * 85).toString(16).padStart(2, '0');
  ag.addColorStop(0,   `${t.glow}${alpha}`);
  ag.addColorStop(0.5, `${t.glow}${alphaMid}`);
  ag.addColorStop(1,   `${t.glow}00`);
  ctx.fillStyle = ag;
  ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
