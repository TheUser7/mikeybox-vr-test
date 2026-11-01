import { validateInvention } from "./goop_rules.mjs";

// This is an editor project, not an invention. The game and Prime accept one
// vanilla item root per package; the document roots below are exported alone.
export const WORKSPACE_PROJECT_SCHEMA = "mikeybox.goop-editor.workspace.v1";
export const PREVIEW_ATTACHMENTS = Object.freeze([
  "free", "back", "hipLeft", "hipRight", "handLeft", "handRight",
  // Loaded as a crossbow's ammo: the ghost player's crossbow, or a crossbow inside another document (`holder`).
  "ghostCrossbow", "crossbow",
]);
const MAX_HOLDER_ROUTE = 512;

const IDENTITY_ROTATION = [0, 0, 0, 1];
const ZERO_POSITION = [0, 0, 0];

function jsonCopy(value) {
  let json;
  try { json = JSON.stringify(value); }
  catch (error) { throw new TypeError(`Invention data must be JSON serializable: ${error.message}`); }
  if (json === undefined) throw new TypeError("Invention data must be JSON serializable.");
  return JSON.parse(json);
}

function itemRoot(root) {
  const copy = jsonCopy(root);
  if (!copy || typeof copy !== "object" || Array.isArray(copy) || isWorkspaceProject(copy) ||
      typeof copy.itemID !== "string" || !copy.itemID.trim()) {
    throw new TypeError("Each document needs one vanilla goop root with an itemID.");
  }
  return copy;
}

function nonemptyId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new TypeError(`${label} must be a nonempty, simple ID.`);
  }
  return value;
}

function nextOrdinalForId(id, prefix, current) {
  const match = new RegExp(`^${prefix}-([1-9]\\d*)$`).exec(id);
  if (!match) return current;
  const ordinal = Number(match[1]);
  return Number.isSafeInteger(ordinal) && ordinal < Number.MAX_SAFE_INTEGER
    ? Math.max(current, ordinal + 1) : current;
}

function numberArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length ||
      value.some((part) => typeof part !== "number" || !Number.isFinite(part))) {
    throw new TypeError(`${label} must contain ${length} finite numbers.`);
  }
  return value.slice();
}

function normalizedPreview(input = {}, base = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Preview placement must be an object.");
  }
  const attachment = input.attachment ?? base?.attachment ?? "free";
  if (!PREVIEW_ATTACHMENTS.includes(attachment)) {
    throw new TypeError(`Unknown preview attachment: ${String(attachment)}.`);
  }
  const position = numberArray(input.position ?? base?.position ?? ZERO_POSITION, 3, "Preview position");
  const rotation = numberArray(input.rotation ?? base?.rotation ?? IDENTITY_ROTATION, 4, "Preview rotation");
  const magnitude = Math.hypot(...rotation);
  if (magnitude < 1e-10) throw new TypeError("Preview rotation cannot be a zero quaternion.");
  const visible = input.visible ?? base?.visible ?? true;
  if (typeof visible !== "boolean") throw new TypeError("Preview visible must be a boolean.");
  const layoutGroupId = input.layoutGroupId ?? base?.layoutGroupId;
  if (layoutGroupId !== undefined) nonemptyId(layoutGroupId, "Preview layout group ID");
  // Both hands (player request 2026-10-18): a hand-held invention is also drawn in the other hand, the way the game holds a
  // second copy. Kept across attachment changes; it only draws for the left/right hand attachments.
  const bothHands = input.bothHands ?? base?.bothHands ?? false;
  if (typeof bothHands !== "boolean") throw new TypeError("Preview bothHands must be a boolean.");
  let holder;
  if (attachment === "crossbow") {
    // Which crossbow: a document ID and the stuck-child index path from that document's root (editor record IDs
    // are not stable across saves). Resolved when drawn; a missing crossbow just shows nothing loaded.
    const raw = input.holder ?? base?.holder;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("A crossbow attachment needs a holder.");
    const route = raw.route ?? [];
    if (!Array.isArray(route) || route.length > MAX_HOLDER_ROUTE ||
        route.some((index) => !Number.isSafeInteger(index) || index < 0)) {
      throw new TypeError("Crossbow holder route must be a list of child indices.");
    }
    holder = { documentId: nonemptyId(raw.documentId, "Crossbow holder document ID"), route: route.slice() };
  }
  return {
    attachment,
    // For an attachment this is an offset from the exported game anchor; for
    // `free` it is a world pose. Neither value belongs in vanilla goop JSON.
    position,
    // Preserve an already-unit quaternion byte-for-byte across project saves.
    rotation: Math.abs(magnitude - 1) < 1e-12 ? rotation : rotation.map((part) => part / magnitude),
    visible,
    // Root copies share an editor preview lane; this never enters vanilla item JSON.
    ...(layoutGroupId === undefined ? {} : { layoutGroupId }),
    ...(holder ? { holder } : {}),
    ...(bothHands ? { bothHands: true } : {}),
  };
}

