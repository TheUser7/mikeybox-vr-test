// Angle display units and angle snapping, shared by the item inspector, ghost posing and every mouse rotation.
// Internally the editor works in radians and unit quaternions [x, y, z, w]; these helpers only convert at the edges.

export const ANGLE_UNITS = Object.freeze(["deg", "rad"]);
export const ROTATION_DISPLAYS = Object.freeze(["euler", "quat"]);
export const DEFAULT_ANGLE_STEP_RAD = Math.PI / 12;   // 15 degrees, the editor's long-standing rotate snap
const MAX_STEP_RAD = 2 * Math.PI;

export function normalizeAngleUnit(unit) { return unit === "rad" ? "rad" : "deg"; }
export function normalizeRotationDisplay(mode) { return mode === "quat" ? "quat" : "euler"; }

export function toDisplayAngle(radians, unit) {
  const value = Number(radians);
  if (!Number.isFinite(value)) return NaN;
  return normalizeAngleUnit(unit) === "rad" ? value : value * 180 / Math.PI;
}

export function fromDisplayAngle(value, unit) {
  const number = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(number)) return NaN;
  return normalizeAngleUnit(unit) === "rad" ? number : number * Math.PI / 180;
}

// Round only for display: degrees to 0.1 deg-scale precision, radians to 4 decimals (about 0.006 deg).
export function formatAngle(radians, unit, { digits = null } = {}) {
  const value = toDisplayAngle(radians, unit);
  if (!Number.isFinite(value)) return "";
  const places = digits ?? (normalizeAngleUnit(unit) === "rad" ? 4 : 1);
  const rounded = Number(value.toFixed(places));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function angleUnitSuffix(unit) { return normalizeAngleUnit(unit) === "rad" ? " rad" : "°"; }

// A positive step no larger than a full turn, in the given unit; null when the text is not usable.
export function parseAngleStep(value, unit) {
  const radians = fromDisplayAngle(value, unit);
  return Number.isFinite(radians) && radians > 1e-9 && radians <= MAX_STEP_RAD + 1e-12 ? radians : null;
}

export function snapAngle(radians, stepRadians) {
  const value = Number(radians);
  if (!Number.isFinite(value) || !(stepRadians > 0)) return value;
  const snapped = Math.round(value / stepRadians) * stepRadians;
  return Object.is(snapped, -0) ? 0 : snapped;
}

// Snap the turn of an axis-angle rotation (quaternion) to a multiple of the step, keeping its axis.
export function snapQuaternionAngle(quaternion, stepRadians) {
  if (!(stepRadians > 0)) return quaternion.slice();
  let [x, y, z, w] = quaternion;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const sinHalf = Math.hypot(x, y, z);
  if (sinHalf < 1e-12) return [0, 0, 0, 1];
  const angle = 2 * Math.atan2(sinHalf, w);
  const snapped = snapAngle(angle, stepRadians);
  const half = snapped / 2, scale = Math.sin(half) / sinHalf;
  return [x * scale, y * scale, z * scale, Math.cos(half)];
}

// Set one component of a unit quaternion exactly and rescale the other three to keep unit length.
// Typing 1 into w (or any component) gives that pure rotation; the sign of untouched components is kept.
export function editQuaternionComponent(quaternion, index, value) {
  const q = quaternion.map(Number);
  const length = Math.hypot(...q);
  if (q.length !== 4 || !(length > 1e-12) || q.some((part) => !Number.isFinite(part))) throw new Error("quaternion must be finite and nonzero");
  const unit = q.map((part) => part / length);
  const target = Number(value);
  if (!Number.isInteger(index) || index < 0 || index > 3 || !Number.isFinite(target)) throw new Error("quaternion component must be a finite number");
  const exact = Math.max(-1, Math.min(1, target));
  const rest = unit.map((part, i) => (i === index ? 0 : part));
  const restLength = Math.hypot(...rest);
  const remaining = Math.sqrt(Math.max(0, 1 - exact * exact));
  const out = rest.map((part, i) => {
    if (i === index) return exact;
    if (restLength < 1e-12) return 0;
    return part / restLength * remaining;
  });
  if (restLength < 1e-12 && remaining > 1e-12) out[(index + 3) % 4] = remaining;   // all others were 0: put the rest on w (or x)
  return out.map((part) => (Object.is(part, -0) ? 0 : part));
}

export function formatQuaternionComponent(value) {
  const rounded = Number(Number(value).toFixed(5));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
