// Ghost-player pose model, driven the way Animal Company drives a player avatar.
// Preview only: a pose never changes invention JSON.
//
// Game behaviour (build 25766246 decompile, latest_decompile/ns_AnimalCompany.c):
// - PlayerView.UpdateTransforms puts IK_Camera at the headset pose. Every avatar
//   bone hangs from Armature/Head, so turning the head turns the whole body
//   (torso, spine, both shoulders). There is no separate torso control.
// - Arms: Animation Rigging TwoBoneIKConstraint (root Arm, mid Arm_Lower, tip Hand),
//   hint weight 0, solved from the base pose (UnityEngine SolveTwoBoneIK). The Hand
//   bone takes the controller target's rotation exactly. The player controls each
//   hand's position and rotation; shoulders and elbows follow.
// - Fingers: PlayerFingerView lerps each finger bone from bind toward
//   bind * Euler(0, 0, angle) by its input (index = trigger, pinky = grip, thumb =
//   0 / 0.1 touched / 1 pressed). Default angles below; right hand negated.
// - Held items follow the controller anchor (the hand target), back and hip items
//   follow the Spine bone (SkinnedAttachmentPoint.LateUpdate).
//
// All math uses row-major 4x4 arrays in the rig's rest AvatarView space (the bind
// matrices of exported_player_rigs/*_arm_skin.json): +X right, +Y up, +Z forward.
// Hand targets live in this space, so turning the head leaves the hands in place,
// exactly as tracked controllers stay where they are.
import { matrix4, multiply4, inverseAffine4, decomposeTRS, composeTRS, posedBoneMatrices } from "./arm_pose_math.mjs";

export const GHOST_POSE_SCHEMA = "goop-editor.ghost-pose.v1";
export const SIDES = ["left", "right"];
export const FINGERS = ["index", "pinky", "thumb"];
const SIDE_SUFFIX = { left: "L", right: "R" };
const FINGER_BONE = { index: "Index", pinky: "Pinky", thumb: "Thumb" };

// PlayerFingerView default closed angles (degrees about bone-local Z) for the
// base, middle, and end bones; build 25766246 cctor (ns_AnimalCompany.c ~1524441).
// Arm body parts may override them; those come from the rig export (fingerSettings).
export const DEFAULT_FINGER_ANGLES = { thumb: [15, 60, 75], index: [55, 55, 77], pinky: [55, 55, 77] };
export const THUMB_STATES = [{ value: 0, label: "Up" }, { value: 0.1, label: "Resting on a button" }, { value: 1, label: "Pressed" }];

export function jointLabel(key) {
  const labels = { head: "Head and body", shoulder: "shoulder", elbow: "elbow", wrist: "hand" };
  const [name, side] = String(key).split(".");
  if (!side) return labels[name] || name;
  return `${side === "left" ? "Left" : "Right"} ${labels[name] || name}`;
}

export function jointKeys() {
  return ["head", ...SIDES.flatMap((side) => ["shoulder", "elbow", "wrist"].map((name) => `${name}.${side}`))];
}

export function jointPaths(skin) {
  const paths = new Map();
  const byName = new Map();
  for (const bone of skin?.bones || []) byName.set(bone.path.split("/").pop(), bone.path);
  const put = (key, name) => { if (byName.has(name)) paths.set(key, byName.get(name)); };
  put("head", "Head");
  put("spine", "Spine");
  for (const side of SIDES) {
    const s = SIDE_SUFFIX[side];
    put(`shoulder.${side}`, `Arm.${s}`);
    put(`elbow.${side}`, `Arm_Lower.${s}`);
    put(`wrist.${side}`, `Hand.${s}`);
    for (const finger of FINGERS) {
      put(`${finger}1.${side}`, `${FINGER_BONE[finger]}_1.${s}`);
      put(`${finger}2.${side}`, `${FINGER_BONE[finger]}_2.${s}`);
      put(`${finger}3.${side}`, `${FINGER_BONE[finger]}_End.${s}`);
    }
  }
  return paths;
}

const IDENTITY_Q = [0, 0, 0, 1];

export function emptyGhostPose() {
  return {
    schema: GHOST_POSE_SCHEMA,
    head: IDENTITY_Q.slice(),
    hands: Object.fromEntries(SIDES.map((side) => [side, { offset: [0, 0, 0], rotation: IDENTITY_Q.slice() }])),
    fingers: Object.fromEntries(SIDES.map((side) => [side, { index: 0, pinky: 0, thumb: 0 }])),
  };
}

