// holder_pose.mjs -- where the game puts an item a HOLDER holds (crossbow, heart gun, salmon cannon, slingshot), and how a
// loaded crossbow's string looks. Plain arrays in the game's item-local frame (metres), like goop_rules.mjs. Data comes from
// holder_anchors.json, exported from the installed build by tools/export_item_holder_anchors.py (Step 5h).
//
// Holders = the items whose save carries the held item as its native children[0] (HandleSerialize / HandleDeserialize,
// decompile build 25996600; the slingshot 26092467): Crossbow, HeartGun, SalmonCannon and Slingshot. Each spawns children[0]
// at its own pose, Deserializes it and attaches it to one AttachedItemAnchor at location 3 (Item). What each one accepts:
//   crossbow      only items whose equip config sets allowAttachToItem; anything else drops loose.
//   heartGun      ANY item (it attaches regardless of the flag), but only when the heart gun itself is not a nested load.
//   salmonCannon  a fish only: allowAttachToItem AND a Fishing.Fish component (its anchor's CheckIsFishAttached).
//   slingshot     like the crossbow (allowAttachToItem, nested or not). Its pouch anchor's checkBeforeGrab
//                 (Slingshot.IsValidAmmo) refuses only itself and anything with a TryGetComponent<T> hit, T inferred to be
//                 Slingshot (its MethodSpec sits alphabetically between <Skybox> and <SoccerBall>); a slingshot has no
//                 allowAttachToItem anyway, so that adds no refusal here.
// Every holder attaches through AttachedItemAnchor.TryGrabObject, which asks the held item's own ValidateGrab: a slingshot
// refuses an Item anchor while its pouch holds something (Slingshot.HandleValidateGrab), so a LOADED slingshot never loads
// into a holder (it spawns loose, still loaded); an empty one can (a heart gun holds it).
//
// Game rule (GrabbableObject.GetGrabbedLocation, case 3 = AttachedLocation.Item), the same for all three holders.
// Live-verified on client D: build 25766246 to 0.34 mm / 0.1 deg on all four crossbows; build 25996600 to 0.27 mm / 0.1 deg
// on heart guns and salmon cannons, scaled holders and held items included (fixtures/holder_loaded_d_25996600.json):
//   slot     = holder Root * T(physicalScale(holder) * Attachment.pos) * R(Attachment.rot)
//   grabRot  = inverse(bottom.rot)                  bottom = the held item's _bottomAttachTransform vs its main
//   grabPos  = grabRot * (-physicalScale(item) * bottom.pos)
//   held Root = slot * T(grabPos) * R(grabRot)       (no bottom anchor: identity)
// The holder's size moves the slot; the held item keeps its own size. The JSON grabPos/grabRot of a held item are
// ignored by the game (nested Deserialize), and only children[0] is held.
//
// Slingshot (decompile 26092467, NOT live-verified yet): the slot is the pouch anchor where Slingshot.Spawned puts it (the
// pouch mesh's bounds centre), and Slingshot.CenterLoadedItem then re-grabs the item centred instead of by its bottom grip:
//   grabRot  = inverse(bottom.rot)                  (identity without a bottom anchor), as above
//   grabPos  = grabRot * (-physicalScale(item) * centre)
// centre = the mean of the item's own counted collider centres in its runtime Root frame (holder_anchors.json
// items[id].colliderCenter; zero when none counts). So the centre of the item's colliders sits on the pouch.

import { contentsOf, physicalScale, qConj, qMul, qNormalize, qRotate, vAdd, vScale } from "./goop_rules.mjs";

export const HOLDER_SCHEMA = "ac.goop-editor-holder-anchors.v1";

let manifest = null;

export function installHolderManifest(raw, expected = {}) {
  if (!raw || raw.schema !== HOLDER_SCHEMA || !raw.items || typeof raw.items !== "object" ||
      !raw.holders || typeof raw.holders !== "object" || !Array.isArray(raw.missing)) {
    throw new Error("invalid crossbow holder manifest");
  }
  for (const key of ["steamBuildId", "gameAssemblySha256", "resourcesSha256"]) {
    if (expected[key] && String(raw[key] || "") !== String(expected[key])) {
      throw new Error(`crossbow holder manifest ${key} ${raw[key]} does not match the item scale manifest (${expected[key]})`);
    }
  }
  const items = Object.keys(raw.items);
  if (raw.holderItemCount !== items.length || raw.itemCount !== items.length + raw.missing.length) {
    throw new Error("incomplete crossbow holder manifest");
  }
  if (expected.itemIDs) {
    const covered = new Set([...items, ...raw.missing.map((row) => row?.itemID)]);
    for (const id of expected.itemIDs) if (!covered.has(id)) throw new Error(`crossbow holder manifest misses ${id}`);
  }
  for (const [id, holder] of Object.entries(raw.holders)) {
    const slot = holder?.slot, string = holder?.string;
    if (!HOLDER_KINDS[holder?.kind] || !finite(slot?.pos, 3) || !finite(slot?.rot, 4) || !raw.items[id] ||
        (holder.kind === "crossbow" && (!finite(string?.pullAxis, 3) || !finite(string?.uvFromX, 2)))) {
      throw new Error(`invalid holder entry for ${id}`);
    }
  }
  for (const [id, item] of Object.entries(raw.items)) {
    if (item?.colliderCenter !== undefined && !finite(item.colliderCenter, 3)) throw new Error(`invalid collider centre for ${id}`);
  }
  if (!(Number(raw.stringPullDistance) > 0 && Number(raw.stringPullDistance) < 2)) throw new Error("invalid crossbow string pull distance");
  manifest = raw;
  return { buildId: String(raw.steamBuildId || ""), holders: Object.keys(raw.holders).length, loadable: raw.loadableCount };
}