function graphNodes(root) {
  const nodes = [];
  const pending = [{ item: root, path: [], parentPath: null, kind: "root" }];
  while (pending.length) {
    const current = pending.pop();
    nodes.push(current);
    const next = [];
    const stuck = Array.isArray(current.item.stuckChildren) ? current.item.stuckChildren : [];
    for (let i = 0; i < stuck.length; i++) {
      if (stuck[i]?.item && typeof stuck[i].item === "object") {
        next.push({ item: stuck[i].item, path: [...current.path, "stuckChildren", i, "item"],
          parentPath: current.path, kind: "stuck" });
      }
    }
    const contents = Array.isArray(current.item.children) ? current.item.children : [];
    for (let i = 0; i < contents.length; i++) {
      const wrapped = contents[i]?.item && typeof contents[i].item === "object";
      const child = wrapped ? contents[i].item : contents[i];
      if (child && typeof child === "object" && child.itemID) {
        next.push({ item: child, path: [...current.path, "children", i, ...(wrapped ? ["item"] : [])],
          parentPath: current.path, kind: "contents" });
      }
    }
    const extension = Array.isArray(current.item.containerContents) ? current.item.containerContents : [];
    for (let i = 0; i < extension.length; i++) {
      if (extension[i] && typeof extension[i] === "object" && extension[i].itemID) {
        next.push({ item: extension[i], path: [...current.path, "containerContents", i],
          parentPath: current.path, kind: "contents" });
      }
    }
    for (let i = next.length - 1; i >= 0; i--) pending.push(next[i]);
  }
  return nodes;
}

function providedRecordIds(entries) {
  if (entries === undefined) return null;
  if (!Array.isArray(entries)) throw new TypeError("Project record IDs must be an array.");
  const byPath = new Map();
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || !Array.isArray(entry.path) ||
        entry.path.some((step) => !(typeof step === "string" || Number.isSafeInteger(step)))) {
      throw new TypeError("Project record ID has an invalid item path.");
    }
    const id = nonemptyId(entry.id, "Record ID");
    const key = JSON.stringify(entry.path);
    if (byPath.has(key) || seen.has(id)) throw new Error("Project has duplicate record IDs or paths.");
    byPath.set(key, id);
    seen.add(id);
  }
  return byPath;
}

export function isWorkspaceProject(value) {
  return !!value && typeof value === "object" && value.schema === WORKSPACE_PROJECT_SCHEMA;
}

/**
 * Pure document ownership model. It owns JSON copies and never exposes a live
 * root reference. A renderer can use record IDs as selection keys; replacing a
 * graph without an explicit ID/path map invalidates only that document's old
 * selection. Edits to one root cannot attach nodes to another root by alias.
 */
export class InventionWorkspace {
  #documents = new Map();
  #owners = new Map();
  #activeDocumentId = null;
  #selection = [];
  #nextDocumentOrdinal = 1;
  #nextRecordOrdinal = 1;

