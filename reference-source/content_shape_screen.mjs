// THE CONTENT SHAPE SCREEN (owner 2026-10-28): builds whose items spell slurs or curse words, or draw a swastika. Owner
// 2026-10-28: "every place that requires the central lag check ... all need to also run a second check that detects builds
// that spell racist, profanity, hate speech, or sexually explicit words, or builds that draw inappropriate symbols like
// swastikas"; and, on this detector, "let's use the detector together with the vision model". The shared goop build
// validator runs it as the "contentShape" rule (shapeFindings below). It needs no model and no network, so it answers at
// every check point even when the vision check (mikeybox_content_vision.py) is down. Of the sexual shapes it finds the
// commonest, a shaft between two balls (shaftShape, 2026-10-29); the rest are the vision check's.
//
// How it reads a build (a port of the 10-28 prototype that found every known case in the 3,227 saved builds, with no false
// alarm): every stuck part becomes an oriented box (its core mesh, content_shape_geometry.mjs), placed exactly as the game
// draws it (NetParent frames, view-scale ratios). Then
//   swastikas  each 3D sub-assembly is viewed along its own planes and, for near misses, up to 24 degrees off them (a
//              swastika built in 3D reads as one only from a slightly oblique view); each view is matched against
//              5x5, 7x7 and 9x9 swastika templates of both chiralities at every window size;
//   text       the whole build and each depth slab is drawn flat along its candidate planes and in-plane angles, at its own
//              dot pitch (letters made of spaced apples are closed first); letter-like blobs are grouped into rows,
//              matched against six pixel fonts (8 readings: four rotations, both sides), and the rows go through the
//              content text rules. Only rows whose letters match well (mean score >= 0.88) count;
//   a penis    two round items side by side with a shaft running one way from between them, the whole build (shaftShape).
// Deterministic: the same build gets the same answer at every point (no clocks, no randomness).
import { SHAPE_GEOMETRY } from "./content_shape_geometry.mjs";
import { blocking, reasonFor, textHits } from "./content_text_screen.mjs";

export const SHAPE_SCREEN_VERSION = 2;
const MAX_PARTS = 4096;
const DEFAULT_SCALE_RANGE = [0.2, 2.5];
const MAX_RASTER = 480;
const TEXT_MIN_MEAN = 0.88;   // a text hit counts only if the glyphs of its fragment average >= this match score
const ORIENT_KEEP = 0.95;     // keep readings whose orientation's mean glyph score is within 95% of the best orientation's
const HALF_PI = Math.PI / 2;

