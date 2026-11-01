// goop_rules.mjs -- authoring knowledge for Animal Company goop inventions, shared by the browser editor (app.js)
// and node tooling (test_goop_rules.mjs, a future validator/API). Plain arrays for vectors ([x,y,z]) and quaternions
// ([x,y,z,w]), all in the GAME's item-local frame (metres), never the editor basis. Its only import is the shared goop
// build policy (goop_build_policy.mjs), which owns the design-rule numbers (owner 2026-10-26).
//
// Sources: AC_Menu/goop_captures/AUTHORING_GUIDE.md sections 2, 2a-2d, 5; AC_Menu/claude_joystick_notes.md
// (live probe of item_joystick NetParents, 2026-09-01); current build 25637820 prefab hierarchy and decompile
// (GrabbableObject.SetStuck, StuckPose.World,
// GrabbableItemState.FromAPIV1 budgets); installed build 25663032 resources.assets NetParent census for robot-arm
// edge IDs; the goop_captures census (1003 files) for gun/container behaviour.

import { GOOP_BUILD_POLICY } from "./goop_build_policy.mjs";

// ---------------------------------------------------------------------------------------------------------------
// 1. Scale curve. GrabbableObject.CalcPhysicalScale: negative lerps 1 -> _scaleRange.x over -128, positive 1 -> _scaleRange.y
//    over 127. The range is PREFAB-SPECIFIC; scale_ranges.json is extracted from current resources.assets and loaded
//    before inventions. These fallbacks cover common items and confirmed exceptions if a local copy lacks that file.
// ---------------------------------------------------------------------------------------------------------------
export const DEFAULT_SCALE_RANGE = { min: 0.2, max: 2.5 };
// Populated from the current game's scale-range export, never by a handwritten
// prefab blacklist. Items with a GrabbableObject remain eligible for goop.
export const NON_GOOP_PREFAB_IDS = new Set();
export const SCALE_RANGE_OVERRIDES = {
  item_fish_rotten_fish: { min: 0.8, max: 1.2 },  // current prefab extracted from resources.assets
  item_fish_fishsword: { min: 0.8, max: 1.2 },  // current ItemSheet prefab probed live on build 25663032
};

// The asset reconciliation exports the current ItemSheet prefab ranges into
// scale_ranges.json. Install it before loading inventions so every parent edge
// is solved with the same physical scale that native Deserialize uses.
let currentScaleRanges = new Map();
export function installScaleRangeManifest(manifest) {
  if (!manifest || manifest.schema !== "ac.goop-editor-scale-ranges.v1" ||
      !manifest.ranges || typeof manifest.ranges !== "object" || Array.isArray(manifest.ranges) ||
      !Array.isArray(manifest.missing)) {
    throw new Error("invalid game scale range manifest");
  }
  if (!Number.isInteger(manifest.itemCount) || !Number.isInteger(manifest.scaleCount) ||
      manifest.itemCount !== manifest.scaleCount + manifest.missing.length ||
      manifest.scaleCount !== Object.keys(manifest.ranges).length) {
    throw new Error("incomplete game scale range manifest");
  }
  const next = new Map();
  for (const [id, raw] of Object.entries(manifest.ranges)) {
    if (!/^item_[a-z0-9_-]+$/i.test(id)) throw new Error(`invalid item ID in scale manifest: ${id}`);
    const min = Number(raw?.min), max = Number(raw?.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < 1 || min > 1 || max > 10) {
      throw new Error(`invalid scale range for ${id}`);
    }
    next.set(id, { min, max });
  }
  if (!next.size) throw new Error("game scale range manifest is empty");
  const missing = new Set();
  for (const entry of manifest.missing) {
    const id = entry?.itemID;
    if (typeof id !== "string" || !/^item_[a-z0-9_-]+$/i.test(id) ||
        missing.has(id) || next.has(id)) {
      throw new Error(`invalid missing item in game scale manifest: ${id}`);
    }
    missing.add(id);
  }
  currentScaleRanges = next;
  NON_GOOP_PREFAB_IDS.clear();
  for (const id of missing) NON_GOOP_PREFAB_IDS.add(id);
  return next.size;
}

