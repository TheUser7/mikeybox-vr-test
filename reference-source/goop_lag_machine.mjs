// Pre-send "lag machine" screen for named packages (owner 2026-10-16). A line-for-line port of AC_Menu/goop_lag_machine.py
// (the A-side bridge gate); test_goop_lag_machine_parity.py proves identical verdicts and counts on every fixture and on
// the whole capture corpus. Rules and calibration: see the Python module docstring and goop_captures/lag_machines/README.md.
// Private deliveries are intentionally NOT screened (owner: the courier runs no physics).
import { GEOMETRY } from "./goop_lag_machine_geometry.mjs";

export const LAG_MACHINE_REFUSAL = "This package would cause too much lag and is not allowed.";
export const LAG_MACHINE_VERSION = 1;
export const REFUSE_COLLIDER_PAIRS = 6000;
export const REFUSE_MIN_UNITS = 200;
const DEEP_FRACTION = 0.25;
const STACK_POS_TOL = 0.02;
const DEFAULT_HALF = 0.15;
const EARLY_EXIT_FACTOR = 10;
const JOYSTICK_STICK_SCALE = 0.005;
export const MAX_NODES = 20000;
const DEFAULT_SCALE_RANGE = [0.2, 2.5];

function num(v, d = 0) {                   // JSON numbers (and booleans) only, as in the Python module
  if (typeof v === "boolean") return v ? 1 : 0;
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function vec(a) {
  if (!Array.isArray(a) || a.length < 3) return [0, 0, 0];
  return [num(a[0]), num(a[1]), num(a[2])];
}
function quat(a) {
  if (!Array.isArray(a) || a.length < 4) return [0, 0, 0, 1];
  const q = [num(a[0]), num(a[1]), num(a[2]), num(a[3], 1)];
  const n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return n > 1e-9 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : [0, 0, 0, 1];
}
function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz];
}
function qconj(q) { return [-q[0], -q[1], -q[2], q[3]]; }
function qrot(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
function absmat(q) {
  const [x, y, z, w] = q;
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]].map((r) => r.map(Math.abs));
}
function itemGeom(geo, itemID) {
  const e = geo.items[String(itemID || "").replace("item_prefab/", "")];
  if (!e) return [[0, 0, 0], [DEFAULT_HALF, DEFAULT_HALF, DEFAULT_HALF], 1, DEFAULT_SCALE_RANGE];
  return [e.c, e.h, Math.max(1, Math.trunc(e.n)), e.s || DEFAULT_SCALE_RANGE];
}
function pyRound(x) {                      // Python round(): half to even
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
export function physicalScale(scaleModifier, rng) {
  const m = Math.max(-128, Math.min(127, pyRound(num(scaleModifier))));
  if (m < 0) return 1 + (rng[0] - 1) * (-m / 128);
  return 1 + (rng[1] - 1) * (m / 127);
}
export function unwrap(data) {
  if (data && typeof data === "object" && !Array.isArray(data) && !data.itemID && Array.isArray(data.items)) {
    for (const it of data.items) if (it && typeof it === "object" && !Array.isArray(it) && it.itemID) return it;
    return null;
  }
  return data && typeof data === "object" && !Array.isArray(data) && data.itemID ? data : null;
}
function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function contents(item) {
  const out = [];
  for (const c of Array.isArray(item.children) ? item.children : []) {
    const it = isObj(c) && isObj(c.item) ? c.item : c;
    if (isObj(it) && it.itemID) out.push(it);
  }
  for (const c of Array.isArray(item.containerContents) ? item.containerContents : []) {
    if (isObj(c) && c.itemID) out.push(c);
  }
  return out;
}

export function flatten(root, geo = GEOMETRY) {
  const nodes = [];
  const stack = [[root, [0, 0, 0], [0, 0, 0, 1], false]];
  while (stack.length) {
    if (nodes.length >= MAX_NODES) break;
    const [item, pos, rot, inside] = stack.pop();
    const iid = String(item.itemID || "");
    const scale = physicalScale(item.scaleModifier ?? 0, itemGeom(geo, iid)[3]);
    nodes.push([iid, pos, rot, scale, inside]);
    for (const c of contents(item)) stack.push([c, pos, rot, true]);
    for (const edge of Array.isArray(item.stuckChildren) ? item.stuckChildren : []) {
      if (!isObj(edge) || !isObj(edge.item)) continue;
      const child = edge.item;
      const sub = Math.trunc(num(edge.subParentID, 0));
      let ep = vec(edge.pos);
      if (sub !== 0) {
        const k = iid.startsWith("item_joystick") ? JOYSTICK_STICK_SCALE : 1;
        ep = [ep[0] * k, ep[1] * k, ep[2] * k];
      }
      const local = qrot(rot, [ep[0] * scale, ep[1] * scale, ep[2] * scale]);
      const jointRot = qmul(rot, quat(edge.rot));
      const childRot = qmul(jointRot, qconj(quat(edge.poseRot)));
      const cscale = physicalScale(child.scaleModifier ?? 0, itemGeom(geo, child.itemID)[3]);
      const pp = vec(edge.posePos);
      const anchor = qrot(childRot, [pp[0] * cscale, pp[1] * cscale, pp[2] * cscale]);
      stack.push([child, [pos[0] + local[0] - anchor[0], pos[1] + local[1] - anchor[1], pos[2] + local[2] - anchor[2]], childRot, inside]);
    }
  }
  return nodes;
}

function units(nodes, geo) {
  const out = [];
  const cells = new Map();
  for (const [iid, pos, rot, scale, inside] of nodes) {
    if (inside) continue;
    const sk = Math.floor(scale * 1000 + 0.5) / 1000;
    const gx = Math.floor(pos[0] / 0.05), gy = Math.floor(pos[1] / 0.05), gz = Math.floor(pos[2] / 0.05);
    let merged = null;
    outer:
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      for (const u of cells.get(`${iid}|${sk}|${gx + dx}|${gy + dy}|${gz + dz}`) || []) {
        if (Math.abs(u.pos[0] - pos[0]) <= STACK_POS_TOL && Math.abs(u.pos[1] - pos[1]) <= STACK_POS_TOL &&
            Math.abs(u.pos[2] - pos[2]) <= STACK_POS_TOL) { merged = u; break outer; }
      }
    }
    if (merged) { merged.count++; continue; }
    const [c, h, n] = itemGeom(geo, iid);
    const cw = qrot(rot, [c[0] * scale, c[1] * scale, c[2] * scale]);
    const ctr = [pos[0] + cw[0], pos[1] + cw[1], pos[2] + cw[2]];
    const hs = [h[0] * scale, h[1] * scale, h[2] * scale];
    const m = absmat(rot);
    const ext = [0, 1, 2].map((i) => m[i][0] * hs[0] + m[i][1] * hs[1] + m[i][2] * hs[2]);
    const u = { id: iid, count: 1, colliders: n, pos,
      lo: [ctr[0] - ext[0], ctr[1] - ext[1], ctr[2] - ext[2]], hi: [ctr[0] + ext[0], ctr[1] + ext[1], ctr[2] + ext[2]] };
    u.vol = Math.max(1e-9, (u.hi[0] - u.lo[0]) * (u.hi[1] - u.lo[1]) * (u.hi[2] - u.lo[2]));
    out.push(u);
    const key = `${iid}|${sk}|${gx}|${gy}|${gz}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(u);
  }
  return out;
}

function deepPairs(us) {
  const order = us.map((_, i) => i).sort((a, b) => us[a].lo[0] - us[b].lo[0]);
  let active = [];
  let pairs = 0, colliderPairs = 0;
  const involved = new Set();
  const byId = new Map();
  for (const i of order) {
    const a = us[i];
    active = active.filter((j) => us[j].hi[0] > a.lo[0]);
    for (const j of active) {
      const b = us[j];
      let inter = 1;
      for (let k = 0; k < 3; k++) {
        const d = Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k]);
        if (d <= 0) { inter = 0; break; }
        inter *= d;
      }
      if (inter <= 0 || inter < DEEP_FRACTION * Math.min(a.vol, b.vol)) continue;
      pairs++;
      const cp = a.colliders * b.colliders;
      colliderPairs += cp;
      involved.add(i); involved.add(j);
      for (const iid of [a.id, b.id]) byId.set(iid, (byId.get(iid) || 0) + cp);
    }
    if (colliderPairs >= EARLY_EXIT_FACTOR * REFUSE_COLLIDER_PAIRS && involved.size >= REFUSE_MIN_UNITS)
      return { pairs, colliderPairs, involved, byId, early: true };
    active.push(i);
  }
  return { pairs, colliderPairs, involved, byId, early: false };
}

export function assessLagMachine(invention, geo = GEOMETRY) {
  const root = unwrap(invention);
  if (!root) return { ok: false, lagMachine: false, reason: "not an invention" };
  const nodes = flatten(root, geo);
  const us = units(nodes, geo);
  const r = deepPairs(us);
  const overlappingUnits = r.involved.size;
  const top = [...r.byId.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k]) => k);
  return {
    ok: true, lagMachine: r.colliderPairs >= REFUSE_COLLIDER_PAIRS && overlappingUnits >= REFUSE_MIN_UNITS,
    nodes: nodes.length, units: us.length, contents: nodes.filter((n) => n[4]).length,
    deepPairs: r.pairs, colliderPairs: r.colliderPairs, overlappingUnits,
    topItems: top, truncated: nodes.length >= MAX_NODES, earlyExit: r.early,
  };
}
