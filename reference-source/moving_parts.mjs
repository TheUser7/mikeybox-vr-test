// moving_parts.mjs -- preview-only motion of the parts that move in game (owner 2026-10-16): joystick sticks and tripod
// heads, with everything that rides on them. Plain arrays in the game's item-local frame (Unity numbers, metres), like
// goop_rules.mjs and film_gear.mjs. Nothing here touches invention JSON; a stuck child keeps its rest-frame edge and is
// only DRAWN on the moved part (app.js hangs it from a mount whose matrix is the delta below).
//
// Survey of build 25969047 (latest_decompile, il2cpp dump, prefab hierarchy in resources.assets):
//  - item_joystick / item_joystick_inv_y: JoystickItem.FixedUpdate slerps _joystickRoot.localRotation toward
//    Euler(y * 30, x * 30, 0) degrees, where (x, y) is the holder's thumbstick (-1..1, +y = pushed forward; _inverseY on
//    item_joystick_inv_y negates y). _joystickRoot is Root/Collider/Joystick/Stick, the very transform of NetParent @1
//    (rest localRotation identity), and the visible stick mesh copies it (GrabbableObjectSubRoot._subViewRoot). So the
//    stick and every part stuck at @1 tilt about the @1 frame origin, up to 30 degrees on each axis. Parts on @0 (the
//    base) stay put. A joystick on another joystick's stick tilts on top of that one's tilt, as in game.
//    Whose thumbstick (GrabbableObject.UpdateControllerInput): a linked remote's provider; else the stuck parent's input,
//    so every joystick in a held invention follows the hand holding its root; else the hand grabbing the joystick.
//  - item_film_tripod: TripodSwivelItem.ApplyHeadRotation sets _headPivot.localRotation = Euler(-pitch, yaw, 0); yaw is
//    0..360 and pitch clamps to the prefab's _pitchMin.._pitchMax (film_gear_anchors.json "head"; -60..45 in this build).
//    Players aim it by holding the pan bar. The Mount (the tripod's mounted camera / light / mic = its children[0]) and
//    the Cradle mesh ride the head. Stuck children sit on the tripod's only NetParent (Root) and do not move.
//  - item_robot_arm_* (4 variants): already move in the editor; each copies the wearer ghost's arm (app.js
//    poseRobotArmsIn), so posing the ghost moves the arm and its @1-@3 parts.
//  - Every other stick-driven item (remote controller, film camera zoom, directors tablet, can light, boom mic, gamebox)
//    changes no geometry that carries attachments, and every other item's only NetParent is its root
//    (netparent_frames.json: the joysticks and robot arms are the only items with a second frame).

import { physicalScale, qConj, qMul, qNormalize, qRotate, subParentFrame, vScale, vSub } from "./goop_rules.mjs";

export const STICK_TILT_DEG = 30;              // JoystickItem.FixedUpdate: value * 30 degrees per axis
export const JOYSTICK_STICK_FRAME = 1;         // NetParent @1 = _joystickRoot ("Stick")
export const TRIPOD = "item_film_tripod";
const JOYSTICKS = Object.freeze({ item_joystick: { invertY: false }, item_joystick_inv_y: { invertY: true } });
// GLB mesh nodes that are the moving stick (three.js strips the "." of "joystick_stick.001").
export const JOYSTICK_STICK_MESH = /^joystick_stick/;

export function isJoystick(itemID) { return Object.hasOwn(JOYSTICKS, String(itemID || "")); }
export function movingPartKind(itemID) {
  if (isJoystick(itemID)) return "joystick";
  if (itemID === TRIPOD) return "tripod";
  return null;
}

function finite(n) { const v = Number(n); return Number.isFinite(v) ? v : 0; }

// Unity Quaternion.Euler in degrees: rotate about Z, then X, then Y (q = qY * qX * qZ).
export function eulerDeg(x, y, z) {
  const half = Math.PI / 360;
  const qx = [Math.sin(finite(x) * half), 0, 0, Math.cos(finite(x) * half)];
  const qy = [0, Math.sin(finite(y) * half), 0, Math.cos(finite(y) * half)];
  const qz = [0, 0, Math.sin(finite(z) * half), Math.cos(finite(z) * half)];
  return qNormalize(qMul(qMul(qy, qx), qz));
}

// A thumbstick as the game reads it: inside the unit circle (a physical stick cannot reach the square's corners).
export function clampStick(stick) {
  const x = finite(stick?.[0]), y = finite(stick?.[1]);
  const length = Math.hypot(x, y);
  return length > 1 ? [x / length, y / length] : [x, y];
}

export function deadzone(stick, radius = 0.08) {
  const [x, y] = clampStick(stick);
  return Math.hypot(x, y) < radius ? [0, 0] : [x, y];
}

// The stick's localRotation for a thumbstick value (the JoystickItem.FixedUpdate target; the game eases toward it).
export function joystickLocalRotation(itemID, stick) {
  const [x, y] = clampStick(stick);
  const vertical = JOYSTICKS[itemID]?.invertY ? -y : y;
  return eulerDeg(vertical * STICK_TILT_DEG, x * STICK_TILT_DEG, 0);
}

// Turning a part whose rest frame is (pivotPos, pivotRot) by `localRot` in its own frame moves everything on it by
// D = T(P) R(Q) R(local) R(Q)^-1 T(-P) in the item frame: { rot, pos } with world' = rot * world + pos.
export function pivotDelta(pivotPos, pivotRot, localRot) {
  const q = qNormalize(pivotRot);
  const rot = qNormalize(qMul(qMul(q, qNormalize(localRot)), qConj(q)));
  return { rot, pos: vSub(pivotPos, qRotate(rot, pivotPos)) };
}

