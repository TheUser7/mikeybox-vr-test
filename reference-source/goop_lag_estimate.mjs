// THE LAG CENSUS ESTIMATE (owner 2026-10-25/27): how much one goop invention lags other players and the host while it
// is used, from the census's measurements (goop_build_lag_data.mjs, generated from goop_lag_scores.json). A port of
// lag_census_model.lag_estimate, kept equal to it by test_goop_build_validator.mjs over lag_census_fixtures.json. The
// shared goop build validator (goop_build_validator.mjs) applies it at every check point as the `lagScore` rule.
//
// Census findings it encodes (LAG_CENSUS_RESULTS_20261026.md): held still, even 512 parts cost observers almost nothing;
// from the first trigger pull every stuck part receives the press, so the build is always scored IN USE. Lag has two
// mechanisms, scored separately: the observers' frame time and the host's main-thread stall (2 s drops the room). Costs
// add up: a generic curve on the part count, plus each item's measured excess over it at its count, plus loaded
// launchers' ammo (one round per launcher per pull, which recurs on every pull and has its own per-pull limit). The part
// count is the in-use parts PLUS every round in an in-use launcher with the parts stuck to it (owner 2026-10-27: "when
// that invention fires, all of its grenade launchers will fire, spawning their ammo"), PLUS everything its in-use bags
// pour and its quivers give out (owner 2026-10-28), each costed from the census's pour table (16 bags x 6 of the item,
// poured). Other stored parts are not in use; oversized bags remain the validator's stored-family rules.

const BASE_FRAME_MS = 1000 / 72;   // the observer's frame at 72 Hz (Quest 3, 3 m away)

/** Piecewise-linear through [[count, value], ...] from (0, 0); past the last point, the larger of the last segment's
 * slope and the last point's average per copy. */
export function interpCurve(points, n) {
  const pts = (Array.isArray(points) ? points : []).map(([a, b]) => [Number(a), Number(b)]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (!pts.length || n <= 0) return 0;
  if (pts[0][0] !== 0) pts.unshift([0, 0]);
  const last = pts[pts.length - 1];
  if (n <= last[0]) {
    const i = pts.findIndex(([x]) => x >= n);
    if (pts[i][0] === n) return pts[i][1];
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + (y1 - y0) * (n - x0) / (x1 - x0);
  }
  const [x0, y0] = pts[pts.length - 2], [x1, y1] = last;
  return y1 + Math.max((y1 - y0) / (x1 - x0), y1 / x1) * (n - x1);
}

const isObj = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function unwrap(data) {
  if (isObj(data) && isObj(data.item) && !data.itemID) data = data.item;
  if (isObj(data) && !data.itemID && Array.isArray(data.items)) return data.items.find((it) => isObj(it) && it.itemID) ?? null;
  return isObj(data) && data.itemID ? data : null;
}
const idOf = (item) => String(item.itemID || "").replace(/^item_prefab\//, "");
const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);

// The item and every part stuck to it, recursively (not its stored contents).
function stuckIds(item, into) {
  const stack = [item];
  while (stack.length) {
    const it = stack.pop();
    bump(into, idOf(it));
    for (const edge of Array.isArray(it.stuckChildren) ? it.stuckChildren : []) if (isObj(edge) && isObj(edge.item)) stack.push(edge.item);
  }
}

/** In-use counts by item (the root and its stuck tree), the stored part count (contents, rounds), loaded launchers by
 * their first round's item, and fired: every round in an in-use launcher with the parts stuck to it, for one invention. */
export function countsOf(invention, launchers = ["item_grenade_launcher"]) {
  const root = unwrap(invention);
  const inUse = new Map(), loaded = new Map(), fired = new Map();
  let stored = 0;
  const stack = root ? [[root, false]] : [];
  while (stack.length) {
    const [item, inside] = stack.pop();
    if (inside) stored++;
    else bump(inUse, idOf(item));
    for (const edge of Array.isArray(item.stuckChildren) ? item.stuckChildren : []) if (isObj(edge) && isObj(edge.item)) stack.push([edge.item, inside]);
    const rounds = [];
    for (const entry of [...(Array.isArray(item.children) ? item.children : []), ...(Array.isArray(item.containerContents) ? item.containerContents : [])]) {
      const inner = isObj(entry) && isObj(entry.item) ? entry.item : entry;
      if (isObj(inner) && inner.itemID) { stack.push([inner, true]); rounds.push(inner); }
    }
    if (!inside && launchers.includes(idOf(item)) && rounds.length) {
      bump(loaded, idOf(rounds[0]));
      for (const round of rounds) stuckIds(round, fired);
    }
  }
  return { inUse, stored, loaded, fired };
}

// Containers that spill their contents into the room while the build is used (owner 2026-10-28; lag_census_model
// CONTAINERS): an open bag upside down pours one item per bag every 0.35 s, and one holding more than its capacity of 30
// never pours; a quiver gives one per hand grab, at most 18. The table carries the same object (pour.containers).
const DEFAULT_CONTAINERS = { pourPrefix: "item_backpack", pourIds: ["item_safe"], pourCapacity: 30,
  drawIds: ["item_quiver", "item_quiver_heart"], drawCapacity: 18 };
const contentsOf = (item) => [...(Array.isArray(item.children) ? item.children : []), ...(Array.isArray(item.containerContents) ? item.containerContents : [])]
  .map((entry) => (isObj(entry) && isObj(entry.item) ? entry.item : entry)).filter((inner) => isObj(inner) && inner.itemID);

/** What the invention's in-use bags pour and in-use quivers give out, each item with the parts stuck to it. */
export function pouredOf(invention, containers = DEFAULT_CONTAINERS) {
  const c = containers ?? DEFAULT_CONTAINERS;
  const root = unwrap(invention);
  const poured = new Map(), stack = root ? [root] : [];
  while (stack.length) {
    const item = stack.pop();
    for (const edge of Array.isArray(item.stuckChildren) ? item.stuckChildren : []) if (isObj(edge) && isObj(edge.item)) stack.push(edge.item);
    const id = idOf(item), inner = contentsOf(item);
    if (!inner.length) continue;
    let emitted;
    if (id.startsWith(c.pourPrefix) || c.pourIds.includes(id)) emitted = inner.length <= c.pourCapacity ? inner : [];
    else if (c.drawIds.includes(id)) emitted = inner.slice(0, c.drawCapacity);
    else continue;
    for (const x of emitted) stuckIds(x, poured);
  }
  return poured;
}

const byId = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0);

