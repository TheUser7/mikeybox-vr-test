// Bridge items (owner 2026-10-12): put an item between a part and its children. The bridge sticks to one attachment
// point of the part, and the part's children on that point move onto one attachment point of the bridge, keeping where
// they are drawn (app.js re-solves their edges on save). A joystick on the part's base (0) with the children on its
// stick (1) is the menu's weightless spelled-text mount (master_menu.js _spellRehomeOnJoystick); any other catalog item
// works the same way, for example shotgun ammo. Pure planning only: no scene or DOM access, so tests run it directly.
// Only the game's 512-part total limits a bridge (owner 2026-10-12): the paced spawner regroups a part with more than 32
// stuck children itself, and an invention it cannot make stash-safe still spawns; the Validation panel says so.

export const BRIDGE_LIMITS = Object.freeze({ descendants: 512 });

const usableIds = (frames) => (Array.isArray(frames) ? frames : []).filter((f) => f && !f.unknown).map((f) => f.id);

// The bridge's point for the children: a joystick-style moving part (1) when the item has one, else its base.
export function defaultChildEdge(frames) {
  const ids = usableIds(frames);
  return ids.includes(1) ? 1 : (ids.length ? Math.min(...ids) : 0);
}

// The part's point for the bridge: where most of its children already are (ties -> the lower id), else its base.
export function defaultParentEdge(frames, childEdges) {
  const ids = usableIds(frames);
  const counts = new Map();
  for (const edge of childEdges || []) if (ids.includes(edge)) counts.set(edge, (counts.get(edge) || 0) + 1);
  let best = null;
  for (const [edge, n] of counts) {
    if (best === null || n > counts.get(best) || (n === counts.get(best) && edge < best)) best = edge;
  }
  if (best !== null) return best;
  return ids.includes(0) ? 0 : (ids.length ? Math.min(...ids) : 0);
}

const fail = (error) => ({ ok: false, error });

// mode "insert": a new bridge item (bridgeItemID) goes on parent edge parentEdge.
// mode "adopt":  the existing part `bridge` (already a child of `parent`) takes its siblings on its own parent edge.
// parent: { itemID, frozen, children: [{ uid, subParentID, frozen }] }
// bridge (adopt): { uid, itemID, subParentID }
// descendants: the parts after the root today (stuck children and container contents).
export function planBridge({ mode, parent, bridge = null, bridgeItemID = "", parentEdge = 0, childEdge = 0,
  knownIds = null, parentFrames = [], bridgeFrames = [], descendants = 0, limits = BRIDGE_LIMITS }) {
  if (mode !== "insert" && mode !== "adopt") return fail("Unknown bridge action.");
  if (!parent) return fail(mode === "insert" ? "Select the part whose children should move onto a bridge."
    : "Select a bridge part that is stuck to another part.");
  if (parent.frozen) return fail("That part's own pose is kept verbatim (unprobed edge); choose an editable part.");
  let itemID = bridgeItemID;
  let sitsOn = Math.round(Number(parentEdge) || 0);
  if (mode === "insert") {
    itemID = String(bridgeItemID || "").trim();
    if (!itemID) return fail("Enter a bridge item ID.");
    if (knownIds && !knownIds.has(itemID)) return fail(`${itemID} is not a spawnable item ID in this game build.`);
    if (!usableIds(parentFrames).includes(sitsOn)) return fail("The selected part has no usable attachment point " + sitsOn + ".");
  } else {
    if (!bridge) return fail("Select a bridge part that is stuck to another part.");
    if (bridge.frozen) return fail("The bridge part's own pose is kept verbatim (unprobed edge); choose an editable part.");
    itemID = bridge.itemID;
    sitsOn = Math.round(Number(bridge.subParentID) || 0);
  }
  const onto = Math.round(Number(childEdge) || 0);
  if (!usableIds(bridgeFrames).includes(onto)) return fail(`${itemID} has no usable attachment point ${onto}.`);
  const others = (parent.children || []).filter((c) => c && (!bridge || c.uid !== bridge.uid));
  const onPoint = others.filter((c) => Math.round(Number(c.subParentID) || 0) === sitsOn);
  const frozen = onPoint.filter((c) => c.frozen);
  const move = onPoint.filter((c) => !c.frozen);
  const otherEdge = others.length - onPoint.length;
  if (!move.length) {
    return fail(frozen.length
      ? "Every child on that attachment point keeps a verbatim (unprobed) edge, so none can move onto a bridge."
      : mode === "insert" ? "The selected part has no children on that attachment point to move onto a bridge."
        : "The selected part has no siblings on its attachment point to take over.");
  }
  if (mode === "insert" && (Number(descendants) || 0) + 1 > limits.descendants) {
    return fail(`A bridge would exceed the game's ${limits.descendants}-part limit.`);
  }
  return { ok: true, itemID, parentEdge: sitsOn, childEdge: onto, move: move.map((c) => c.uid),
    skippedFrozen: frozen.length, otherEdge };
}
