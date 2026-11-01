// Pure editors for item-specific goop `state` encodings. Item-ID capability
// checks belong to the caller; an unknown item's signed Int32 stays raw.

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;
const REVOLVER_CHAMBER_COUNT = 6;
const REVOLVER_CHAMBER_MASK = (1 << REVOLVER_CHAMBER_COUNT) - 1;

export const SHREDDER_PROGRESS_MAX = 8_000;

function assertSignedInt32(state) {
  if (!Number.isInteger(state) || state < INT32_MIN || state > INT32_MAX) {
    throw new RangeError("state must be a signed 32-bit integer");
  }
}

function assertChamberIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= REVOLVER_CHAMBER_COUNT) {
    throw new RangeError("chamber index must be an integer from 0 to 5");
  }
}

function assertStateBitIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index > 31) {
    throw new RangeError("state bit index must be an integer from 0 to 31");
  }
}

/** Read a bit of a signed Int32 state without interpreting its item meaning. */
export function isStateBitSet(state, index) {
  assertSignedInt32(state);
  assertStateBitIndex(index);
  return Boolean(state & (1 << index));
}

/** Edit one state bit while preserving all other bits, including the sign bit. */
export function setStateBit(state, index, enabled) {
  assertSignedInt32(state);
  assertStateBitIndex(index);
  if (typeof enabled !== "boolean") throw new TypeError("enabled must be a boolean");
  const bit = 1 << index;
  return enabled ? (state | bit) : (state & ~bit);
}

/** Return the revolver's loaded-chamber mask (0–63) without changing state. */
export function revolverChamberMask(state) {
  assertSignedInt32(state);
  return state & REVOLVER_CHAMBER_MASK;
}

/** Read one chamber, indexed 0–5 in the game's low-six-bit mask. */
export function isRevolverChamberLoaded(state, index) {
  assertChamberIndex(index);
  return isStateBitSet(state, index);
}

/** Change one chamber while preserving every unrelated bit of the raw state. */
export function setRevolverChamberLoaded(state, index, loaded) {
  assertSignedInt32(state);
  assertChamberIndex(index);
  if (typeof loaded !== "boolean") {
    throw new TypeError("loaded must be a boolean");
  }
  return setStateBit(state, index, loaded);
}

/** Parse an edited shredder value; reject values the game would clamp on load. */
export function parseShredderProgress(input) {
  let value = input;
  if (typeof input === "string") {
    const text = input.trim();
    if (!/^\d+$/.test(text)) {
      throw new RangeError("shredded value must be a whole number from 0 to 8000");
    }
    value = Number(text);
  }
  if (!Number.isInteger(value) || value < 0 || value > SHREDDER_PROGRESS_MAX) {
    throw new RangeError("shredded value must be a whole number from 0 to 8000");
  }
  return value;
}