// ---------------------------------------------------------------------------------------------------------------------
// Numbers as numpy computes them (the prototype's verdicts are the reference)
// ---------------------------------------------------------------------------------------------------------------------
const num = (v, d = 0) => (typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "number" && Number.isFinite(v) ? v : d);
/** Round half to even, like numpy rint and Python round(). */
function rint(x) {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
/** Python's float %: the result takes the divisor's sign. */
function pmod(a, b) {
  let m = a % b;
  if (m !== 0 && (b < 0) !== (m < 0)) m += b;
  return m;
}
function median(values) {
  const a = Float64Array.from(values).sort();
  const n = a.length;
  if (!n) return NaN;
  const h = n >> 1;
  return n % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
}
/** numpy.percentile, method "linear". */
function percentile(values, p) {
  const a = Float64Array.from(values).sort();
  const n = a.length;
  if (!n) return NaN;
  const pos = (p / 100) * (n - 1);
  const lo = Math.floor(pos), hi = Math.min(lo + 1, n - 1), t = pos - lo;
  const diff = a[hi] - a[lo];
  return t >= 0.5 ? a[hi] - diff * (1 - t) : a[lo] + diff * t;
}
const toFixed3 = (x) => Number(x.toFixed(3));

function vec(a) { return Array.isArray(a) && a.length >= 3 ? [num(a[0]), num(a[1]), num(a[2])] : [0, 0, 0]; }
function quat(a) {
  if (!Array.isArray(a) || a.length < 4) return [0, 0, 0, 1];
  const q = [num(a[0]), num(a[1]), num(a[2]), num(a[3], 1)];
  const n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return n > 1e-9 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : [0, 0, 0, 1];
}
function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
function qmat(q) {
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
function mm(A, B) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return out;
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => Math.sqrt(dot3(a, a));
const unit3 = (a) => { const n = norm3(a); return [a[0] / n, a[1] / n, a[2] / n]; };

/** Eigen decomposition of a symmetric 3x3 (row-major), eigenvalues ascending; vectors[k] is eigenvalue k's (cyclic Jacobi). */
function eigh3(S) {
  const a = S.slice();
  const V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 64; sweep++) {
    const off = a[1] * a[1] + a[2] * a[2] + a[5] * a[5];
    if (off === 0 || off < 1e-40 * (a[0] * a[0] + a[4] * a[4] + a[8] * a[8])) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = a[p * 3 + q];
      if (apq === 0) continue;
      const theta = (a[q * 4] - a[p * 4]) / (2 * apq);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k * 3 + p], akq = a[k * 3 + q];
        a[k * 3 + p] = c * akp - s * akq; a[k * 3 + q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p * 3 + k], aqk = a[q * 3 + k];
        a[p * 3 + k] = c * apk - s * aqk; a[q * 3 + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k * 3 + p], vkq = V[k * 3 + q];
        V[k * 3 + p] = c * vkp - s * vkq; V[k * 3 + q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[i * 4] - a[j * 4]);
  return { w: order.map((i) => a[i * 4]), vectors: order.map((i) => [V[i], V[3 + i], V[6 + i]]) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Geometry: a build as oriented part boxes (transform convention: goop_editor/goop_rules.mjs edgeToParentLocal /
// edgeToDisplayPose; parent scale scales child offsets, never the child's own size)
// ---------------------------------------------------------------------------------------------------------------------
const bare = (id) => String(id || "").replace("item_prefab/", "");
function physScale(mod, rng) {
  const m = Math.trunc(rint(Math.max(-128, Math.min(127, num(mod)))));
  return m < 0 ? 1 + (rng[0] - 1) * (-m / 128) : 1 + (rng[1] - 1) * (m / 127);
}
const FRAME_CACHE = new WeakMap();
function framesOf(geo) {
  let out = FRAME_CACHE.get(geo);
  if (!out) {
    out = new Map();
    for (const [iid, frames] of Object.entries(geo.frames || {})) {
      const m = new Map();
      for (const [id, [pos, rot, linear]] of Object.entries(frames)) m.set(Number(id), [pos, rot, linear]);
      out.set(iid, m);
    }
    FRAME_CACHE.set(geo, out);
  }
  return out;
}

/** Every stuck part of one invention: ids, C (core box centres, 3 per part), A (3 world half-axis vectors per part, 9). */
export function flatten(root, geo = SHAPE_GEOMETRY) {
  const frames = framesOf(geo);
  const ids = [], C = [], A = [];
  const stack = [[root, [0, 0, 0], [1, 0, 0, 0, 1, 0, 0, 0, 1]]];
  while (stack.length && ids.length < MAX_PARTS) {
    const [item, P, R] = stack.pop();
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const iid = bare(item.itemID);
    const g = geo.items[iid];
    const s = physScale(item.scaleModifier ?? 0, g ? g.s : DEFAULT_SCALE_RANGE);
    const mn = g ? g.min.map((x) => x * s) : [-0.15 * s, -0.15 * s, -0.15 * s];
    const mx = g ? g.max.map((x) => x * s) : [0.15 * s, 0.15 * s, 0.15 * s];
    const cl = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const half = [Math.max((mx[0] - mn[0]) / 2, 1e-4), Math.max((mx[1] - mn[1]) / 2, 1e-4), Math.max((mx[2] - mn[2]) / 2, 1e-4)];
    ids.push(iid);
    const rc = mv(R, cl);
    C.push(P[0] + rc[0], P[1] + rc[1], P[2] + rc[2]);
    for (let k = 0; k < 3; k++) A.push(R[k] * half[k], R[3 + k] * half[k], R[6 + k] * half[k]);
    const ratio = geo.viewRatios?.[iid] ?? 1;
    const fr = frames.get(iid);
    for (const edge of Array.isArray(item.stuckChildren) ? item.stuckChildren : []) {
      if (edge === null || typeof edge !== "object" || edge.item === null || typeof edge.item !== "object" || Array.isArray(edge.item)) continue;
      const child = edge.item;
      const sub = Math.trunc(num(edge.subParentID, 0));
      const ep = vec(edge.pos), er = quat(edge.rot);
      const f = fr && sub !== 0 ? fr.get(sub) : undefined;
      let local, lrot;
      if (f) {
        const lin = f[2];
        const le = [lin[0] * ep[0] + lin[1] * ep[1] + lin[2] * ep[2], lin[3] * ep[0] + lin[4] * ep[1] + lin[5] * ep[2],
          lin[6] * ep[0] + lin[7] * ep[1] + lin[8] * ep[2]];
        local = [s * (f[0][0] + le[0]), s * (f[0][1] + le[1]), s * (f[0][2] + le[2])];
        lrot = qmul(f[1], er);
      } else {
        local = [s * ep[0], s * ep[1], s * ep[2]];
        lrot = er;
      }
      const cg = geo.items[bare(child.itemID)];
      const cs = physScale(child.scaleModifier ?? 0, cg ? cg.s : DEFAULT_SCALE_RANGE);
      const cr = qmat(qmul(lrot, qconj(quat(edge.poseRot))));
      const pp = vec(edge.posePos);
      const anchor = mv(cr, [pp[0] * cs, pp[1] * cs, pp[2] * cs]);
      const cpos = [(local[0] - anchor[0]) * ratio, (local[1] - anchor[1]) * ratio, (local[2] - anchor[2]) * ratio];
      const wp = mv(R, cpos);
      stack.push([child, [P[0] + wp[0], P[1] + wp[1], P[2] + wp[2]], mm(R, cr)]);
    }
  }
  return { ids, n: ids.length, C: Float64Array.from(C), A: Float64Array.from(A) };
}
const axisOf = (parts, i, k) => [parts.A[i * 9 + k * 3], parts.A[i * 9 + k * 3 + 1], parts.A[i * 9 + k * 3 + 2]];
const centreOf = (parts, i) => [parts.C[i * 3], parts.C[i * 3 + 1], parts.C[i * 3 + 2]];
function subset(parts, idx) {
  const C = new Float64Array(idx.length * 3), A = new Float64Array(idx.length * 9);
  idx.forEach((i, j) => { C.set(parts.C.subarray(i * 3, i * 3 + 3), j * 3); A.set(parts.A.subarray(i * 9, i * 9 + 9), j * 9); });
  return { ids: idx.map((i) => parts.ids[i]), n: idx.length, C, A };
}
const range = (n) => Array.from({ length: n }, (_, i) => i);

// ---- planes ----
function basisFor(n0) {
  const n = unit3(n0);
  const abs = n.map(Math.abs);
  const ax = abs[0] >= abs[1] && abs[0] >= abs[2] ? 0 : abs[1] >= abs[2] ? 1 : 2;
  if (abs[ax] > 0.999) {
    if (ax === 2) return [n, [1, 0, 0], [0, 1, 0]];      // XY plane, seen from -Z (Unity front)
    if (ax === 0) return [n, [0, 0, 1], [0, 1, 0]];      // YZ plane (mirror readings cover the other side)
    return [n, [1, 0, 0], [0, 0, 1]];                    // XZ plane (floor), seen from above
  }
  const up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = unit3(cross3(up, n));
  return [n, u, cross3(n, u)];
}
function scatter(rows) {   // X^T X of row vectors
  const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i * 3 + j] += r[i] * r[j];
  return M;
}
function meanOf(parts, idx) {
  const m = [0, 0, 0];
  for (const i of idx) { m[0] += parts.C[i * 3]; m[1] += parts.C[i * 3 + 1]; m[2] += parts.C[i * 3 + 2]; }
  return [m[0] / idx.length, m[1] / idx.length, m[2] / idx.length];
}
const axisLen = (parts, i, k) => norm3(axisOf(parts, i, k));

function candidateNormals(parts, maxNormals = 6) {
  const n = parts.n;
  const normals = [[0, 0, 1], [1, 0, 0], [0, 1, 0]];
  if (n >= 4) {
    let keep = range(n);
    let w = null, vectors = null;
    for (let it = 0; it < 3; it++) {               // robust plane fit: drop the worst 15% residuals, refit
      const mean = meanOf(parts, keep);
      ({ w, vectors } = eigh3(scatter(keep.map((i) => { const c = centreOf(parts, i); return [c[0] - mean[0], c[1] - mean[1], c[2] - mean[2]]; }))));
      const res = range(n).map((i) => { const c = centreOf(parts, i); return Math.abs((c[0] - mean[0]) * vectors[0][0] + (c[1] - mean[1]) * vectors[0][1] + (c[2] - mean[2]) * vectors[0][2]); });
      if (keep.length < 8) break;
      const cut = percentile(res, 85) + 1e-9;
      keep = range(n).filter((i) => res[i] <= cut);
    }
    if (w[2] > 1e-9 && w[0] / w[2] < 0.05) normals.push(vectors[0]);
  }
  // axes of the most common part orientation (text/sign builders rotate every pixel with the sign plane)
  if (n >= 6) {
    const keys = new Map();
    for (let i = 0; i < n; i++) {
      const parts9 = [];
      for (let k = 0; k < 3; k++) {
        const a = axisOf(parts, i, k), l = Math.max(norm3(a), 1e-9);
        for (let d = 0; d < 3; d++) parts9.push(rint(Math.abs(a[d] / l) * 10) / 10);
      }
      const key = parts9.join(",");
      const e = keys.get(key);
      if (e) e.count++; else keys.set(key, { count: 1, first: i, sort: parts9 });
    }
    // np.unique sorts the keys; argmax takes the first (smallest) of the most common
    let top = null;
    for (const e of keys.values()) {
      if (!top || e.count > top.count || (e.count === top.count && lexLess(e.sort, top.sort))) top = e;
    }
    if (top.count >= 0.3 * n) {
      for (let k = 0; k < 3; k++) { const a = axisOf(parts, top.first, k), l = Math.max(norm3(a), 1e-9); normals.push([a[0] / l, a[1] / l, a[2] / l]); }
    }
  }
  // dominant thin-axis directions of flat parts (pallets, planks, glowsticks lying in a tilted plane)
  const T = [], W = [];
  for (let i = 0; i < n; i++) {
    const lens = [0, 1, 2].map((k) => axisLen(parts, i, k));
    let k = 0;
    if (lens[1] < lens[k]) k = 1;
    if (lens[2] < lens[k]) k = 2;
    const sorted = [...lens].sort((a, b) => a - b);
    if (lens[k] < 0.6 * sorted[1]) {
      const a = axisOf(parts, i, k), l = Math.max(lens[k], 1e-9);
      T.push([a[0] / l, a[1] / l, a[2] / l]);
      W.push(sorted[1] * sorted[2]);
    }
  }
  if (T.length >= 4) {
    const colSum = [0, 1, 2].map((d) => T.reduce((s, t) => s + Math.abs(t[d]), 0));
    const c = colSum[0] >= colSum[1] && colSum[0] >= colSum[2] ? 0 : colSum[1] >= colSum[2] ? 1 : 2;
    for (const t of T) { const sg = Math.sign(t[c] + 1e-12); t[0] *= sg; t[1] *= sg; t[2] *= sg; }
    const used = new Uint8Array(T.length);
    for (let rep = 0; rep < 3; rep++) {
      if (used.every(Boolean)) break;
      let best = -1, bw = 0;
      let tried = 0;
      for (let i = 0; i < T.length && tried < 200; i++) {
        if (used[i]) continue;
        tried++;
        let sum = 0;
        for (let j = 0; j < T.length; j++) if (!used[j] && Math.abs(dot3(T[j], T[i])) > 0.985) sum += W[j];
        if (sum > bw) { bw = sum; best = i; }
      }
      if (best < 0) break;
      const m = [];
      for (let j = 0; j < T.length; j++) if (!used[j] && Math.abs(dot3(T[j], T[best])) > 0.985) m.push(j);
      for (const j of m) used[j] = 1;
      if (m.length >= 4) {
        const d = [0, 0, 0];
        for (const j of m) { const sg = Math.sign(dot3(T[j], T[best])); for (let q = 0; q < 3; q++) d[q] += T[j][q] * sg * W[j]; }
        normals.push(unit3(d));
      }
    }
  }
  const out = [];
  for (const nn of normals) {
    const u = unit3(nn);
    if (out.every((o) => Math.abs(dot3(u, o)) < 0.985)) out.push(u);
  }
  return out.slice(0, maxNormals);
}
function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** Index sets of parts in depth slabs along n (overlapping thickness intervals merged), largest first. */
function slabs(parts, n, maxSlabs = 5, minParts = 5) {
  const N = parts.n;
  const t = new Float64Array(N), h = new Float64Array(N), inplane = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    t[i] = parts.C[i * 3] * n[0] + parts.C[i * 3 + 1] * n[1] + parts.C[i * 3 + 2] * n[2];
    let hs = 0, l2 = 0;
    for (let k = 0; k < 3; k++) { const a = axisOf(parts, i, k); hs += Math.abs(dot3(a, n)); l2 += dot3(a, a); }
    h[i] = hs;
    inplane[i] = Math.sqrt(Math.max(l2 - hs * hs, 0));
  }
  const tol = N ? 0.35 * median(inplane) : 0;
  const order = range(N).sort((a, b) => (t[a] - h[a]) - (t[b] - h[b]));
  const groups = [];
  let cur = [], curHi = -Infinity;
  for (const i of order) {
    const lo = t[i] - h[i];
    if (cur.length && lo > curHi + tol) { groups.push(cur); cur = []; curHi = -Infinity; }
    cur.push(i);
    curHi = Math.max(curHi, t[i] + h[i]);
  }
  if (cur.length) groups.push(cur);
  return groups.filter((g) => g.length >= minParts).sort((a, b) => b.length - a.length).slice(0, maxSlabs);
}

/** Separating-axis test of OBB i against OBB j (half-axis rows), inflated by tol. */
function obbTouch(parts, i, j, tol) {
  const a = [0, 1, 2].map((k) => axisOf(parts, i, k)), b = [0, 1, 2].map((k) => axisOf(parts, j, k));
  const d = [parts.C[j * 3] - parts.C[i * 3], parts.C[j * 3 + 1] - parts.C[i * 3 + 1], parts.C[j * 3 + 2] - parts.C[i * 3 + 2]];
  const axes = [a[0], b[0], a[1], b[1], a[2], b[2]];
  for (let k = 0; k < 3; k++) for (let q = 0; q < 3; q++) axes.push(cross3(a[k], b[q]));
  for (const L of axes) {
    const nrm = norm3(L);
    if (!(nrm > 1e-9)) continue;
    const Lu = [L[0] / nrm, L[1] / nrm, L[2] / nrm];
    const ra = Math.abs(dot3(Lu, a[0])) + Math.abs(dot3(Lu, a[1])) + Math.abs(dot3(Lu, a[2]));
    const rb = Math.abs(dot3(b[0], Lu)) + Math.abs(dot3(b[1], Lu)) + Math.abs(dot3(b[2], Lu));
    if (Math.abs(dot3(d, Lu)) > ra + rb + tol) return false;
  }
  return true;
}
/** Sub-assemblies: connected groups of parts whose boxes touch (within tol metres), largest first. */
function clusters(parts, tol = 0.04, minParts = 4) {
  const n = parts.n;
  if (!n) return [];
  const lo = new Float64Array(n * 3), hi = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < 3; d++) {
      const e = Math.abs(parts.A[i * 9 + d]) + Math.abs(parts.A[i * 9 + 3 + d]) + Math.abs(parts.A[i * 9 + 6 + d]);
      lo[i * 3 + d] = parts.C[i * 3 + d] - e - tol; hi[i * 3 + d] = parts.C[i * 3 + d] + e + tol;
    }
  }
  const parent = Int32Array.from(range(n));
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const order = range(n).sort((a, b) => lo[a * 3] - lo[b * 3]);
  for (let oi = 0; oi < n; oi++) {
    const i = order[oi];
    for (let oj = oi + 1; oj < n; oj++) {
      const j = order[oj];
      if (lo[j * 3] > hi[i * 3]) break;
      if (!(lo[j * 3 + 1] <= hi[i * 3 + 1] && hi[j * 3 + 1] >= lo[i * 3 + 1] && lo[j * 3 + 2] <= hi[i * 3 + 2] && hi[j * 3 + 2] >= lo[i * 3 + 2])) continue;
      if (!obbTouch(parts, i, j, tol)) continue;
      const a = find(i), b = find(j);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  return [...groups.values()].filter((g) => g.length >= minParts).sort((a, b) => b.length - a.length);
}
function tilted(n, deg, az) {
  const [nn, u, v] = basisFor(n);
  const t = deg * Math.PI / 180;
  const d = [0, 1, 2].map((q) => Math.cos(t) * nn[q] + Math.sin(t) * (Math.cos(az) * u[q] + Math.sin(az) * v[q]));
  return unit3(d);
}

// ---- projection and rasterization of each part's box footprint (a zonotope with 3 generators) ----
/** c2 (2 per part) and E (3 generators x 2 per part) of the parts idx seen in the plane (u, v). */
function project(parts, idx, u, v) {
  const m = idx.length, c2 = new Float64Array(m * 2), E = new Float64Array(m * 6);
  idx.forEach((i, j) => {
    const c = centreOf(parts, i);
    c2[j * 2] = dot3(c, u); c2[j * 2 + 1] = dot3(c, v);
    for (let g = 0; g < 3; g++) { const a = axisOf(parts, i, g); E[j * 6 + g * 2] = dot3(a, u); E[j * 6 + g * 2 + 1] = dot3(a, v); }
  });
  return [c2, E];
}
function rotate2(c2, E, ang) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const rc = new Float64Array(c2.length), rE = new Float64Array(E.length);
  for (let i = 0; i < c2.length; i += 2) { rc[i] = ca * c2[i] - sa * c2[i + 1]; rc[i + 1] = sa * c2[i] + ca * c2[i + 1]; }
  for (let i = 0; i < E.length; i += 2) { rE[i] = ca * E[i] - sa * E[i + 1]; rE[i + 1] = sa * E[i] + ca * E[i + 1]; }
  return [rc, rE];
}
const extOf = (E, i, d) => Math.abs(E[i * 6 + d]) + Math.abs(E[i * 6 + 2 + d]) + Math.abs(E[i * 6 + 4 + d]);
/** Minimal in-plane width of each part footprint (its width along the generators' normals), metres; Infinity if none. */
function partWidths(E) {
  const m = E.length / 6, out = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const ex = E[i * 6 + k * 2], ey = E[i * 6 + k * 2 + 1], L = Math.sqrt(ex * ex + ey * ey);
      if (!(L > 1e-6)) continue;
      const px = -ey / L, py = ex / L;
      let w = 0;
      for (let g = 0; g < 3; g++) w += Math.abs(E[i * 6 + g * 2] * px + E[i * 6 + g * 2 + 1] * py);
      best = Math.min(best, 2 * w);
    }
    out[i] = best;
  }
  return out;
}

