import { containerRule, validateInvention } from "./goop_rules.mjs";

const copy = (value) => JSON.parse(JSON.stringify(value));

function hasStuckDescendants(root) {
  const pending = [root];
  const seen = new Set();
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    if (Array.isArray(item.stuckChildren) && item.stuckChildren.length) return true;
    if (Array.isArray(item.children)) {
      for (const child of item.children) pending.push(child?.item && typeof child.item === "object" ? child.item : child);
    }
    if (Array.isArray(item.containerContents)) {
      for (const child of item.containerContents) pending.push(child?.item && typeof child.item === "object" ? child.item : child);
    }
  }
  return false;
}

export function planInventionImport(base, stuckRoute, inventions, mode, validationOptions = {}) {
  if (!base?.itemID) throw new Error("Add a root item before importing inventions.");
  if (!Array.isArray(inventions) || !inventions.length) throw new Error("Choose one or more invention JSON files.");
  if (!inventions.every((item) => item?.itemID)) throw new Error("Every imported file needs a root itemID.");
  if (!["attach", "inside"].includes(mode)) throw new Error("Choose how to import the inventions.");
  const prospective = copy(base);
  let target = prospective;
  for (const index of stuckRoute || []) {
    target = target?.stuckChildren?.[index]?.item;
    if (!target) throw new Error("The selected import target no longer exists.");
  }
  if (mode === "inside") {
    const rule = containerRule(target.itemID);
    if (!rule) throw new Error(`Select a backpack, quiver, or crossbow; ${target.itemID} cannot hold items.`);
    if (rule.kind === "backpack" && inventions.some(hasStuckDescendants)) {
      throw new Error("Backpacks and quivers discard stuck descendants from items put inside. Use Attach each root to keep the complete inventions on the outside, or put plain items inside.");
    }
    target.children = Array.isArray(target.children) ? target.children : [];
    if (target.children.length + inventions.length > rule.capacity) {
      throw new Error(`${target.itemID} holds at most ${rule.capacity} item(s); ${target.children.length} are already inside.`);
    }
    // A holder (crossbow, heart gun, salmon cannon) holds only children[0], and only what it can hold; anything else the game
    // spawns loose next to it (owner 2026-10-19). `holderRefusal(holderItemID, itemID)` (the editor's holder manifest check)
    // returns the refusal sentence, or "" when the holder keeps the item or cannot tell.
    if (rule.kind === "holder" && !target.children.length && typeof validationOptions.holderRefusal === "function") {
      const refusal = String(validationOptions.holderRefusal(target.itemID, inventions[0].itemID) || "");
      if (refusal) throw new Error(refusal);
    }
    target.children.push(...inventions.map(copy));
  } else {
    target.stuckChildren = Array.isArray(target.stuckChildren) ? target.stuckChildren : [];
    target.stuckChildren.push(...inventions.map((item) => ({
      item: copy(item), subParentID: 0, pos: [0, 0, 0], rot: [0, 0, 0, 1],
      posePos: [0, 0, 0], poseRot: [0, 0, 0, 1], wasDynamicStuck: false,
    })));
  }
  const check = validateInvention(prospective, validationOptions);
  if (check.errors.length) throw new Error(`Import would create ${check.errors.length} validation error(s): ${check.errors.slice(0, 2).join("; ")}`);
  return { prospective, stats: check.stats };
}
