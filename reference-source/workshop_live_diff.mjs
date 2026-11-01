// Convert editor snapshots into compare-and-swap operations for a shared room.
// Structural changes use an exact-revision replacement; disjoint field edits
// and additions can merge without erasing another editor's work.

const OBJECT_FIELDS = ["itemID", "position", "quaternion", "scaleModifier", "colorHue",
  "colorSaturation", "jellyStrength", "state", "ammo", "subParentID", "contents",
  "frozenEdge", "sourceItem", "sourceStuck", "transformDirty", "hierarchyDirty"];
const DOCUMENT_FIELDS = ["name", "filename", "preview", "dirty"];
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((value, index) => same(value, b[index]));
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]));
};

function idsMatch(before, after) {
  return same(before.map((row) => row.id).sort(), after.map((row) => row.id).sort());
}

function fieldChanges(before, after, fields) {
  const changed = fields.filter((field) => !same(before[field], after[field]));
  if (changed.some((field) => !Object.hasOwn(before, field) || !Object.hasOwn(after, field))) return null;
  return changed
    .map((field) => ({ field, before: clone(before[field]), after: clone(after[field]) }));
}

export function diffLiveSnapshots(before, after) {
  if (!before || !after) throw new TypeError("Two snapshots are required.");
  if (!idsMatch(before.documents, after.documents) ||
      !same(before.selectionGroups, after.selectionGroups)) {
    return { kind: "snapshot_replace", snapshot: clone(after) };
  }
  const oldObjects = new Map(before.objects.map((row) => [row.uid, row]));
  const newObjects = new Map(after.objects.map((row) => [row.uid, row]));
  if ([...oldObjects.keys()].some((uid) => !newObjects.has(uid))) {
    return { kind: "snapshot_replace", snapshot: clone(after) };
  }
  const added = [...newObjects.values()].filter((row) => !oldObjects.has(row.uid));
  if (added.some((row) => row.role !== "child" || !Number.isSafeInteger(row.uid) ||
      row.uid < 1 || !Array.isArray(row.children))) {
    return { kind: "snapshot_replace", snapshot: clone(after) };
  }
  const addedByUid = new Map(added.map((row) => [row.uid, row]));
  const ops = [];
  for (const document of after.documents) {
    const old = before.documents.find((row) => row.id === document.id);
    const changes = fieldChanges(old, document, DOCUMENT_FIELDS);
    if (!changes) return { kind: "snapshot_replace", snapshot: clone(after) };
    if (changes.length) ops.push({ kind: "document_set", documentId: document.id, changes });
  }
  for (const [uid, old] of oldObjects) {
    const row = newObjects.get(uid);
    if (old.role !== row.role || old.documentId !== row.documentId || old.parentUid !== row.parentUid) {
      return { kind: "snapshot_replace", snapshot: clone(after) };
    }
    if (!same(row.children.slice(0, old.children.length), old.children) ||
        row.children.slice(old.children.length).some((childUid) =>
          addedByUid.get(childUid)?.parentUid !== uid)) {
      return { kind: "snapshot_replace", snapshot: clone(after) };
    }
    const changes = fieldChanges(old, row, OBJECT_FIELDS);
    if (!changes) return { kind: "snapshot_replace", snapshot: clone(after) };
    if (changes.length) ops.push({ kind: "object_set", uid, changes });
  }
  if (added.length) {
    // Send new parents with an empty children array, then append descendants
    // in the exact order present in the editor snapshot.
    const seen = new Set();
    const addBranch = (uid, parentUid) => {
      const row = addedByUid.get(uid);
      if (!row || row.parentUid !== parentUid || seen.has(uid)) return false;
      seen.add(uid);
      ops.push({ kind: "object_add", object: { ...clone(row), children: [] } });
      return row.children.every((childUid) => addBranch(childUid, uid));
    };
    for (const old of before.objects) {
      const row = newObjects.get(old.uid);
      for (const uid of row.children.slice(old.children.length)) {
        if (!addBranch(uid, old.uid)) return { kind: "snapshot_replace", snapshot: clone(after) };
      }
    }
    if (seen.size !== added.length) return { kind: "snapshot_replace", snapshot: clone(after) };
  }
  return !ops.length ? null : ops.length === 1 ? ops[0] : { kind: "batch", operations: ops };
}