/** Boolean raster of the footprints, row 0 at the TOP (max v), cols u ascending: { img, H, W, lo, cell }. */
function rasterize(c2, E, cell, dilate = 0, maxDim = 600, work) {
  const m = c2.length / 2;
  const dil = (i) => (typeof dilate === "number" ? dilate : dilate[i]);
  let lo0 = Infinity, lo1 = Infinity, hi0 = -Infinity, hi1 = -Infinity;
  for (let i = 0; i < m; i++) {
    const e0 = extOf(E, i, 0) + dil(i), e1 = extOf(E, i, 1) + dil(i);
    lo0 = Math.min(lo0, c2[i * 2] - e0); hi0 = Math.max(hi0, c2[i * 2] + e0);
    lo1 = Math.min(lo1, c2[i * 2 + 1] - e1); hi1 = Math.max(hi1, c2[i * 2 + 1] + e1);
  }
  let W = Math.ceil((hi0 - lo0) / cell) + 1, H = Math.ceil((hi1 - lo1) / cell) + 1;
  if (W > maxDim || H > maxDim) {
    cell = cell * Math.max(W, H) / maxDim;
    W = Math.ceil((hi0 - lo0) / cell) + 1; H = Math.ceil((hi1 - lo1) / cell) + 1;
  }
  const img = new Uint8Array(H * W);
  const clip = (x, top) => (x < 0 ? 0 : x > top ? top : x);
  const set = (px, py) => { img[(H - 1 - py) * W + px] = 1; };
  for (let i = 0; i < m; i++) {
    set(clip(Math.trunc((c2[i * 2] - lo0) / cell), W - 1), clip(Math.trunc((c2[i * 2 + 1] - lo1) / cell), H - 1));
  }
  const D = new Float64Array(10), lim = new Float64Array(5);
  for (let i = 0; i < m; i++) {
    const cx = c2[i * 2], cy = c2[i * 2 + 1], dd = dil(i);
    D[0] = 1; D[1] = 0; D[2] = 0; D[3] = 1;
    for (let g = 0; g < 3; g++) {
      const ex = E[i * 6 + g * 2], ey = E[i * 6 + g * 2 + 1], L = Math.sqrt(ex * ex + ey * ey), den = Math.max(L, 1e-9);
      D[4 + g * 2] = -ey / den; D[5 + g * 2] = ex / den;
    }
    for (let j = 0; j < 5; j++) {
      let s = 0;
      for (let g = 0; g < 3; g++) s += Math.abs(E[i * 6 + g * 2] * D[j * 2] + E[i * 6 + g * 2 + 1] * D[j * 2 + 1]);
      lim[j] = s + dd;
    }
    for (let g = 0; g < 3; g++) {
      const ex = E[i * 6 + g * 2], ey = E[i * 6 + g * 2 + 1];
      if (Math.sqrt(ex * ex + ey * ey) < 1e-6) lim[2 + g] = Infinity;
    }
    const e0 = extOf(E, i, 0) + dd, e1 = extOf(E, i, 1) + dd;
    const x0 = clip(Math.floor((cx - e0 - lo0) / cell), W - 1), x1 = clip(Math.ceil((cx + e0 - lo0) / cell), W - 1);
    const y0 = clip(Math.floor((cy - e1 - lo1) / cell), H - 1), y1 = clip(Math.ceil((cy + e1 - lo1) / cell), H - 1);
    if (work) work.n += (x1 - x0 + 1) * (y1 - y0 + 1);
    for (let py = y0; py <= y1; py++) {
      const gy = lo1 + (py + 0.5) * cell - cy;
      for (let px = x0; px <= x1; px++) {
        const gx = lo0 + (px + 0.5) * cell - cx;
        let ok = true;
        for (let j = 0; j < 5 && ok; j++) ok = Math.abs(gx * D[j * 2] + gy * D[j * 2 + 1]) <= lim[j] + 1e-9;
        if (ok) set(px, py);
      }
    }
  }
  return { img, H, W, lo: [lo0, lo1], cell };
}

/** 8-connected component labels (run-length union-find), numbered by their first run: { lab, count }. */
function label(img, H, W) {
  const parent = [];
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  let prev = [];
  const all = [];
  for (let y = 0; y < H; y++) {
    const runs = [];
    let j = 0, x = 0;
    const base = y * W;
    while (x < W) {
      if (!img[base + x]) { x++; continue; }
      const s = x;
      while (x < W && img[base + x]) x++;
      const e = x - 1;
      const lab = parent.length;
      parent.push(lab);
      while (j < prev.length && prev[j][1] < s - 1) j++;
      for (let k = j; k < prev.length && prev[k][0] <= e + 1; k++) {
        const a = find(lab), b = find(prev[k][2]);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
      runs.push([s, e, lab]);
      all.push(y, s, e, lab);
    }
    prev = runs;
  }
  const lab = new Int32Array(H * W);
  const remap = new Map();
  for (let i = 0; i < all.length; i += 4) {
    const r = find(all[i + 3]);
    let id = remap.get(r);
    if (id === undefined) { id = remap.size + 1; remap.set(r, id); }
    lab.fill(id, all[i] * W + all[i + 1], all[i] * W + all[i + 2] + 1);
  }
  return { lab, count: remap.size };
}
function components(img, H, W) {
  const { lab, count } = label(img, H, W);
  const comps = [];
  for (let id = 1; id <= count; id++) comps.push({ id, y0: Infinity, y1: -1, x0: Infinity, x1: -1, area: 0 });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const id = lab[y * W + x];
      if (!id) continue;
      const c = comps[id - 1];
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      c.area++;
    }
  }
  return { lab, comps };
}

// ---------------------------------------------------------------------------------------------------------------------
// Glyph templates: 5x7 capitals (claude_wireframe_text_builder FONT) and their compact 3x4 sampling, a 3x5 pixel font
// with plank-built variants, 5x5 block capitals, 5x7-ish lowercase, bars. Each is cropped to its own ink box, because
// glyphs found in builds are normalized the same way. Ordered lists: the order breaks score ties.
// ---------------------------------------------------------------------------------------------------------------------
const glyphs = (text) => text.trim().split(/\s+/).map((entry) => { const [ch, rows] = entry.split(":"); return [ch, rows.split(",")]; });
const F57 = glyphs(`A:01110,10001,10001,11111,10001,10001,10001 B:11110,10001,10001,11110,10001,10001,11110
  C:01110,10001,10000,10000,10000,10001,01110 D:11110,10001,10001,10001,10001,10001,11110
  E:11111,10000,10000,11110,10000,10000,11111 F:11111,10000,10000,11110,10000,10000,10000
  G:01110,10001,10000,10111,10001,10001,01110 H:10001,10001,10001,11111,10001,10001,10001
  I:11111,00100,00100,00100,00100,00100,11111 J:00111,00010,00010,00010,00010,10010,01100
  K:10001,10010,10100,11000,10100,10010,10001 L:10000,10000,10000,10000,10000,10000,11111
  M:10001,11011,10101,10101,10001,10001,10001 N:10001,11001,10101,10011,10001,10001,10001
  O:01110,10001,10001,10001,10001,10001,01110 P:11110,10001,10001,11110,10000,10000,10000
  Q:01110,10001,10001,10001,10101,10010,01101 R:11110,10001,10001,11110,10100,10010,10001
  S:01111,10000,10000,01110,00001,00001,11110 T:11111,00100,00100,00100,00100,00100,00100
  U:10001,10001,10001,10001,10001,10001,01110 V:10001,10001,10001,10001,10001,01010,00100
  W:10001,10001,10001,10101,10101,10101,01010 X:10001,10001,01010,00100,01010,10001,10001
  Y:10001,10001,01010,00100,00100,00100,00100 Z:11111,00001,00010,00100,01000,10000,11111
  0:01110,10001,10011,10101,11001,10001,01110 1:00100,01100,00100,00100,00100,00100,01110
  2:01110,10001,00001,00110,01000,10000,11111 3:01110,10001,00001,00110,00001,10001,01110
  4:00010,00110,01010,10010,11111,00010,00010 5:11111,10000,11110,00001,00001,10001,01110
  6:00110,01000,10000,11110,10001,10001,01110 7:11111,00001,00010,00100,01000,01000,01000
  8:01110,10001,10001,01110,10001,10001,01110 9:01110,10001,10001,01111,00001,00010,01100`);
const F35 = glyphs(`A:010,101,111,101,101 B:110,101,110,101,110 C:011,100,100,100,011 D:110,101,101,101,110
  E:111,100,110,100,111 F:111,100,110,100,100 G:011,100,101,101,011 H:101,101,111,101,101 I:111,010,010,010,111
  J:001,001,001,101,010 K:101,101,110,101,101 L:100,100,100,100,111 M:101,111,111,101,101 N:110,101,101,101,101
  O:010,101,101,101,010 P:110,101,110,100,100 Q:010,101,101,110,011 R:110,101,110,101,101 S:011,100,010,001,110
  T:111,010,010,010,010 U:101,101,101,101,111 V:101,101,101,101,010 W:101,101,111,111,101 X:101,101,010,101,101
  Y:101,101,010,010,010 Z:111,001,010,100,111 1:010,110,010,010,111 2:110,001,010,100,111 3:110,001,010,001,110
  4:101,101,111,001,001 5:111,100,110,001,110 6:011,100,111,101,111 7:111,001,010,010,010 8:111,101,111,101,111
  9:111,101,111,001,110`);
const F35R = glyphs(`A:111,101,111,101,101 B:111,101,111,101,111 C:111,100,100,100,111 D:110,101,101,101,110
  G:111,100,101,101,111 O:111,101,101,101,111 P:111,101,111,100,100 R:111,101,110,101,101 S:111,100,111,001,111
  U:101,101,101,101,111 N:101,111,111,111,101 K:101,110,100,110,101 Y:101,101,111,010,010 J:001,001,001,101,111
  Q:111,101,101,111,001 H:101,101,111,101,101 E:111,100,111,100,111 F:111,100,111,100,100 T:111,010,010,010,010
  L:100,100,100,100,111`);
const BLOCK55 = glyphs(`A:01110,10001,11111,10001,10001 B:11110,10001,11110,10001,11110 C:01111,10000,10000,10000,01111
  D:11110,10001,10001,10001,11110 E:11111,10000,11110,10000,11111 F:11111,10000,11110,10000,10000
  G:01111,10000,10011,10001,01111 H:10001,10001,11111,10001,10001 I:11111,00100,00100,00100,11111
  J:00111,00010,00010,10010,01100 K:10001,10010,11100,10010,10001 L:10000,10000,10000,10000,11111
  M:10001,11011,10101,10001,10001 N:10001,11001,10101,10011,10001 O:01110,10001,10001,10001,01110
  P:11110,10001,11110,10000,10000 Q:01110,10001,10101,10010,01101 R:11110,10001,11110,10010,10001
  S:01111,10000,01110,00001,11110 T:11111,00100,00100,00100,00100 U:10001,10001,10001,10001,01110
  V:10001,10001,10001,01010,00100 W:10001,10001,10101,11011,10001 X:10001,01010,00100,01010,10001
  Y:10001,01010,00100,00100,00100 Z:11111,00010,00100,01000,11111`);
