// film_gear.mjs -- film cameras, filters, lights, gels, tripods and directors tablets (owner 2026-10-15).
// Plain arrays in the game's item-local frame (metres), like goop_rules.mjs. Data comes from film_gear_anchors.json,
// exported from the installed build by tools/export_film_gear_anchors.py (Step 5h); every pose is relative to the
// item's record frame (its runtime Root, identity under the prefab's GrabbableItem node; the exporter checks that).
//
// Game rules (build 25969047, decompile + live on client E):
//  - Filters clip into a camera's FilterAnchor slots, gels into a light's GelAnchor slots. The GAME DOES NOT SAVE THEM
//    (FilmGearAttachments.Serialize/Deserialize is wired only to the tripod), so an invention carries each one as a
//    base-edge stuck child (subParentID 0) of its camera / light, and our paced loader attaches it after the build. It
//    fills free slots, so beyond the slot count a part stays stuck where it was authored. Filters stack; gels tint.
//  - A tripod's mounted camera / light / mic IS saved: it is the tripod's native children[0] (its contents), restored by
//    TripodSwivelItem.HandleDeserialize. It sits on the Mount anchor by its bottom grip (same rule as a crossbow).
//  - A directors tablet shows the camera it picked within 75 m: cameras sorted by network ID (spawn order, so the first
//    camera in an invention is every tablet's default), stepped with the operator's stick. Not saved, not networked, and
//    the screen is blank unless the local player operates it (held, inside a held invention, or a linked remote).

import { contentsOf, forEachNode, physicalScale, qConj, qMul, qNormalize, qRotate, vAdd, vScale, vSub } from "./goop_rules.mjs";

export const FILM_SCHEMA = "ac.goop-editor-film-gear.v1";
export const CAMERA = "item_film_camera";
export const LIGHT = "item_film_light";
export const TRIPOD = "item_film_tripod";
export const TABLET = "item_film_directors_tablet";
export const REMOTE = "item_remote_controller";
export const TABLET_RANGE_M = 75;

// Same pairing as master_menu.js FILM_ATTACH_KINDS (test_film_gear.mjs checks they agree).
const ATTACH_KINDS = [
  { prefix: "item_film_filter_", receiver: CAMERA, what: "filter" },
  { prefix: "item_film_gel_", receiver: LIGHT, what: "gel" },
];

let manifest = null;

function finite(arr, n) { return Array.isArray(arr) && arr.length === n && arr.every((v) => Number.isFinite(Number(v))); }
function validPose(p) { return !!p && finite(p.pos, 3) && finite(p.rot, 4); }

export function installFilmManifest(raw, expected = {}) {
  if (!raw || raw.schema !== FILM_SCHEMA || !raw.items || typeof raw.items !== "object" ||
      !Array.isArray(raw.filters) || !Array.isArray(raw.gels) || !Array.isArray(raw.mountable)) {
    throw new Error("invalid film gear manifest");
  }
  for (const key of ["steamBuildId", "gameAssemblySha256", "resourcesSha256"]) {
    if (expected[key] && String(raw[key] || "") !== String(expected[key])) {
      throw new Error(`film gear manifest ${key} ${raw[key]} does not match the item scale manifest (${expected[key]})`);
    }
  }
  const items = raw.items;
  for (const id of [CAMERA, LIGHT]) {
    const slots = items[id]?.slots;
    if (!Array.isArray(slots) || !slots.length || !slots.every(validPose)) throw new Error(`film gear manifest: bad ${id} slots`);
  }
  if (!validPose(items[CAMERA]?.lens)) throw new Error("film gear manifest: bad camera lens");
  if (!validPose(items[TRIPOD]?.mount)) throw new Error("film gear manifest: bad tripod mount");
  const head = items[TRIPOD]?.head;
  if (!validPose(head) || !(Number(head.pitchMin) < 0 && Number(head.pitchMax) > 0) || !Array.isArray(head.meshes) ||
      !String(items[TRIPOD].mount.path || "").startsWith(`${head.path}/`)) {
    throw new Error("film gear manifest: bad tripod swivel head");
  }
  const screen = items[TABLET]?.screen;
  if (!screen || !finite(screen.center, 3) || !(Number(screen.width) > 0) || !(Number(screen.height) > 0) ||
      !["-z", "+z"].includes(screen.viewFrom)) {
    throw new Error("film gear manifest: bad tablet screen");
  }
  if (expected.itemIDs) {
    for (const id of [...raw.filters, ...raw.gels, ...raw.mountable]) {
      if (!expected.itemIDs.has(id)) throw new Error(`film gear manifest names ${id}, which is not in this build's catalog`);
    }
  }
  manifest = raw;
  return { buildId: String(raw.steamBuildId || ""), filters: raw.filters.length, gels: raw.gels.length };
}

