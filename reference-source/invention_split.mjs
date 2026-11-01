// Split parts of an invention into a new invention in the same workspace (owner 2026-10-22). Pure planning over
// plain records { uid, parentUid, documentId, role, itemID, subParentID, frozenEdge, children: [uid...] }; the editor
// applies the plan (app.js splitIntoNewInvention) and keeps every part where it is drawn.
//
// mode "parts":  exactly the selected parts move. The topmost selected part becomes the new root (the active part
//                when it is one of the topmost). A moved part keeps its parent when that parent moves too, otherwise
//                it attaches to its nearest selected ancestor, or to the new root. Parts left behind whose parent moved
//                attach to their nearest remaining ancestor.
// mode "branch": each topmost selected part becomes the root of its own new invention and takes everything attached
//                under it; nothing else changes parent.
//
// A locked (verbatim, unprobed sub-part) edge cannot be re-encoded, so a part with one must keep its parent.

export const SPLIT_MODES = Object.freeze(["parts", "branch"]);

function label(record) { return `${record.itemID} #${record.uid}`; }

export function uniqueInventionName(base, existingNames) {
  const taken = new Set([...existingNames].map((name) => String(name).toLowerCase()));
  if (!taken.has(String(base).toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

// hasFrame(parentItemID, subParentID) -> boolean (an editable frame exists); checkRoot(itemID) throws when the
// item cannot be an invention root.
export function planInventionSplit(records, { mode, selectedUids, activeUid = null, hasFrame = () => true, checkRoot = () => {} }) {
  if (!SPLIT_MODES.includes(mode)) throw new Error(`Unknown split mode: ${mode}`);
  const byUid = new Map(records.map((record) => [record.uid, record]));
  const selected = [...new Set(selectedUids || [])].map((uid) => byUid.get(uid)).filter(Boolean);
  if (!selected.length) throw new Error("Select the parts to move first.");

  // depth-first hierarchy order per invention, so the root choice and the result are deterministic
  const order = new Map();
  let next = 0;
  const visit = (record) => {
    if (!record || order.has(record.uid)) return;
    order.set(record.uid, next++);
    for (const uid of record.children || []) visit(byUid.get(uid));
  };
  for (const record of records) if (record.role === "root") visit(record);
  for (const record of records) visit(record);
  const inOrder = (list) => list.slice().sort((a, b) => order.get(a.uid) - order.get(b.uid));
  const parent = (record) => (record.parentUid != null ? byUid.get(record.parentUid) || null : null);
  const ancestors = function* (record) { for (let p = parent(record); p; p = parent(p)) yield p; };
  const subtree = (record) => {
    const out = [];
    const walk = (node) => { if (!node) return; out.push(node); for (const uid of node.children || []) walk(byUid.get(uid)); };
    walk(record);
    return out;
  };

  const inventions = [];
  const reparent = [];
  const addReparent = (record, target) => {
    if (record.frozenEdge) {
      throw new Error(`${label(record)} has a locked edge (its attachment point was never measured), so it can only stay on ` +
        `${parent(record) ? label(parent(record)) : "its parent"}. Select both or neither.`);
    }
    const wanted = Math.round(Number(record.subParentID) || 0);
    const keep = wanted === 0 || hasFrame(target.itemID, wanted);
    reparent.push({ uid: record.uid, parentUid: target.uid, subParentID: keep ? wanted : 0, rehomed: !keep });
  };

  if (mode === "branch") {
    const candidates = selected.filter((record) => record.role !== "root");
    if (!candidates.length) throw new Error("Select a part (not the invention's root) to become the root of the new invention.");
    const chosen = new Set(candidates.map((record) => record.uid));
    const tops = inOrder(candidates.filter((record) => ![...ancestors(record)].some((a) => chosen.has(a.uid))));
    for (const top of tops) {
      checkRoot(top.itemID);
      inventions.push({ sourceDocumentId: top.documentId, rootUid: top.uid, memberUids: inOrder(subtree(top)).map((r) => r.uid) });
    }
    return { mode, inventions, reparent };
  }

  const documents = new Set(selected.map((record) => record.documentId));
  if (documents.size > 1) throw new Error("Select parts of one invention at a time.");
  const sourceRoot = selected.find((record) => record.role === "root");
  if (sourceRoot) {
    throw new Error(`${label(sourceRoot)} is this invention's root and stays with it. Deselect it, or use "New invention from branch" ` +
      "on a part to take that part and everything under it.");
  }
  const moving = new Set(selected.map((record) => record.uid));
  const ordered = inOrder(selected);
  const tops = ordered.filter((record) => ![...ancestors(record)].some((a) => moving.has(a.uid)));
  const root = tops.find((record) => record.uid === activeUid) || tops[0];
  checkRoot(root.itemID);
  for (const record of ordered) {
    if (record === root) continue;
    const target = [...ancestors(record)].find((a) => moving.has(a.uid)) || root;
    if (target.uid !== record.parentUid) addReparent(record, target);
  }
  // parts left behind under a moving part attach to their nearest remaining ancestor (the old root always remains)
  for (const record of inOrder(records.filter((r) => r.documentId === root.documentId && !moving.has(r.uid) && r.role !== "root"))) {
    const p = parent(record);
    if (!p || !moving.has(p.uid)) continue;
    const target = [...ancestors(record)].find((a) => !moving.has(a.uid));
    if (!target) throw new Error(`${label(record)} has no remaining parent in its invention.`);
    addReparent(record, target);
  }
  inventions.push({ sourceDocumentId: root.documentId, rootUid: root.uid, memberUids: ordered.map((r) => r.uid) });
  return { mode, inventions, reparent };
}

// Merge one invention into another (owner 2026-10-25): the inverse of a split, for builds that were duplicated or split
// into separate JSON files by accident. The source invention's root becomes a part stuck to the target part (the
// target invention's root unless another of its parts is named), taking every part of the source along; the source
// invention then leaves the workspace. The editor keeps every part where it is drawn.
export function planInventionMerge(records, { sourceDocumentId, targetDocumentId, targetUid = null }) {
  if (!sourceDocumentId || !targetDocumentId) throw new Error("Choose the invention to merge into.");
  if (sourceDocumentId === targetDocumentId) throw new Error("Choose a different invention to merge into.");
  const sourceRoot = records.find((record) => record.documentId === sourceDocumentId && record.role === "root");
  if (!sourceRoot) throw new Error("The invention to merge has no root item yet.");
  const targetRoot = records.find((record) => record.documentId === targetDocumentId && record.role === "root");
  if (!targetRoot) throw new Error("The invention to merge into has no root item yet.");
  const target = targetUid == null ? targetRoot : records.find((record) => record.uid === targetUid);
  if (!target || target.documentId !== targetDocumentId)
    throw new Error("The part to attach to must belong to the invention you merge into.");
  return { sourceRootUid: sourceRoot.uid, targetUid: target.uid,
    memberUids: records.filter((record) => record.documentId === sourceDocumentId).map((record) => record.uid) };
}