const LOWER = glyphs(`a:01110,00001,01111,10001,01111 b:10000,10000,10110,11001,10001,10001,11110 c:01110,10000,10000,10001,01110
  d:00001,00001,01101,10011,10001,10001,01111 e:01110,10001,11111,10000,01110 f:00110,01001,01000,11100,01000,01000,01000
  g:01111,10001,10001,01111,00001,01110 h:10000,10000,10110,11001,10001,10001,10001
  i:00100,00000,01100,00100,00100,00100,01110 j:00010,00000,00110,00010,00010,10010,01100
  k:10000,10000,10010,10100,11000,10100,10010 l:01100,00100,00100,00100,00100,00100,01110 m:11010,10101,10101,10001,10001
  n:10110,11001,10001,10001,10001 o:01110,10001,10001,10001,01110 p:11110,10001,11110,10000,10000
  q:01101,10011,01111,00001,00001 r:10110,11001,10000,10000,10000 s:01110,10000,01110,00001,11110
  t:01000,01000,11100,01000,01000,01001,00110 u:10001,10001,10001,10011,01101 v:10001,10001,10001,01010,00100
  w:10001,10001,10101,10101,01010 x:10001,01010,00100,01010,10001 y:10001,10001,01111,00001,01110 z:11111,00010,00100,01000,11111`);
const BARS = [["I", ["1", "1", "1", "1", "1"]], ["|", ["1", "1", "1", "1", "1"]]];
const FONT_PENALTY = { "3x4": 0.06, lower: 0.02 };   // coarse fonts confuse letters (a compact N is two bars)

/** A template cropped to its ink box: { h, w, a: Float64Array }. */
function inkBox(rows) {
  let y0 = Infinity, y1 = -1, x0 = Infinity, x1 = -1;
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === "1") { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }));
  const h = y1 - y0 + 1, w = x1 - x0 + 1, a = new Float64Array(h * w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = rows[y0 + y][x0 + x] === "1" ? 1 : 0;
  return { h, w, a };
}
let FONTS = null;   // built on first use
function fonts() {
  if (FONTS) return FONTS;
  const raw = [];
  for (const [name, table] of [["5x7", F57], ["3x5", F35], ["3x5r", F35R], ["block", BLOCK55], ["lower", LOWER], ["bar", BARS]]) {
    for (const [ch, rows] of table) raw.push([name === "lower" ? ch : ch.toUpperCase(), name, inkBox(rows)]);
  }
  for (const [ch, rows] of F57) {
    const c = [0, 1, 3, 6].map((r) => [0, 2, 4].map((col) => rows[r][col]).join(""));
    if (c.some((r) => r.includes("1"))) raw.push([ch, "3x4", inkBox(c)]);
  }
  const seen = new Set(), templates = [];
  for (const [ch, name, box] of raw) {
    const key = `${ch}|${box.h}x${box.w}|${box.a.join("")}`;
    if (!seen.has(key)) { seen.add(key); templates.push({ ch, font: name, ...box }); }
  }
  const byShape = new Map();
  for (const t of templates) {
    const key = `${t.h}x${t.w}`;
    if (!byShape.has(key)) byShape.set(key, { th: t.h, tw: t.w, list: [] });
    byShape.get(key).list.push(t);
  }
  const t75 = templates.map((t) => (t.h === 7 && t.w === 5 ? t.a : resample(t.a.map((v) => (v ? 1 : 0)), t.h, t.w, 7, 5)));
  FONTS = { templates, byShape, t75 };
  return FONTS;
}

/** Area-fraction resample of a 0/1 crop (h x w) to th x tw. */
function resample(crop, h, w, th, tw) {
  const ky = Math.max(1, Math.ceil(2 * th / h)), kx = Math.max(1, Math.ceil(2 * tw / w));
  const H = h * ky, W = w * kx;
  const s = new Float64Array(th * tw), c = new Float64Array(th * tw);
  for (let y = 0; y < H; y++) {
    const yi = Math.floor((y * th) / H), sy = Math.floor(y / ky);
    for (let x = 0; x < W; x++) {
      const cell = yi * tw + Math.floor((x * tw) / W);
      s[cell] += crop[sy * w + Math.floor(x / kx)];
      c[cell] += 1;
    }
  }
  for (let i = 0; i < s.length; i++) s[i] /= Math.max(c[i], 1);
  return s;
}
/** Typical stroke thickness: the smaller of the median horizontal and vertical ink run lengths. */
function strokePx(crop, h, w) {
  const rh = [], rv = [];
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && crop[y * w + x]) run++;
      else if (run) { rh.push(run); run = 0; }
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y <= h; y++) {
      if (y < h && crop[y * w + x]) run++;
      else if (run) { rv.push(run); run = 0; }
    }
  }
  if (!rh.length || !rv.length) return 1;
  return Math.max(1, Math.min(median(rh), median(rv)));
}
const ACCEPT = 0.80;     // glyph score needed to count as a letter
const ALT_MARGIN = 0.04; // other characters within this score of the best are kept as alternative readings
const ASPECT_W = 0.22;   // penalty per unit |log aspect ratio|
const MATCH_CACHE = new Map();
/** Best { ch, score, second, alts } for a trimmed glyph crop (cached). */
function match(crop, h, w) {
  const key = `${h}x${w}:${crop.join("")}`;
  let hit = MATCH_CACHE.get(key);
  if (hit) return hit;
  if (MATCH_CACHE.size > 200000) MATCH_CACHE.clear();
  hit = matchUncached(crop, h, w);
  MATCH_CACHE.set(key, hit);
  return hit;
}
function scaled(crop, h, w, th, tw, t) {
  const F = resample(crop, h, w, th, tw), k = Math.max(1, Math.min(h / th, w / tw) / t);
  for (let i = 0; i < F.length; i++) F[i] = Math.min(1, Math.max(0, F[i] * k));
  return F;
}
function matchUncached(crop, h, w) {
  const { templates, byShape, t75 } = fonts();
  const asp = w / h, t = strokePx(crop, h, w);
  const F75 = scaled(crop, h, w, 7, 5, t);
  const pre = t75.map((T) => { let s = 0; for (let i = 0; i < 35; i++) s += Math.abs(T[i] - F75[i]); return s / 35; });
  const keep = new Set(range(templates.length).sort((a, b) => pre[a] - pre[b]).slice(0, 14).map((i) => `${templates[i].h}x${templates[i].w}`));
  const scores = new Map();
  for (const [key, { th, tw, list }] of byShape) {
    if (!keep.has(key)) continue;
    const F = scaled(crop, h, w, th, tw, t);
    const pen = ASPECT_W * Math.abs(Math.log(Math.max(asp, 1e-3) / (tw / th)));
    for (const tpl of list) {
      let s = 0;
      for (let i = 0; i < F.length; i++) s += Math.abs(tpl.a[i] - F[i]);
      const v = 1 - s / F.length - pen - (FONT_PENALTY[tpl.font] ?? 0);
      if (v > (scores.get(tpl.ch) ?? -9)) scores.set(tpl.ch, v);
    }
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const second = ranked.length > 1 ? ranked[1][1] : -1;
  const alts = ranked.slice(1, 4).filter(([ch, v]) => v >= ranked[0][1] - ALT_MARGIN && ch.toLowerCase() !== ranked[0][0].toLowerCase()).map(([ch]) => ch);
  return { ch: ranked[0][0], score: ranked[0][1], second, alts };
}

// ---- the 8 readings of a raster (4 rotations x mirror) ----
/** One counter-clockwise numpy rot90, k times, then fliplr: a new { a, H, W }. */
function transformImage(a, H, W, k, flip) {
  let cur = a, hh = H, ww = W;
  for (let r = 0; r < (k % 4); r++) {
    const next = new Int32Array(hh * ww);
    // new[i][j] = old[j][ww-1-i], new shape (ww, hh)
    for (let i = 0; i < ww; i++) for (let j = 0; j < hh; j++) next[i * hh + j] = cur[j * ww + (ww - 1 - i)];
    cur = next;
    [hh, ww] = [ww, hh];
  }
  if (flip) {
    const next = new Int32Array(hh * ww);
    for (let i = 0; i < hh; i++) for (let j = 0; j < ww; j++) next[i * ww + j] = cur[i * ww + (ww - 1 - j)];
    cur = next;
  }
  return { a: cur, H: hh, W: ww };
}
function transformPoint(y, x, k, flip, H, W) {
  let hh = H, ww = W;
  for (let r = 0; r < (k % 4); r++) { [y, x] = [ww - 1 - x, y]; [hh, ww] = [ww, hh]; }
  if (flip) x = ww - 1 - x;
  return [y, x];
}
function transformBox(b, k, flip, H, W) {
  const pts = [[b.y0, b.x0], [b.y0, b.x1], [b.y1, b.x0], [b.y1, b.x1]].map(([y, x]) => transformPoint(y, x, k, flip, H, W));
  return { y0: Math.min(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[0])), x0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[1])) };
}

function rowsFor(lab, H, W, comps, k, flip) {
  const labt = transformImage(lab, H, W, k, flip);
  const items = [];
  for (const c of comps) {
    if (c.area < 3) continue;
    const b = transformBox(c, k, flip, H, W);
    items.push({ y0: b.y0, y1: b.y1, x0: b.x0, x1: b.x1, ids: [c.id], area: c.area });
  }
  if (!items.length) return { labt, rows: [] };
  items.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const rows = [];
  for (const it of items) {
    const hi = it.y1 - it.y0 + 1;
    let placed = false;
    for (const r of rows) {
      const ov = Math.min(r.y1, it.y1) - Math.max(r.y0, it.y0) + 1;
      if (ov >= 0.5 * Math.min(hi, r.y1 - r.y0 + 1)) {
        r.items.push(it); r.y0 = Math.min(r.y0, it.y0); r.y1 = Math.max(r.y1, it.y1); placed = true;
        break;
      }
    }
    if (!placed) rows.push({ y0: it.y0, y1: it.y1, items: [it] });
  }
  const out = [];
  for (const r of rows) {
    const its = [...r.items].sort((a, b) => a.x0 - b.x0);
    const merged = [];
    for (const it of its) {
      const m = merged.at(-1);
      if (m) {
        const ov = Math.min(m.x1, it.x1) - Math.max(m.x0, it.x0) + 1;
        const narrow = Math.min(m.x1 - m.x0 + 1, it.x1 - it.x0 + 1);
        if (ov >= 0.3 * narrow) {
          m.y0 = Math.min(m.y0, it.y0); m.y1 = Math.max(m.y1, it.y1); m.x0 = Math.min(m.x0, it.x0); m.x1 = Math.max(m.x1, it.x1);
          m.ids = m.ids.concat(it.ids); m.area += it.area;
          continue;
        }
      }
      merged.push({ ...it, ids: [...it.ids] });
    }
    if (merged.length < 3) continue;
    const hs = merged.map((g) => g.y1 - g.y0 + 1), ws = merged.map((g) => g.x1 - g.x0 + 1);
    const Hrow = percentile(hs, 75);
    let letterish = 0;
    hs.forEach((h, i) => { if (h >= 0.6 * Hrow && h <= 1.4 * Hrow && ws[i] <= 1.6 * Hrow && h >= 4) letterish++; });
    if (letterish < 3) continue;
    const full = merged.filter((g) => g.y1 - g.y0 + 1 >= 0.7 * Hrow);
    const top = median(full.map((g) => g.y0)), bot = median(full.map((g) => g.y1));
    const Hb = bot - top + 1;
    const b0 = Math.floor(top - 0.3 * Hb), b1 = Math.ceil(bot + 0.3 * Hb);
    out.push({ band: [Math.max(b0, 0), Math.min(b1, labt.H - 1)], H: Hb, top, bot, glyphs: merged });
  }
  return { labt, rows: out };
}

