// Build 25700536 native Goop state encodings. The caller must gate these
// helpers by the current-build prefab component registry, never by item name.
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const UINT32_MAX = 4294967295;

function integerInRange(value, min, max, label) {
  const text = typeof value === "string" ? value.trim() : value;
  if (typeof text === "string" && !/^[+]?[0-9]+$/.test(text))
    throw new RangeError(`${label} must be a whole number from ${min} to ${max}`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new RangeError(`${label} must be a whole number from ${min} to ${max}`);
  return number;
}

function signedState(state) {
  if (!Number.isInteger(state) || state < INT32_MIN || state > INT32_MAX)
    throw new RangeError("state must be signed Int32");
  return state;
}

export function decodeHandExplosive(state, ammo) {
  const bits = signedState(state);
  return { pinPulled: (bits & 1) !== 0, paused: (bits & 2) !== 0,
    fuseTicks: Number.isInteger(ammo) ? ammo : 0 };
}

export function setHandExplosivePin(state, enabled) {
  const bits = signedState(state);
  return enabled ? bits | 1 : bits & ~1;
}

export function setHandExplosivePaused(state, enabled) {
  const bits = signedState(state);
  return enabled ? bits | 2 : bits & ~2;
}

// TeleGrenade writes state = 2 * (remainingTicks | (runnerTag << 8)) | pin.
// The loader compares only the low 16 bits of runnerTag; upper state bits are
// preserved here so an imported native capture is not altered by a field edit.
export function decodeTeleGrenade(state, ammo) {
  const bits = signedState(state) >>> 0;
  if (!Number.isInteger(ammo) || ammo < INT32_MIN || ammo > INT32_MAX)
    throw new RangeError("ammo must be signed Int32");
  return { pinPulled: (bits & 1) !== 0, remainingTicks: (bits >>> 1) & 255,
    sessionTag: (bits >>> 9) & 65535, sourcePlayerObjectId: ammo >>> 0 };
}

export function setTeleGrenadePin(state, enabled) {
  const bits = signedState(state);
  return enabled ? bits | 1 : bits & ~1;
}

export function setTeleGrenadeTicks(state, value) {
  const ticks = integerInRange(value, 0, 255, "remaining ticks");
  return (signedState(state) & ~0x1fe) | (ticks << 1);
}

export function setTeleGrenadeSessionTag(state, value) {
  const tag = integerInRange(value, 0, 65535, "session tag");
  return (signedState(state) & ~0x1fffe00) | (tag << 9);
}

export function objectIdToSignedAmmo(value) {
  return integerInRange(value, 0, UINT32_MAX, "NetPlayer.objectID") | 0;
}

export function parseGrenadeFuseTicks(value) {
  return integerInRange(value, 0, INT32_MAX, "remaining fuse ticks");
}