  get activeDocumentId() { return this.#activeDocumentId; }
  get selection() { return this.#selection.map((reference) => ({ ...reference })); }
  get documentCount() { return this.#documents.size; }

  #document(id) {
    const doc = this.#documents.get(id);
    if (!doc) throw new RangeError(`Unknown document ID: ${String(id)}.`);
    return doc;
  }

  #newDocumentId() {
    let id;
    do { id = `doc-${this.#nextDocumentOrdinal++}`; } while (this.#documents.has(id));
    return id;
  }

  #newRecordId(used) {
    let id;
    do { id = `record-${this.#nextRecordOrdinal++}`; }
    while (this.#owners.has(id) || used.has(id));
    return id;
  }

  #index(root, recordIds, replacingDocumentId = null) {
    const provided = providedRecordIds(recordIds);
    const nodes = graphNodes(root);
    const records = new Map();
    const byPath = new Map();
    const used = new Set();
    for (const node of nodes) {
      const key = JSON.stringify(node.path);
      if (provided && !provided.has(key)) {
        throw new Error("Project record IDs do not match this document's item graph.");
      }
      const id = provided?.get(key) ?? this.#newRecordId(used);
      if (this.#owners.has(id) && this.#owners.get(id) !== replacingDocumentId) {
        throw new Error(`Record ID ${id} already belongs to another document.`);
      }
      if (used.has(id)) throw new Error(`Duplicate record ID: ${id}.`);
      used.add(id);
      byPath.set(key, id);
      records.set(id, { recordId: id, path: node.path, itemID: String(node.item.itemID ?? ""),
        parentRecordId: node.parentPath === null ? null : byPath.get(JSON.stringify(node.parentPath)),
        kind: node.kind });
    }
    if (provided && provided.size !== nodes.length) {
      throw new Error("Project record IDs do not match this document's item graph.");
    }
    return records;
  }

  addDocument({ root, name, id, preview, activate = true, dirty = false, recordIds } = {}) {
    const documentId = id === undefined ? this.#newDocumentId() : nonemptyId(id, "Document ID");
    if (this.#documents.has(documentId)) throw new Error(`Duplicate document ID: ${documentId}.`);
    const ownedRoot = itemRoot(root);
    const ownedPreview = normalizedPreview(preview);
    const records = this.#index(ownedRoot, recordIds);
    const title = name === undefined ? ownedRoot.itemID : String(name).trim();
    if (!title) throw new TypeError("Document name cannot be empty.");
    const doc = { id: documentId, name: title, root: ownedRoot, preview: ownedPreview,
      dirty: !!dirty, records };
    this.#documents.set(documentId, doc);
    for (const recordId of records.keys()) this.#owners.set(recordId, documentId);
    this.#nextDocumentOrdinal = nextOrdinalForId(documentId, "doc", this.#nextDocumentOrdinal);
    for (const recordId of records.keys()) {
      this.#nextRecordOrdinal = nextOrdinalForId(recordId, "record", this.#nextRecordOrdinal);
    }
    if (activate || this.#activeDocumentId === null) this.#activeDocumentId = documentId;
    return documentId;
  }

  removeDocument(id) {
    const doc = this.#document(id);
    for (const recordId of doc.records.keys()) this.#owners.delete(recordId);
    this.#documents.delete(id);
    this.#selection = this.#selection.filter((reference) => reference.documentId !== id);
    if (this.#activeDocumentId === id) this.#activeDocumentId = this.#documents.keys().next().value ?? null;
  }

  setActiveDocument(id) {
    this.#document(id);
    this.#activeDocumentId = id;
  }

  renameDocument(id, name) {
    const title = String(name).trim();
    if (!title) throw new TypeError("Document name cannot be empty.");
    const doc = this.#document(id);
    doc.name = title;
    doc.dirty = true;
  }

  setPreview(id, update) {
    const doc = this.#document(id);
    doc.preview = normalizedPreview(update, doc.preview);
    doc.dirty = true;
  }

  markClean(id) { this.#document(id).dirty = false; }

  replaceDocumentRoot(id, root, { recordIds } = {}) {
    const doc = this.#document(id);
    const ownedRoot = itemRoot(root);
    const records = this.#index(ownedRoot, recordIds, id);
    for (const recordId of doc.records.keys()) this.#owners.delete(recordId);
    doc.root = ownedRoot;
    doc.records = records;
    doc.dirty = true;
    for (const recordId of records.keys()) this.#owners.set(recordId, id);
    for (const recordId of records.keys()) {
      this.#nextRecordOrdinal = nextOrdinalForId(recordId, "record", this.#nextRecordOrdinal);
    }
    this.#selection = this.#selection.filter((reference) =>
      reference.documentId !== id || records.has(reference.recordId));
  }

  listDocuments() {
    return [...this.#documents.values()].map((doc) => ({
      id: doc.id, name: doc.name, rootItemID: doc.root.itemID,
      nodeCount: doc.records.size, preview: jsonCopy(doc.preview), dirty: doc.dirty,
      active: doc.id === this.#activeDocumentId,
      selectedCount: this.#selection.filter((reference) => reference.documentId === doc.id).length,
    }));
  }

  getDocument(id) {
    const doc = this.#document(id);
    return { id: doc.id, name: doc.name, root: jsonCopy(doc.root),
      preview: jsonCopy(doc.preview), dirty: doc.dirty };
  }

  listRecords(id) {
    const doc = this.#document(id);
    return [...doc.records.values()].map((record) => ({ ...record, path: record.path.slice(), documentId: id }));
  }

  recordOwner(recordId) { return this.#owners.get(recordId) ?? null; }

  getRecord(recordId) {
    const documentId = this.recordOwner(recordId);
    if (documentId === null) return null;
    const doc = this.#document(documentId);
    const record = doc.records.get(recordId);
    let item = doc.root;
    for (const step of record.path) item = item[step];
    return { ...record, path: record.path.slice(), documentId, item: jsonCopy(item) };
  }

  setSelection(references, { activatePrimary = false } = {}) {
    if (!Array.isArray(references)) throw new TypeError("Selection must be an array of document/record IDs.");
    const seen = new Set();
    const next = [];
    for (const reference of references) {
      const documentId = reference?.documentId;
      const recordId = reference?.recordId;
      const doc = this.#document(documentId);
      if (!doc.records.has(recordId)) throw new RangeError(`Record ${String(recordId)} does not belong to ${documentId}.`);
      if (seen.has(recordId)) continue;
      seen.add(recordId);
      next.push({ documentId, recordId });
    }
    this.#selection = next;
    if (activatePrimary && next.length) this.#activeDocumentId = next[0].documentId;
  }

  exportDocument(id) { return jsonCopy(this.#document(id).root); }
  serializeDocument(id, pretty = true) { return JSON.stringify(this.exportDocument(id), null, pretty ? 2 : 0); }
  validateDocument(id, options = {}) { return validateInvention(this.#document(id).root, options); }
  validateAll(options = {}) {
    return this.listDocuments().map(({ id }) => ({ documentId: id, ...this.validateDocument(id, options) }));
  }

  exportProject() {
    return {
      schema: WORKSPACE_PROJECT_SCHEMA,
      nextIds: { document: this.#nextDocumentOrdinal, record: this.#nextRecordOrdinal },
      activeDocumentId: this.#activeDocumentId,
      selection: this.selection,
      documents: [...this.#documents.values()].map((doc) => ({
        id: doc.id, name: doc.name, root: jsonCopy(doc.root), preview: jsonCopy(doc.preview), dirty: doc.dirty,
        recordIds: [...doc.records.values()].map(({ recordId, path }) => ({ id: recordId, path: path.slice() })),
      })),
    };
  }

  serializeProject(pretty = true) { return JSON.stringify(this.exportProject(), null, pretty ? 2 : 0); }

  static fromProject(input) {
    const project = typeof input === "string" ? JSON.parse(input) : jsonCopy(input);
    if (!isWorkspaceProject(project) || !Array.isArray(project.documents)) {
      throw new TypeError("Expected a Mikeybox editor workspace project, not a goop invention.");
    }
    const workspace = new InventionWorkspace();
    for (const document of project.documents) {
      workspace.addDocument({ ...document, activate: false });
    }
    if (project.nextIds !== undefined) {
      const { document: nextDocument, record: nextRecord } = project.nextIds ?? {};
      if (!Number.isSafeInteger(nextDocument) || nextDocument < 1 ||
          !Number.isSafeInteger(nextRecord) || nextRecord < 1) {
        throw new TypeError("Project nextIds must contain positive safe integer document and record counters.");
      }
      workspace.#nextDocumentOrdinal = Math.max(nextDocument, workspace.#nextDocumentOrdinal);
      workspace.#nextRecordOrdinal = Math.max(nextRecord, workspace.#nextRecordOrdinal);
    }
    if (project.documents.length) workspace.setActiveDocument(project.activeDocumentId);
    else if (project.activeDocumentId !== null) throw new RangeError("Empty workspace cannot have an active document.");
    workspace.setSelection(project.selection ?? []);
    return workspace;
  }
}