/** Dot-matrix glyph straight from part centres: the centres inside the glyph, snapped to the dot pitch. */
function latticeBitmap(pts, pitchPx, labt, ids, y0, y1, x0, x1) {
  if (!pts || pitchPx < 1.5) return null;
  const inside = [];
  for (const p of pts) if (p[0] >= y0 - 0.5 && p[0] <= y1 + 0.5 && p[1] >= x0 - 0.5 && p[1] <= x1 + 0.5) inside.push(p);
  if (inside.length < 3) return null;
  const keep = inside.filter((p) => {
    const ri = Math.min(Math.max(rint(p[0]), 0), labt.H - 1), ci = Math.min(Math.max(rint(p[1]), 0), labt.W - 1);
    return ids.includes(labt.a[ri * labt.W + ci]);
  });
  if (keep.length < 3) return null;
  const minR = Math.min(...keep.map((p) => p[0])), minC = Math.min(...keep.map((p) => p[1]));
  const r = keep.map((p) => rint((p[0] - minR) / pitchPx)), c = keep.map((p) => rint((p[1] - minC) / pitchPx));
  const h = Math.max(...r) + 1, w = Math.max(...c) + 1;
  if (h - 1 > 11 || w - 1 > 9) return null;
  const bm = new Uint8Array(h * w);
  r.forEach((ri, i) => { bm[ri * w + c[i]] = 1; });
  return { bm, h, w };
}

function decodeGroup(labt, row, items, pts, pitchPx, t0, t1) {
  const [b0, b1] = row.band, Hb = row.H;
  const ids = items.flatMap((it) => it.ids);
  const idSet = new Set(ids);
  const x0 = Math.min(...items.map((it) => it.x0)), x1 = Math.max(...items.map((it) => it.x1));
  const e0 = Math.max(rint(row.top), 0), e1 = Math.min(rint(row.bot), labt.H - 1);
  const gy0 = Math.min(...items.map((it) => it.y0)), gy1 = Math.max(...items.map((it) => it.y1));
  const bands = [[b0, b1]];
  if (gy0 < row.top - 0.2 * Hb || gy1 > row.bot + 0.2 * Hb) bands.push([t0, t1], [e0, e1]);   // an attachment runs through it
  let best = null;
  for (const [c0, c1] of bands) {
    let ys0 = Infinity, ys1 = -1, xs0 = Infinity, xs1 = -1;
    for (let y = c0; y <= c1; y++) for (let x = x0; x <= x1; x++) {
      if (idSet.has(labt.a[y * labt.W + x])) { if (y < ys0) ys0 = y; if (y > ys1) ys1 = y; if (x < xs0) xs0 = x; if (x > xs1) xs1 = x; }
    }
    if (ys1 < 0) continue;
    const gh = ys1 - ys0 + 1, gw = xs1 - xs0 + 1;
    const crop = new Uint8Array(gh * gw);
    let ink = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (idSet.has(labt.a[(ys0 + y) * labt.W + xs0 + x])) { crop[y * gw + x] = 1; ink++; }
    }
    const info = { x0: xs0, x1: xs1, y0: ys0, y1: ys1, h: gh, w: gw, n: items.length };
    if (gh < 0.45 * Hb || gw > 1.6 * Hb || ink / (gh * gw) > 0.88 || gh < 3) Object.assign(info, { ch: "?", score: 0, second: 0, how: "reject" });
    else {
      const m = match(crop, gh, gw);
      Object.assign(info, { ch: m.ch, score: m.score, second: m.second, alts: m.alts, how: "area" });
      const lb = latticeBitmap(pts, pitchPx, labt, ids, info.y0, info.y1, info.x0, info.x1);
      if (lb && lb.h >= 3) {
        const l = match(lb.bm, lb.h, lb.w);
        if (l.score > info.score) Object.assign(info, { ch: l.ch, score: l.score, second: l.second, alts: l.alts, how: "lattice" });
      }
    }
    if (!best || info.score > best.score) best = info;
  }
  return best;
}

/** A row's components as glyphs: each glyph is 1-3 consecutive components (a compact N is two bars, a K a bar and two
 * dots); dynamic programming maximizes accepted-glyph score x width. */
function decodeRow(labt, row, pts, pitchPx) {
  const { top, bot, H: Hb } = row;
  const t0 = Math.max(Math.floor(top - 0.12 * Hb), 0), t1 = Math.min(Math.ceil(bot + 0.12 * Hb), labt.H - 1);
  const items = row.glyphs, n = items.length;
  const cache = new Map();
  const group = (i, j) => {
    const key = i * 4096 + j;
    if (!cache.has(key)) cache.set(key, decodeGroup(labt, row, items.slice(i, j), pts, pitchPx, t0, t1));
    return cache.get(key);
  };
  const best = new Array(n + 1).fill(null);
  best[0] = [0, -1];
  for (let j = 1; j <= n; j++) {
    for (let i = Math.max(0, j - 3); i < j; i++) {
      if (!best[i]) continue;
      if (j - i > 1) {
        let gapsOk = true;
        for (let k = i; k < j - 1; k++) if (items[k + 1].x0 - items[k].x1 - 1 > 0.4 * Hb) { gapsOk = false; break; }
        if (!gapsOk || items[j - 1].x1 - items[i].x0 + 1 > 1.3 * Hb) continue;
      }
      const g = group(i, j);
      if (!g) continue;
      const tot = best[i][0] + (g.score >= ACCEPT ? g.score : -0.1) * (g.w + 1);
      if (!best[j] || tot > best[j][0] + 1e-9) best[j] = [tot, i];
    }
  }
  const out = [];
  let j = n;
  while (j > 0 && best[j]) {
    const i = best[j][1];
    const g = group(i, j);
    if (g) out.push(g);
    j = i;
  }
  return out.reverse();
}
function rowText(gl, H) {
  if (!gl.length) return "";
  const gaps = gl.slice(1).map((g, i) => g.x0 - gl[i].x1 - 1);
  const med = gaps.length ? median(gaps) : 0;
  let s = "";
  gl.forEach((g, i) => {
    if (i && gaps[i - 1] > Math.max(1.9 * med + 1, 0.55 * H)) s += " ";
    s += g.score >= ACCEPT ? g.ch : "?";
  });
  return s;
}
/** Other readings of a row: ambiguous accepted glyphs (I/l/1, O/D/0, ...) swapped for close seconds. */
function rowVariants(gl, main, limit = 16) {
  const idx = [];
  for (let i = 0; i < main.length; i++) if (main[i] !== " ") idx.push(i);
  const pos = [];
  gl.forEach((g, gi) => { if (g.score >= ACCEPT && g.alts?.length) pos.push([idx[gi], g.alts]); });
  if (!pos.length) return [];
  const out = [];
  const choice = new Array(pos.length).fill(0);   // itertools.product order: the last position varies fastest
  const sizes = pos.map(([, alts]) => alts.length + 1);
  for (;;) {
    if (choice.some((c) => c)) {
      const v = [...main];
      pos.forEach(([p, alts], q) => { if (choice[q]) v[p] = alts[choice[q] - 1]; });
      out.push(v.join(""));
      if (out.length >= limit) break;
    }
    let q = pos.length - 1;
    while (q >= 0 && ++choice[q] === sizes[q]) { choice[q] = 0; q--; }
    if (q < 0) break;
  }
  return out;
}
/** Every row string of the 8 readings: [{ k, flip, text, glyphs, H, variants }]. pts = part centres as (row, col). */
function readings(img, H, W, pts, pitchPx, maxComps = 1500) {
  const { lab, comps } = components(img, H, W);
  if (!comps.length || comps.length > maxComps) return [];
  const out = [];
  for (let k = 0; k < 4; k++) {
    for (const flip of [false, true]) {
      const { labt, rows } = rowsFor(lab, H, W, comps, k, flip);
      const ptt = pts && pts.map(([y, x]) => transformPoint(y, x, k, flip, H, W));
      for (const r of rows) {
        if (r.glyphs.length < 3) continue;
        const gl = decodeRow(labt, r, ptt, pitchPx);
        const text = rowText(gl, r.H);
        if ([...text].filter(isAlnum).length >= 2) out.push({ k, flip, text, glyphs: gl, H: r.H, variants: rowVariants(gl, text) });
      }
    }
  }
  return out;
}
const isAlnum = (ch) => /[A-Za-z0-9]/.test(ch);

// ---- the text rules on decoded rows ----
const HITS_CACHE = new Map();
function hitsOf(s) {
  let h = HITS_CACHE.get(s);
  if (!h) {
    if (HITS_CACHE.size > 50000) HITS_CACHE.clear();
    h = blocking(textHits(s));
    HITS_CACHE.set(s, h);
  }
  return h;
}
/** A word masked like the moderation tools do (first and last letter kept), for moderators' logs. */
export function maskWords(t) {
  return t.split(/(\s+)/).map((tok) => (tok.length >= 3 && tok.trim() && hitsOf(tok.toLowerCase()).length ? tok[0] + "*".repeat(tok.length - 2) + tok.at(-1) : tok)).join("");
}
function fragments(txt) {
  const out = [];
  let pos = 0;
  for (const frag of txt.split("?")) {
    const start = pos;
    pos += frag.length + 1;
    const lead = frag.length - frag.replace(/^\s+/, "").length;
    const f = frag.trim();
    if ([...f].filter(isAlnum).length >= 3) out.push([f, start + lead]);
  }
  return out;
}
/** Blocking hits per fragment of a decoded row, with the match quality of the glyphs that make it. */
function judgeRow(txt, gl) {
  const found = [];
  const pos2g = new Map();
  for (let i = 0, k = 0; i < txt.length; i++) if (txt[i] !== " ") pos2g.set(i, k++);
  for (const [f, start] of fragments(txt)) {
    for (const cand of f.includes(" ") ? [f, f.replaceAll(" ", "")] : [f]) {
      const hits = hitsOf(cand.toLowerCase());
      if (!hits.length) continue;
      const sc = [];
      for (let p = start; p < start + f.length; p++) {
        const k = pos2g.get(p);
        if (k !== undefined && k < gl.length) sc.push(gl[k].score);
      }
      found.push({ fragment: maskWords(cand), hits, n: [...f].filter(isAlnum).length,
        min: sc.length ? toFixed3(Math.min(...sc)) : null, mean: sc.length ? toFixed3(sc.reduce((a, b) => a + b, 0) / sc.length) : null });
      break;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------
// Swastikas: a sliding-window template match on rasters already rotated to a candidate in-plane angle
//     X . X X X        X X X . X
//     X . X . .        . . X . X
//     X X X X X        X X X X X
//     . . X . X        X . X . .
//     X X X . X        X . X X X
// Each window is cut into G x G cells (integral image of the raster, dilated so a thin arm is as thick as one cell). A
// window matches when the 'on' cells are >= 0.45 full and the 'off' cells <= 0.30, with the template's allowance of
// violations, and the on/off contrast is >= 0.5.
// ---------------------------------------------------------------------------------------------------------------------
const ON_MIN = 0.45, OFF_MAX = 0.30, MIN_CONTRAST = 0.5, MAX_SIDE = 64;
let SW_TEMPLATES = null;
function swTemplate(hook, G, N0 = 630) {
  const tau = 2 / (G - 1);
  const N = Math.floor(N0 / G) * G, half = 1 + tau / 2, B = N / G;
  const xs = Float64Array.from(range(N), (i) => ((i + 0.5) / N) * 2 * half - half);
  const segs = [[0, 0, 1, 0], [1, 0, 1, -hook], [0, 0, 0, 1], [0, 1, hook, 1], [0, 0, -1, 0], [-1, 0, -1, hook], [0, 0, 0, -1], [0, -1, -hook, -1]];
  const T = new Float64Array(G * G);
  for (let i = 0; i < N; i++) {
    const Y = -xs[i];
    for (let j = 0; j < N; j++) {
      const X = xs[j];
      let on = false;
      for (const [x0, y0, x1, y1] of segs) {
        if (X >= Math.min(x0, x1) - tau / 2 && X <= Math.max(x0, x1) + tau / 2 && Y >= Math.min(y0, y1) - tau / 2 && Y <= Math.max(y0, y1) + tau / 2) { on = true; break; }
      }
      if (on) T[Math.floor(i / B) * G + Math.floor(j / B)] += 1;
    }
  }
  for (let i = 0; i < T.length; i++) T[i] /= B * B;
  return { on: Array.from(T, (v) => v >= 0.6), off: Array.from(T, (v) => v <= 0.1) };
}
function swTemplates() {
  if (SW_TEMPLATES) return SW_TEMPLATES;
  SW_TEMPLATES = [];
  for (const [hook, hookName, G] of [[1.0, "1.0", 5], [1.0, "1.0", 7], [0.66, "0.66", 7], [0.5, "0.5", 9], [0.75, "0.75", 9]]) {
    const { on, off } = swTemplate(hook, G);
    const mirror = (a) => range(G * G).map((i) => a[Math.floor(i / G) * G + (G - 1 - (i % G))]);
    for (const [name, a, b] of [["right", on, off], ["left", mirror(on), mirror(off)]]) {
      SW_TEMPLATES.push({ G, name: `${name}/h${hookName}/g${G}`, on: range(G * G).filter((i) => a[i]), off: range(G * G).filter((i) => b[i]),
        allow: Math.max(1, Math.floor((G * G) / 25)) });
    }
  }
  return SW_TEMPLATES;
}
/** Square dilation by r (separable max). */
function dilateImg(img, H, W, r) {
  if (r <= 0) return img;
  const rowMax = new Uint8Array(H * W), out = new Uint8Array(H * W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let d = Math.max(0, x - r); d <= Math.min(W - 1, x + r) && !v; d++) v = img[y * W + d];
    rowMax[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let d = Math.max(0, y - r); d <= Math.min(H - 1, y + r) && !v; d++) v = rowMax[d * W + x];
    out[y * W + x] = v;
  }
  return out;
}
function pool(img, H, W, maxSide = MAX_SIDE) {
  const f = Math.ceil(Math.max(H, W) / maxSide);
  if (f <= 1) return { img, H, W, f: 1 };
  const Hp = Math.ceil(H / f), Wp = Math.ceil(W / f), out = new Uint8Array(Hp * Wp);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (img[y * W + x]) out[Math.floor(y / f) * Wp + Math.floor(x / f)] = 1;
  return { img: out, H: Hp, W: Wp, f };
}
function integral(img, H, W, r, cache) {
  if (!cache.has(r)) {
    const m = dilateImg(img, H, W, r), W1 = W + 1, I = new Int32Array((H + 1) * W1);
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) { row += m[y * W + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; }
    }
    cache.set(r, { I, W1 });
  }
  return cache.get(r);
}
/** The G x G cell occupancy of one window. */
function cellFill({ I, W1 }, G, y0, x0, h, w, out) {
  const ye = new Array(G + 1), xe = new Array(G + 1);
  for (let k = 0; k <= G; k++) { ye[k] = y0 + rint((k * h) / G); xe[k] = x0 + rint((k * w) / G); }
  for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) {
    const S = I[ye[a + 1] * W1 + xe[b + 1]] - I[ye[a] * W1 + xe[b + 1]] - I[ye[a + 1] * W1 + xe[b]] + I[ye[a] * W1 + xe[b]];
    out[a * G + b] = S / Math.max((ye[a + 1] - ye[a]) * (xe[b + 1] - xe[b]), 1);
  }
  return out;
}
const better = (a, b) => !b || a[0] < b[0] || (a[0] === b[0] && -a[1] < -b[1]);
/** The best window: [violations beyond the template's allowance + 1, contrast, name, cells, [y0, x0, h, w]] or null.
 * Windows: every sizable component's exact box jittered by +-1 px, plus a coarse sliding grid (square, sizes x1.2, step
 * size/8). The 5x5 pass screens every window; the 7x7/9x9 (short-hook, thin-arm) templates run only on near misses. */