function finiteQuat(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const q = value.map(Number);
  if (q.some((x) => !Number.isFinite(x))) return null;
  const n = Math.hypot(...q);
  if (n < 1e-9) return null;
  const out = q.map((x) => x / n);
  return (out[3] < 0 ? out.map((x) => -x) : out).map((x) => x || 0);
}

function finiteVec(value, limit) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const v = value.map(Number);
  return v.every(Number.isFinite) ? v.map((x) => Math.max(-limit, Math.min(limit, x))) : null;
}

// Accept saved or shared data defensively.
export function normalizeGhostPose(raw) {
  const pose = emptyGhostPose();
  if (!raw || typeof raw !== "object") return pose;
  pose.head = finiteQuat(raw.head) || IDENTITY_Q.slice();
  for (const side of SIDES) {
    pose.hands[side].offset = finiteVec(raw.hands?.[side]?.offset, 3) || [0, 0, 0];
    pose.hands[side].rotation = finiteQuat(raw.hands?.[side]?.rotation) || IDENTITY_Q.slice();
    for (const finger of FINGERS) {
      const value = Number(raw.fingers?.[side]?.[finger]);
      pose.fingers[side][finger] = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    }
  }
  return pose;
}

const nearIdentity = (q) => Math.abs(Math.abs(q[3]) - 1) < 1e-9;
export function poseIsNeutral(pose) {
  const p = normalizeGhostPose(pose);
  return nearIdentity(p.head) && SIDES.every((side) => nearIdentity(p.hands[side].rotation) &&
    p.hands[side].offset.every((x) => Math.abs(x) < 1e-9) && FINGERS.every((finger) => !p.fingers[side][finger]));
}

// ---- quaternion / 3x3 helpers (row-major) ----
function qmul([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
function qnorm(q) { const n = Math.hypot(...q) || 1; return q.map((x) => x / n); }
const qinv = ([x, y, z, w]) => [-x, -y, -z, w];
function qaxis(axis, radians) {
  const n = Math.hypot(...axis) || 1, s = Math.sin(radians / 2) / n;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(radians / 2)];
}
function qrot(q, v) { const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q)); return [r[0], r[1], r[2]]; }
function qFromMatrix(m) { return finiteQuat(decomposeTRS(m).quaternion); }
// Unity Quaternion.Lerp: component lerp of the shorter arc, normalised.
function qlerp(a, b, t) {
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  return qnorm(a.map((x, i) => x + (sign * b[i] - x) * t));
}
// Unity Quaternion.FromToRotation.
function qFromTo(a, b) {
  const u = unit(a), v = unit(b);
  if (!u || !v) return IDENTITY_Q.slice();
  const c = dot(u, v);
  if (c > 1 - 1e-12) return IDENTITY_Q.slice();
  if (c < -1 + 1e-12) {
    const axis = Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]);
    return qaxis(axis, Math.PI);
  }
  return qaxis(cross(u, v), Math.acos(c));
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a);
const unit = (a) => { const n = len(a); return n > 1e-12 ? scale(a, 1 / n) : null; };
const position = (m) => [m[3], m[7], m[11]];
const lossyScale = (m) => [Math.hypot(m[0], m[4], m[8]), Math.hypot(m[1], m[5], m[9]), Math.hypot(m[2], m[6], m[10])];

// Yaw (about +Y), pitch (about +X), roll (about +Z), applied in that order: Unity's ZXY Euler order.
export function quatFromYawPitchRoll(yaw = 0, pitch = 0, roll = 0) {
  const r = Math.PI / 180;
  return qnorm(qmul(qmul(qaxis([0, 1, 0], yaw * r), qaxis([1, 0, 0], pitch * r)), qaxis([0, 0, 1], roll * r)));
}
export function yawPitchRollFromQuat(q) {
  const [x, y, z, w] = qnorm(q);
  const m10 = 2 * (x * y + z * w), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - x * w);
  const m02 = 2 * (x * z + y * w), m22 = 1 - 2 * (x * x + y * y), m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - z * w);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -m12)));
  let yaw, roll;
  if (Math.abs(m12) < 0.9999999) { yaw = Math.atan2(m02, m22); roll = Math.atan2(m10, m11); }
  else { yaw = Math.atan2(-2 * (x * z - y * w), m00); roll = 0; void m01; }
  return [yaw, pitch, roll].map((v) => v * 180 / Math.PI);
}