export function clearFilmManifest() { manifest = null; }
export function filmManifestInstalled() { return !!manifest; }
export function filterIDs() { return manifest ? manifest.filters.slice() : []; }
export function gelIDs() { return manifest ? manifest.gels.slice() : []; }
export function mountableIDs() { return manifest ? manifest.mountable.slice() : []; }

// "camera" | "light" | "tripod" | "tablet" | "filter" | "gel" | null. Filters / gels by prefix, so a later build's new
// ones are recognised before the manifest lists them.
export function filmRole(itemID) {
  const id = String(itemID || "");
  if (id === CAMERA) return "camera";
  if (id === LIGHT) return "light";
  if (id === TRIPOD) return "tripod";
  if (id === TABLET) return "tablet";
  for (const kind of ATTACH_KINDS) if (id.startsWith(kind.prefix)) return kind.what;
  return null;
}

// The receiver item a filter / gel attaches to, or null.
export function attachReceiver(itemID) {
  const id = String(itemID || "");
  const kind = ATTACH_KINDS.find((k) => id.startsWith(k.prefix));
  return kind ? kind.receiver : null;
}

export function partIDsFor(receiverItemID) {
  return receiverItemID === CAMERA ? filterIDs() : receiverItemID === LIGHT ? gelIDs() : [];
}

export function slotCount(receiverItemID) {
  return manifest?.items?.[receiverItemID]?.slots?.length || 0;
}

export function isMountable(itemID) { return !!manifest && manifest.mountable.includes(String(itemID || "")); }

// Root pose of an item attached by its bottom grip to an anchor at `anchor` (receiver frame, unscaled), receiver-relative,
// game frame (GetGrabbedLocation, AttachedLocation.Item; see holder_pose.mjs). `bottom` = the item's bottom attach pose
// vs its record frame (holder_anchors.json items[id].bottom), or null when it has none (filters, gels: root on the anchor).
export function attachedPose(anchor, receiverItemID, receiverScaleModifier, itemID, itemScaleModifier, bottom = null) {
  const slotPos = vScale(anchor.pos.map(Number), physicalScale(receiverScaleModifier, receiverItemID));
  const slotRot = qNormalize(anchor.rot.map(Number));
  let grabPos = [0, 0, 0], grabRot = [0, 0, 0, 1];
  if (bottom && finite(bottom.pos, 3) && finite(bottom.rot, 4)) {
    grabRot = qConj(qNormalize(bottom.rot.map(Number)));
    grabPos = qRotate(grabRot, vScale(bottom.pos.map(Number), -physicalScale(itemScaleModifier, itemID)));
  }
  return { pos: vAdd(slotPos, qRotate(slotRot, grabPos)), rot: qNormalize(qMul(slotRot, grabRot)) };
}

export function slotPose(receiverItemID, receiverScaleModifier, slotIndex, itemID, itemScaleModifier, bottom = null) {
  const slot = manifest?.items?.[receiverItemID]?.slots?.[slotIndex];
  return slot ? attachedPose(slot, receiverItemID, receiverScaleModifier, itemID, itemScaleModifier, bottom) : null;
}

export function mountPose(tripodScaleModifier, itemID, itemScaleModifier, bottom = null) {
  const mount = manifest?.items?.[TRIPOD]?.mount;
  return mount ? attachedPose(mount, TRIPOD, tripodScaleModifier, itemID, itemScaleModifier, bottom) : null;
}

// The tripod's swivel head (TripodSwivelItem._headPivot): pivot pose in the record frame (unscaled), pitch limits in
// degrees and the GLB mesh names that turn with it. The Mount rides the head. moving_parts.mjs turns it for the preview.
export function tripodHead() {
  const head = manifest?.items?.[TRIPOD]?.head;
  return head ? { pos: head.pos.map(Number), rot: qNormalize(head.rot.map(Number)), pitchMin: Number(head.pitchMin),
    pitchMax: Number(head.pitchMax), meshes: head.meshes.map(String) } : null;
}