export function clearHolderManifest() { manifest = null; }
export function holderManifestInstalled() { return !!manifest; }

function finite(arr, n) { return Array.isArray(arr) && arr.length === n && arr.every((v) => Number.isFinite(Number(v))); }

// Holder kinds and the word the editor uses for each (owner 2026-10-18: heart guns and salmon cannons hold items too).
// Owner 2026-10-20: the 1.96.0 slingshot loads like a crossbow.
export const HOLDER_KINDS = Object.freeze({ crossbow: "crossbow", heartGun: "heart gun", salmonCannon: "salmon cannon", slingshot: "slingshot" });

// The holder entry for an item (any kind), or null (sawblade launchers and everything else hold nothing from JSON).
export function holderEntry(itemID) {
  const holder = manifest?.holders?.[String(itemID || "")];
  return holder && HOLDER_KINDS[holder.kind] ? holder : null;
}
export function holderKind(itemID) { return holderEntry(itemID)?.kind || null; }
export function holderNoun(itemID) { return HOLDER_KINDS[holderKind(itemID)] || "holder"; }
export function holderIDs() {
  return manifest ? Object.keys(manifest.holders).filter((id) => holderEntry(id)).sort() : [];
}

// The crossbow entry for an item, or null (string pull, ghost crossbow and crossbow-only UI).
export function crossbowHolder(itemID) {
  const holder = holderEntry(itemID);
  return holder?.kind === "crossbow" ? holder : null;
}

export function crossbowIDs() {
  return manifest ? Object.keys(manifest.holders).filter((id) => crossbowHolder(id)).sort() : [];
}

// true when the item's prefab carries an AnimalCompany.Fishing.Fish component; null when the item is unknown.
export function isFish(itemID) {
  const entry = manifest?.items?.[String(itemID || "")];
  return entry ? entry.fish === true : null;
}

// The mean of an item's counted collider centres in its runtime Root frame (Slingshot.CenterLoadedItem), [0,0,0] when none
// counts, or null when the manifest is not installed or the item is unknown.
export function colliderCenter(itemID) {
  const entry = manifest?.items?.[String(itemID || "")];
  if (!entry) return null;
  return finite(entry.colliderCenter, 3) ? entry.colliderCenter.map(Number) : [0, 0, 0];
}

// Whether `holderItemID` keeps `itemID` on its anchor (true), drops it loose (false), or cannot tell (null). `nested`:
// the holder is itself a held item (HeartGun.HandleDeserialize attaches only when it is not a nested load). This looks at
// the item id only; holderLoadPlan also checks what a held slingshot itself holds.
export function canHold(holderItemID, itemID, { nested = false } = {}) {
  const kind = holderKind(holderItemID);
  const loadable = isLoadableIntoCrossbow(itemID);
  if (!kind || loadable === null) return null;
  if (kind === "heartGun") return !nested;
  if (kind === "salmonCannon") return loadable && isFish(itemID) === true;
  return loadable;
}

// true / false from the game's equip config; null when the manifest is not installed or the item is unknown.
export function isLoadableIntoCrossbow(itemID) {
  const entry = manifest?.items?.[String(itemID || "")];
  return entry ? entry.loadable === true : null;
}

// The item's bottom attach pose vs its record frame (how it sits in a crossbow slot or on a tripod mount), or null.
export function bottomAnchor(itemID) {
  const bottom = manifest?.items?.[String(itemID || "")]?.bottom;
  return bottom ? { pos: bottom.pos.map(Number), rot: bottom.rot.map(Number) } : null;
}

export function stringPullDistance() { return manifest ? Number(manifest.stringPullDistance) : 0; }

