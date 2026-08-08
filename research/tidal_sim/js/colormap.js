// Diverging colormap approximating matplotlib's RdBu_r, plus a solid "land" gray.
const RDBU_R_STOPS = [
  [0.00, [103, 0, 31]],
  [0.10, [178, 24, 43]],
  [0.20, [214, 96, 77]],
  [0.30, [244, 165, 130]],
  [0.40, [253, 219, 199]],
  [0.50, [247, 247, 247]],
  [0.60, [209, 229, 240]],
  [0.70, [146, 197, 222]],
  [0.80, [67, 147, 195]],
  [0.90, [33, 102, 172]],
  [1.00, [5, 48, 97]],
];

export const LAND_COLOR = [120, 120, 120];

// t in [0,1], 0 = most negative, 0.5 = zero, 1 = most positive
export function divergingColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < RDBU_R_STOPS.length - 1; i++) {
    const [t0, c0] = RDBU_R_STOPS[i];
    const [t1, c1] = RDBU_R_STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
  }
  return RDBU_R_STOPS[RDBU_R_STOPS.length - 1][1];
}