export function scaleRangeFor(itemID) {
  const id = String(itemID || "").replace(/^item_prefab\//, "");
  return currentScaleRanges.get(id) || SCALE_RANGE_OVERRIDES[id] || DEFAULT_SCALE_RANGE;
}

export function clampInt(n, lo, hi, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

export function physicalScale(scaleModifier, itemID) {
  const m = clampInt(scaleModifier, -128, 127, 0);
  const range = scaleRangeFor(itemID);
  if (m < 0) return 1 + (range.min - 1) * (-m / 128);
  return 1 + (range.max - 1) * (m / 127);
}

export function scaleModifierForPhysicalScale(scalar, itemID) {
  const s = Math.max(0.01, Number(scalar) || 1);
  const range = scaleRangeFor(itemID);
  if (s < 1) return clampInt(-128 * (s - 1) / (range.min - 1), -128, 0, 0);
  return clampInt(127 * (s - 1) / (range.max - 1), 0, 127, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Sub-parents (NetParent frames). `subParentID` selects one of the parent item's NetParent behaviours; the edge's
//    pos/rot are stored in THAT transform's local space, scale included (SetStuck -> worldToLocalMatrix). Almost every
//    item has only id 0. NetParent frames, including root offsets, are exported from the installed build. The joystick
//    stick (id 1) sits ~4.1 cm up the item's local +Y and its
//    frame is scaled 0.005 (1 unit = 5 mm; the tip is ~20 units = 10 cm up stick-local +Z). Each robot arm variant has
//    ids 0 (root), 1 (arm), 2 (lower arm), and 3 (hand). Their bone frames come from the current-build NetParent
//    manifest at rest, which is where an arm no player has held keeps them (RobotArmItem.FixedUpdate only drives the
//    bones for a linked player). The game applies the same NetParent formula as for any other frame; a client-D
//    A:B on build 25766246 matched every @1-@3 child to 0.06 mm / 0.05 deg at 1.0x and 1.71x arm scale. Without the
//    manifest there is no measured frame, so those edges stay verbatim.
//    Current installed prefab: Root/Collider/Joystick rotates -90deg around X and scales 0.005; its Stick child is
//    offset (0,0,8.261284). The ancestor rotation must be included in BOTH the pivot and frame rotation. Omitting it
//    made radiation_gun.json display five rotated guns away from the root even though the game stacks them.
// ---------------------------------------------------------------------------------------------------------------
export const IDENTITY_QUAT = [0, 0, 0, 1];
export const BASE_FRAME = { id: 0, name: "Base", pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: 1 };
const JOYSTICK_STICK_FRAME = { id: 1, name: "Stick (moves with the joystick)", pos: [0, 8.261284 * 0.005, 0], rot: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], scale: 0.005, tipUnits: 20 };
const ROBOT_ARM_FRAMES = [
  { ...BASE_FRAME, name: "Root" },
  { id: 1, name: "Arm (upper arm bone)", unknown: true },
  { id: 2, name: "Lower Arm (forearm bone)", unknown: true },
  { id: 3, name: "Hand (hand bone)", unknown: true },
];
// A captured upright joystick-on-joystick link. The +90° X edge rotation cancels
// the stick frame's -90° X rotation, keeping the next joystick upright.
export const JOYSTICK_CHAIN_EDGE = { subParentID: 1, pos: [0, 0, 25.11], rot: [Math.SQRT1_2, 0, 0, Math.SQRT1_2], posePos: [0, 0, 0], poseRot: IDENTITY_QUAT };
export const SUB_PARENT_FRAMES = {
  item_joystick: [BASE_FRAME, JOYSTICK_STICK_FRAME],
  item_joystick_inv_y: [BASE_FRAME, JOYSTICK_STICK_FRAME],
  item_robot_arm_right: ROBOT_ARM_FRAMES,
  item_robot_arm_left: ROBOT_ARM_FRAMES,
  item_robot_arm_right_galaxy: ROBOT_ARM_FRAMES,
  item_robot_arm_left_galaxy: ROBOT_ARM_FRAMES,
};

// REVIEWED MULTI-ATTACHMENT ITEMS (owner 2026-10-09): every item whose prefab has more than one NetParent frame, with
// the bone each frame id sits on (last path segment). check_attachment_points.mjs compares a build's
// netparent_frames.json with this list; game_update_reconcile.ps1 STEP 5h and the Pages deploy gate run it, so a NEW
// multi-attachment item or a CHANGED one is reviewed (label, preview motion) before the editor ships it. Unreviewed
// items still work: they get one selector option per frame, named after the game bone, placed with the measured
// frame matrix. "motion" names the editor preview that moves the parts: joystick-stick (the Moving parts thumbstick
// tilts it, moving_parts.mjs) or
// robot-arm-follow (poseRobotArmsIn copies the wearer's arm).
export const REVIEWED_ATTACHMENT_POINTS = Object.freeze({
  item_joystick: { bones: ["Root", "Stick"], motion: "joystick-stick" },
  item_joystick_inv_y: { bones: ["Root", "Stick"], motion: "joystick-stick" },
  item_robot_arm_right: { bones: ["Root", "Arm.R", "Arm_Lower.R", "Hand.R"], motion: "robot-arm-follow" },
  item_robot_arm_right_galaxy: { bones: ["Root", "Arm.R", "Arm_Lower.R", "Hand.R"], motion: "robot-arm-follow" },
  item_robot_arm_left: { bones: ["Root", "Arm.L", "Arm_Lower.L", "Hand.L"], motion: "robot-arm-follow" },
  item_robot_arm_left_galaxy: { bones: ["Root", "Arm.L", "Arm_Lower.L", "Hand.L"], motion: "robot-arm-follow" },
});

// Selector label for a frame the editor has no hand-written name for: the game's own bone name.
export function frameBoneName(path) {
  const bone = String(path || "").split("/").filter(Boolean).pop() || "";
  return bone.replace(/[^\w .()-]/g, "").slice(0, 40);
}

// Uniform scale of a frame's 3x3 linear part (1 unit = scale metres); 1 when it is a plain rotation.
export function frameLinearScale(linear) {
  const s = Math.cbrt(Math.abs(mat3Det(linear)));
  return Number.isFinite(s) && s > 0 && Math.abs(s - 1) > 1e-3 ? Number(s.toPrecision(6)) : 1;
}

let currentNetParentFrames = null;
let currentComponentNetParentFrames = null;
let currentRuntimeNetParentFrames = null;
const ROBOT_ARM_IDS = new Set(["item_robot_arm_left", "item_robot_arm_right", "item_robot_arm_left_galaxy", "item_robot_arm_right_galaxy"]);

// The generated file is tied to the same installed build and resources as the scale
// file. Never silently fall back to identity after it has been installed.
export function installNetParentFrameManifest(manifest, expected = {}) {
  if (!manifest || manifest.schema !== "ac.goop-editor-netparent-frames.v2" ||
      !manifest.items || typeof manifest.items !== "object" || Array.isArray(manifest.items) ||
      !Array.isArray(manifest.missing) ||
      !Number.isInteger(manifest.itemCount) || !Number.isInteger(manifest.frameItemCount) ||
      manifest.frameItemCount !== Object.keys(manifest.items).length ||
      manifest.itemCount !== manifest.frameItemCount + manifest.missing.length) {
    throw new Error("invalid game NetParent frame manifest");
  }
  for (const key of ["steamBuildId", "gameAssemblySha256", "resourcesSha256"]) {
    if (!manifest[key] || (expected[key] != null && String(manifest[key]).toLowerCase() !== String(expected[key]).toLowerCase())) {
      throw new Error(`game NetParent frame manifest ${key} is missing or stale`);
    }
  }
  if (expected.itemIDs) {
    const ids = new Set(expected.itemIDs);
    const covered = new Set([...Object.keys(manifest.items), ...manifest.missing.map((entry) => entry.itemID)]);
    if (ids.size !== manifest.itemCount || covered.size !== ids.size || [...ids].some((id) => !covered.has(id))) {
      throw new Error("game NetParent frame manifest does not cover the item catalog");
    }
  }
  const next = new Map();
  const runtime = new Map();
  for (const [itemID, entry] of Object.entries(manifest.items)) {
    if (!/^item_[a-z0-9_-]+$/i.test(itemID) || !entry || !Array.isArray(entry.frames) || !entry.frames.length ||
        typeof entry.runtimeRootPath !== "string" || !entry.runtimeRootPath ||
        !Array.isArray(entry.runtimeFrames) || entry.runtimeFrames.length !== entry.frames.length) {
      throw new Error(`invalid NetParent frame entry for ${itemID}`);
    }
    const parseFrames = (source) => source.map((raw, index) => {
      if (raw.id !== index || !Array.isArray(raw.pos) || raw.pos.length !== 3 ||
          !Array.isArray(raw.rot) || raw.rot.length !== 4 ||
          !Array.isArray(raw.linear) || raw.linear.length !== 9 ||
          [...raw.pos, ...raw.rot, ...raw.linear].some((value) => !Number.isFinite(value)) ||
          Math.abs(mat3Det(raw.linear)) < 1e-10 || Math.abs(1 - Math.hypot(...raw.rot)) > 1e-3) {
        throw new Error(`invalid NetParent frame ${itemID}@${index}`);
      }
      const known = SUB_PARENT_FRAMES[itemID]?.find((frame) => frame.id === index);
      // The frame matrix carries the scale (the joystick Stick is 0.005); only the selector's "1 unit = N mm" uses it.
      const scale = frameLinearScale(raw.linear);
      const bone = frameBoneName(raw.path);
      return { id: index, name: known?.name || (index === 0 ? "Root" : bone ? `${bone} (part ${index})` : `Part ${index}`),
        pos: raw.pos.slice(), rot: raw.rot.slice(), linear: raw.linear.slice(), scale,
        ...(known?.tipUnits ? { tipUnits: known.tipUnits } : {}),
        ...(ROBOT_ARM_IDS.has(itemID) && index > 0 ? { movesWithWearer: true } : {}) };
    });
    next.set(itemID, parseFrames(entry.frames)); // component/GLB asset basis; used to rebase mesh vertices
    runtime.set(itemID, parseFrames(entry.runtimeFrames)); // reparented _root basis; native edge authority
  }
  // Native Deserialize reparents the GrabbableObject._root to the stuck edge.
  // Its NetParent coordinates are therefore in the serialized runtime-root
  // basis, not the prefab's GrabbableItem component basis. Grimstaff exposes
  // the distinction: the prefab NP0 is -0.136 m below the component, while
  // the reparented runtime NP0 is at the root origin.
  currentNetParentFrames = runtime;
  currentComponentNetParentFrames = next;
  currentRuntimeNetParentFrames = runtime;
  return next.size;
}

export function runtimeNetParentFrame(itemID, subParentID) {
  const id = clampInt(subParentID, 0, 255, 0);
  return currentRuntimeNetParentFrames?.get(itemID)?.find((frame) => frame.id === id) || null;
}

export function componentNetParentFrame(itemID, subParentID) {
  const id = clampInt(subParentID, 0, 255, 0);
  return currentComponentNetParentFrames?.get(itemID)?.find((frame) => frame.id === id) || null;
}

// GLB vertices are baked from the prefab's component origin. The preview group
// is at the native _viewRoot pose, so move the model from the component basis
// into the runtime-root basis. The current build has exactly one nonidentity
// offset (grimstaff); refuse a future rotated/scaled NP0 until its full affine
// model conversion is implemented and live-verified.
export function modelOriginCorrection(itemID, scaleModifier) {
  const component = componentNetParentFrame(itemID, 0);
  const runtime = runtimeNetParentFrame(itemID, 0);
  if (!component || !runtime) return [0, 0, 0];
  const delta = vSub(runtime.pos, component.pos);
  if (Math.hypot(...delta) < 1e-9) return [0, 0, 0];
  const identityLinear = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (component.linear.some((value, i) => Math.abs(value - identityLinear[i]) > 1e-6) ||
      runtime.linear.some((value, i) => Math.abs(value - identityLinear[i]) > 1e-6)) {
    throw new Error(`${itemID}: model origin correction requires a full affine transform`);
  }
  return vScale(delta, physicalScale(scaleModifier, itemID));
}

export function subParentFramesFor(itemID) {
  if (currentNetParentFrames) return currentNetParentFrames.get(itemID) || [];
  return SUB_PARENT_FRAMES[itemID] || [BASE_FRAME];
}

export function subParentFrame(itemID, subParentID) {
  const id = clampInt(subParentID, 0, 255, 0);
  const frames = subParentFramesFor(itemID);
  return frames.find((f) => f.id === id) || null;   // null = the game would silently re-home onto the base
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Minimal vector / quaternion algebra (game frame).
// ---------------------------------------------------------------------------------------------------------------
export function vAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function vScale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function qNormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return n > 1e-12 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : [0, 0, 0, 1];
}
export function qConj(q) { return [-q[0], -q[1], -q[2], q[3]]; }
export function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qRotate(q, v) {
  const p = [v[0], v[1], v[2], 0];
  const r = qMul(qMul(q, p), qConj(q));
  return [r[0], r[1], r[2]];
}

function num(v, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
export function vec3(arr, fb = [0, 0, 0]) { const a = Array.isArray(arr) ? arr : fb; return [num(a[0], fb[0]), num(a[1], fb[1]), num(a[2], fb[2])]; }
export function quat(arr, fb = IDENTITY_QUAT) { const a = Array.isArray(arr) ? arr : fb; return qNormalize([num(a[0], fb[0]), num(a[1], fb[1]), num(a[2], fb[2]), num(a[3], fb[3])]); }
export function roundArr(arr, digits = 6) { const m = 10 ** digits; return arr.map((n) => { const r = Math.round(Number(n) * m) / m; return Object.is(r, -0) ? 0 : r; }); }

function mat3Det(m) {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6]);
}
function mat3Apply(m, v) {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
function mat3InverseApply(m, v) {
  const det = mat3Det(m);
  if (Math.abs(det) < 1e-10) return null;
  const x = (m[4] * m[8] - m[5] * m[7]) * v[0] + (m[2] * m[7] - m[1] * m[8]) * v[1] + (m[1] * m[5] - m[2] * m[4]) * v[2];
  const y = (m[5] * m[6] - m[3] * m[8]) * v[0] + (m[0] * m[8] - m[2] * m[6]) * v[1] + (m[2] * m[3] - m[0] * m[5]) * v[2];
  const z = (m[3] * m[7] - m[4] * m[6]) * v[0] + (m[1] * m[6] - m[0] * m[7]) * v[1] + (m[0] * m[4] - m[1] * m[3]) * v[2];
  return [x / det, y / det, z / det];
}
function frameLinear(frame) { return frame.linear || null; }

// ---------------------------------------------------------------------------------------------------------------
// 4. Edge <-> parent-local conversion (the core of the update).
//    Game (decompile): NetParent Transform.localToWorldMatrix maps the stored edge position into the parent's
//    frame; worldRot uses the Transform rotation. The exported full 3x3 linear transform includes rotated and
//    nonuniformly scaled ancestors. In parent-local metres:
//      local = itemScale * (framePos + frameLinear * edgePos), localRot = frameRot * edgeRot.
//    The inverse matrix returns edgePos. Identity Root frames reduce to pos = local / itemScale.
// ---------------------------------------------------------------------------------------------------------------
export function edgeToParentLocal(edge, parentItemID, parentScaleModifier) {
  const frame = subParentFrame(parentItemID, edge && edge.subParentID);
  if (!frame || frame.unknown) return null;
  const itemScale = physicalScale(parentScaleModifier, parentItemID);
  const pos = vec3(edge && edge.pos);
  const rot = quat(edge && edge.rot);
  const inFrame = frameLinear(frame) ? mat3Apply(frame.linear, pos) : qRotate(frame.rot, vScale(pos, frame.scale));
  return {
    pos: vScale(vAdd(frame.pos, inFrame), itemScale),
    rot: qNormalize(qMul(frame.rot, rot)),
    frame,
    itemScale,
  };
}

export function parentLocalToEdge(localPos, localRot, parentItemID, parentScaleModifier, subParentID) {
  const frame = subParentFrame(parentItemID, subParentID);
  if (!frame || frame.unknown) return null;
  const itemScale = physicalScale(parentScaleModifier, parentItemID);
  const unscaled = vScale(vec3(localPos), 1 / itemScale);
  const rel = vSub(unscaled, frame.pos);
  const inv = qConj(frame.rot);
  return {
    pos: frameLinear(frame) ? mat3InverseApply(frame.linear, rel) : vScale(qRotate(inv, rel), 1 / frame.scale),
    rot: qNormalize(qMul(inv, quat(localRot))),
    frame,
    itemScale,
  };
}

// The joint is in the selected NetParent frame; posePos/poseRot describe the child's anchor within its own root.
// Keep those fields when an author moves an item, then solve for a new joint rather than resetting the anchor.
export function edgeToDisplayPose(edge, parentItemID, parentScaleModifier, childItemID, childScaleModifier) {
  const local = edgeToParentLocal(edge, parentItemID, parentScaleModifier);
  if (!local) return null;
  const posePos = vec3(edge && edge.posePos);
  const poseRot = quat(edge && edge.poseRot);
  const childScale = physicalScale(childScaleModifier, childItemID);
  const rot = qNormalize(qMul(local.rot, qConj(poseRot)));
  return { pos: vSub(local.pos, qRotate(rot, vScale(posePos, childScale))), rot };
}

export function displayPoseToEdge(displayPos, displayRot, parentItemID, parentScaleModifier,
  subParentID, childItemID, childScaleModifier, posePos = [0, 0, 0], poseRot = IDENTITY_QUAT) {
  const rot = quat(displayRot);
  const childScale = physicalScale(childScaleModifier, childItemID);
  const anchorPos = vAdd(vec3(displayPos), qRotate(rot, vScale(vec3(posePos), childScale)));
  const anchorRot = qNormalize(qMul(rot, quat(poseRot)));
  return parentLocalToEdge(anchorPos, anchorRot, parentItemID, parentScaleModifier, subParentID);
}

// Where the game DRAWS a part stuck to a VIEW_SCALE_MISMATCH_PARENTS prefab (measured on client E, build 26142670): its
// position relative to the parent times the parent's ratio, at the authored rotation and size; parts stuck to that part
// keep their own offsets from it. An apple 0.5 m up a mannequin torso is drawn 0.35 m up (0.2 m on an alien blaster), and
// an apple 0.3 m from that apple is drawn 0.3 m from it. Physics keeps the full offset. The editor shows and edits the
// drawn pose and saves the edge that makes the game draw the part there.
export function stuckDrawRatio(parentItemID) {
  const ratio = Number(VIEW_SCALE_MISMATCH_PARENTS[String(parentItemID || "").replace(/^item_prefab\//, "")]);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

export function edgeToDrawnPose(edge, parentItemID, parentScaleModifier, childItemID, childScaleModifier) {
  const pose = edgeToDisplayPose(edge, parentItemID, parentScaleModifier, childItemID, childScaleModifier);
  return pose && { pos: vScale(pose.pos, stuckDrawRatio(parentItemID)), rot: pose.rot };
}

export function drawnPoseToEdge(drawnPos, drawnRot, parentItemID, parentScaleModifier,
  subParentID, childItemID, childScaleModifier, posePos, poseRot) {
  return displayPoseToEdge(vScale(vec3(drawnPos), 1 / stuckDrawRatio(parentItemID)), drawnRot, parentItemID,
    parentScaleModifier, subParentID, childItemID, childScaleModifier, posePos, poseRot);
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Item knowledge for authoring defaults and validation.
// ---------------------------------------------------------------------------------------------------------------
// Guns spawn EMPTY unless `ammo` is set. Real captures of the older gun types carry 999999 when loaded;
// current-build prefab exports can supply a narrower, game-verified range for individual items.
export const LOADED_AMMO = 999999;
export const GUN_IDS = new Set([
  "item_alienblaster", "item_arena_pistol", "item_arena_shotgun", "item_bubble_gun", "item_crossbow", "item_crossbow_heart",
  "item_crossbow_pinkmorph", "item_crossbow_vampirehunter", "item_flaregun", "item_friend_launcher", "item_grenade_launcher",
  "item_heart_gun", "item_mining_laser", "item_mining_laser_blood", "item_mining_laser_orange", "item_module_gun_1",
  "item_module_gun_2", "item_module_gun_3", "item_module_laser_1", "item_module_laser_2", "item_module_laser_3",
  "item_module_minigun_1", "item_module_minigun_2", "item_module_minigun_3", "item_moneygun", "item_pistol_dragon",
  "item_radiation_gun", "item_revolver", "item_revolver_gold", "item_rpg", "item_rpg_cny", "item_rpg_easter", "item_rpg_shoe",
  "item_rpg_smshr", "item_rpg_spear", "item_salmoncannon", "item_sawblade_launcher", "item_shotgun", "item_shotgun_blood",
  "item_shotgun_gold", "item_shotgun_sawed", "item_shotgun_viper", "item_teleport_gun", "item_teleport_gun_galaxy",
  "item_water_gun_blue", "item_water_gun_red", "item_wireframe_gun", "item_zipline_gun",
  // 2026-10-21 (report: "the BB gun doesn't have ammo when spawned from the editor"): a census of every item prefab in
  // build 26092467 found these guns missing here, so the editor left their ammo at 0. Each restores
  // clamp(ammo, 0, maxAmmo) in its HandleDeserialize (BBGun/Hydra/PrecisionRifle: GunConfig.maxAmmo 10/6/4; RebarGun:
  // its own 3 rounds), so the loaded value fills them. The ghost grenade launcher is a GrenadeLauncher (rounds are its
  // contents). The supersoakers (WaterGun) refill to full in Spawned and the slingshot loads a held item, not a number.
  "item_bb_gun", "item_hydra", "item_precision_rifle", "item_rebar_gun", "item_grenade_launcher_ghost",
]);
const LEGACY_GUN_AMMO = Object.freeze({ min: 0, max: null, defaultLoaded: LOADED_AMMO });
let exportedGunAmmo = new Map();

// The model exporter attaches ammoCapability only after verifying the exact GameAssembly build and prefab
// component. Reject a stale or malformed capability instead of silently authoring an incorrect ammo value.
export function installGunAmmoCapabilities(entries, expected) {
  if (!Array.isArray(entries) || !expected?.steamBuildId || !expected?.gameAssemblySha256 ||
      !(expected.itemIDs instanceof Set)) throw new Error("invalid game ammo capability manifest");
  const next = new Map();
  for (const entry of entries) {
    if (!entry?.ammoCapability) continue;
    const id = String(entry.item_id || "");
    const cap = entry.ammoCapability;
    if (!expected.itemIDs.has(id) || next.has(id) || cap.kind !== "integer" ||
        String(cap.steamBuildId) !== String(expected.steamBuildId) ||
        cap.gameAssemblySha256 !== expected.gameAssemblySha256 ||
        !Number.isSafeInteger(cap.min) || !Number.isSafeInteger(cap.max) ||
        !Number.isSafeInteger(cap.defaultLoaded) || cap.min < 0 || cap.max > 2147483647 ||
        cap.min > cap.max || cap.defaultLoaded <= 0 || cap.defaultLoaded < cap.min ||
        cap.defaultLoaded > cap.max) throw new Error(`invalid game ammo capability for ${id || "unknown item"}`);
    next.set(id, Object.freeze({ min: cap.min, max: cap.max, defaultLoaded: cap.defaultLoaded }));
  }
  exportedGunAmmo = next;
  return next.size;
}

export function gunAmmoCapability(itemID) {
  const id = String(itemID || "");
  return exportedGunAmmo.get(id) || (GUN_IDS.has(id) ? LEGACY_GUN_AMMO : null);
}
export function isGun(itemID) { return !!gunAmmoCapability(itemID); }
export function loadedAmmoFor(itemID) { return gunAmmoCapability(itemID)?.defaultLoaded ?? 0; }
export function clampGunAmmo(itemID, ammo) {
  const value = Math.round(Number(ammo) || 0);
  const cap = exportedGunAmmo.get(String(itemID || ""));
  return cap ? Math.min(cap.max, Math.max(cap.min, value)) : value;
}

// Containers: items whose `children` array is their INVENTORY (native capture format). A crossbow is a one-slot holder
// (AnimalCompany.Weapons.Crossbow: HandleSerialize/HandleDeserialize + attached item): it loads children[0] only, and
// only an item whose equip config sets allowAttachToItem (547 of 740 in build 25766246, from holder_anchors.json --
// e.g. arrows, guns, lances, a flare gun; NOT a pelican case, which live D tests showed stays loose). Capacities are
// the largest counts seen in real captures (goop_captures census 2026-09-06) or the game's own caps; unknown backpacks
// fall back to the generic backpack rule.
export const CONTAINER_RULES = {
  item_crossbow: { kind: "holder", capacity: 1, label: "loaded item (one; arrows and other loadable items)" },
  item_crossbow_heart: { kind: "holder", capacity: 1, label: "loaded item (one; arrows and other loadable items)" },
  item_crossbow_pinkmorph: { kind: "holder", capacity: 1, label: "loaded item (one; arrows and other loadable items)" },
  item_crossbow_vampirehunter: { kind: "holder", capacity: 1, label: "loaded item (one; arrows and other loadable items)" },
  // Owner 2026-10-18 ("put stuff in heart guns, then put that in a bag"): HeartGun and SalmonCannon save their held item as
  // children[0] and restore it the same way (HandleSerialize/HandleDeserialize, decompile 25996600; live on client D). A heart
  // gun holds any item; a salmon cannon holds a fish only (holder_pose.mjs canHold). In a bag the holder keeps its one item.
  item_heart_gun: { kind: "holder", capacity: 1, label: "held item (one; any item, a whole invention included)" },
  item_salmoncannon: { kind: "holder", capacity: 1, label: "loaded fish (one)" },
  // Quiver.containedObjects is a NetworkLinkedList of 18 (item_class_layouts_25996600); HandleDeserialize stops there.
  item_quiver: { kind: "backpack", capacity: 18, label: "quiver contents (up to 18; the game drops the rest)" },
  item_backpack_small_base: { kind: "backpack", capacity: 6, label: "backpack contents" },
  item_backpack_large_clover: { kind: "backpack", capacity: 22, label: "backpack contents" },
  // A tripod mounts its children[0] (a camera, light or mic) on its swivel head (TripodSwivelItem.HandleDeserialize;
  // film_gear.mjs, live on client E 2026-10-15). The game saves the mount; nothing else in children is used.
  item_film_tripod: { kind: "mount", capacity: 1, label: "mounted gear (one camera, light or mic)" },
  // Glitched items (owner 2026-10-18): GrenadeLauncher (6) and AmmoPouch (20) store contents as records like a quiver.
  // Their HandleDeserialize loads any catalog item up to MAX_CAPACITY; the grenade / ammo filter in CheckToAddItem only
  // applies when a player loads one by hand (decompile 25996600). The launcher fires its FIRST record:
  // GrenadeLauncher.TryRemoveNextItem spawns it at the barrel and Shoot throws it at 40 m/s (live on client D 2026-10-18:
  // a gold bar, a revolver and a heart gun flew out).
  item_grenade_launcher: { kind: "backpack", capacity: 6, label: "loaded rounds (up to 6; fires any item, first listed first)" },
  item_grenade_launcher_ghost: { kind: "backpack", capacity: 6, label: "loaded rounds (up to 6; fires any item, first listed first)" },
  item_ammo_pouch: { kind: "backpack", capacity: 20, label: "pouch contents (up to 20; any item)" },
};
// Every GrenadeLauncher prefab (item census 26092467: the ghost launcher is the same component as the original).
export const GRENADE_LAUNCHER_IDS = new Set(["item_grenade_launcher", "item_grenade_launcher_ghost"]);
// The design rules are the shared goop build policy's (goop_build_policy.mjs, owner 2026-10-26).
export const MAX_CONTENTS_PER_CONTAINER = GOOP_BUILD_POLICY.structure.maxContentsPerContainer;   // FromAPIV1 children lane immediate cap (max(30, runtime))
export const MAX_CONTENTS_DEPTH = GOOP_BUILD_POLICY.structure.maxContentsDepth;            // MAX_ITEM_CHILD_DEPTH: contents of contents of ... 5 nested containers
export function containerRule(itemID) {
  const id = String(itemID || "");
  if (CONTAINER_RULES[id]) return CONTAINER_RULES[id];
  if (/^item_backpack/.test(id)) return { kind: "backpack", capacity: MAX_CONTENTS_PER_CONTAINER, label: "backpack contents" };
  if (/^item_quiver/.test(id)) return { kind: "backpack", capacity: 18, label: "quiver contents (up to 18; the game drops the rest)" };
  return null;
}
// How a record container hands its contents back (decompile 25996600). "bag" (BackpackItem): the item a player picks; each
// stored item keeps one item of its own. The others keep no nested contents: "quiver" gives out its LAST item first,
// "pouch" (AmmoPouch) the newest round for the gun in the player's other hand and otherwise its last item, "launcher"
// (GrenadeLauncher) fires its FIRST item.
export function containerFamily(itemID) {
  const id = String(itemID || "");
  if (/^item_quiver/.test(id)) return "quiver";
  if (id === "item_ammo_pouch") return "pouch";
  if (GRENADE_LAUNCHER_IDS.has(id)) return "launcher";
  return containerRule(id)?.kind === "backpack" ? "bag" : null;
}
export const CONTAINER_FAMILY_NOUNS = Object.freeze({ bag: "bag", quiver: "quiver", pouch: "ammo pouch", launcher: "grenade launcher" });

// Glitched items (owner 2026-10-18): each item's GameplayItemEquippingConfig says where a PLAYER may put it
// (holder_anchors.json items[id].allow). Containers check those flags only when a player adds an item by hand
// (CheckToAddItem); every HandleDeserialize loads any catalog item, so a saved container can hold what no player can put
// there. Until the manifest is installed nothing is reported.
const FAMILY_ALLOW_FLAG = Object.freeze({ bag: "bag", quiver: "quiver", pouch: "ammoPouch", launcher: "grenadeLauncher" });
let equipAllow = null;
export function installEquipAllowFlags(items) {
  if (!items || typeof items !== "object") throw new Error("invalid equip allow flags");
  const next = new Map();
  for (const [id, row] of Object.entries(items)) if (Array.isArray(row?.allow)) next.set(id, new Set(row.allow.map(String)));
  equipAllow = next;
  return next.size;
}
export function clearEquipAllowFlags() { equipAllow = null; }
// true / false from the game's flags, or null when unknown (no manifest, or an item without a GrabbableItem).
export function normallyAllowedIn(itemID, family) {
  const flag = FAMILY_ALLOW_FLAG[family];
  const allow = flag && equipAllow ? equipAllow.get(String(itemID || "")) : null;
  return allow ? allow.has(flag) : null;
}

// item_crate / item_nut_drop have no GrabbableItem, so they ride only as stored records (decompile 25996600):
// Quiver/AmmoPouch spawn the stored item and remove the record even when it is not grabbable (one per pull);
// GrenadeLauncher.TryRemoveNextItem does the same at the barrel, but Shoot launches only a GrabbableItem, so the crate
// drops out with the misfire click; BackpackItem.TryGetItemOut removes a record only after a successful grab, so a bag
// spawns a new one on every take-out or tipped-bag tick. A holder spawns what it holds through the item path, which
// cannot spawn either. NutDrop.Spawned hides a nut drop whose network "active" flag is off, and only NutDropManager
// sets it, so a nut drop from any container stays invisible and pays nothing.
function nonGrabbableContentsNote(id, where, parent) {
  const parentId = String(parent?.itemID || "");
  const kind = containerRule(parentId)?.kind;
  if (kind === "holder" || kind === "mount") return `${where}: ${parentId} cannot hold ${id}: it spawns what it holds, and ${id} cannot be spawned that way, so nothing appears. Put it in a quiver, ammo pouch, grenade launcher or bag instead.`;
  const nut = id === "item_nut_drop" ? " A nut drop that the game did not drop itself spawns hidden, so it shows nothing and pays nothing." : "";
  const family = containerFamily(parentId);
  if (family === "quiver" || family === "pouch") return `${where}: ${id} is not grabbable, so it rides in the ${CONTAINER_FAMILY_NOUNS[family]} as stored contents. In game, each pull spawns one real ${id} and removes it.${nut}`;
  if (family === "launcher") return `${where}: ${id} is not grabbable, so it rides in the grenade launcher as stored contents. In game, the trigger drops one real ${id} out of the barrel with a misfire click (it is not launched) and removes it.${nut}`;
  return `${where}: ${id} is not grabbable, so it rides in the container as stored contents. In game, every take-out spawns a new ${id} and the bag keeps it, and an open bag tipped upside down spawns one every network tick for as long as it stays tipped (a room flood). For giveaways use a quiver instead: one ${id} per pull.${nut}`;
}

// Glitched contents (owner 2026-10-18): gameplay-catalog items that have no prefab, so only a bag can hold one. A bag stores
// its contents as records (ContainedItemCoreData: catalog netID + state), so the game never spawns them while they sit inside.
// item_unidentified is the game's own placeholder (netID 0, catalog name "Unknown Item", description "???"); bags and stashes
// show it as "Unknown Item" with the placeholder thumbnail. Taking it out spawns nothing (there is no prefab), and
// BackpackItem.TryGetItemOut removes an entry only after a spawn succeeds, so it stays in the bag. Build-bound: this list is
// the gameplay catalog (voice_concierge/item_netids_<build>.json) minus items.txt; test_goop_rules.mjs checks it.
export const RECORD_ONLY_ITEMS = Object.freeze([
  Object.freeze({ id: "item_unidentified", name: "Unknown Item (glitched, bag contents only)", category: "Glitched contents" }),
]);
export const RECORD_ONLY_ITEM_IDS = new Set(RECORD_ONLY_ITEMS.map((item) => item.id));

// Ids the game's catalog carries with null itemData (GROUP 2): the native Deserialize drops them silently; our loader
// spawns them by the direct path on a BASE edge only. On a rigid (stick) edge they are dropped and reported.
export const GROUP2_NULLDATA_IDS = new Set(["item_brick", "item_motor", "item_piston", "item_sludge", "item_deck_of_chances",
  "item_deck_of_chances_card", "item_squishy_template", "item_chefspot", "item_randombox_base"]);

// Parents whose VISUAL root is scaled differently from their physics frame: every child stuck under them renders its
// offset multiplied by that ratio ("offset rows", live-measured 2026-09-04). Never use one as a parent of stuck children.
// Every prefab, from view_scale_ratio_census.json (live census 2026-10-25, test_goop_view_scale_mismatch_heads.mjs keeps
// them equal). The courier's normalizer primes these ratios, A's loader measures them live: with only three listed, a
// private delivery of bike.json hung 13 parts under an alien blaster (0.4x) and they were drawn out of place.
export const VIEW_SCALE_MISMATCH_PARENTS = {
  item_alienblaster: 0.4, item_backrooms_chair: 0.6, item_brain_chunk: 0.15, item_bubble_gun: 0.4,
  item_eye_googly: 0.01, item_flamethrower: 0.4, item_flamethrower_skull: 0.4, item_flamethrower_skull_blood: 0.4,
  item_flamethrower_skull_ruby: 0.4, item_glitched_banana: 10, item_heart_chunk: 0.15, item_hh_key: 3.816,
  item_key_challengearena: 3.816, item_key_factoryboss_easy: 3.816, item_key_factoryboss_hard: 3.816,
  item_key_factoryboss_medium: 3.816, item_mannequin_arm_left: 0.7, item_mannequin_arm_right: 0.7,
  item_mannequin_head: 0.7, item_mannequin_leg_left: 0.7, item_mannequin_leg_right: 0.7, item_mannequin_torso: 0.7,
  item_moonhorror_key: 3.816, item_mountain_key: 3.816, item_ore_copper_l: 0.15, item_ore_copper_m: 0.15,
  item_ore_copper_s: 0.15, item_ore_gold_l: 0.15, item_ore_gold_m: 0.15, item_ore_gold_s: 0.15, item_ore_hell: 0.11,
  item_ore_silver_l: 0.15, item_ore_silver_m: 0.15, item_ore_silver_s: 0.15, item_quest_key_graveyard: 3.816,
  item_shadowboss_key: 3, item_trampoline: 2, item_upsidedown_loot: 0.15, item_uranium_chunk_l: 0.15,
  item_uranium_chunk_m: 0.15, item_uranium_chunk_s: 0.15, item_volatile_brain_chunk: 0.23,
};

// Items that move by themselves and make the whole invention drift.
export const SELF_MOVING_IDS = new Set(["item_blox_sphere"]);

// Machine-save caps (goop machine): 32 items total, 16 of each capped prop. FromAPIV1 has one shared budget of
// 512 descendants across stuck and inventory children; the editor refuses more. The 32-children and 32-level stash caps
// never block: the paced loader regroups fan-out itself and spawns the rest as authored (predictPacedNormalizer, 7a).
export const MACHINE_SAVE_TOTAL_CAP = 32;
export const MACHINE_SAVE_PROP_CAP = 16;
export const CAPPED_PROP_PATTERN = /^item_(broom|box_fan|umbrella)/;
export const STASH_MAX_IMMEDIATE = 32;
export const STASH_MAX_DESCENDANTS = GOOP_BUILD_POLICY.structure.maxDescendants;
export const STASH_MAX_DEPTH = 32;

// Items that read the controller input they inherit from the part they are stuck to (a remote stuck on a calculator
// drives every joystick under the calculator). The paced loader never splits a top-level part holding one of these, so
// a regroup cannot move a joystick out from under its calculator (master_menu.js _goopFromApiV1InputReaderIds, same list;
// the parity test holds them equal).
export const INPUT_READER_IDS = Object.freeze([
  "item_joystick", "item_joystick_inv_y",
  "item_robot_arm_left", "item_robot_arm_right", "item_robot_arm_left_galaxy", "item_robot_arm_right_galaxy",
  "item_painters_tape", "item_zipline_gun",
  "item_film_boom_mic", "item_film_interview_mic", "item_film_light",
  "item_gameboy",
]);
const INPUT_READER_SET = new Set(INPUT_READER_IDS);

// ---------------------------------------------------------------------------------------------------------------
// 6. Invention JSON helpers (native shape only; `containerContents` is our loader's extension and is folded into
//    `children` on load so the editor has ONE representation for contents).
// ---------------------------------------------------------------------------------------------------------------
export function newItem(itemID) {
  return {
    itemID: String(itemID || ""), jsonData: "", stashPos: 0, children: [], stuckChildren: [], grabPos: [0, 0, 0], grabRot: [0, 0, 0, 1],
    state: 0, ammo: loadedAmmoFor(itemID), isBlueprint: true, scaleModifier: 0, colorHue: 0, colorSaturation: 0,
    jellyStrength: 0, stashRow: 0, stashCol: 0,
  };
}

export function unwrapInvention(data) {
  if (data && typeof data === "object" && !data.itemID && Array.isArray(data.items)) {
    const first = data.items.find((it) => it && typeof it === "object" && it.itemID);
    return first || null;   // legacy tool wrapper: only the first root is loaded
  }
  return data && typeof data === "object" && data.itemID ? data : null;
}

export function contentsOf(item) {
  const out = [];
  for (const c of (item && Array.isArray(item.children)) ? item.children : []) {
    const it = c && typeof c === "object" ? (c.item && typeof c.item === "object" ? c.item : c) : null;
    if (it && it.itemID) out.push(it);
  }
  for (const c of (item && Array.isArray(item.containerContents)) ? item.containerContents : []) {
    if (c && typeof c === "object" && c.itemID) out.push(c);
  }
  return out;
}

export function forEachNode(root, fn) {
  const walk = (item, depth, edge, parent, contentsDepth, insideBackpack) => {
    if (!item || typeof item !== "object") return;
    fn(item, { depth, edge, parent, contentsDepth, insideBackpack });
    for (const e of Array.isArray(item.stuckChildren) ? item.stuckChildren : []) {
      if (e && e.item) walk(e.item, depth + 1, e, item, contentsDepth, insideBackpack);
    }
    const contentsInsideBackpack = insideBackpack || containerRule(item.itemID)?.kind === "backpack";
    for (const c of contentsOf(item)) walk(c, depth + 1, null, item, contentsDepth + 1, contentsInsideBackpack);
  };
  walk(root, 0, null, null, 0, false);
}

// Old files may carry the generic 999999 value on an item whose newer native loader clamps it. Keep the
// editor record and any nested inventory copies consistent with the value the game will actually restore.
export function normalizeGameAmmoTree(root) {
  let changed = 0;
  forEachNode(root, (item) => {
    if (!exportedGunAmmo.has(String(item.itemID || ""))) return;
    const next = clampGunAmmo(item.itemID, item.ammo);
    if (item.ammo !== next) { item.ammo = next; changed++; }
  });
  return changed;
}

// Make every gun in the tree loaded (the owner's rule: a file that contains a revolver must spawn it loaded, not empty).
export function loadAllGuns(root) {
  let changed = 0;
  forEachNode(root, (item) => {
    if (!isGun(item.itemID)) return;
    if (!exportedGunAmmo.has(String(item.itemID || "")) && Number(item.ammo) > 0) return;
    const current = clampGunAmmo(item.itemID, item.ammo);
    const next = current > 0 ? current : loadedAmmoFor(item.itemID);
    if (item.ammo !== next) { item.ammo = next; changed++; }
  });
  return changed;
}

// ---------------------------------------------------------------------------------------------------------------
// 7a. The paced spawner's normalizer (master_menu.js _goopFromApiV1PrepareGen in warn-only mode, owner R1), modelled on
//     structure only. The game's stash keeps at most 32 stuck children per part, 32 stuck levels and 512 parts, but a
//     website invention never has to be authored inside those caps (owner 2026-10-12): the paced loader regroups every
//     over-wide part (its whole base-edge subtree is hung under heads of <= 32) and spawns everything else as built. So
//     the website only says when the RESULT still breaks a stash cap: the invention spawns, but cannot be saved in the
//     stash. Poses and live prefab metadata are not modelled. A part whose model is scaled against its physics frame
//     (VIEW_SCALE_MISMATCH_PARENTS) fails the regroup exactly as in the loader, which then spawns the item as built.
// ---------------------------------------------------------------------------------------------------------------
const bareItemId = (item) => String(item && item.itemID || "").replace(/^item_prefab\//, "");
const isRigidEdge = (edge) => !!(edge && typeof edge === "object" && (Number(edge.subParentID) || 0) !== 0);
const viewMismatch = (item) => Object.prototype.hasOwnProperty.call(VIEW_SCALE_MISMATCH_PARENTS, bareItemId(item));
const viewMismatchReason = (item) => `${bareItemId(item)}'s model is drawn at ${VIEW_SCALE_MISMATCH_PARENTS[bareItemId(item)]}x ` +
  "its physics size, so the spawner cannot regroup the parts stuck to it";
// _goopFromApiV1HeadScore without live metadata: lower is a better promoted head.
const headScore = (item) => (!item || typeof item !== "object") ? 100 :
  (viewMismatch(item) ? 25 : 0) + (Math.trunc(Number(item.scaleModifier) || 0) !== 0 ? 1 : 0);

function directNonStuck(item) {
  const out = [];
  for (const key of ["children", "containerContents"]) {
    for (const value of (item && Array.isArray(item[key])) ? item[key] : []) {
      if (value && typeof value === "object") out.push(value.item && typeof value.item === "object" ? value.item : value);
    }
  }
  return out;
}

// A structural copy (ids, scale modifiers, edges, contents) the model can rewrite without touching the editor's data.
function normalizerSkeleton(item) {
  if (!item || typeof item !== "object") return item;
  return {
    itemID: item.itemID, scaleModifier: item.scaleModifier,
    stuckChildren: (Array.isArray(item.stuckChildren) ? item.stuckChildren : []).map((edge) =>
      (edge && typeof edge === "object" && edge.item && typeof edge.item === "object")
        ? { subParentID: edge.subParentID, item: normalizerSkeleton(edge.item) } : edge),
    children: directNonStuck(item).map(normalizerSkeleton),
  };
}

// _goopFromApiV1GraphStats: contents count toward the total but sit at their container's stuck depth.
export function normalizerGraphStats(root) {
  const stats = { descendants: 0, maxImmediate: 0, maxDepth: 0, malformed: 0 };
  if (!root || typeof root !== "object") { stats.malformed++; return stats; }
  const stack = [{ item: root, depth: 0, isRoot: true }];
  while (stack.length) {
    const { item, depth, isRoot } = stack.pop();
    if (!item || typeof item !== "object") { stats.malformed++; continue; }
    if (!isRoot) stats.descendants++;
    const stuck = Array.isArray(item.stuckChildren) ? item.stuckChildren : [];
    stats.maxImmediate = Math.max(stats.maxImmediate, stuck.length);
    for (const edge of stuck) {
      if (!edge || typeof edge !== "object" || !edge.item || typeof edge.item !== "object") { stats.malformed++; continue; }
      stats.maxDepth = Math.max(stats.maxDepth, depth + 1);
      stack.push({ item: edge.item, depth: depth + 1 });
    }
    for (const other of directNonStuck(item)) stack.push({ item: other, depth });
  }
  return stats;
}

function localStuckStats(root) {
  const stats = { maxImmediate: 0, malformed: 0 };
  const stack = [root];
  while (stack.length) {
    const item = stack.pop();
    const stuck = item && Array.isArray(item.stuckChildren) ? item.stuckChildren : [];
    stats.maxImmediate = Math.max(stats.maxImmediate, stuck.length);
    for (const edge of stuck) {
      if (!edge || typeof edge !== "object" || !edge.item || typeof edge.item !== "object") stats.malformed++;
      else stack.push(edge.item);
    }
  }
  return stats;
}

function holdsInputReader(item) {
  const stack = item ? [item] : [];
  while (stack.length) {
    const at = stack.pop();
    if (!at || typeof at !== "object") continue;
    if (INPUT_READER_SET.has(String(at.itemID || "").replace(/^item_prefab\//, ""))) return true;
    for (const edge of Array.isArray(at.stuckChildren) ? at.stuckChildren : []) if (edge && edge.item) stack.push(edge.item);
  }
  return false;
}

// _goopFromApiV1FlattenStuck: every base-edge descendant in walk order; stick (rigid) edges ride with their item, and a
// top-level part holding an input reader rides whole (its subtree is never split).
function flattenSoftSubtree(item) {
  const records = [], stack = [];
  const first = Array.isArray(item.stuckChildren) ? item.stuckChildren : [];
  for (let i = first.length - 1; i >= 0; i--) {
    if (!isRigidEdge(first[i])) stack.push({ edge: first[i], whole: !!(first[i] && first[i].item && holdsInputReader(first[i].item)) });
  }
  while (stack.length) {
    const { edge, whole } = stack.pop();
    if (!edge || typeof edge !== "object" || !edge.item || typeof edge.item !== "object") continue;
    const nested = Array.isArray(edge.item.stuckChildren) ? edge.item.stuckChildren : [];
    const kept = whole ? nested.slice() : nested.filter(isRigidEdge);
    records.push({ edge: { ...edge, item: { ...edge.item, stuckChildren: kept } }, rigid: kept.length });
    if (!whole) for (let i = nested.length - 1; i >= 0; i--) if (!isRigidEdge(nested[i])) stack.push({ edge: nested[i], whole: false });
  }
  return records;
}

function chunkRecords(records, capOverride) {
  const chunks = [], baseCap = Number(capOverride) > 0 ? Math.trunc(Number(capOverride)) : STASH_MAX_IMMEDIATE;
  for (let cursor = 0; cursor < records.length;) {
    const cap = Math.max(0, baseCap - (records[cursor].rigid || 0));
    chunks.push(records.slice(cursor, cursor + 1 + cap));
    cursor += 1 + cap;
  }
  return chunks;
}

// _goopFromApiV1PromoteRigidGroups: more than 32 parts on one moving sub-part (a joystick stick) are hung under heads that
// stay on that sub-part, widened when the heads still do not fit.
function promoteRigidGroups(rigidEdges, slots) {
  const groups = [], bySub = new Map();
  for (const edge of rigidEdges) {
    const sub = Math.trunc(Number(edge.subParentID) || 0);
    if (!bySub.has(sub)) { const group = { edges: [] }; bySub.set(sub, group); groups.push(group); }
    bySub.get(sub).edges.push(edge);
  }
  const immediateOf = (edge) => Array.isArray(edge?.item?.stuckChildren) ? edge.item.stuckChildren.length : 0;
  const plan = (cap) => {
    let heads = 0;
    const out = groups.map(({ edges }) => {
      const chunks = [], consumed = new Uint8Array(edges.length);
      let cursor = 0;
      while (cursor < edges.length) {
        while (cursor < edges.length && consumed[cursor]) cursor++;
        if (cursor >= edges.length) break;
        let hi = cursor, bestScore = headScore(edges[cursor].item), candidates = 1;
        for (let k = cursor + 1; k < edges.length && candidates <= cap && bestScore > 0; k++) {
          if (consumed[k]) continue;
          candidates++;
          const score = headScore(edges[k].item);
          if (score < bestScore) { hi = k; bestScore = score; }
        }
        const head = edges[hi];
        consumed[hi] = 1;
        const room = Math.max(0, cap - immediateOf(head)), others = [];
        for (let k = cursor; k < edges.length && others.length < room; k++) {
          if (consumed[k]) continue;
          consumed[k] = 1;
          others.push(edges[k]);
        }
        chunks.push({ head, others });
        while (cursor < edges.length && consumed[cursor]) cursor++;
      }
      heads += chunks.length;
      return chunks;
    });
    return { heads, groups: out };
  };
  let cap = STASH_MAX_IMMEDIATE, planned = plan(cap);
  for (let attempt = 0; attempt < 12 && planned.heads > slots; attempt++) { cap = Math.ceil(cap * 1.125) + 1; planned = plan(cap); }
  if (planned.heads > slots) return { error: "too many parts on one moving sub-part to regroup" };
  const edges = [];
  let promoted = 0;
  for (const chunks of planned.groups) {
    for (const { head, others } of chunks) {
      if (!others.length) { edges.push(head); continue; }
      if (viewMismatch(head.item)) return { error: viewMismatchReason(head.item) };
      head.item.stuckChildren = (head.item.stuckChildren || []).concat(others.map((edge) => ({ ...edge, subParentID: 0 })));
      edges.push(head);
      promoted++;
    }
  }
  return { edges, promoted };
}

// _goopFromApiV1RebalanceOneGen, warn-only: a part whose stuck subtree holds an over-wide part is regrouped.
// _goopFromApiV1RebalanceTriggerStats: a top-level part holding an input reader is one child and is not descended (its own
// over-wide parts are regrouped when the worklist reaches them).
function rebalanceTriggerStats(item) {
  const own = Array.isArray(item.stuckChildren) ? item.stuckChildren : [];
  const stats = { maxImmediate: own.length, malformed: 0 };
  for (const edge of own) {
    if (!edge || typeof edge !== "object" || !edge.item || typeof edge.item !== "object") { stats.malformed++; continue; }
    if (!isRigidEdge(edge) && holdsInputReader(edge.item)) continue;
    const sub = localStuckStats(edge.item);
    stats.malformed += sub.malformed;
    stats.maxImmediate = Math.max(stats.maxImmediate, sub.maxImmediate);
  }
  return stats;
}

function rebalanceOne(item) {
  const local = rebalanceTriggerStats(item);
  if (local.malformed || local.maxImmediate <= STASH_MAX_IMMEDIATE) return {};
  if (viewMismatch(item)) return { error: viewMismatchReason(item) };
  const records = flattenSoftSubtree(item);
  const own = Array.isArray(item.stuckChildren) ? item.stuckChildren : [];
  const rootRigid = own.filter(isRigidEdge);
  if (!records.length && !(own.length > STASH_MAX_IMMEDIATE && rootRigid.length > 1)) return {};
  let chunks = chunkRecords(records);
  if (records.length && chunks.length + rootRigid.length > STASH_MAX_IMMEDIATE) {
    // more than two 32-wide levels hold: widen the heads; the worklist regroups each head again (the third level)
    const slots = Math.max(1, STASH_MAX_IMMEDIATE - rootRigid.length);
    let widened = Math.max(STASH_MAX_IMMEDIATE, Math.ceil(records.length / slots) - 1);
    for (let attempt = 0; attempt < 8; attempt++) {
      chunks = chunkRecords(records, widened);
      if (chunks.length + rootRigid.length <= STASH_MAX_IMMEDIATE) break;
      widened = Math.ceil(widened * 1.125) + 1;
    }
  }
  const rebuilt = [];
  for (const chunk of chunks) {
    if (chunk.length > 1) {
      let best = 0, bestScore = headScore(chunk[0].edge.item);
      for (let i = 1; i < chunk.length && bestScore > 0; i++) {
        if (chunk[i].rigid > chunk[0].rigid) continue;
        const score = headScore(chunk[i].edge.item);
        if (score < bestScore) { best = i; bestScore = score; }
      }
      if (best) [chunk[0], chunk[best]] = [chunk[best], chunk[0]];
      if (viewMismatch(chunk[0].edge.item)) return { error: viewMismatchReason(chunk[0].edge.item) };
    }
    const head = chunk[0].edge;
    head.item.stuckChildren = chunk.slice(1).map((record) => record.edge).concat(head.item.stuckChildren);
    rebuilt.push(head);
  }
  let rigidOut = rootRigid, promoted = 0;
  if (rebuilt.length + rootRigid.length > STASH_MAX_IMMEDIATE && rootRigid.length > 1) {
    const regrouped = promoteRigidGroups(rootRigid, Math.max(1, STASH_MAX_IMMEDIATE - rebuilt.length));
    if (regrouped.error) return regrouped;
    rigidOut = regrouped.edges;
    promoted = regrouped.promoted;
  }
  if (rebuilt.length + rigidOut.length > STASH_MAX_IMMEDIATE) return { error: "too many parts on one part to regroup" };
  if (!records.length && !promoted) return {};
  item.stuckChildren = rebuilt.concat(rigidOut);
  return { changed: true };
}

const stashSafeStats = (s) => !s.malformed && s.descendants <= STASH_MAX_DESCENDANTS &&
  s.maxImmediate <= STASH_MAX_IMMEDIATE && s.maxDepth <= STASH_MAX_DEPTH;

// What the paced spawner makes of `root`: { before, after, stashSafe, regrouped, failure }. `failure` names why the
// regroup could not run; the spawner then builds the invention exactly as authored (`after` = `before`).
export function predictPacedNormalizer(root) {
  const before = normalizerGraphStats(root);
  const result = (after, regrouped, failure = "") => ({ before, after, stashSafe: stashSafeStats(after), regrouped, failure });
  if (before.malformed || stashSafeStats(before)) return result(before, false);
  const work = normalizerSkeleton(root);
  const stack = [work], seen = new Set();
  let regrouped = false;
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    const step = rebalanceOne(item);
    if (step.error) return result(before, false, step.error);
    if (step.changed) regrouped = true;
    const stuck = item.stuckChildren || [];
    for (let i = stuck.length - 1; i >= 0; i--) if (stuck[i] && stuck[i].item) stack.push(stuck[i].item);
    const other = directNonStuck(item);
    for (let i = other.length - 1; i >= 0; i--) stack.push(other[i]);
  }
  return result(normalizerGraphStats(work), regrouped);
}

// The one stash message the website shows: the invention spawns, but the game will not save it in the stash.
export function stashWarning(prediction) {
  const { after, failure } = prediction;
  const why = [];
  if (after.maxDepth > STASH_MAX_DEPTH) why.push(`it is ${after.maxDepth} stuck levels deep (the stash keeps ${STASH_MAX_DEPTH})`);
  if (after.maxImmediate > STASH_MAX_IMMEDIATE) why.push(`one part has ${after.maxImmediate} parts stuck directly to it (the stash keeps ${STASH_MAX_IMMEDIATE})`);
  return `This invention will spawn, but it cannot be saved in the game's stash${failure ? ` (${failure})` : ""}: ` +
    `${why.join(" and ") || "it is outside the stash limits"}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Validation. Returns { errors: [], warnings: [], infos: [], stats }. `knownIds` (Set) is optional (items.txt).
// ---------------------------------------------------------------------------------------------------------------
export function validateInvention(root, options = {}) {
  const knownIds = options.knownIds instanceof Set ? options.knownIds : null;
  const bannedIds = options.bannedIds instanceof Set ? options.bannedIds : new Set();
  const errors = [], warnings = [], infos = [];
  const stats = { nodes: 0, stuckDescendants: 0, contentsNodes: 0, maxImmediate: 0, maxStuckDepth: 0, maxContentsDepth: 0, guns: 0, emptyGuns: 0, cappedProps: {} };
  if (!root || !root.itemID) { errors.push("The invention has no root itemID."); return { errors, warnings, infos, stats }; }
  if (Number(root.scaleModifier) !== 0) {
    let scaledChild = false;
    forEachNode(root, (item, ctx) => { if (ctx.depth > 0 && Number(item.scaleModifier) !== 0) scaledChild = true; });
    warnings.push(`Root scaleModifier is ${root.scaleModifier}: the spawner's own client stacks the root scale onto children ${scaledChild ? "(this file has scaled children -- they will render extra small/large for the spawner)" : ""}. Keep the root at 0 and hide a tiny root INSIDE the build instead (AUTHORING_GUIDE section 5).`.replace(/\s+\./, "."));
  }
  forEachNode(root, (item, ctx) => {
    stats.nodes++;
    const id = String(item.itemID || "");
    const where = ctx.depth === 0 ? "root" : `${id} (depth ${ctx.depth})`;
    if (ctx.edge) stats.stuckDescendants++;
    if (ctx.edge === null && ctx.depth > 0) stats.contentsNodes++;
    stats.maxStuckDepth = Math.max(stats.maxStuckDepth, ctx.edge ? ctx.depth : 0);
    stats.maxContentsDepth = Math.max(stats.maxContentsDepth, ctx.contentsDepth);
    if (!id) errors.push(`An item at depth ${ctx.depth} has no itemID.`);
    else if (RECORD_ONLY_ITEM_IDS.has(id)) {
      if (ctx.insideBackpack && ctx.contentsDepth > 0) infos.push(`${where}: glitched contents -- it shows as "Unknown Item" with the placeholder thumbnail; taking it out spawns nothing, so it stays inside.`);
      else errors.push(`${where}: ${id} has no prefab, so it can only ride inside a backpack, quiver, ammo pouch or grenade launcher as stored contents (it shows as "Unknown Item").`);
    }
    else if (knownIds && !knownIds.has(id)) errors.push(`Unknown item id "${id}" (not in items.txt): the game cannot spawn it.`);
    // Owner 2026-10-18: non-grabbable catalog items (item_crate, item_nut_drop) may ride INSIDE bags and containers: the game
    // stores contents as ContainedItem records (catalog netID + state), not as spawned objects. They still cannot be the root
    // or a stuck part. BackpackItem.TryGetItemOut spawns the prefab before it checks for a GrabbableItem and keeps the bag
    // entry when that check fails, so every take-out or pour tick leaves one more crate/nut drop in the room.
    // Quiver.TryGetNextItemOut spawns the stored item and removes the record even when it is not grabbable, so each pull
    // materializes exactly one (the quiver empties); BackpackItem.TryGetItemOut removes it only after a successful grab, so a
    // bag spawns a new one on every take-out or pour and keeps it (decompile 25996600; a player spawned crates this way).
    if (NON_GOOP_PREFAB_IDS.has(id) && ctx.contentsDepth > 0) warnings.push(nonGrabbableContentsNote(id, where, ctx.parent));
    else if (NON_GOOP_PREFAB_IDS.has(id)) errors.push(`${where}: ${id} has no GrabbableObject in the current game prefab, so it cannot be attached to a goop invention (it can go inside a bag or container).`);
    else if (GROUP2_NULLDATA_IDS.has(id)) {
      if (ctx.edge && Number(ctx.edge.subParentID) !== 0) errors.push(`${id} has no item data in the game's catalog and sits on a stick edge: the loader must DROP it (rigid catalog-miss). Move it to a base edge.`);
      else warnings.push(`${id} has no item data in the game's catalog: the game's own Deserialize drops it; only our loader's direct path spawns it (base edges only).`);
    }
    // Glitched items (owner 2026-10-18): a stored item that the game's own flags keep players from putting in this container.
    const holdingFamily = ctx.edge === null && ctx.contentsDepth > 0 ? containerFamily(ctx.parent?.itemID) : null;
    if (holdingFamily && id && !RECORD_ONLY_ITEM_IDS.has(id) && normallyAllowedIn(id, holdingFamily) === false)
      infos.push(`${where}: glitched -- players cannot put ${id} in a ${CONTAINER_FAMILY_NOUNS[holdingFamily]}; this one rides in from the save${holdingFamily === "launcher" ? " and fires like a grenade" : ""}.`);
    // Owner 2026-10-18: the website and the private courier allow banned items; only A (the public MIKEYBOX code) refuses them.
    if (bannedIds.has(id)) warnings.push(`${where}: ${id} is banned in the public MIKEYBOX room, so a named package leaves it out there. Private deliveries bring it.`);
    if (SELF_MOVING_IDS.has(id)) warnings.push(`${id} moves by itself; the whole invention will drift (AUTHORING_GUIDE section 7).`);
    if (isGun(id)) {
      stats.guns++;
      // A grenade launcher's rounds are its contents, not its ammo number.
      if (!(Number(item.ammo) > 0) && !(GRENADE_LAUNCHER_IDS.has(id) && contentsOf(item).length)) {
        stats.emptyGuns++;
        warnings.push(`${where}: gun spawns EMPTY (ammo ${item.ammo || 0}). Use "Load all guns" or set ammo to ${loadedAmmoFor(id)}.`);
      }
      const cap = exportedGunAmmo.get(id);
      if (cap && Number(item.ammo) !== clampGunAmmo(id, item.ammo))
        warnings.push(`${where}: ammo ${item.ammo} is outside this game's ${cap.min}..${cap.max} range; native load clamps it to ${clampGunAmmo(id, item.ammo)}.`);
    }
    if (CAPPED_PROP_PATTERN.test(id)) { const k = id.replace(/^item_/, "").replace(/_.*$/, ""); stats.cappedProps[k] = (stats.cappedProps[k] || 0) + 1; }
    // stuck edges of THIS item
    const stuck = Array.isArray(item.stuckChildren) ? item.stuckChildren : [];
    if (ctx.insideBackpack && stuck.length) errors.push(`${where}: backpack/quiver inventory flattens items and discards their stuck children. Attach complete inventions to the bag exterior instead.`);
    stats.maxImmediate = Math.max(stats.maxImmediate, stuck.length);
    if (stuck.length && VIEW_SCALE_MISMATCH_PARENTS[id]) warnings.push(`${where}: the game draws parts stuck to this item at ${VIEW_SCALE_MISMATCH_PARENTS[id]}x their distance from it ("offset rows"; the preview shows them there), but they collide and weigh at the full distance. Stick them to another part if that matters.`);
    const frames = subParentFramesFor(id);
    for (const e of stuck) {
      if (!e || !e.item) { errors.push(`${where}: a stuckChildren entry has no item.`); continue; }
      const sub = Number(e.subParentID) || 0;
      const frame = frames.find((f) => f.id === sub);
      if (!frame) errors.push(`${where}: child ${e.item.itemID} uses subParentID ${sub}, but ${id} has no such sub-parent; the game silently re-homes it onto the base with the wrong units (~200x too far for stick numbers).`);
      else if (frame.unknown) infos.push(`${where}: child ${e.item.itemID} rides sub-parent ${sub} ("${frame.name}"); its pos/rot are kept verbatim because that frame has not been probed.`);
      if (Array.isArray(e.pos) && e.pos.some((n) => !Number.isFinite(Number(n)))) errors.push(`${where}: child ${e.item.itemID} has a non-numeric pos.`);
    }
    // contents
    const contents = contentsOf(item);
    // Daisy chains (owner 2026-10-18; decompile 25996600, live on client E): HeartGun.HandleDeserialize attaches its held item
    // only when the heart gun is NOT a nested load. A heart gun loaded straight into a holder is nested, so what it holds
    // drops loose; a heart gun STUCK onto a part of the held invention is deserialized with isNestedItem=0 and holds.
    if (id === "item_heart_gun" && contents.length && ctx.edge === null && ctx.parent &&
        containerRule(ctx.parent.itemID)?.kind === "holder") {
      warnings.push(`${where}: a heart gun loaded straight into ${ctx.parent.itemID} drops what it holds (${contents[0].itemID} spawns loose). To chain heart guns, stick this heart gun onto a part of the loaded invention instead.`);
    }
    if (contents.length) {
      const rule = containerRule(id);
      if (!rule) warnings.push(`${where}: ${contents.length} item(s) in children/contents, but ${id} is not a known container (backpack, quiver, ammo pouch, grenade launcher, crossbow, heart gun, salmon cannon, tripod); they may be dropped.`);
      // BackpackItem.AddItemFromState stores at most ONE child per stored item (decompile 25996600): a heart gun or crossbow
      // keeps its one held item inside a bag, but a bag or quiver inside a bag keeps only its first item.
      else if (["quiver", "pouch", "launcher"].includes(containerFamily(ctx.parent?.itemID)) && ctx.edge === null) warnings.push(`${where}: a ${CONTAINER_FAMILY_NOUNS[containerFamily(ctx.parent?.itemID)]} stores items without their own contents, so the ${contents.length} item(s) inside ${id} are dropped.`);
      else if (ctx.insideBackpack && contents.length > 1) warnings.push(`${where}: inside a bag, ${id} keeps only its first item (the game stores one item per stored item); the other ${contents.length - 1} are dropped.`);
      else if (contents.length > rule.capacity) warnings.push(`${where}: ${contents.length} contents exceed the ${rule.capacity} seen to work for ${id} (${rule.label}).`);
      if (contents.length > MAX_CONTENTS_PER_CONTAINER) errors.push(`${where}: ${contents.length} contents exceed the game's per-container cap of ${MAX_CONTENTS_PER_CONTAINER}; the rest are silently truncated.`);
      // Quiver.TryGetNextItemOut gives out the LAST listed item first and stops (without removing it) when the spawn yields
      // nothing, so an Unknown Item blocks every item listed before it (live on client E 2026-10-18).
      // AmmoPouch.TryGetNextItemOut also takes the last item (unless a round matches the gun in the other hand) and stops on
      // an empty item id; GrenadeLauncher.TryRemoveNextItem takes the FIRST item and stops the same way (decompile 25996600).
      const family = containerFamily(id);
      if (family === "quiver" || family === "pouch" || family === "launcher") {
        const ids = contents.map((c) => String(c?.itemID || ""));
        const noun = CONTAINER_FAMILY_NOUNS[family];
        if (family === "launcher") {
          const first = ids.indexOf("item_unidentified");
          const blocked = first >= 0 ? ids.slice(first + 1).filter((x) => x !== "item_unidentified").length : 0;
          if (blocked) warnings.push(`${where}: a grenade launcher fires its first item first, and item_unidentified never fires, so it jams the launcher: the ${blocked} item(s) listed after it never fire. Move Unknown Items to the end of the list.`);
        } else {
          const top = ids.lastIndexOf("item_unidentified");
          const blocked = top > 0 ? ids.slice(0, top).filter((x) => x !== "item_unidentified").length : 0;
          if (blocked) warnings.push(`${where}: ${family === "quiver" ? "a quiver gives out its last item first" : "an ammo pouch gives out its last item first (or the newest round for the gun in your other hand)"}, and item_unidentified never comes out, so it jams the ${noun}: the ${blocked} item(s) listed before it can never be taken out. Move Unknown Items to the start of the list.`);
        }
      }
      if (ctx.contentsDepth + 1 > MAX_CONTENTS_DEPTH) errors.push(`${where}: contents nested deeper than ${MAX_CONTENTS_DEPTH} containers are silently emptied by the game (MAX_ITEM_CHILD_DEPTH).`);
    }
  });
  // Stash caps (owner 2026-10-12): only the 512-part total blocks. More than 32 stuck children or 32 stuck levels is the
  // paced spawner's normalizer's job; the website warns only when its RESULT still cannot be saved in the stash.
  if (stats.nodes - 1 > STASH_MAX_DESCENDANTS) errors.push(`${stats.nodes - 1} total descendants exceed the game's shared 512-node budget (stuck children and container contents both count). Remove nodes before sending.`);
  else {
    const paced = predictPacedNormalizer(root);
    stats.stashSafeAfterSpawn = paced.stashSafe;
    if (!paced.stashSafe && !paced.before.malformed) warnings.push(stashWarning(paced));
  }
  const total = stats.nodes - stats.contentsNodes;
  if (total > MACHINE_SAVE_TOTAL_CAP) infos.push(`${total} items: over the goop machine's ${MACHINE_SAVE_TOTAL_CAP}-item save cap (load-only; fine for the menu / Send To Game).`);
  for (const [k, n] of Object.entries(stats.cappedProps)) if (n > MACHINE_SAVE_PROP_CAP) infos.push(`${n} x ${k}: over the machine's ${MACHINE_SAVE_PROP_CAP}-per-type cap (load-only).`);
  return { errors, warnings, infos, stats };
}