function swScan(img0, H0, W0, thickPx0, work, minPx = 10) {
  const { img, H, W, f } = pool(img0, H0, W0);
  const thickPx = thickPx0 / f;
  if (H < minPx || W < minPx) return null;
  const wins = [];
  const { comps } = components(img, H, W);
  for (const c of [...comps].sort((a, b) => b.area - a.area).slice(0, 12)) {
    const h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1;
    if (!(h >= minPx && w >= minPx && w / h >= 0.6 && w / h <= 1.67)) continue;
    for (const dy0 of [-1, 0, 1]) for (const dx0 of [-1, 0, 1]) for (const dh of [-1, 0, 1]) for (const dw of [-1, 0, 1]) {
      const win = [c.y0 + dy0, c.x0 + dx0, h + dh - dy0, w + dw - dx0];
      if (win[0] >= 0 && win[1] >= 0 && win[0] + win[2] <= H && win[1] + win[3] <= W && win[2] >= minPx && win[3] >= minPx) wins.push(win);
    }
  }
  for (let s = minPx; s <= Math.min(H, W) + 1e-9; s *= 1.2) {
    const si = rint(s), step = Math.max(1, rint(si / 8));
    for (let y = 0; y <= H - si; y += step) for (let x = 0; x <= W - si; x += step) wins.push([y, x, si, si]);
  }
  if (!wins.length) return null;
  const integ = new Map();
  let best = null, screen = null;
  for (const G of [5, 7, 9]) {
    if (G !== 5 && !screen) continue;
    let sel = G === 5 ? wins : wins.filter((_, i) => screen[i]);
    sel = sel.filter((w) => Math.min(w[2], w[3]) >= 2 * G);
    if (!sel.length) continue;
    const R = sel.map((w) => Math.max(0, Math.floor((Math.min(w[2], w[3]) / G - thickPx) / 2)));
    const g5 = G === 5 ? new Array(sel.length).fill(99) : null;
    const F = new Float64Array(G * G);
    for (const r of [...new Set(R)].sort((a, b) => a - b)) {
      const integ_r = integral(img, H, W, r, integ);
      const members = [];
      R.forEach((rr, i) => { if (rr === r) members.push(i); });
      const tpls = swTemplates().filter((t) => t.G === G);
      const bestOf = tpls.map(() => null);
      for (const i of members) {
        const w = sel[i];
        cellFill(integ_r, G, w[0], w[1], w[2], w[3], F);
        if (work) work.n += G * G;
        tpls.forEach((t, ti) => {
          let raw = 0, onSum = 0, offSum = 0;
          for (const c of t.on) { if (F[c] < ON_MIN) raw++; onSum += F[c]; }
          for (const c of t.off) { if (F[c] > OFF_MAX) raw++; offSum += F[c]; }
          const viol = raw - t.allow + 1, con = onSum / t.on.length - offSum / t.off.length;
          if (g5) g5[i] = Math.min(g5[i], raw);
          const key = viol * 10 - con;
          if (!bestOf[ti] || key < bestOf[ti].key) bestOf[ti] = { key, viol, con, cells: Float64Array.from(F), win: w };
        });
      }
      tpls.forEach((t, ti) => {
        const b = bestOf[ti];
        if (b && better([b.viol, b.con], best)) best = [b.viol, b.con, t.name, b.cells, [b.win[0] * f, b.win[1] * f, b.win[2] * f, b.win[3] * f], G];
      });
    }
    if (G === 5) {
      if (best && best[0] <= 1 && best[1] >= MIN_CONTRAST) return best;
      screen = new Array(wins.length).fill(false);
      let q = 0;
      wins.forEach((w, i) => { if (Math.min(w[2], w[3]) >= 10) screen[i] = g5[q++] <= 9; });
    }
  }
  return best;
}
const isHit = (b) => Boolean(b) && b[0] <= 1 && b[1] >= MIN_CONTRAST;
function thicknessPx(E, cell) {
  const w = [...partWidths(E)].filter(Number.isFinite);
  return w.length ? median(w) / cell : 1;
}
function grid(cells, G) {
  return range(G).map((r) => range(G).map((c) => { const x = cells[r * G + c]; return x >= 0.5 ? "#" : x > 0.3 ? "+" : "."; }).join(""));
}

/** In-plane rotations worth reading at (radians, mod 90 degrees): 0, the dominant part-edge angle, the centre PCA. */
function angleCandidates(E, c2) {
  const m = c2.length / 2;
  const angs = [0];
  const hist = new Float64Array(90);
  const ad = [], wd = [];
  for (let i = 0; i < m; i++) for (let g = 0; g < 3; g++) {
    const ex = E[i * 6 + g * 2], ey = E[i * 6 + g * 2 + 1], L = Math.sqrt(ex * ex + ey * ey);
    if (!(L > 1e-6)) continue;
    const deg = pmod(Math.atan2(ey, ex), HALF_PI) * (180 / Math.PI);
    hist[Math.trunc(deg) % 90] += L;
    ad.push(deg); wd.push(L);
  }
  if (ad.length) {
    const hs = Float64Array.from(hist, (v, i) => v + hist[(i + 89) % 90] + hist[(i + 1) % 90]);
    let pk = 0, total = 0;
    for (let i = 0; i < 90; i++) { if (hs[i] > hs[pk]) pk = i; total += hs[i]; }
    if (hs[pk] > 0.3 * total) {
      let re = 0, im = 0;
      ad.forEach((d, i) => {
        if (Math.abs(pmod(d - (pk + 0.5) + 45, 90) - 45) < 5) { const r = 4 * (d * (Math.PI / 180)); re += wd[i] * Math.cos(r); im += wd[i] * Math.sin(r); }
      });
      angs.push(pmod(Math.atan2(im, re) / 4, HALF_PI));
    }
  }
  if (m >= 6) {
    let mx = 0, my = 0;
    for (let i = 0; i < m; i++) { mx += c2[i * 2]; my += c2[i * 2 + 1]; }
    mx /= m; my /= m;
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < m; i++) { const x = c2[i * 2] - mx, y = c2[i * 2 + 1] - my; a += x * x; b += x * y; c += y * y; }
    const mid = (a + c) / 2, rad = Math.sqrt(((a - c) / 2) ** 2 + b * b);
    if (mid + rad > 4 * Math.max(mid - rad, 1e-12)) angs.push(pmod(0.5 * Math.atan2(2 * b, a - c), HALF_PI));
  }
  const out = [];
  for (const t of angs) {
    if (out.every((o) => { const d = Math.abs(t - o) % HALF_PI; return Math.min(d, HALF_PI - d) > 4 * Math.PI / 180; })) out.push(t);
  }
  return out;
}

