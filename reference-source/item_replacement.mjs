import { containerRule, NON_GOOP_PREFAB_IDS, subParentFrame } from "./goop_rules.mjs";

// Changing a parent's prefab changes the coordinate frame used by every direct
// stuck edge. Return the child frames that can be re-encoded from their current
// displayed poses, or reject replacements whose poses cannot be recovered.
export function planItemReplacement(newItemId, children = [], contents = []) {
  const id = String(newItemId || "").trim();
  if (!id) throw new Error("Choose an item ID.");
  if (NON_GOOP_PREFAB_IDS.has(id)) throw new Error(`${id} has no GrabbableObject in the current game prefab and cannot be a goop item.`);
  const held = Array.isArray(contents) ? contents : [];
  if (held.length) {
    const rule = containerRule(id);
    if (!rule) throw new Error(`${id} cannot hold the ${held.length} item(s) already inside this item.`);
    if (held.length > rule.capacity) throw new Error(`${id} holds at most ${rule.capacity} item(s); remove contents before changing the item ID.`);
  }
  const frames = [];
  let rehomed = 0;
  for (const child of children) {
    if (child.frozenEdge) {
      throw new Error("A direct child's sub-part pose is unprobed. Keep this parent or remove that child before replacing the parent item.");
    }
    const wanted = Math.round(Number(child.subParentID) || 0);
    const frame = subParentFrame(id, wanted);
    if (frame && !frame.unknown) frames.push(wanted);
    else { frames.push(0); rehomed++; }
  }
  return { frames, rehomed };
}