// What the paced loader will do with a receiver's direct children, in invention order (= spawn order). `children` are
// { itemID, subParentID } in stuck-children order. Returns per child: { index, slot } attached into `slot`, or
// { index, slot: null, reason } kept stuck where authored.
export function attachmentPlan(receiverItemID, children) {
  const slots = slotCount(receiverItemID);
  let used = 0;
  const plan = [];
  (Array.isArray(children) ? children : []).forEach((child, index) => {
    if (attachReceiver(child?.itemID) !== receiverItemID || !receiverItemID) return;
    if ((Math.round(Number(child.subParentID) || 0)) !== 0) { plan.push({ index, slot: null, reason: "on a sub-part" }); return; }
    if (used >= slots) { plan.push({ index, slot: null, reason: "no free slot" }); return; }
    plan.push({ index, slot: used++ });
  });
  return plan;
}

// What a tripod does with its contents: only children[0] is mounted, and only a mountable item.
export function tripodMountPlan(contents) {
  const list = Array.isArray(contents) ? contents : [];
  const first = list[0] || null;
  if (!first) return { mounted: null, reason: "empty", ignored: 0 };
  if (!isMountable(first.itemID)) return { mounted: null, reason: "not mountable", item: first, ignored: list.length - 1 };
  return { mounted: first, reason: "mounted", ignored: list.length - 1 };
}

// Tablet screen geometry at a scale: centre (record frame), width, height, view side.
export function tabletScreen(scaleModifier = 0) {
  const screen = manifest?.items?.[TABLET]?.screen;
  if (!screen) return null;
  const s = physicalScale(scaleModifier, TABLET);
  return { center: vScale(screen.center.map(Number), s), width: Number(screen.width) * s, height: Number(screen.height) * s,
    viewFrom: screen.viewFrom };
}

function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function vCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function vUnit(a) { const n = Math.hypot(a[0], a[1], a[2]); return n > 1e-9 ? vScale(a, 1 / n) : null; }

// Quaternion of the rotation whose columns are the unit axes right (x), up (y), forward (z) (a proper rotation).
export function quatFromAxes(x, y, z) {
  const [m00, m10, m20] = x, [m01, m11, m21] = y, [m02, m12, m22] = z;
  const trace = m00 + m11 + m22;
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return qNormalize(q);
}

export const GOGGLES_DEFAULTS = Object.freeze({ ipd: 0.064, fovDeg: 90, fill: "width", tabletScaleModifier: -128,
  cameraScaleModifier: 0, cameraBaseline: 0.064, cameraForward: 0.5, minEyeClearance: 0.015 });

// VR goggles (owner 2026-10-15): one miniature directors tablet in front of each eye, filling `fovDeg` across its width
// ("width") or height ("height"), plus one camera per eye outside the mech. All inputs and outputs are in the PARENT
// record's frame, game axes: `eye` = the point between the eyes, `forward` / `up` = the head's axes. Order is the spawn
// order: left camera, right camera (lower network ID = every tablet's default view), left tablet, right tablet.
export function planGoggles({ eye, forward, up, ...options }) {
  const o = { ...GOGGLES_DEFAULTS, ...options };
  const f = vUnit(forward), u0 = vUnit(up);
  if (!f || !u0 || !finite(eye, 3)) throw new Error("goggles need an eye point and head axes");
  const u = vUnit(vSub(u0, vScale(f, vDot(u0, f))));
  if (!u) throw new Error("head forward and up are parallel");
  const r = vCross(u, f);   // right = up x forward (game axes: x = right, y = up, z = forward)
  const screen = tabletScreen(o.tabletScaleModifier);
  const lens = manifest?.items?.[CAMERA]?.lens;
  if (!screen || !lens) throw new Error("film gear manifest is not installed");
  const fov = Math.max(10, Math.min(170, Number(o.fovDeg) || 90)) * Math.PI / 180;
  const span = o.fill === "height" ? screen.height : screen.width;
  const wanted = (span / 2) / Math.tan(fov / 2);
  const distance = Math.max(Number(o.minEyeClearance) || 0, wanted);
  const ipd = Math.max(0, Number(o.ipd) || 0);
  const warnings = [];
  if (distance > wanted + 1e-9) warnings.push(`The tablets sit ${(distance * 100).toFixed(1)} cm from the eyes (closer would clip the game's 1 cm near plane), so they cover less than ${Math.round(fov * 180 / Math.PI)} degrees.`);
  if (screen.width > ipd) warnings.push(`Each screen (${(screen.width * 100).toFixed(1)} cm wide) is wider than the eye spacing (${(ipd * 100).toFixed(1)} cm); the two tablets overlap. Use a smaller tablet scale.`);
  // Tablet: picture side toward the eye. viewFrom "-z": the item's +Z points away from the eye.
  const tabletRot = screen.viewFrom === "-z" ? quatFromAxes(r, u, f) : quatFromAxes(vScale(r, -1), u, vScale(f, -1));
  const camRot = quatFromAxes(r, u, f);   // the lens (CaptureCamera, identity in the item) looks along item +Z
  const camScale = physicalScale(o.cameraScaleModifier, CAMERA);
  const lensOffset = qRotate(camRot, vScale(lens.pos.map(Number), camScale));
  const parts = [];
  const side = (sign) => vScale(r, sign * ipd / 2);
  const camSide = (sign) => vScale(r, sign * Math.max(0, Number(o.cameraBaseline) || 0) / 2);
  for (const [name, sign] of [["left", -1], ["right", 1]]) {
    const lensAt = vAdd(vAdd(eye, camSide(sign)), vScale(f, Number(o.cameraForward) || 0));
    parts.push({ role: `${name} camera`, itemID: CAMERA, scaleModifier: o.cameraScaleModifier, pos: vSub(lensAt, lensOffset), rot: camRot });
  }
  for (const [name, sign] of [["left", -1], ["right", 1]]) {
    const screenAt = vAdd(vAdd(eye, side(sign)), vScale(f, distance));
    parts.push({ role: `${name} eye tablet`, itemID: TABLET, scaleModifier: o.tabletScaleModifier,
      pos: vSub(screenAt, qRotate(tabletRot, screen.center)), rot: tabletRot });
  }
  return { parts, distance, coverageDeg: 2 * Math.atan((span / 2) / distance) * 180 / Math.PI, screen, warnings };
}