function boneByPath(skin) { return new Map(skin.bones.map((bone) => [bone.path, bone])); }
function bindLocalQuat(bone) { return qFromMatrix(matrix4(bone.localBindMatrix)); }

// Per-animal finger closing angles: rig export first, game defaults otherwise.
export function fingerAngles(skin, side, finger) {
  const custom = skin?.fingerSettings?.[finger];
  const angles = Array.isArray(custom) && custom.length === 3 ? custom : null;
  const base = angles ? angles.map((euler) => (Array.isArray(euler) ? euler : [0, 0, Number(euler) || 0]))
    : DEFAULT_FINGER_ANGLES[finger].map((z) => [0, 0, z]);
  return base.map(([x, y, z]) => (side === "right" ? [-x || 0, -y || 0, -z || 0] : [x, y, z]));
}

function unityEulerQuat([x, y, z]) { // Unity Quaternion.Euler: Z, then X, then Y
  const r = Math.PI / 180;
  return qnorm(qmul(qmul(qaxis([0, 1, 0], y * r), qaxis([1, 0, 0], x * r)), qaxis([0, 0, 1], z * r)));
}

// The rest (bind) pose of each hand in rest AvatarView space.
export function restHands(skin) {
  const rig = posedBoneMatrices(skin.bones, {}, {});
  const paths = jointPaths(skin);
  return Object.fromEntries(SIDES.map((side) => {
    const m = rig.worldByPath.get(paths.get(`wrist.${side}`));
    return [side, { position: position(m), rotation: qFromMatrix(m), scale: lossyScale(m) }];
  }));
}

// Hand target (the Hand bone's commanded world pose) for a side.
export function handTarget(skin, pose, side, rest = restHands(skin)) {
  const hand = normalizeGhostPose(pose).hands[side];
  return { position: add(rest[side].position, hand.offset), rotation: qnorm(qmul(hand.rotation, rest[side].rotation)), scale: rest[side].scale };
}

// UnityEngine.Animations.Rigging SolveTwoBoneIK with hint weight 0 and full
// position/rotation weights, from the given base pose world matrices.
function solveTwoBone(rootW, midW, tipW, target) {
  const a = position(rootW), b = position(midW), c = position(tipW), t = target.position;
  const ab = sub(b, a), bc = sub(c, b), ac = sub(c, a), at = sub(t, a);
  const abLen = len(ab), bcLen = len(bc);
  const triangle = (side) => Math.acos(Math.max(-1, Math.min(1, (abLen * abLen + bcLen * bcLen - side * side) / (abLen * bcLen) / 2)));
  const oldAngle = triangle(len(ac)), newAngle = triangle(len(at));
  let axis = cross(ab, bc);
  if (len(axis) < 1e-5) {
    axis = cross(at, bc);
    if (len(axis) < 1e-5) axis = [0, 1, 0];
  }
  const midRot = qaxis(axis, oldAngle - newAngle);
  const midQ = qnorm(qmul(midRot, qFromMatrix(midW)));
  const tipAfterMid = add(b, qrot(midRot, bc));
  const rootTurn = qFromTo(sub(tipAfterMid, a), at);
  return {
    root: qnorm(qmul(rootTurn, qFromMatrix(rootW))),
    mid: qnorm(qmul(rootTurn, midQ)),
    tip: qnorm(target.rotation),
  };
}

