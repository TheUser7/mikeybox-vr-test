// Square up (owner 2026-10-26: "the side handle of the police baton ... is rotated at some odd non-90 degree angle that
// makes it basically impossible to get symmetry"). Some game models sit tilted inside their item (the baton's mesh node is
// turned 79/22/55 degrees, which leaves its side handle 28.7 degrees around the shaft). This finds an item's own straight
// lines from its mesh edges and the smallest turn that lays them along X, Y and Z.
//
// d1 = the direction most edge length runs along (a shaft, a barrel, a box side); d2 = the strongest direction square to it
// (a side handle). Round shapes have no dominant direction and diagonal parts are not square to d1, so they never count.
// When several directions are about equally strong (a box's sides, a hexagon's edges), the one needing the least turn wins,
// so items that are already square stay exactly where they are.

const PARALLEL_COS = Math.cos(4 * Math.PI / 180);   // edges within 4 degrees run along the same line
const PERP_SIN = Math.sin(4 * Math.PI / 180);       // edges within 4 degrees of square to d1
const REFINE_COS = Math.cos(1.5 * Math.PI / 180);   // the exact direction: edges within 1.5 degrees of the 4-degree average
// Ties: a main line with at least 40% of the strongest one's length is a real alternative (a hexagon's three edge
// directions differ only by how its caps happen to be triangulated); a side line must be within 15% of the strongest.
const MAIN_TIE = 0.4;
const SIDE_TIE = 0.85;
const SEEDS = 320;                                  // longest edges tried as candidate directions
export const MAIN_LINE_SHARE = 0.15;                // d1 must carry this share of all edge length
export const SIDE_LINE_SHARE = 0.04;                // d2 must carry this share of all edge length ...
export const SIDE_LINE_SHARE_OF_SQUARE = 0.25;      // ... and this share of the edge length square to d1
export const AUTO_MIN_DEGREES = 3;                  // squaring a new part automatically: only a clear tilt

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const n = Math.hypot(v[0], v[1], v[2]); return n > 1e-12 ? [v[0] / n, v[1] / n, v[2] / n] : null; };

/** Edges of an indexed or plain triangle mesh, as unit directions and lengths after `matrix` (16 numbers, column-major,
 *  three.js Matrix4.elements). Accumulates into `into` so several meshes of one item can be pooled. */
export function meshEdges(positions, index, matrix, into = { dirs: [], lens: [] }) {
  const m = matrix || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const point = (i) => {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  };
  const count = index ? index.length : positions.length / 3;
  const at = index ? (k) => index[k] : (k) => k;
  for (let k = 0; k + 2 < count; k += 3) {
    const p = [point(at(k)), point(at(k + 1)), point(at(k + 2))];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const e = [p[b][0] - p[a][0], p[b][1] - p[a][1], p[b][2] - p[a][2]];
      const len = Math.hypot(e[0], e[1], e[2]);
      if (!(len > 1e-7) || !Number.isFinite(len)) continue;
      into.dirs.push([e[0] / len, e[1] / len, e[2] / len]);
      into.lens.push(len);
    }
  }
  return into;
}

// Distinct strong directions among `members` (indices into the edge lists), strongest first, each refined to the
// length-weighted average of the edges along it.
function directionCandidates(edges, members) {
  const { dirs, lens } = edges;
  const seeds = members.slice().sort((a, b) => lens[b] - lens[a]).slice(0, SEEDS);
  const scored = [];
  for (const s of seeds) {
    const d = dirs[s];
    if (scored.some((c) => Math.abs(dot(c.seed, d)) > PARALLEL_COS)) continue;
    let score = 0;
    for (const i of members) if (Math.abs(dot(dirs[i], d)) > PARALLEL_COS) score += lens[i];
    // The exact direction: the average of everything within 4 degrees (a prism's side diagonals lean every way around
    // its axis and cancel out), then again within REFINE degrees of that average (nearby short chords drop out).
    let refined = d;
    for (const window of [PARALLEL_COS, REFINE_COS]) {
      let sum = [0, 0, 0];
      for (const i of members) {
        const c = dot(dirs[i], refined);
        if (Math.abs(c) <= window) continue;
        const w = (c < 0 ? -1 : 1) * lens[i];
        sum = [sum[0] + w * dirs[i][0], sum[1] + w * dirs[i][1], sum[2] + w * dirs[i][2]];
      }
      refined = unit(sum) || refined;
    }
    scored.push({ seed: d, dir: refined, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

const AXIS_ROTATIONS = (() => {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const perm of perms) for (let s = 0; s < 8; s++) {
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    perm.forEach((row, col) => { m[row][col] = (s >> col) & 1 ? -1 : 1; });
    const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    if (det > 0) out.push(m);
  }
  return out;
})();

// The smallest rotation (3x3, rows) that turns the orthonormal frame with columns b0, b1, b2 onto the world axes.
function frameTurn(b0, b1, b2) {
  const B = [[b0[0], b1[0], b2[0]], [b0[1], b1[1], b2[1]], [b0[2], b1[2], b2[2]]];
  let best = null, bestTrace = -Infinity;
  for (const P of AXIS_ROTATIONS) {
    let trace = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) trace += P[r][c] * B[r][c];
    if (trace > bestTrace) { bestTrace = trace; best = P; }
  }
  // R = P * B^T
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    R[r][c] = best[r][0] * B[c][0] + best[r][1] * B[c][1] + best[r][2] * B[c][2];
  return R;
}

// The smallest rotation that lays one direction along its nearest axis (any turn about that line is left alone).
function lineTurn(d) {
  let k = 0;
  if (Math.abs(d[1]) > Math.abs(d[k])) k = 1;
  if (Math.abs(d[2]) > Math.abs(d[k])) k = 2;
  const target = [0, 0, 0];
  target[k] = d[k] < 0 ? -1 : 1;
  const v = cross(d, target), c = dot(d, target), s = Math.hypot(v[0], v[1], v[2]);
  if (s < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const vx = [[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]];
  const k2 = 1 / (1 + c);
  const R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) {
    let sq = 0;
    for (let i = 0; i < 3; i++) sq += vx[r][i] * vx[i][col];
    R[r][col] += vx[r][col] + sq * k2;
  }
  return R;
}

const turnDegrees = (R) => Math.acos(Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2))) * 180 / Math.PI;