// Validation notes for a goop JSON tree (root item with stuckChildren / children), as the paced loader will build it.
export function filmNotes(root) {
  const warnings = [], infos = [];
  if (!manifest || !root) return { warnings, infos };
  let attached = 0, tablets = 0, cameras = 0, strays = 0;
  forEachNode(root, (item, { edge, parent, contentsDepth }) => {
    const id = String(item?.itemID || "");
    const role = filmRole(id);
    if (role === "tablet") tablets++;
    if (role === "camera") cameras++;
    if ((role === "filter" || role === "gel") && edge && attachReceiver(id) !== String(parent?.itemID || "")) strays++;
    if (role === "camera" || role === "light") {
      const children = (Array.isArray(item.stuckChildren) ? item.stuckChildren : [])
        .map((e) => ({ itemID: e?.item?.itemID, subParentID: e?.subParentID }));
      if (contentsDepth > 0) {
        // Contents are restored by the game's own Deserialize, which never attaches filters / gels.
        const parts = children.filter((child) => attachReceiver(child.itemID) === id).length;
        if (parts) warnings.push(`${id} is inside a container (a tripod mount, backpack or crossbow), so its ${parts} ${role === "camera" ? "filter" : "gel"}(s) are not clipped in; stick the ${role} to the tripod instead of mounting it if it needs them.`);
        return;
      }
      for (const row of attachmentPlan(id, children)) {
        if (row.slot !== null) { attached++; continue; }
        const part = children[row.index].itemID;
        warnings.push(row.reason === "no free slot"
          ? `${id} has more ${role === "camera" ? "filters" : "gels"} than its ${slotCount(id)} slots; ${part} stays stuck where it is instead of clipping in.`
          : `${part} is stuck to a moving sub-part of ${id}; only parts stuck to its base clip into a slot, so it stays stuck where it is.`);
      }
    }
    if (role === "tripod") {
      const plan = tripodMountPlan(contentsOf(item));
      if (plan.reason === "not mountable") warnings.push(`${plan.item.itemID} cannot be mounted on a tripod (only ${mountableIDs().join(", ")}); the game leaves it off.`);
      if (plan.ignored > 0) warnings.push(`A tripod mounts only its first item; ${plan.ignored} more inside it are ignored.`);
    }
  });
  if (attached) infos.push(`${attached} filter(s) / gel(s) clip into their camera / light slots after the build. The game does not save them, so A's loader attaches them; a player who picks the invention apart sees them as normal attachments.`);
  if (strays) infos.push(`${strays} filter(s) / gel(s) are not stuck directly on a camera / light (filters go on item_film_camera, gels on item_film_light); they stay stuck decorations.`);
  if (tablets) infos.push(`${tablets} directors tablet(s): each shows a camera within ${TABLET_RANGE_M} m, starting with the one with the lowest network ID (here: the first camera in this invention${cameras ? "" : "; this invention has none"}). The screen stays blank unless the local player operates it: held, inside an invention the player holds, or linked to a remote controller. Players step through cameras with the stick; the choice is not saved.`);
  return { warnings, infos };
}