/** The best swastika window over a sub-assembly's in-plane angles seen along n. */
function bestView(sub, n, budget, work, res = 56) {
  if (budget.views <= 0) return null;
  budget.views--;
  const [, u, v] = basisFor(n);
  const [c2, E] = project(sub, range(sub.n), u, v);
  let angs = angleCandidates(E, c2);
  if (angs.length > 1) angs = angs.slice(1, 2);      // a sub-assembly: its dominant part-edge angle is the swastika's frame
  angs = angs.concat(angs.map((x) => x + Math.PI / 4));
  let best = null;
  let spacing = null;   // [pitch, gap] of spaced parts, measured once per view when a near miss needs it
  for (const ang of angs) {
    const [rc, rE] = rotate2(c2, E, -ang);
    let lo0 = Infinity, lo1 = Infinity, hi0 = -Infinity, hi1 = -Infinity;
    for (let i = 0; i < sub.n; i++) {
      const e0 = extOf(rE, i, 0), e1 = extOf(rE, i, 1);
      lo0 = Math.min(lo0, rc[i * 2] - e0); hi0 = Math.max(hi0, rc[i * 2] + e0); lo1 = Math.min(lo1, rc[i * 2 + 1] - e1); hi1 = Math.max(hi1, rc[i * 2 + 1] + e1);
    }
    const cell = Math.max(Math.max(hi0 - lo0, hi1 - lo1) / res, 1e-3);
    const r1 = rasterize(rc, rE, cell, 0, res + 6, work);
    let b = swScan(r1.img, r1.H, r1.W, thicknessPx(rE, cell), work);
    if (b && better(b, best)) best = [...b, ang];
    if (isHit(best)) break;
    // thin parts (hooks thinner than arms, a rod among planks): inflate each part to the median width
    const w = partWidths(rE);
    const fw = [...w].filter(Number.isFinite);
    if (fw.length && b && b[0] <= 6) {
      const med = median(fw);
      if (fw.some((x) => x < 0.7 * med)) {
        const d = Float64Array.from(w, (x) => Math.max(0, (med - (Number.isFinite(x) ? x : med)) / 2));
        const r2 = rasterize(rc, rE, cell, d, res + 6, work);
        b = swScan(r2.img, r2.H, r2.W, thicknessPx(rE, cell), work);
        if (b && better(b, best)) best = [...b, ang];
        if (isHit(best)) break;
      }
    }
    // spaced parts (blocks with gaps between them; not in the 10-28 prototype): grow each part to close the gaps, as the
    // text reader closes dot letters, and look again. Grown parts fill more cells, so here the match must be exact (no
    // wrong cell): with the usual one allowed, a snow globe's castle (99208f9c) read as one.
    if (fw.length && b && b[0] <= 6) {
      spacing ??= nnStats(c2, E);
      const [pitch, gap] = spacing, med = median(fw);
      const dil = pitch > 0 && gap > 0 ? Math.max(0, Math.min(0.55 * pitch - 0.5 * med, 0.75 * gap)) : 0;
      if (dil >= 0.2 * cell) {
        const r3 = rasterize(rc, rE, cell, dil, res + 6, work);
        const b3 = swScan(r3.img, r3.H, r3.W, (med + 2 * dil) / r3.cell, work);
        if (b3 && b3[0] <= 0 && better(b3, best)) best = [...b3, ang];
        if (isHit(best)) break;
      }
    }
  }
  return best;
}
const TILTS = [8, 16, 24];
const MAX_VIEWS = 80;     // deterministic per-build cap on sub-assembly views (worst-case time bound)
const swHit = (b, view, tilt, parts) => ({ where: "cluster", chirality: b[2], violations: b[0], contrast: toFixed3(b[1]),
  view: view.map(toFixed3), tilt, angle: Number((b[6] * 180 / Math.PI).toFixed(1)), parts, window: b[4], grid: grid(b[3], b[5]) });
/** Per 3D sub-assembly: its candidate planes, then a +-24 degree view search around the near misses. */
function scanClusters(parts, work, maxClusters = 40, prune = 3) {
  const hits = [];
  const cls = clusters(parts, 0.04, 5);
  const mids = range(parts.n).map((i) => 2 * [0, 1, 2].map((k) => axisLen(parts, i, k)).sort((a, b) => a - b)[1]);
  const tol2 = Math.min(parts.n ? median(mids) : 0, 0.6);
  if (tol2 > 0.06) {   // spaced dots (apples on a grid) never touch: also group parts closer than about their own size
    const seen = new Set(cls.map((c) => c.join(",")));
    for (const c of clusters(parts, tol2, 5)) if (!seen.has(c.join(","))) cls.push(c);
  }
  const budget = { views: MAX_VIEWS };
  for (const cl of cls.slice(0, maxClusters)) {
    if (cl.length > 400) continue;
    const sub = subset(parts, cl);
    // a swastika is square in its plane: skip sub-assemblies whose two largest extents differ more than 2.5x
    const mean = meanOf(sub, range(sub.n));
    const M = scatter(range(sub.n).map((i) => { const c = centreOf(sub, i); return [c[0] - mean[0], c[1] - mean[1], c[2] - mean[2]]; }));
    for (let i = 0; i < sub.n; i++) for (let k = 0; k < 3; k++) {
      const a = axisOf(sub, i, k);
      for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) M[p * 3 + q] += (a[p] * a[q]) / 3;
    }
    const ev = eigh3(M).w.slice().sort((a, b) => b - a);
    if (ev[1] < ev[0] / 6.25) continue;
    const near = [];
    let found = false;
    for (const n of candidateNormals(sub)) {
      const b = bestView(sub, n, budget, work);
      if (!b) continue;
      if (isHit(b)) { hits.push(swHit(b, n, 0, cl.length)); found = true; break; }
      if (b[0] <= prune) near.push([b[0], -b[1], n]);
    }
    near.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, , n] of near.slice(0, 2)) {
      if (found) break;
      for (const deg of TILTS) {
        for (let k = 0; k < 8 && !found; k++) {
          const d = tilted(n, deg, (k * Math.PI) / 4);
          const b = bestView(sub, d, budget, work);
          if (isHit(b)) { hits.push(swHit(b, d, deg, cl.length)); found = true; }
        }
        if (found) break;
      }
    }
    if (hits.length) break;   // one is enough to refuse
  }
  return hits;
}
function swFind(r, E, work) {
  const b = swScan(r.img, r.H, r.W, thicknessPx(E, r.cell), work);
  if (!isHit(b)) return [];
  return [{ where: "raster", chirality: b[2], violations: b[0], contrast: toFixed3(b[1]), window: b[4],
    sizeM: toFixed3(Math.max(b[4][2], b[4][3]) * r.cell), grid: grid(b[3], b[5]) }];
}

// ---------------------------------------------------------------------------------------------------------------------
// One invention
// ---------------------------------------------------------------------------------------------------------------------
/** Median nearest-neighbour centre distance (the dot pitch) and the 75th percentile of the smallest positive footprint
 * gap to one of the k nearest neighbours (the gap that keeps a dot-matrix stroke broken). */
function nnStats(c2, E, k = 6) {
  const m = c2.length / 2;
  if (m < 2) return [0, 0];
  const sub = m <= 800 ? range(m) : range(800).map((i) => (i === 799 ? m - 1 : Math.trunc(i * ((m - 1) / 799))));
  const kk = Math.min(k, m - 1);
  const minD = [], gaps = [];
  const rowGaps = [];
  let anyOk = false;
  const nd = new Float64Array(kk), nj = new Int32Array(kk);
  for (const s of sub) {
    let cnt = 0;
    for (let j = 0; j < m; j++) {
      if (j === s) continue;
      const dx = c2[s * 2] - c2[j * 2], dy = c2[s * 2 + 1] - c2[j * 2 + 1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-6) continue;
      if (cnt < kk) { let p = cnt++; while (p > 0 && nd[p - 1] > d) { nd[p] = nd[p - 1]; nj[p] = nj[p - 1]; p--; } nd[p] = d; nj[p] = j; }
      else if (d < nd[kk - 1]) { let p = kk - 1; while (p > 0 && nd[p - 1] > d) { nd[p] = nd[p - 1]; nj[p] = nj[p - 1]; p--; } nd[p] = d; nj[p] = j; }
    }
    if (!cnt) { rowGaps.push(null); continue; }
    anyOk = true;
    minD.push(nd[0]);
    const row = [];
    for (let q = 0; q < cnt; q++) {
      const j = nj[q], d = nd[q];
      const ux = (c2[s * 2] - c2[j * 2]) / d, uy = (c2[s * 2 + 1] - c2[j * 2 + 1]) / d;
      let ri = 0, rj = 0;
      for (let g = 0; g < 3; g++) {
        ri += Math.abs(E[s * 6 + g * 2] * ux + E[s * 6 + g * 2 + 1] * uy);
        rj += Math.abs(E[j * 6 + g * 2] * ux + E[j * 6 + g * 2 + 1] * uy);
      }
      row.push(d - ri - rj);
    }
    rowGaps.push(row);
  }
  if (!anyOk) return [0, 0];
  const pitch = median(minD);
  for (const row of rowGaps) {
    if (!row) continue;
    let g = Infinity;
    for (const x of row) if (x > 0.05 * pitch && x < g) g = x;
    if (Number.isFinite(g)) gaps.push(g);
  }
  if (gaps.length < 0.3 * sub.length) return [pitch, 0];
  return [pitch, percentile(gaps, 75)];
}
/** [[cell, dilation]] raster levels: as built, and (spaced dots) dilated to close the dot gaps; and the dot pitch. */
function planRaster(c2, E) {
  const m = c2.length / 2;
  const [pitch, gap] = nnStats(c2, E);
  const pw = partWidths(E);
  const thick = range(m).map((i) => (Number.isFinite(pw[i]) ? pw[i] : 2 * Math.min(extOf(E, i, 0), extOf(E, i, 1))));
  let span = 1;
  if (m) {
    let lo0 = Infinity, lo1 = Infinity, hi0 = -Infinity, hi1 = -Infinity, emax = 0;
    for (let i = 0; i < m; i++) {
      lo0 = Math.min(lo0, c2[i * 2]); hi0 = Math.max(hi0, c2[i * 2]); lo1 = Math.min(lo1, c2[i * 2 + 1]); hi1 = Math.max(hi1, c2[i * 2 + 1]);
      emax = Math.max(emax, extOf(E, i, 0), extOf(E, i, 1));
    }
    span = Math.max(hi0 - lo0, hi1 - lo1) + 2 * emax;
  }
  const medThick = median(thick);
  const d1 = pitch > 0 && gap > 0 ? Math.max(0, Math.min(0.55 * pitch - 0.5 * medThick, 0.75 * gap)) : 0;
  const levels = [];
  for (const dil of [0, d1]) {
    const cell = Math.max((medThick + 2 * dil) / 3, span / MAX_RASTER, 1e-3);
    if (dil > 0 && dil < 0.2 * cell) continue;
    if (levels.length && dil === 0) continue;     // the prototype read the same raster twice here
    levels.push([cell, dil]);
  }
  return [levels, pitch];
}

// ---------------------------------------------------------------------------------------------------------------------
// The shaft-and-balls shape (owner 2026-10-29, "the inappropriate builds recognition"): a penis built from harmless items,
// the commonest sexual build (073142ee a stick between two soccer balls, 1abe8429 stacked metal balls on two, eb32d660,
// 88cf4f85). The local vision models tried on 10-29 described such builds right ("a tall pole standing between two soccer
// balls") and still judged them fine, so this shape is found from the parts instead:
//   two round items side by side (similar size, touching or nearly); a shaft of other parts that starts between them, runs
//   one way at least 2.5 ball radii, and is no wider than the pair; and the shape IS the build (at least half its parts and
//   three quarters of its size), so a corner of a big build (a cabin's chimney, a dinosaur's legs) is not one.
// Measured 10-29 on the 3,380 saved Workshop/Fabshop builds: the four known ones and nothing else (the nearest innocent
// build had 12% of its parts and 56% of its size in such a shape); on synthetic builds in any orientation 11 of 12, and no
// snowman, dumbbell, lamp, tree or lone pair of balls.
// ---------------------------------------------------------------------------------------------------------------------
const ROUND_ITEM = /^item_(apple|orange|tomato|snowball|soccer_ball|metal_ball\w*|moonrock\w*|easter_egg|egg\w*|rpg_ammo_egg|pumpkinjack\w*|pumpkin_bomb|coconut_shell|quest_dball_\d|water_balloon_\w+|balloon|tele_pearl|squishy\w*smiley|bait_magmar_ball|ore_\w+|uranium_chunk_\w+)$/;
const SHAFT = { aniso: 1.6, pairSize: 1.5, pairNear: 1.25, pairFar: 0.5, seed: 1.15, slab: 0.9, slabHalf: 1.15, grow: 0.3,
  minLen: 2.5, maxBack: 1.1, maxWidth: 2.5, minAspect: 1.5, maxParts: 150, minPartsFrac: 0.5, minExtentFrac: 0.75 };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/** Each part as a capsule along its longest box axis (a round item is a sphere), plus its box. */
