import { clampInt, physicalScale, scaleModifierForPhysicalScale } from "./goop_rules.mjs";

// Deserialize attaches a stuck child with SetParent(worldPositionStays=true): the
// child keeps its own world scale, while its parent scales the attachment offset.
// Give every selected item's own physical scale the same factor, even when its
// parent is selected. Keep initial values for a whole slider/step edit so small
// changes survive integer rounding on narrow prefab ranges.
export function planSelectionScale(records, primaryUid, nextPrimaryModifier) {
  const primary = records.find((record) => record.uid === primaryUid);
  if (!primary) throw new Error("The active item is not in the scale selection.");
  const primaryModifier = clampInt(nextPrimaryModifier, -128, 127, primary.scaleModifier);
  const factor = physicalScale(primaryModifier, primary.itemID) /
    physicalScale(primary.scaleModifier, primary.itemID);
  const modifiers = new Map(records.map((record) => [
    record.uid,
    record.uid === primaryUid ? primaryModifier :
      scaleModifierForPhysicalScale(physicalScale(record.scaleModifier, record.itemID) * factor, record.itemID),
  ]));
  return { factor, modifiers, primaryModifier };
}
