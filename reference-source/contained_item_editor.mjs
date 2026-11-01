// Inventory children are native item JSON, not stuck-object graph records. Keep edits in that
// JSON so backpack, quiver and crossbow contents survive an editor save without reparenting.
import { gunAmmoCapability } from "./goop_rules.mjs";

export const CONTAINED_FIELD_LIMITS = Object.freeze({
  scaleModifier: Object.freeze([-128, 127]),
  colorHue: Object.freeze([0, 255]),
  colorSaturation: Object.freeze([-128, 127]),
  jellyStrength: Object.freeze([0, 255]),
  state: Object.freeze([-2147483648, 2147483647]),
  ammo: Object.freeze([-2147483648, 2147483647]),
});

function contentsArray(recordOrContents) {
  if (Array.isArray(recordOrContents)) return recordOrContents;
  return recordOrContents && Array.isArray(recordOrContents.contents)
    ? recordOrContents.contents : [];
}

function unwrapItem(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const candidate = entry.item && typeof entry.item === "object" && !Array.isArray(entry.item)
    ? entry.item : entry;
  return typeof candidate.itemID === "string" && candidate.itemID ? candidate : null;
}

/** Paths index `record.contents`, then successive native `children` arrays. */
export function listContainedItems(recordOrContents) {
  const rows = [];
  const visited = new WeakSet();
  const visit = (entries, prefix) => {
    if (!Array.isArray(entries)) return;
    for (let index = 0; index < entries.length; index++) {
      const item = unwrapItem(entries[index]);
      if (!item || visited.has(item)) continue;
      visited.add(item);
      const path = [...prefix, index];
      rows.push({ path, item, depth: prefix.length });
      visit(item.children, path);
    }
  };
  visit(contentsArray(recordOrContents), []);
  return rows;
}

export function getContainedItem(recordOrContents, path) {
  if (!Array.isArray(path) || !path.length) return null;
  let entries = contentsArray(recordOrContents);
  let item = null;
  for (const index of path) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= entries.length) return null;
    item = unwrapItem(entries[index]);
    if (!item) return null;
    entries = Array.isArray(item.children) ? item.children : [];
  }
  return item;
}

/** The empty path addresses the editor root record; other paths address native inventory items. */
export function getContainedContainer(recordOrContents, path) {
  if (!Array.isArray(path)) return null;
  if (path.length) return getContainedItem(recordOrContents, path);
  if (Array.isArray(recordOrContents)) return { contents: recordOrContents };
  return recordOrContents && typeof recordOrContents === "object" ? recordOrContents : null;
}

function childArray(recordOrContents, containerPath) {
  const container = getContainedContainer(recordOrContents, containerPath);
  if (!container) return null;
  if (!containerPath.length) return contentsArray(recordOrContents);
  return Array.isArray(container.children) ? container.children : [];
}

export function listDirectContents(recordOrContents, containerPath = []) {
  const entries = childArray(recordOrContents, containerPath);
  if (!entries) return [];
  const rows = [];
  for (let index = 0; index < entries.length; index++) {
    const item = unwrapItem(entries[index]);
    if (item) rows.push({ index, path: [...containerPath, index], item });
  }
  return rows;
}

/** Appends native item JSON as a child; caller enforces the selected container's game capacity. */
export function appendContainedItem(recordOrContents, containerPath, item) {
  if (!unwrapItem(item)) throw new TypeError("A contained item must have an itemID");
  const container = getContainedContainer(recordOrContents, containerPath);
  if (!container) throw new RangeError("Containing item no longer exists at that path");
  const property = containerPath.length ? "children" : "contents";
  if (!Array.isArray(container[property])) container[property] = [];
  const index = container[property].push(item) - 1;
  return [...containerPath, index];
}

/** Removes one native inventory entry, including its wrapper, without changing adjacent items. */
export function removeContainedItem(recordOrContents, path) {
  if (!Array.isArray(path) || !path.length) throw new RangeError("A contained item path is required");
  const containerPath = path.slice(0, -1);
  const entries = childArray(recordOrContents, containerPath);
  const index = path[path.length - 1];
  if (!entries || !Number.isSafeInteger(index) || index < 0 || index >= entries.length ||
      !unwrapItem(entries[index])) {
    throw new RangeError("Contained item no longer exists at that path");
  }
  return entries.splice(index, 1)[0];
}