/** {observerFrameMs, observerFps, hostStallS, ammoHostStallSPerPull, q2FrameMs, q2Fps10, verdict ok|review|refuse,
 * reasons, refuseReasons, reviewReasons, inUseParts, storedParts, firedRounds, partsWhenFired, loadedLaunchers, top} for
 * one invention while it is used and fired (q2FrameMs / q2Fps10: a Quest 2 with 3 players / in a 10-player room; null
 * for a table without `q2`). `thresholds` are the ones in force (goop_build_policy.mjs lagScore); the table carries the
 * census's proposal. */
export function lagEstimate(invention, table, thresholds = table.proposedThresholds ?? table.thresholds) {
  const { inUse, stored, loaded, fired } = countsOf(invention, table.launchers ?? table.counting?.launchers);
  const pour = table.pour ?? {};
  const poured = pouredOf(invention, pour.containers);
  let parts = 0, firedRounds = 0, pouredItems = 0;
  for (const n of inUse.values()) parts += n;
  for (const n of fired.values()) firedRounds += n;
  for (const n of poured.values()) pouredItems += n;
  // Every part in use plus every round its launchers fire into the room (owner 2026-10-27) and everything its bags and
  // quivers spill (owner 2026-10-28).
  const spawned = new Map(inUse);
  for (const [id, n] of fired) bump(spawned, id, n);
  for (const [id, n] of poured) bump(spawned, id, n);
  const total = parts + firedRounds + pouredItems;
  const items = table.items, ammo = table.ammo, th = thresholds;
  let frame = interpCurve(table.genericInUseFrameMs, total);
  let host = interpCurve(table.genericHostStallS, total);
  const top = [], refuse = [], review = [];
  for (const [id, n] of [...spawned].sort(byId)) {
    const e = items[id] ?? table.unmeasuredItem ?? {};
    const k = inUse.get(id) ?? 0;
    const f = interpCurve(e.inUseFrameMs, k), h = interpCurve(e.hostStallS, k);
    frame += f; host += h;
    if (f || h) top.push([f + h * 10, { item: id, count: n, frameMs: round(f, 1), hostStallS: round(h, 2) }]);
    const x = e.extended || {};
    let via = e.relative ? ` (as ${e.relative})`
      : x.relative && n > x.beyond ? ` (as ${x.relative} above ${x.beyond})`
      : Array.isArray(e.neighbors) && e.neighbors.length ? ` (predicted from ${e.neighbors.slice(0, 3).join(", ")})`
      : e.source === "unmeasured" ? " (scored as the worst measured item)" : "";
    if (e.source === "predicted" || e.source === "unmeasured")
      review.push(`${n} x ${id}: not measured by the lag census yet${via}`);
    if (fired.get(id)) via += ` (${fired.get(id)} of them as launcher ammo)`;
    if (poured.get(id)) via += ` (${poured.get(id)} of them poured from bags or quivers)`;
    if (e.refuseAt && n >= e.refuseAt) refuse.push(`${n} x ${id}: lag from ${e.refuseAt} copies measured${via}`);
    else if (e.unacceptableAt && n >= e.unacceptableAt) review.push(`${n} x ${id}: unacceptable from ${e.unacceptableAt} copies measured${via}`);
  }
  let ammoHost = 0;
  for (const [shot, k] of [...loaded].sort(byId)) {
    const a = ammo.items[shot] ?? ammo.default;
    const f = interpCurve(a.frameMs, k), h = interpCurve(a.hostStallS, k);
    frame += f; host += h; ammoHost += h;
    top.push([f + h * 10, { item: `${shot} rounds`, count: k, frameMs: round(f, 1), hostStallS: round(h, 2) }]);
    const known = a.source === "predicted" ? " (not measured as ammo yet: estimated)"
      : shot in ammo.items ? "" : " (unmeasured ammo: scored as the worst measured)";
    if (a.refuseAtLoadedLaunchers && k >= a.refuseAtLoadedLaunchers) refuse.push(`${k} launchers loaded with ${shot}: lag from ${a.refuseAtLoadedLaunchers} measured${known}`);
    else if (a.unacceptableAtLoadedLaunchers && k >= a.unacceptableAtLoadedLaunchers) review.push(`${k} launchers loaded with ${shot}: unacceptable from ${a.unacceptableAtLoadedLaunchers}${known}`);
  }
  const pourItems = pour.items ?? {};
  for (const [shot, k] of [...poured].sort(byId)) {
    const a = pourItems[shot] ?? pour.default ?? {};
    const f = interpCurve(a.frameMs, k), h = interpCurve(a.hostStallS, k);
    frame += f; host += h;
    if (f || h) top.push([f + h * 10, { item: `${shot} poured`, count: k, frameMs: round(f, 1), hostStallS: round(h, 2) }]);
    const known = a.source === "predicted" ? " (not measured poured yet: estimated)"
      : shot in pourItems ? "" : " (unmeasured pour: scored as the worst measured)";
    if (a.refuseAtPoured && k >= a.refuseAtPoured) refuse.push(`${k} x ${shot} poured from bags or quivers: lag from ${a.refuseAtPoured} measured${known}`);
    else if (a.unacceptableAtPoured && k >= a.unacceptableAtPoured) review.push(`${k} x ${shot} poured from bags or quivers: unacceptable from ${a.unacceptableAtPoured}${known}`);
  }
  const fps = 1000 / (BASE_FRAME_MS + frame);
  const pull = th.ammoHostStallSPerPull;
  if (loaded.size && pull && ammoHost >= pull.refuse) refuse.push(`loaded launchers stall the host ~${ammoHost.toFixed(1)} s on every trigger pull`);
  else if (loaded.size && pull && ammoHost >= pull.review) review.push(`loaded launchers stall the host ~${ammoHost.toFixed(1)} s on every trigger pull`);
  // THE QUEST 2 SCORE (owner 2026-10-31: "refuse under 24fps and warn under 36 for a Quest 2 in a 10-player room"; the
  // table's `q2` block, lag_census_model.q2_block): every excess as above, the generic part on the Quest 2's calibrated
  // curve, through the measured Mike -> Quest 2 formula, plus the parked players of a full room. Where the thresholds in
  // force carry q2Fps10 it replaces the observers' rule; without it (or a table without `q2`) the observers' rule applies.
  const q2 = table.q2;
  let q2Frame = null, q2Fps = null;
  if (q2) {
    const mike = BASE_FRAME_MS + interpCurve(q2.genericInUseFrameMs, total) + (frame - interpCurve(table.genericInUseFrameMs, total));
    q2Frame = Math.exp(q2.fromMike.a) * mike ** q2.fromMike.b;
    q2Fps = 1000 / (q2Frame + (q2.room.players - q2.room.measuredPlayers) * q2.room.perPlayerMs);
  }
  if (th.q2Fps10 && q2Fps !== null) {
    const where = `a Quest 2 in a ${q2.room.players}-player room ~${q2Fps.toFixed(0)} fps while it is used`;
    if (q2Fps < th.q2Fps10.refuse) refuse.push(where);
    else if (q2Fps < th.q2Fps10.review) review.push(where);
  } else if (frame >= th.observerFrameMs.refuse) refuse.push(`observers ~${fps.toFixed(0)} fps while it is used`);
  else if (frame >= th.observerFrameMs.review) review.push(`observers ~${fps.toFixed(0)} fps while it is used`);
  if (host >= th.hostStallS.refuse) refuse.push(`host stall ~${host.toFixed(1)} s`);
  else if (host >= th.hostStallS.review) review.push(`host stall ~${host.toFixed(1)} s`);
  top.sort((p, q) => q[0] - p[0]);
  return { observerFrameMs: round(frame, 1), observerFps: round(fps, 1), hostStallS: round(host, 2),
    ammoHostStallSPerPull: round(ammoHost, 2),
    q2FrameMs: q2Frame === null ? null : round(q2Frame, 1), q2Fps10: q2Fps === null ? null : round(q2Fps, 1),
    verdict: refuse.length ? "refuse" : review.length ? "review" : "ok",
    reasons: [...refuse, ...review], refuseReasons: refuse, reviewReasons: review,
    inUseParts: parts, storedParts: stored, firedRounds, pouredItems, partsWhenFired: total, loadedLaunchers: Object.fromEntries(loaded),
    top: top.slice(0, 5).map((t) => t[1]) };
}

// toFixed on the exact binary value: ties go away from zero (the reference matches since 6dbc3d08).
const round = (value, digits) => Number(value.toFixed(digits));