export function applyLiveMutation(snapshot, mutation, { allowReplacement = true } = {}) {
  const next = clone(snapshot);
  const apply = (op) => {
    if (op.kind === "batch") {
      for (const child of op.operations) {
        if (child.kind === "batch" || child.kind === "snapshot_replace") {
          throw new Error("A batch cannot contain a nested or structural replacement.");
        }
        apply(child);
      }
      return;
    }
    if (op.kind === "snapshot_replace") {
      if (!allowReplacement) throw new Error("A concurrent structural edit needs review.");
      return clone(op.snapshot);
    }
    if (op.kind === "object_set" || op.kind === "document_set") {
      const target = op.kind === "object_set"
        ? next.objects.find((row) => row.uid === op.uid)
        : next.documents.find((row) => row.id === op.documentId);
      if (!target) throw new Error("A part being edited was removed by another editor.");
      for (const change of op.changes) {
        if (!same(target[change.field], change.before)) {
          throw new Error(`Another editor changed ${change.field} on the same part.`);
        }
        target[change.field] = clone(change.after);
      }
      return;
    }
    if (op.kind === "object_add") {
      const object = op.object;
      if (next.objects.some((row) => row.uid === object.uid)) throw new Error("Two editors created the same part ID.");
      const parent = next.objects.find((row) => row.uid === object.parentUid);
      if (!parent) throw new Error("The parent of a new part was removed.");
      next.objects.push(clone(object));
      parent.children.push(object.uid);
      next.nextUid = Math.max(next.nextUid, object.uid + 1);
      return;
    }
    if (op.kind === "object_remove") {
      const index = next.objects.findIndex((row) => row.uid === op.uid);
      if (index < 0 || next.objects[index].role !== "child" ||
          !same(next.objects[index], op.before) || next.objects[index].children.length) {
        throw new Error("The part changed before it could be removed.");
      }
      const parent = next.objects.find((row) => row.uid === op.before.parentUid);
      if (!parent || parent.children.filter((uid) => uid === op.uid).length !== 1 ||
          next.selectionGroups.some((group) => group.uids.includes(op.uid))) {
        throw new Error("The part's link or selection group changed before removal.");
      }
      next.objects.splice(index, 1);
      parent.children.splice(parent.children.indexOf(op.uid), 1);
      next.selectedUids = next.selectedUids.filter((uid) => uid !== op.uid);
      if (next.selectedUid === op.uid) next.selectedUid = null;
      if (next.parentTargetUid === op.uid) next.parentTargetUid = parent.uid;
      return;
    }
    throw new Error(`Unsupported live edit: ${op.kind}`);
  };
  const result = apply(mutation);
  return result || next;
}

export function rebaseLiveSnapshot(base, local, remote) {
  const preserveLocalFocus = (rebased) => {
    const valid = new Set(rebased.objects.map((row) => row.uid));
    rebased.selectedUids = (local.selectedUids || []).filter((uid) => valid.has(uid));
    rebased.selectedUid = valid.has(local.selectedUid) ? local.selectedUid : null;
    rebased.parentTargetUid = valid.has(local.parentTargetUid) ? local.parentTargetUid : null;
    rebased.activeDocumentId = rebased.documents.some((row) => row.id === local.activeDocumentId)
      ? local.activeDocumentId : rebased.documents[0]?.id ?? null;
    rebased.nextUid = Math.max(rebased.nextUid, local.nextUid);
    rebased.nextDocumentId = Math.max(rebased.nextDocumentId, local.nextDocumentId);
    return rebased;
  };
  const mutation = diffLiveSnapshots(base, local);
  if (!mutation) return preserveLocalFocus(clone(remote));
  if (mutation.kind === "snapshot_replace" && !same(base, remote) && !same(local, remote)) {
    throw new Error("Both editors changed the workspace structure. Save a copy before choosing which version to keep.");
  }
  const merged = clone(remote);
  const applyRebased = (op) => {
    if (op.kind === "batch") { for (const child of op.operations) applyRebased(child); return; }
    if (op.kind === "snapshot_replace") return clone(local);
    if (op.kind === "object_set" || op.kind === "document_set") {
      const target = op.kind === "object_set"
        ? merged.objects.find((row) => row.uid === op.uid)
        : merged.documents.find((row) => row.id === op.documentId);
      if (!target) throw new Error("A part being edited was removed by another editor.");
      for (const change of op.changes) {
        if (same(target[change.field], change.after)) continue;
        if (!same(target[change.field], change.before)) {
          throw new Error(`Another editor changed ${change.field} on the same part.`);
        }
        target[change.field] = clone(change.after);
      }
      return;
    }
    if (op.kind === "object_add") {
      const existing = merged.objects.find((row) => row.uid === op.object.uid);
      if (existing) {
        if (!same(existing, op.object)) throw new Error("A newly added part changed on another editor.");
        return;
      }
    }
    if (op.kind === "object_remove" && !merged.objects.some((row) => row.uid === op.uid)) return;
    const updated = applyLiveMutation(merged, op);
    Object.assign(merged, updated);
  };
  const result = applyRebased(mutation);
  const rebased = result || merged;
  // Selection and focus belong to the local browser, not to the shared document.
  return preserveLocalFocus(rebased);
}