export function parseContainedFieldValue(field, rawValue, itemID = "") {
  const limits = CONTAINED_FIELD_LIMITS[field];
  if (!limits) throw new TypeError(`Unsupported contained-item field: ${String(field)}`);
  let value;
  if (typeof rawValue === "number") {
    value = rawValue;
  } else if (typeof rawValue === "string" && /^[+-]?\d+$/.test(rawValue.trim())) {
    value = Number(rawValue.trim());
  } else {
    throw new TypeError(`${field} must be a whole-number integer`);
  }
  if (!Number.isSafeInteger(value) || value < limits[0] || value > limits[1]) {
    throw new RangeError(`${field} must be an integer from ${limits[0]} to ${limits[1]}`);
  }
  const ammoCap = field === "ammo" ? gunAmmoCapability(itemID) : null;
  if (ammoCap?.max != null && (value < ammoCap.min || value > ammoCap.max))
    throw new RangeError(`${itemID} ammo must be an integer from ${ammoCap.min} to ${ammoCap.max}`);
  return value;
}

/**
 * Random colours for giveaways (player request 2026-10-18): every item directly inside the container gets a random hue
 * (0-255) and a random saturation from 0 to 127 (never negative, so nothing comes out grey). Returns how many changed.
 */
export function randomizeContainedColors(recordOrContents, containerPath = [], random = Math.random) {
  const rows = listDirectContents(recordOrContents, containerPath);
  for (const { item } of rows) {
    item.colorHue = Math.min(255, Math.floor(random() * 256));
    item.colorSaturation = Math.min(127, Math.floor(random() * 128));
  }
  return rows.length;
}

/**
 * Random sizes (owner 2026-10-18, with random colours): every item directly inside the container gets a random scaleModifier
 * over the game's whole -128..127 range, which spans that item's own smallest to largest size. Returns how many changed.
 */
export function randomizeContainedSizes(recordOrContents, containerPath = [], random = Math.random) {
  const rows = listDirectContents(recordOrContents, containerPath);
  for (const { item } of rows) item.scaleModifier = Math.min(127, Math.floor(random() * 256) - 128);
  return rows.length;
}

/**
 * Fill a container (owner 2026-10-23: "instantly fill a bag with the selected item or make a bag with randomized items for
 * the selected category"): appends makeItem(id) for every free slot up to `capacity`, taking `itemIDs` in order and
 * repeating them when there are more free slots. Items already inside stay. Returns the added paths.
 */
export function fillContainedItems(recordOrContents, containerPath, capacity, itemIDs, makeItem) {
  if (!Array.isArray(itemIDs) || !itemIDs.length) throw new TypeError("At least one item ID is needed to fill a container");
  const free = Math.max(0, capacity - listDirectContents(recordOrContents, containerPath).length);
  const added = [];
  for (let slot = 0; slot < free; slot++)
    added.push(appendContainedItem(recordOrContents, containerPath, makeItem(itemIDs[slot % itemIDs.length])));
  return added;
}

/** `count` random picks from `pool`: every item once, in shuffled order, before any repeats, so a bag comes out varied. */
export function randomItemIDs(pool, count, random = Math.random) {
  const unique = [...new Set(pool)];
  const picks = [];
  while (unique.length && picks.length < count) {
    const round = unique.slice();
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(random() * (i + 1)));
      [round[i], round[j]] = [round[j], round[i]];
    }
    picks.push(...round.slice(0, count - picks.length));
  }
  return picks;
}

/** Mutates only the named native JSON field after validating the item, field and exact value. */
export function setContainedItemField(recordOrContents, path, field, rawValue) {
  const item = getContainedItem(recordOrContents, path);
  if (!item) throw new RangeError("Contained item no longer exists at that path");
  const value = parseContainedFieldValue(field, rawValue, item.itemID);
  item[field] = value;
  return value;
}