// Pose the whole rig. Returns posedBoneMatrices output plus hand targets
// (row-major 4x4, rest AvatarView space) that held items follow.
export function posedGhostRig(skin, pose) {
  const p = normalizeGhostPose(pose);
  const bones = boneByPath(skin);
  const paths = jointPaths(skin);
  const overrides = {};
  const headPath = paths.get("head");
  if (headPath && !nearIdentity(p.head)) {
    // Head turns about its own origin in rest AvatarView axes: world = R * bindWorld.
    const bindWorld = qFromMatrix(matrix4(bones.get(headPath).worldBindMatrix));
    const bindLocal = bindLocalQuat(bones.get(headPath));
    const parentWorld = qnorm(qmul(bindWorld, qinv(bindLocal)));
    overrides[headPath] = qnorm(qmul(qinv(parentWorld), qmul(p.head, bindWorld)));
  }
  for (const side of SIDES) for (const finger of FINGERS) {
    const amount = p.fingers[side][finger];
    if (!amount) continue;
    fingerAngles(skin, side, finger).forEach((euler, index) => {
      const path = paths.get(`${finger}${index + 1}.${side}`);
      if (!path) return;
      const bind = bindLocalQuat(bones.get(path));
      overrides[path] = qlerp(bind, qnorm(qmul(bind, unityEulerQuat(euler))), amount);
    });
  }
  const base = posedBoneMatrices(skin.bones, {}, overrides);
  const rest = restHands(skin);
  const targets = {};
  for (const side of SIDES) {
    const [root, mid, tip] = ["shoulder", "elbow", "wrist"].map((name) => paths.get(`${name}.${side}`));
    if (!root || !mid || !tip) continue;
    const target = handTarget(skin, p, side, rest);
    targets[side] = composeTRS(target.position, target.rotation, target.scale);
    const solved = solveTwoBone(base.worldByPath.get(root), base.worldByPath.get(mid), base.worldByPath.get(tip), target);
    const parentOf = (path) => {
      const bone = bones.get(path);
      return bone.parent ? qFromMatrix(base.worldByPath.get(bone.parent)) : IDENTITY_Q;
    };
    overrides[root] = qnorm(qmul(qinv(parentOf(root)), solved.root));
    overrides[mid] = qnorm(qmul(qinv(solved.root), solved.mid));
    overrides[tip] = qnorm(qmul(qinv(solved.mid), solved.tip));
  }
  const rig = posedBoneMatrices(skin.bones, {}, overrides);
  rig.handTargets = targets;
  return rig;
}

// ---- editing operations (all return a new normalised pose) ----
export function setHeadYawPitchRoll(pose, [yaw, pitch, roll]) {
  const next = normalizeGhostPose(pose);
  next.head = finiteQuat(quatFromYawPitchRoll(yaw, pitch, roll));
  return next;
}
export function headYawPitchRoll(pose) { return yawPitchRollFromQuat(normalizeGhostPose(pose).head); }

export function setHandOffsetAndTurn(pose, side, offset, [yaw, pitch, roll]) {
  const next = normalizeGhostPose(pose);
  next.hands[side] = { offset: finiteVec(offset, 3) || [0, 0, 0], rotation: finiteQuat(quatFromYawPitchRoll(yaw, pitch, roll)) };
  return next;
}
export function handOffsetAndTurn(pose, side) {
  const hand = normalizeGhostPose(pose).hands[side];
  return { offset: hand.offset.slice(), turn: yawPitchRollFromQuat(hand.rotation) };
}

// Place a hand at a world (rest AvatarView) position and, optionally, rotation.
export function setHandTargetWorld(skin, pose, side, targetPosition, targetRotation = null) {
  const next = normalizeGhostPose(pose);
  const rest = restHands(skin)[side];
  next.hands[side].offset = finiteVec(sub(targetPosition, rest.position), 3) || next.hands[side].offset;
  if (targetRotation) next.hands[side].rotation = finiteQuat(qmul(qnorm(targetRotation), qinv(rest.rotation)));
  return next;
}

// Turn the whole head/body so the Head bone has this world rotation.
export function setHeadWorldRotation(skin, pose, worldRotation) {
  const path = jointPaths(skin).get("head");
  const next = normalizeGhostPose(pose);
  if (!path) return next;
  const bindWorld = qFromMatrix(matrix4(boneByPath(skin).get(path).worldBindMatrix));
  next.head = finiteQuat(qmul(qnorm(worldRotation), qinv(bindWorld)));
  return next;
}

// Rotating a shoulder or elbow handle swings the hand around that joint; the
// game's IK then redraws the arm for the new hand pose.
export function rotateArmAboutJoint(skin, pose, key, worldDelta) {
  const [name, side] = key.split(".");
  if (!side || name === "wrist") return normalizeGhostPose(pose);
  const rig = posedGhostRig(skin, pose);
  const pivot = position(rig.worldByPath.get(jointPaths(skin).get(key)));
  const target = handTarget(skin, pose, side);
  const d = qnorm(worldDelta);
  return setHandTargetWorld(skin, pose, side, add(pivot, qrot(d, sub(target.position, pivot))), qmul(d, target.rotation));
}