function capsules(parts) {
  const out = [];
  for (let i = 0; i < parts.n; i++) {
    const c = [parts.C[3 * i], parts.C[3 * i + 1], parts.C[3 * i + 2]];
    const ax = [0, 1, 2].map((k) => [parts.A[9 * i + 3 * k], parts.A[9 * i + 3 * k + 1], parts.A[9 * i + 3 * k + 2]]);
    const h = ax.map(norm3);
    const [m, k1, k2] = [0, 1, 2].sort((a, b) => h[b] - h[a]);
    const rho = Math.max(h[k1], h[k2]);
    const along = h[m] > 1e-9 ? scale3(ax[m], Math.max(h[m] - rho, 0) / h[m]) : [0, 0, 0];
    out.push({ c, ax, rho, a: sub3(c, along), b: add3(c, along), r: (h[0] + h[1] + h[2]) / 3,
      ball: ROUND_ITEM.test(parts.ids[i]) && h[m] <= SHAFT.aniso * Math.max(Math.min(...h), 1e-9) });
  }
  return out;
}
/** The closest distance between segments p1-q1 and p2-q2. */
function segDist(p1, q1, p2, q2) {
  const d1 = sub3(q1, p1), d2 = sub3(q2, p2), r = sub3(p1, p2);
  const a = dot3(d1, d1), e = dot3(d2, d2), f = dot3(d2, r);
  const clamp = (x) => Math.min(Math.max(x, 0), 1);
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) return norm3(r);
  if (a <= 1e-12) t = clamp(f / e);
  else {
    const c = dot3(d1, r);
    if (e <= 1e-12) s = clamp(-c / a);
    else {
      const b = dot3(d1, d2), den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a); } else if (t > 1) { t = 1; s = clamp((b - c) / a); }
    }
  }
  return norm3(sub3(add3(p1, scale3(d1, s)), add3(p2, scale3(d2, t))));
}
const capGap = (x, y) => Math.max(segDist(x.a, x.b, y.a, y.b) - x.rho - y.rho, 0);
function boxCorners(p) {
  const out = [];
  for (const s0 of [-1, 1]) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
    out.push(add3(p.c, add3(scale3(p.ax[0], s0), add3(scale3(p.ax[1], s1), scale3(p.ax[2], s2)))));
  }
  return out;
}
function boxSpan(ps, ks) {
  const all = ks.flatMap((k) => boxCorners(ps[k]));
  return norm3([0, 1, 2].map((a) => Math.max(...all.map((x) => x[a])) - Math.min(...all.map((x) => x[a]))));
}

/** The shaft-and-balls shape in one invention's parts (flatten()), or null: { balls, shaftParts, len, width, partsFrac,
 * extentFrac } with lengths in ball radii. */
export function shaftShape(parts) {
  if (parts.n < 3 || parts.n > SHAFT.maxParts / SHAFT.minPartsFrac + 2) return null;
  const ps = capsules(parts);
  const balls = range(ps.length).filter((i) => ps[i].ball);
  const whole = boxSpan(ps, range(ps.length));
  for (let x = 0; x < balls.length; x++) for (let y = x + 1; y < balls.length; y++) {
    const i = balls[x], j = balls[y], A = ps[i], B = ps[j];
    if (Math.max(A.r, B.r) > SHAFT.pairSize * Math.min(A.r, B.r)) continue;
    const d = norm3(sub3(B.c, A.c)), rs = A.r + B.r;
    if (d > SHAFT.pairNear * rs || d < SHAFT.pairFar * rs) continue;
    const u = scale3(sub3(B.c, A.c), 1 / d), M = scale3(add3(A.c, B.c), 0.5), r = rs / 2;
    // the shaft: parts centred between the two balls (a slab across the pair axis), grown out from the gap between them
    const inSlab = (p) => Math.abs(dot3(sub3(p.c, M), u)) <= SHAFT.slab * r &&
      Math.abs(dot3(p.ax[0], u)) + Math.abs(dot3(p.ax[1], u)) + Math.abs(dot3(p.ax[2], u)) <= SHAFT.slabHalf * r;
    const shaft = new Set(), queue = [];
    ps.forEach((p, k) => {
      if (k !== i && k !== j && inSlab(p) && Math.max(segDist(M, M, p.a, p.b) - p.rho, 0) <= SHAFT.seed * r) { shaft.add(k); queue.push(k); }
    });
    while (queue.length && shaft.size < SHAFT.maxParts) {
      const k = queue.pop();
      ps.forEach((p, m) => {
        if (m !== i && m !== j && !shaft.has(m) && inSlab(p) && capGap(ps[k], p) <= SHAFT.grow * r) { shaft.add(m); queue.push(m); }
      });
    }
    if (!shaft.size || shaft.size >= SHAFT.maxParts) continue;
    // its direction: the main axis of its corners in the plane across the pair axis; it must run one way from the balls
    const pts = [...shaft].flatMap((k) => boxCorners(ps[k])).map((p) => { const w = sub3(p, M); return sub3(w, scale3(u, dot3(w, u))); });
    const b1 = unit3(norm3(cross3(u, [1, 0, 0])) > 0.3 ? cross3(u, [1, 0, 0]) : cross3(u, [0, 1, 0])), b2 = cross3(u, b1);
    let sxx = 0, sxy = 0, syy = 0;
    for (const q of pts) { const p1 = dot3(q, b1), p2 = dot3(q, b2); sxx += p1 * p1; sxy += p1 * p2; syy += p2 * p2; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let v = add3(scale3(b1, Math.cos(ang)), scale3(b2, Math.sin(ang)));
    let ts = pts.map((q) => dot3(q, v));
    if (Math.max(...ts) < -Math.min(...ts)) { v = scale3(v, -1); ts = ts.map((t) => -t); }
    const across = cross3(u, v), ws = pts.map((q) => dot3(q, across));
    const len = Math.max(...ts), back = -Math.min(...ts), width = Math.max(...ws) - Math.min(...ws);
    if (len < SHAFT.minLen * r || back > SHAFT.maxBack * r || width > SHAFT.maxWidth * r || len < SHAFT.minAspect * width) continue;
    const group = [i, j, ...shaft];
    const partsFrac = group.length / ps.length, extentFrac = boxSpan(ps, group) / Math.max(whole, 1e-9);
    if (partsFrac < SHAFT.minPartsFrac || extentFrac < SHAFT.minExtentFrac) continue;
    return { balls: [parts.ids[i], parts.ids[j]], shaftParts: shaft.size, len: toFixed3(len / r), width: toFixed3(width / r),
      partsFrac: toFixed3(partsFrac), extentFrac: toFixed3(extentFrac) };
  }
  return null;
}

/** What the shape screen finds in one invention: { parts, text: [...], swastika: [...], sexual: [...], work }. `all` keeps
 * looking after the first finding that refuses (the audit); a check point stops there. */
export function analyzeInvention(root, { geo = SHAPE_GEOMETRY, all = false, readingsOut = null } = {}) {
  const parts = flatten(root, geo);
  const work = { n: 0 };
  const res = { parts: parts.n, text: [], swastika: [], sexual: [], work };
  const shape = shaftShape(parts);
  if (shape) res.sexual.push(shape);
  if (parts.n < 5 || (shape && !all)) return res;
  const refused = () => !all && (res.swastika.length > 0 || res.text.some((t) => t.strong));
  res.swastika.push(...scanClusters(parts, work));
  if (refused()) return res;
  const seen = new Set();
  for (const n0 of candidateNormals(parts)) {
    const [n, u, v] = basisFor(n0);
    const groups = slabs(parts, n);
    if (!groups.some((g) => g.length === parts.n)) groups.push(range(parts.n));
    for (const idx of groups) {
      const [c2, E] = project(parts, idx, u, v);
      const [levels, pitch] = planRaster(c2, E);
      const angs = angleCandidates(E, c2);
      for (let li = 0; li < levels.length; li++) {
        const [cell, dil] = levels[li];
        const list = li === 0 ? angs.concat(angs.map((a) => a + Math.PI / 4)) : angs;
        for (let ai = 0; ai < list.length; ai++) {
          const ang = list[ai];
          const [rc, rE] = rotate2(c2, E, -ang);
          const r = rasterize(rc, rE, cell, dil, MAX_RASTER + 20, work);
          if (ai < angs.length) {
            const pts = range(idx.length).map((i) => [(r.H - 1) - ((rc[i * 2 + 1] - r.lo[1]) / r.cell - 0.5), (rc[i * 2] - r.lo[0]) / r.cell - 0.5]);
            const rds = readings(r.img, r.H, r.W, pts, pitch / r.cell);
            // real text reads best in its own orientation: readings from one that reads clearly worse are dropped
            const acc = new Map();
            for (const rd of rds) {
              const key = `${rd.k}|${rd.flip}`;
              const a = acc.get(key) ?? [0, 0];
              for (const g of rd.glyphs) if (g.score >= ACCEPT) a[0] += g.score;
              a[1] += rd.glyphs.length;
              acc.set(key, a);
            }
            const qual = new Map([...acc].map(([key, a]) => [key, a[0] / Math.max(a[1], 1)]));
            const qbest = qual.size ? Math.max(...qual.values()) : 0;
            for (const rd of rds) {
              if (qual.get(`${rd.k}|${rd.flip}`) < ORIENT_KEEP * qbest) continue;
              if (readingsOut && !seen.has(rd.text)) readingsOut.push(rd.text);
              seen.add(rd.text);
              for (const vtxt of [rd.text, ...rd.variants]) {
                const hits = judgeRow(vtxt, rd.glyphs);
                if (!hits.length) continue;
                res.text.push({ text: maskWords(vtxt), hits, normal: n.map(toFixed3), angle: Number((ang * 180 / Math.PI).toFixed(1)),
                  rot90: rd.k, mirror: rd.flip, dilate: toFixed3(dil), slabParts: idx.length, variant: vtxt !== rd.text,
                  strong: hits.some((fr) => (fr.mean ?? 0) >= TEXT_MIN_MEAN), glyphs: rd.glyphs.length });
                break;
              }
            }
          }
          if (li === 0) res.swastika.push(...swFind(r, rE, work));
          if (refused()) return res;
        }
      }
    }
  }
  return res;
}

const list = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
/** What the contentShape rule finds in a check point's inventions, as reasons that never repeat the word: { refuse:
 * [...texts], hits: [...labels], findings: [...per invention, for moderators' logs] }. */
export function shapeFindings(roots = [], { geo = SHAPE_GEOMETRY } = {}) {
  const refuse = [], labels = new Set(), findings = [];
  roots.forEach((root, index) => {
    if (!root) return;
    const r = analyzeInvention(root, { geo });
    const strong = r.text.filter((t) => t.strong);
    if (r.swastika.length) { refuse.push("its parts form a swastika"); labels.add("shape:swastika"); }
    if (r.sexual.length) { refuse.push("its parts form a sexual shape"); labels.add("shape:sexual"); }
    if (strong.length) {
      const hits = [...new Set(strong.flatMap((t) => t.hits.flatMap((fr) => fr.hits)))];
      for (const hit of hits) labels.add(`shape:${hit}`);
      refuse.push(`its parts spell out ${list([...new Set(hits.map(reasonFor))])}`);
    }
    if (r.swastika.length || strong.length || r.sexual.length) {
      findings.push({ index, parts: r.parts, swastika: r.swastika.slice(0, 1), text: strong.slice(0, 2).map((t) => ({ text: t.text, hits: t.hits })),
        ...(r.sexual.length ? { sexual: r.sexual.slice(0, 1) } : {}) });
    }
  });
  return { refuse: [...new Set(refuse)], hits: [...labels].sort(), findings };
}
