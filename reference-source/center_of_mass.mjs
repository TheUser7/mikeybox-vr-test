// Effective weight and center of mass of an invention, the way the game adds it up (owner 2026-10-23).
//
// From the game code (GrabbableObject.UpdateTotalMass, NetParent.UpdateAccumulatedMass):
// * every item weighs its prefab Rigidbody mass; scaling it does not change that (a backpack weighs 5 kg plus the
//   prefab mass of each item at its top level);
// * an item's center of mass is its prefab Rigidbody's center of mass, applied in the item's runtime root frame
//   and scaled with the item;
// * a part adds its whole weight, its own children included, only through its parent's ROOT attachment point
//   (NetParent 0). Whatever is stuck to any other attachment point (a joystick's stick @1, a robot arm's joints
//   @1-@3) adds no weight, and neither does anything stuck to it.
//
// mass_properties.json (tools/export_item_mass_properties.py) holds the prefab numbers. This module is pure: the
// editor hands it accessors for its records and their world transforms.

export const MASS_SCHEMA = "ac.goop-editor-mass-properties.v1";

let manifest = null;

export function installMassManifest(data) {
  if (!data || data.schema !== MASS_SCHEMA || !data.items || typeof data.items !== "object")
    throw new Error("mass manifest has the wrong schema");
  const items = new Map();
  for (const [itemID, row] of Object.entries(data.items)) {
    const mass = Number(row?.mass);
    const com = row?.centerOfMass;
    if (!Number.isFinite(mass) || mass < 0 || !Array.isArray(com) || com.length !== 3 ||
        !com.every((value) => Number.isFinite(Number(value))))
      throw new Error(`mass manifest row for ${itemID} is invalid`);
    items.set(itemID, {
      mass, centerOfMass: com.map(Number), massRule: row.massRule || "",
      rootNetParentId: row.rootNetParentId == null ? null : Number(row.rootNetParentId),
    });
  }
  const backpackBase = Number(data.backpackBaseMass);
  manifest = { items, buildId: String(data.steamBuildId || ""), backpackBase: Number.isFinite(backpackBase) ? backpackBase : 5 };
  return items.size;
}

export function massManifestInfo() {
  return manifest ? { buildId: manifest.buildId, count: manifest.items.size } : null;
}

export function itemMassProperties(itemID) {
  return manifest?.items.get(itemID) || null;
}

// The weight one item adds by itself. `contents` are the native `children` items inside it (backpack contents).
export function itemOwnMass(itemID, contents = []) {
  const row = itemMassProperties(itemID);
  if (!row) return { mass: 0, known: false, approximate: false };
  if (row.massRule === "backpack") {
    let mass = manifest.backpackBase;
    let known = true;
    for (const inside of Array.isArray(contents) ? contents : []) {
      const content = itemMassProperties(inside?.itemID);
      if (content) mass += content.mass;
      else known = false;
    }
    return { mass, known, approximate: !known };
  }
  // AmmoPouch, Quiver, ItemShredder, RPG and Railgun set their own mass from what they hold or their state.
  return { mass: row.mass, known: true, approximate: !!row.massRule };
}

// Center of mass of one invention.
//   root                   the invention's root part
//   childrenOf(part)       its stuck children
//   attachmentOf(part)     the parent's attachment point it is stuck to (subParentID)
//   contentsOf(part)       items inside it (native `children`)
//   scaleOf(part)          its physical scale
//   toWorld(part, [x,y,z]) a point in the part's runtime root frame (metres, unscaled) to world [x,y,z]
// Returns { mass, center, counted, ignored, unknown, approximate, ignoredParts } (center null when nothing weighs).
export function inventionCenterOfMass(root, { childrenOf, attachmentOf, contentsOf, scaleOf, toWorld }) {
  const result = { mass: 0, center: null, counted: 0, ignored: 0, unknown: 0, approximate: 0, ignoredParts: [] };
  if (!root) return result;
  const sum = [0, 0, 0];
  const countSubtree = (part) => 1 + (childrenOf(part) || []).reduce((n, child) => n + countSubtree(child), 0);
  const visit = (part) => {
    const own = itemOwnMass(part.itemID, contentsOf ? contentsOf(part) : []);
    const row = itemMassProperties(part.itemID);
    result.counted += 1;
    if (!row) result.unknown += 1;
    else if (own.approximate) result.approximate += 1;
    if (row && own.mass > 0) {
      const scale = Number(scaleOf ? scaleOf(part) : 1) || 1;
      const point = toWorld(part, row.centerOfMass.map((value) => value * scale));
      for (let i = 0; i < 3; i++) sum[i] += point[i] * own.mass;
      result.mass += own.mass;
    }
    const rootPoint = row ? row.rootNetParentId : 0;
    for (const child of childrenOf(part) || []) {
      const attachment = Math.round(Number(attachmentOf(child)) || 0);
      if (rootPoint !== null && attachment === rootPoint) visit(child);
      else {
        const parts = countSubtree(child);
        result.ignored += parts;
        result.ignoredParts.push({ part: child, attachment, parts });
      }
    }
  };
  visit(root);
  if (result.mass > 0) result.center = sum.map((value) => value / result.mass);
  return result;
}

// THE WATCH'S WEIGHT BAR (a moderator 2026-10-30: "What weight fills the bar on the watch all the way"). From the game code
// (build 26305127): NetPlayer.HandleGrabbedItemMassChanged takes each held item's Rigidbody mass (halved for the item on your
// back, doubled for items with one particular tag), PlayerController.SetItemWeight adds them up, and
// PlayerWatch.OnPlayerHeldWeightUpdated shows weight / 20 * 0.25, clamped 0..1. So the bar is full at 80 kg in your hands;
// it turns to the warning colour above a quarter (20 kg) and the danger colour above three quarters (60 kg).
export const WATCH_FULL_KG = 80;
export const watchBarPercent = (kg) => Math.min(100, Math.round((Math.max(0, kg) / WATCH_FULL_KG) * 100));

// A short, plain-language summary for the editor's readout.
export function centerOfMassSummary(result, formatMass = (kg) => `${kg.toFixed(kg < 10 ? 2 : 1)} kg`) {
  if (!result || result.mass <= 0) return "Center of mass: not known for these items";
  const notes = [];
  if (result.ignored) notes.push(`${result.ignored} part${result.ignored === 1 ? "" : "s"} on a joystick stick or ` +
    `robot arm joint add${result.ignored === 1 ? "s" : ""} no weight`);
  if (result.unknown) notes.push(`${result.unknown} item${result.unknown === 1 ? " has" : "s have"} no mass data`);
  if (result.approximate) notes.push(`${result.approximate} container or launcher weight${result.approximate === 1 ? " is" : "s are"} approximate`);
  return `Total weight ${formatMass(result.mass)}` + (notes.length ? ` (${notes.join("; ")})` : "") +
    ` · held, it fills ${watchBarPercent(result.mass)}% of the watch's weight bar (full at ${WATCH_FULL_KG} kg)`;
}
