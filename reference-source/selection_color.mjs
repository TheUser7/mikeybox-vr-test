const COLOR_FIELDS = Object.freeze({
  colorHue: [0, 255],
  colorSaturation: [-128, 127],
  jellyStrength: [0, 255],
});

export function applyColorToSelection(records, field, rawValue) {
  const limits = COLOR_FIELDS[field];
  if (!limits || rawValue === "" || !Number.isFinite(Number(rawValue))) return [];
  const value = Math.round(Math.max(limits[0], Math.min(limits[1], Number(rawValue))));
  const changed = [];
  for (const record of records) {
    if (record[field] === value) continue;
    record[field] = value;
    changed.push(record);
  }
  return changed;
}
