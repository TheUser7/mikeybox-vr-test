// An editor-local clipboard stores the selected forest, not live object references.
// A copied subtree must still paste after its source is edited or deleted.
const clone = (value) => JSON.parse(JSON.stringify(value));

export function captureSelectedForest(snapshot) {
  const byUid = new Map((snapshot?.objects || []).map((record) => [record.uid, record]));
  const selected = new Set(snapshot?.selectedUids || []);
  const documents = new Map((snapshot?.documents || []).map((document) => [document.id, document]));
  const roots = [];
  const selectedRecords = (snapshot?.selectedUids || []).map((uid) => byUid.get(uid)).filter(Boolean);
  for (const record of selectedRecords) {
    let ancestor = byUid.get(record.parentUid);
    const seen = new Set([record.uid]);
    let covered = false;
    while (ancestor && !seen.has(ancestor.uid)) {
      if (selected.has(ancestor.uid)) { covered = true; break; }
      seen.add(ancestor.uid);
      ancestor = byUid.get(ancestor.parentUid);
    }
    if (covered) continue;
    const nodes = [];
    const collect = (node) => {
      if (!node || nodes.some((item) => item.uid === node.uid)) return;
      nodes.push(clone(node));
      for (const childUid of node.children || []) collect(byUid.get(childUid));
    };
    collect(record);
    roots.push({ sourceDocumentId: record.documentId, sourceParentUid: record.parentUid,
      rootUid: record.uid, isDocumentRoot: record.role === "root",
      document: record.role === "root" ? clone(documents.get(record.documentId) || {}) : null,
      nodes });
  }
  return { entries: roots, sourceDocumentIds: [...new Set(roots.map((entry) => entry.sourceDocumentId))] };
}

// Only the selected parts, none of the parts under them that were left unselected (owner 2026-10-25). A selected part
// whose own parent is selected too stays attached to that parent's copy; every other selected part starts its own
// entry, which pastes onto its original parent, so its copy lands beside it on the same parent at the same pose.
export function captureSelectedParts(snapshot) {
  const byUid = new Map((snapshot?.objects || []).map((record) => [record.uid, record]));
  const selected = new Set((snapshot?.selectedUids || []).filter((uid) => byUid.has(uid)));
  const documents = new Map((snapshot?.documents || []).map((document) => [document.id, document]));
  const roots = [];
  for (const uid of snapshot?.selectedUids || []) {
    const record = byUid.get(uid);
    if (!record || selected.has(record.parentUid) || roots.some((entry) => entry.rootUid === uid)) continue;
    const nodes = [];
    const collect = (node) => {
      if (!node || nodes.some((item) => item.uid === node.uid)) return;
      const copy = clone(node);
      copy.children = (node.children || []).filter((childUid) => selected.has(childUid));
      nodes.push(copy);
      for (const childUid of copy.children) collect(byUid.get(childUid));
    };
    collect(record);
    roots.push({ sourceDocumentId: record.documentId, sourceParentUid: record.parentUid,
      rootUid: record.uid, isDocumentRoot: record.role === "root",
      document: record.role === "root" ? clone(documents.get(record.documentId) || {}) : null,
      nodes });
  }
  return { entries: roots, sourceDocumentIds: [...new Set(roots.map((entry) => entry.sourceDocumentId))] };
}

export function editorClipboardShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return null;
  const target = event.target;
  const tag = target?.tagName?.toUpperCase();
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || target?.isContentEditable ||
      target?.closest?.("[contenteditable]")) return null;
  const key = String(event.key || "").toLowerCase();
  if (key === "c") return "copy";
  if (key === "v") return "paste";
  if (key === "d") return "duplicate";
  return null;
}