// Delta of a joystick's stick (and its @1 parts) in the joystick's record frame, scaled like the item.
export function joystickDelta(itemID, scaleModifier, stick) {
  if (!isJoystick(itemID)) return null;
  const frame = subParentFrame(itemID, JOYSTICK_STICK_FRAME);
  if (!frame || frame.unknown) return null;
  return pivotDelta(vScale(frame.pos, physicalScale(scaleModifier, itemID)), frame.rot, joystickLocalRotation(itemID, stick));
}

// Tripod head aim as the game keeps it: yaw wrapped into 0..360, pitch clamped to the prefab limits.
export function clampTripodAim(head, aim) {
  const yaw = ((finite(aim?.yaw) % 360) + 360) % 360;
  const pitch = Math.min(Number(head?.pitchMax ?? 0), Math.max(Number(head?.pitchMin ?? 0), finite(aim?.pitch)));
  return { yaw, pitch };
}

export function tripodHeadLocalRotation(yaw, pitch) { return eulerDeg(-finite(pitch), finite(yaw), 0); }

// Delta of the tripod head (its Cradle mesh and Mount) in the tripod's record frame. `head` = film_gear.mjs tripodHead().
export function tripodHeadDelta(head, scaleModifier, aim) {
  if (!head) return null;
  const { yaw, pitch } = clampTripodAim(head, aim);
  return pivotDelta(vScale(head.pos, physicalScale(scaleModifier, TRIPOD)), head.rot, tripodHeadLocalRotation(yaw, pitch));
}

// Which thumbstick drives an invention's joysticks: the hand holding its root ("handLeft" / "handRight" preview
// attachment), since stuck parts inherit the root's input. One that is not hand-held follows the stick pushed further.
export function stickForHand(hand, sticks) {
  const left = clampStick(sticks?.left), right = clampStick(sticks?.right);
  if (hand === "handLeft") return left;
  if (hand === "handRight") return right;
  return Math.hypot(...left) > Math.hypot(...right) ? left : right;
}

// Thumbsticks of one Gamepad API / WebXR gamepad, in the game's convention (+y = pushed forward; both APIs report
// forward as negative). A WebXR "xr-standard" controller has its thumbstick on axes 2-3 (0-1 is a touchpad, zero on
// Meta Touch controllers); a "standard" (Xbox-style) pad has the left stick on 0-1 and the right on 2-3. A controller
// that names its hand reports one stick for that hand.
export function gamepadSticks(gamepad, handedness = "") {
  const axes = Array.isArray(gamepad?.axes) || ArrayLike(gamepad?.axes) ? Array.from(gamepad.axes, finite) : null;
  if (!axes || axes.length < 2) return {};
  const hand = ["left", "right"].includes(handedness) ? handedness
    : ["left", "right"].includes(gamepad.hand) ? gamepad.hand
    : /\bleft\b/i.test(gamepad.id || "") ? "left" : /\bright\b/i.test(gamepad.id || "") ? "right" : "";
  const pair = (i) => [axes[i] || 0, -(axes[i + 1] || 0)];
  if (gamepad.mapping === "standard" && !hand) return { left: pair(0), right: axes.length >= 4 ? pair(2) : [0, 0] };
  const stick = axes.length >= 4 ? pair(2) : pair(0);
  if (hand) return { [hand]: stick };
  return { left: stick, right: stick };
}
function ArrayLike(value) { return !!value && typeof value === "object" && Number.isInteger(value.length); }

// Combine every connected pad: each hand takes the stick pushed furthest.
export function mergeSticks(list) {
  const out = { left: [0, 0], right: [0, 0] };
  for (const entry of list) {
    for (const hand of ["left", "right"]) {
      const stick = entry?.[hand] ? deadzone(entry[hand]) : null;
      if (stick && Math.hypot(...stick) > Math.hypot(...out[hand])) out[hand] = stick;
    }
  }
  return out;
}

// "Sweep range" preview: one turn around the rim every `periodSec`, starting pushed forward.
export function sweepStick(seconds, periodSec = 4) {
  const angle = (finite(seconds) / Math.max(0.5, finite(periodSec) || 4)) * 2 * Math.PI;
  return [Math.sin(angle), Math.cos(angle)];
}

// Where the WebXR viewer starts, in the XR world: the editor scene mirrored in X (the game's left-handed numbers drawn in
// WebXR's right-handed space). On the line from the editor camera to the orbit target, between minDistance and
// maxDistance from the target, facing it. With a floor-level space ("local-floor") the floor is lowered so a target below
// `viewHeight` sits at that height; in a head-level space ("local") the head starts `headAbove` over the target.
// Returns { position: [x, y, z] (the reference-space origin in the XR world), yaw (radians about +Y; 0 looks down -Z) }.
export function xrViewerStart(cameraPos, target, { minDistance = 0.45, maxDistance = 0.9, viewHeight = 1.1, floor = true,
  headAbove = 0.15 } = {}) {
  const c = [-finite(cameraPos?.[0]), finite(cameraPos?.[1]), finite(cameraPos?.[2])];
  const t = [-finite(target?.[0]), finite(target?.[1]), finite(target?.[2])];
  let dx = t[0] - c[0], dz = t[2] - c[2];
  let length = Math.hypot(dx, dz);
  if (length < 1e-6) { dx = 0; dz = -1; length = 1; }
  const distance = Math.min(maxDistance, Math.max(minDistance, length));
  const ux = dx / length, uz = dz / length;
  const y = floor ? Math.min(0, t[1] - viewHeight) : t[1] + headAbove;
  return { position: [t[0] - ux * distance, y, t[2] - uz * distance], yaw: Math.atan2(-ux, -uz) };
}
