// PortableSafeZone stores a Float32 timer by copying its four bytes into the
// goop item's signed Int32 `state`. This is a bit cast, not a numeric cast.

/** Encode seconds as the native signed Int32 state carrying Float32 bits. */
export function float32SecondsToStateBits(seconds) {
  if (typeof seconds !== "number") {
    throw new TypeError("seconds must be a number");
  }
  const bytes = new DataView(new ArrayBuffer(4));
  bytes.setFloat32(0, seconds, true);
  return bytes.getInt32(0, true);
}

/** Decode a native signed Int32 state as Float32 seconds. */
export function stateBitsToFloat32Seconds(stateBits) {
  if (!Number.isInteger(stateBits) || stateBits < -2147483648 || stateBits > 2147483647) {
    throw new RangeError("stateBits must be a signed 32-bit integer");
  }
  const bytes = new DataView(new ArrayBuffer(4));
  bytes.setInt32(0, stateBits, true);
  return bytes.getFloat32(0, true);
}

// An arbitrary NaN bit pattern decodes as NaN, but JavaScript cannot retain
// that pattern in a Number. Keep the original raw state if no edit is made.