function quaternionOf(R) {
  const t = R[0][0] + R[1][1] + R[2][2];
  let x, y, z, w;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    w = s / 4; x = (R[2][1] - R[1][2]) / s; y = (R[0][2] - R[2][0]) / s; z = (R[1][0] - R[0][1]) / s;
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2;
    w = (R[2][1] - R[1][2]) / s; x = s / 4; y = (R[0][1] + R[1][0]) / s; z = (R[0][2] + R[2][0]) / s;
  } else if (R[1][1] > R[2][2]) {
    const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2;
    w = (R[0][2] - R[2][0]) / s; x = (R[0][1] + R[1][0]) / s; y = s / 4; z = (R[1][2] + R[2][1]) / s;
  } else {
    const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2;
    w = (R[1][0] - R[0][1]) / s; x = (R[0][2] + R[2][0]) / s; y = (R[1][2] + R[2][1]) / s; z = s / 4;
  }
  const n = Math.hypot(x, y, z, w);
  return [x / n, y / n, z / n, w / n];
}

/** The smallest world turn that squares an item's straight lines to X/Y/Z, from its world-space mesh edges.
 *  Returns null when the item has no clear straight line (round shapes), else
 *  { kind: "two-lines" | "one-line", degrees, quaternion: [x, y, z, w], mainShare, sideShare }. */
export function squareUpTurn(edges) {
  const { dirs, lens } = edges;
  const total = lens.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const all = lens.map((_, i) => i);
  const mains = directionCandidates(edges, all);
  if (!mains.length || mains[0].score / total < MAIN_LINE_SHARE) return null;
  let best = null;
  for (const main of mains.filter((c) => c.score >= MAIN_TIE * mains[0].score)) {
    const d1 = main.dir;
    const square = all.filter((i) => Math.abs(dot(dirs[i], d1)) < PERP_SIN);
    const squareTotal = square.reduce((a, i) => a + lens[i], 0);
    const sides = square.length ? directionCandidates(edges, square) : [];
    const strongSide = sides.length && sides[0].score / total >= SIDE_LINE_SHARE &&
      sides[0].score / Math.max(squareTotal, 1e-12) >= SIDE_LINE_SHARE_OF_SQUARE;
    const frames = strongSide
      ? sides.filter((c) => c.score >= SIDE_TIE * sides[0].score).map((side) => {
        const d2 = unit([side.dir[0] - dot(side.dir, d1) * d1[0], side.dir[1] - dot(side.dir, d1) * d1[1],
          side.dir[2] - dot(side.dir, d1) * d1[2]]);
        return d2 ? { kind: "two-lines", R: frameTurn(d1, d2, cross(d1, d2)), sideShare: side.score / total } : null;
      }).filter(Boolean)
      : [{ kind: "one-line", R: lineTurn(d1), sideShare: 0 }];
    for (const frame of frames) {
      const degrees = turnDegrees(frame.R);
      if (!best || degrees < best.degrees - 1e-9) best = { ...frame, degrees, mainShare: main.score / total };
    }
  }
  if (!best) return null;
  return { kind: best.kind, degrees: best.degrees, quaternion: quaternionOf(best.R), mainShare: best.mainShare,
    sideShare: best.sideShare };
}