export function mirrorGhostPose(pose, from = "left") {
  const p = normalizeGhostPose(pose);
  const to = from === "left" ? "right" : "left";
  const hand = p.hands[from];
  // Reflect through the avatar's X = 0 plane: positions negate X, rotations (x, -y, -z, w).
  p.hands[to] = { offset: [-hand.offset[0], hand.offset[1], hand.offset[2]],
    rotation: finiteQuat([hand.rotation[0], -hand.rotation[1], -hand.rotation[2], hand.rotation[3]]) };
  p.fingers[to] = { ...p.fingers[from] };
  return p;
}

// Quaternion view of a joint's editable turn (Quaternion rotation display): the head's turn, or a hand's turn from
// its rest pose. Shoulders and elbows act through the hand, so they have none.
export function jointRotation(pose, key) {
  const p = normalizeGhostPose(pose);
  if (key === "head") return p.head.slice();
  const [name, side] = String(key).split(".");
  return name === "wrist" && p.hands[side] ? p.hands[side].rotation.slice() : null;
}

export function setJointRotation(pose, key, quaternion) {
  const next = normalizeGhostPose(pose);
  const turn = finiteQuat(quaternion);
  if (!turn) return next;
  const [name, side] = String(key).split(".");
  if (key === "head") next.head = turn;
  else if (name === "wrist" && next.hands[side]) next.hands[side].rotation = turn;
  return normalizeGhostPose(next);
}

export function wristPosition(skin, pose, side) {
  const m = posedGhostRig(skin, pose).worldByPath.get(jointPaths(skin).get(`wrist.${side}`));
  return m ? position(m) : null;
}

// Presets place hands relative to each animal's shoulders and arm length.
export const POSE_PRESETS = [
  { id: "neutral", label: "Game neutral (rest pose)" },
  { id: "forward", label: "Both hands forward (holding)" },
  { id: "aimRight", label: "Aim with right hand" },
  { id: "aimLeft", label: "Aim with left hand" },
  { id: "twoHand", label: "Two-handed hold" },
  { id: "raised", label: "Both hands raised" },
  { id: "tpose", label: "Arms out to the sides" },
  { id: "fists", label: "Make fists (grip + trigger + thumb)" },
  { id: "openHands", label: "Open hands" },
  { id: "pointRight", label: "Point with right index" },
];

export function applyPosePreset(skin, pose, presetId) {
  let next = normalizeGhostPose(pose);
  if (presetId === "neutral") return emptyGhostPose();
  if (presetId === "fists" || presetId === "openHands") {
    for (const side of SIDES) next.fingers[side] = presetId === "fists" ? { index: 1, pinky: 1, thumb: 1 } : { index: 0, pinky: 0, thumb: 0 };
    return next;
  }
  if (presetId === "pointRight") { next.fingers.right = { index: 0, pinky: 1, thumb: 1 }; return next; }
  const rig = posedBoneMatrices(skin.bones, {}, {});
  const paths = jointPaths(skin);
  const reach = {};
  for (const side of SIDES) {
    const S = position(rig.worldByPath.get(paths.get(`shoulder.${side}`)));
    const E = position(rig.worldByPath.get(paths.get(`elbow.${side}`)));
    const H = position(rig.worldByPath.get(paths.get(`wrist.${side}`)));
    reach[side] = { S, length: len(sub(E, S)) + len(sub(H, E)) };
  }
  const mid = scale(add(reach.left.S, reach.right.S), 0.5);
  const at = (side, d) => add(reach[side].S, scale(d, reach[side].length));
  const near = (side, d) => add(mid, scale(d, reach[side].length));
  const targets = {
    forward: { left: at("left", [0.15, -0.25, 0.75]), right: at("right", [-0.15, -0.25, 0.75]) },
    aimRight: { right: near("right", [0.05, 0.08, 0.9]) },
    aimLeft: { left: near("left", [-0.05, 0.08, 0.9]) },
    twoHand: { right: near("right", [0.12, -0.05, 0.55]), left: near("left", [0, 0, 0.95]) },
    raised: { left: at("left", [-0.2, 0.9, 0.1]), right: at("right", [0.2, 0.9, 0.1]) },
    tpose: { left: at("left", [-0.97, 0, 0]), right: at("right", [0.97, 0, 0]) },
  }[presetId];
  if (!targets) return next;
  for (const side of SIDES) if (targets[side]) next = setHandTargetWorld(skin, next, side, targets[side]);
  return next;
}