// Held item's runtime Root (the editor's record frame) relative to the crossbow's runtime Root, game frame.
export function heldItemPose(holderItemID, holderScaleModifier, itemID, itemScaleModifier) {
  const holder = holderEntry(holderItemID);
  if (!holder) return null;
  const slotPos = vScale(holder.slot.pos.map(Number), physicalScale(holderScaleModifier, holderItemID));
  const slotRot = qNormalize(holder.slot.rot.map(Number));
  const bottom = manifest.items?.[String(itemID || "")]?.bottom;
  // The slingshot hangs nothing by its bottom grip: CenterLoadedItem puts the item's collider centre on the pouch.
  const point = holder.kind === "slingshot" ? colliderCenter(itemID) || [0, 0, 0] : bottom ? bottom.pos.map(Number) : null;
  const grabRot = bottom ? qConj(qNormalize(bottom.rot.map(Number))) : [0, 0, 0, 1];
  const grabPos = point ? qRotate(grabRot, vScale(point, -physicalScale(itemScaleModifier, itemID))) : [0, 0, 0];
  return { pos: vAdd(slotPos, qRotate(slotRot, grabPos)), rot: qNormalize(qMul(slotRot, grabRot)) };
}

// Per-vertex string pull. The game blends each string vertex toward TRS(pull * forward) by a weight the shader
// takes from the mesh's second UV channel, which runs 0..1 from one limb tip to the other; the export stores that
// coordinate as u = a + b * x (main-space X). Weight 1 - |2u - 1|: the centre moves the full pull, the tips stay.
export function stringPullWeight(holderItemID, mainX) {
  const holder = crossbowHolder(holderItemID);
  if (!holder) return 0;
  const [a, b] = holder.string.uvFromX.map(Number);
  const u = a + b * Number(mainX);
  return Math.max(0, Math.min(1, 1 - Math.abs(2 * u - 1)));
}

// Main-space displacement of a string vertex at `mainX` for a pull distance (0 = empty, stringPullDistance() = loaded).
export function stringVertexOffset(holderItemID, mainX, pull) {
  const holder = crossbowHolder(holderItemID);
  if (!holder || !pull) return [0, 0, 0];
  return vScale(holder.string.pullAxis.map(Number), Number(pull) * stringPullWeight(holderItemID, mainX));
}

// What the game does with a holder's children: only the first is held, and only if this holder accepts it (canHold).
// reason: "loaded" | "empty" | "not a crossbow" (not a holder) | "unknown item" | "not loadable" (crossbow, slingshot) |
//         "not a fish" (salmon cannon) | "nested" (a heart gun that is itself a held item keeps nothing attached) |
//         "loaded slingshot" (the first item is a slingshot holding something: Slingshot.HandleValidateGrab refuses).
// `contents` are saved items ({ itemID, children }); a held slingshot's own children decide "loaded slingshot".
export function holderLoadPlan(holderItemID, contents, { nested = false } = {}) {
  const list = Array.isArray(contents) ? contents : [];
  const first = list[0] || null;
  const kind = holderKind(holderItemID);
  if (!kind || !first) return { loaded: null, reason: first ? "not a crossbow" : "empty", ignored: list.length };
  const ok = canHold(holderItemID, first.itemID, { nested });
  if (ok !== true) {
    const reason = ok === null ? "unknown item" : kind === "heartGun" ? "nested" : kind === "salmonCannon" ? "not a fish" : "not loadable";
    return { loaded: null, reason, item: first, ignored: list.length - 1 };
  }
  // The held slingshot is Deserialized (and loads its own pouch) before this holder grabs it; a filled pouch refuses.
  if (holderKind(first.itemID) === "slingshot" && holderLoadPlan(first.itemID, contentsOf(first), { nested: true }).loaded) {
    return { loaded: null, reason: "loaded slingshot", item: first, ignored: list.length - 1 };
  }
  return { loaded: first, reason: "loaded", ignored: list.length - 1 };
}
export const crossbowLoadPlan = holderLoadPlan;

// Owner 2026-10-19 ("when you try to put something into a crossbow it spawns in not on the crossbow"): what an item put into a
// holder by hand (Put inside / Import inside) would do. "" = the game holds it (or this cannot tell: no manifest, not a holder),
// else the holderLoadPlan reason it would spawn loose next to the holder instead: "not loadable" (a crossbow and an item whose
// equip config has no allowAttachToItem, e.g. a backpack or pelican case), "unknown item" (no GrabbableItem, e.g. a crate),
// "not a fish" (salmon cannon), "nested" (a heart gun that is itself a held item) or "loaded slingshot" (`item`, the whole
// saved item when there is one, is a slingshot holding something). The editor refuses the add instead of saving an item the
// game drops loose.
export function holderAddRefusal(holderItemID, itemID, { nested = false, item = null } = {}) {
  if (!holderEntry(holderItemID)) return "";
  const plan = holderLoadPlan(holderItemID, [item && typeof item === "object" ? { ...item, itemID } : { itemID }], { nested });
  return plan.reason === "loaded" ? "" : plan.reason;
}
