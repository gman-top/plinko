// === Board geometry source of truth ===
//
// 3D world is centred on (0, 0, 0). Coordinates are in "scene units"
// where one unit ≈ one peg-spacing. The board grows upward (+y is up).
//
// Layout (for a 12-row board):
//   y =  4.2 → dispenser opening
//   y =  3.4 → first peg row (3 pegs)
//   y = ...  → 12 peg rows, spacing 0.55
//   y = -3.4 → slot row (13 slots)
//   y = -4.2 → bottom rail / closed base
//
// All consumers (PlinkoBoard, Pegs, Slots, Balls, TriangleRails) read
// from the SAME geometry object so positions never drift apart.

export function boardGeometry(rows) {
  const topPegs    = 3;
  const bottomPegs = topPegs + rows - 1;       // e.g. 14 for 12 rows
  const slotCount  = bottomPegs - 1;           // 13
  const sp         = 0.55;                     // peg spacing
  const pegR       = 0.07;                     // peg radius (for collisions)
  const ballR      = 0.13;                     // ball radius

  // Pyramid centred on (0, 0). Y axis: top = +pyramidHalfH, bottom = -pyramidHalfH
  const pyramidH       = (rows - 1) * sp;
  const pyramidHalfH   = pyramidH / 2;
  const apexY          = pyramidHalfH + sp * 0.9;
  const slotRowY       = -pyramidHalfH - sp * 0.7;
  const slotH          = sp * 0.85;
  const halfBaseW      = ((bottomPegs - 1) * sp) / 2 + sp * 0.7;

  // Compute peg positions ------------------------------------------------
  const pegs = [];
  for (let i = 0; i < rows; i++) {
    const pegsInRow = topPegs + i;
    const rowW = (pegsInRow - 1) * sp;
    const startX = -rowW / 2;
    const y = pyramidHalfH - i * sp;
    for (let j = 0; j < pegsInRow; j++) {
      pegs.push({ x: startX + j * sp, y, r: pegR, key: `p${i}-${j}` });
    }
  }

  // Slot cells -----------------------------------------------------------
  const slotsTotalW = slotCount * sp;
  const slotsStartX = -slotsTotalW / 2;
  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push({
      index: i,
      x: slotsStartX + i * sp + sp / 2,        // centre x
      y: slotRowY,
      w: sp - 0.03,
      h: slotH,
    });
  }

  return {
    rows,
    sp,
    pegR,
    ballR,
    apexY,
    pyramidH,
    pyramidHalfH,
    halfBaseW,
    slotRowY,
    slotH,
    pegs,
    slots,
    bottomPegs,
    slotCount,
  };
}
