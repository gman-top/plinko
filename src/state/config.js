// === Game configuration: ball types, multiplier tables, palette ===

export const PALETTE = {
  bg0: '#050404',
  bg1: '#0B0805',
  panelHi: '#1C140B',
  gold: '#D4AF37',
  goldHi: '#FFE695',
  goldLite: '#FFF6D8',
  goldDeep: '#5C3F08',
  orange: '#FA7909',
  cream: '#F8E9C6',
  textDim: '#8A7A5E',
  wild: '#FF6B1A',
  wildHi: '#FFB347',
  purple: '#B946FF',
  purpleHi: '#E6A6FF',
  blue: '#2090FF',
  blueHi: '#9BC8FF',
  jackpot: '#FF2D2D',
  jackpotHi: '#FF8C42',
  green: '#3FCB7C',
};

// Ball types — `tint` is the inner hot-spot colour, `core` is the
// outer surface tone, `deep` is the deepest shadow.  `glow` is the
// outer halo / emissive colour the 3D material radiates.
// Ball-type payoutMul is COSMETIC ONLY — kept at 1.0 across the board
// so the effective RTP is driven entirely by the slot multiplier table.
// Cinematic flag still triggers the FIRE/ELECTRIC/WILD/JACKPOT banner
// for visual flair; the reward is in the chase, not the multiplier.
//
// (If we ever want feature-tied ball bonuses, the `multi` feature
// already adds +30% to bet cost — that's where the EV budget lives.)
export const BALL_TYPES = {
  gold:    { id:'gold',    name:'GOLD',       tint:'#FA7909', core:'#FFE695', deep:'#D4AF37', glow:'#FFB347', payoutMul:1, cinematic:false, weight:80 },
  fire:    { id:'fire',    name:'FIRE',       tint:'#FF3300', core:'#FFB347', deep:'#8B2500', glow:'#FF6B1A', payoutMul:1, cinematic:true,  weight:8 },
  electric:{ id:'electric',name:'ELECTRIC',   tint:'#2AB8FF', core:'#9BC8FF', deep:'#0A3E5C', glow:'#2090FF', payoutMul:1, cinematic:true,  weight:6 },
  wild:    { id:'wild',    name:'WILD',       tint:'#E040A0', core:'#FFE695', deep:'#5C0A40', glow:'#B946FF', payoutMul:1, cinematic:true,  weight:4 },
  jackpot: { id:'jackpot', name:'JACKPOT',    tint:'#FF1133', core:'#FFE695', deep:'#7A0F0F', glow:'#FF2D2D', payoutMul:1, cinematic:true,  weight:0.5 },
};

// The 6-color legend shown on the right side
export const LEGEND_BADGES = [
  { color: '#FA7909', deep: '#5C3F08', label: '1x' },
  { color: '#2AB8FF', deep: '#0A3E5C', label: '2x' },
  { color: '#E040A0', deep: '#5C0A40', label: '4x' },
  { color: '#3FCB7C', deep: '#0A4020', label: '6x' },
  { color: '#B946FF', deep: '#3D0A5C', label: '8x' },
  { color: '#FFE695', deep: '#7A6008', label: '10x' },
];

// Multiplier tables per risk and row count (matches Stake-style values)
export const MULT_TABLE = {
  LOW: {
    8:  [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
    12: [10, 3, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3, 10],
    14: [7.1, 4.0, 1.9, 1.4, 1.3, 1.1, 1.0, 0.5, 1.0, 1.1, 1.3, 1.4, 1.9, 4.0, 7.1],
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  MEDIUM: {
    8:  [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    10: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    14: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  },
  // HIGH tables retuned to hit ~99% slot RTP (was 67–102% — broken).
  // Edge multipliers carry the variance; centre slots minimised at
  // 0.2x for big-swing volatility. Verify with `npm run rtp`.
  HIGH: {
    8:  [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    10: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
    12: [128, 24, 5, 2, 0.8, 0.4, 0.3, 0.4, 0.8, 2, 5, 24, 128],
    14: [160, 38, 10, 4, 1.7, 1.05, 0.3, 0.2, 0.3, 1.05, 1.7, 4, 10, 38, 160],
    16: [800, 130, 26, 9, 4, 1.4, 0.5, 0.25, 0.2, 0.25, 0.5, 1.4, 4, 9, 26, 130, 800],
  },
};

// Pick a ball type with weighted probability
export function rollBallType(featuresOn = { mult: true, respin: true, multi: false }) {
  const types = Object.values(BALL_TYPES);
  const total = types.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of types) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return BALL_TYPES.gold;
}
