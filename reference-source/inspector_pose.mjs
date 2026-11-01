// Keep the exact loaded pose when an author re-enters a rounded inspector value.
// The editor's display formatting is UI only; it must never quantize untouched
// axes or turn a no-op into a new stuck edge.
import { editQuaternionComponent } from "./angle_units.mjs";

const POSITION_AXES = { posX: 0, posY: 1, posZ: 2 };
const ROTATION_AXES = { rotX: 0, rotY: 1, rotZ: 2 };
// Quaternion display mode: one exact component, the others rescaled to keep a unit quaternion.
const QUATERNION_COMPONENTS = { rotQX: 0, rotQY: 1, rotQZ: 2, rotQW: 3 };

export function isInspectorPoseField(fieldId) {
  return Object.hasOwn(POSITION_AXES, fieldId) || Object.hasOwn(ROTATION_AXES, fieldId) ||
    Object.hasOwn(QUATERNION_COMPONENTS, fieldId);
}

function normalizedQuaternion(values) {
  if (!Array.isArray(values) || values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("inspector pose requires a finite quaternion");
  }
  const length = Math.hypot(...values);
  if (length < 1e-12) throw new Error("inspector pose requires a nonzero quaternion");
  return values.map((value) => value / length);
}

// Three.js Euler order XYZ, matching app.js's inspector and TransformControls.
function quaternionToEulerXYZ(values) {
  const [x, y, z, w] = normalizedQuaternion(values);
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const pitchY = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    return [Math.atan2(-m23, m33), pitchY, Math.atan2(-m12, m11)];
  }
  return [Math.atan2(m32, m22), pitchY, 0];
}

function eulerXYZToQuaternion([x, y, z]) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return normalizedQuaternion([
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]);
}

export function editInspectorPose({ position, quaternion, fieldId, inputValue, displayedValue, angleUnit = "deg" }) {
  if (!isInspectorPoseField(fieldId)) throw new Error(`unknown inspector pose field: ${fieldId}`);
  if (!Array.isArray(position) || position.length !== 3 || position.some((value) => !Number.isFinite(value))) {
    throw new Error("inspector pose requires a finite position");
  }
  normalizedQuaternion(quaternion);
  const desired = Number(inputValue);
  const baseline = Number(displayedValue);
  if (inputValue === "" || !Number.isFinite(desired) || !Number.isFinite(baseline)) {
    throw new Error("inspector pose value must be finite");
  }
  // The author may type 0.020 into a field that displayed 0.02. The loaded
  // value might be 0.0195942; identical display numbers mean no edit.
  if (desired === baseline) {
    return { position: position.slice(), quaternion: quaternion.slice(), changed: false };
  }
  const nextPosition = position.slice();
  const nextQuaternion = quaternion.slice();
  if (Object.hasOwn(POSITION_AXES, fieldId)) {
    nextPosition[POSITION_AXES[fieldId]] = desired;
    return { position: nextPosition, quaternion: nextQuaternion, changed: nextPosition.some((value, i) => value !== position[i]) };
  }
  if (Object.hasOwn(QUATERNION_COMPONENTS, fieldId)) {
    return { position: nextPosition, quaternion: editQuaternionComponent(normalizedQuaternion(quaternion),
      QUATERNION_COMPONENTS[fieldId], desired), changed: true };
  }
  const euler = quaternionToEulerXYZ(quaternion);
  euler[ROTATION_AXES[fieldId]] = angleUnit === "rad" ? desired : desired * Math.PI / 180;
  return { position: nextPosition, quaternion: eulerXYZToQuaternion(euler), changed: true };
}

// Plain [x, y, z, w] quaternion helpers in Three.js's Hamilton convention.
function multiplyQuaternions([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function rotateVector([qx, qy, qz, qw], [vx, vy, vz]) {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

function finiteVector(values, label) {
  if (!Array.isArray(values) || values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} requires a finite position`);
  }
  return values;
}

// The Properties fields show the active item's pose relative to its parent.
// With several items selected, the typed change becomes one world-space move or
// turn shared by every independent selected item, exactly as if the Move or
// Rotate handle had made it: a move translates each item by the same world
// offset, and a turn orbits each item around the shared pivot. Each item keeps
// its own parent, document, and stuck children; the caller re-solves its edge.
//
// primary: { position, quaternion, parentWorldQuaternion } -- the active item's
//   local pose and its parent's world rotation (editor groups carry no scale).
// entries: [{ worldPosition, worldQuaternion }] -- the editable items to move.
// pivot: [x, y, z] -- the Rotate handle's pivot for these entries.
export function planInspectorGroupPose({ primary, entries, pivot, fieldId, inputValue, displayedValue, angleUnit = "deg" }) {
  if (!primary) throw new Error("inspector group pose requires the active item");
  const parentWorldQuaternion = normalizedQuaternion(primary.parentWorldQuaternion || [0, 0, 0, 1]);
  const edited = editInspectorPose({ position: primary.position, quaternion: primary.quaternion,
    fieldId, inputValue, displayedValue, angleUnit });
  const current = (entries || []).map((entry, index) => ({
    worldPosition: finiteVector(entry.worldPosition, `entry ${index}`).slice(),
    worldQuaternion: normalizedQuaternion(entry.worldQuaternion),
  }));
  if (!edited.changed) return { changed: false, kind: null, primary: edited, entries: current };
  if (Object.hasOwn(POSITION_AXES, fieldId)) {
    const localDelta = edited.position.map((value, axis) => value - primary.position[axis]);
    const worldDelta = rotateVector(parentWorldQuaternion, localDelta);
    return {
      changed: true, kind: "move", worldDelta, primary: edited,
      entries: current.map((entry) => ({
        worldPosition: entry.worldPosition.map((value, axis) => value + worldDelta[axis]),
        worldQuaternion: entry.worldQuaternion,
      })),
    };
  }
  finiteVector(pivot, "rotation pivot");
  const before = normalizedQuaternion(multiplyQuaternions(parentWorldQuaternion, normalizedQuaternion(primary.quaternion)));
  const after = normalizedQuaternion(multiplyQuaternions(parentWorldQuaternion, edited.quaternion));
  const worldRotation = normalizedQuaternion(multiplyQuaternions(after,
    [-before[0], -before[1], -before[2], before[3]]));
  return {
    changed: true, kind: "rotate", worldRotation, primary: edited,
    entries: current.map((entry) => {
      const offset = entry.worldPosition.map((value, axis) => value - pivot[axis]);
      const turned = rotateVector(worldRotation, offset);
      return {
        worldPosition: turned.map((value, axis) => value + pivot[axis]),
        worldQuaternion: normalizedQuaternion(multiplyQuaternions(worldRotation, entry.worldQuaternion)),
      };
    }),
  };
}

// TURN IN PLACE (owner 2026-10-09: "rotate an item without changing its position"). A part's origin is often not the
// middle of its model, so turning it about the origin swings the model away from where it sat. Turning about the
// model's own centre keeps that centre, and so where the part sits on its parent, exactly where it was.
export function turnAboutCentre({ worldPosition, worldQuaternion, centre, rotation }) {
  const q = normalizedQuaternion(rotation);
  const c = finiteVector(centre, "turn centre");
  const offset = finiteVector(worldPosition, "part position").map((value, axis) => value - c[axis]);
  const turned = rotateVector(q, offset);
  return {
    worldPosition: turned.map((value, axis) => value + c[axis]),
    worldQuaternion: normalizedQuaternion(multiplyQuaternions(q, normalizedQuaternion(worldQuaternion))),
  };
}
