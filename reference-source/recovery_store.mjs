// Durable, origin-local recovery snapshots. Metadata lives separately so the
// restore menu can list backups without reading every full editor snapshot.
const SCHEMA = "mikeybox.goop-editor.recovery.v1";
const DATABASE_VERSION = 1;
const RECORDS = "snapshots";
const METADATA = "snapshot_metadata";

function storageError(action, cause) {
  const detail = cause?.message || cause?.name || String(cause || "unknown error");
  const error = new Error(`Could not ${action} editor recovery backups: ${detail}`);
  error.cause = cause;
  return error;
}

function textField(value, name, maxLength, required = true) {
  if (value == null && !required) return "";
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${name} must be a nonempty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function payloadField(value, name) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  if (name === "snapshot" && (!Array.isArray(value.objects) || !Array.isArray(value.documents))) {
    throw new TypeError("snapshot must contain objects and documents arrays.");
  }
  if (name === "project" && (!Array.isArray(value.documents) || typeof value.schema !== "string")) {
    throw new TypeError("project must be a versioned workspace project with a documents array.");
  }
  return value;
}

function validateId(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError("Backup id must be a positive integer.");
}

function metadataOf(record) {
  if (record?.schema !== SCHEMA || !Number.isSafeInteger(record.id) || record.id < 1) {
    throw new Error("A recovery backup has an unsupported or damaged schema.");
  }
  return {
    id: record.id,
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    reason: record.reason,
    label: record.label,
    fingerprint: record.fingerprint,
  };
}

function newestFirst(a, b) {
  return b.createdAt - a.createdAt || b.id - a.id;
}

export class RecoveryStore {
  constructor({ indexedDB = globalThis.indexedDB, dbName = "mikeybox-goop-recovery-v1", limit = 20 } = {}) {
    if (!indexedDB || typeof indexedDB.open !== "function") {
      throw new Error("Editor recovery backups are unavailable because IndexedDB is disabled in this browser.");
    }
    if (typeof dbName !== "string" || !dbName.trim()) throw new TypeError("dbName must be a nonempty string.");
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("limit must be a positive integer.");
    this.indexedDB = indexedDB;
    this.dbName = dbName;
    this.limit = limit;
  }

  async #open() {
    let request;
    try { request = this.indexedDB.open(this.dbName, DATABASE_VERSION); }
    catch (error) { throw storageError("open", error); }
    return new Promise((resolve, reject) => {
      let settled = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS, { keyPath: "id", autoIncrement: true });
        if (!db.objectStoreNames.contains(METADATA)) db.createObjectStore(METADATA, { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        if (settled) db.close();
        else { settled = true; resolve(db); }
      };
      request.onerror = () => {
        if (!settled) { settled = true; reject(storageError("open", request.error)); }
      };
      request.onblocked = () => {
        if (!settled) { settled = true; reject(new Error("Editor recovery backups are blocked by another open editor tab. Close or reload that tab and retry.")); }
      };
    });
  }

  async #transact(storeNames, mode, action, setup) {
    const db = await this.#open();
    try {
      return await new Promise((resolve, reject) => {
        let transaction;
        try { transaction = db.transaction(storeNames, mode); }
        catch (error) { reject(storageError(action, error)); return; }
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(storageError(action, transaction.error));
        try { setup(transaction, (value) => { result = value; }); }
        catch (error) {
          try { transaction.abort(); } catch (_) { /* The transaction may already have aborted. */ }
          reject(storageError(action, error));
        }
      });
    } finally { db.close(); }
  }

  async save({ sessionId, createdAt = Date.now(), reason, label, snapshot, project, fingerprint } = {}) {
    const record = {
      schema: SCHEMA,
      sessionId: textField(sessionId, "sessionId", 128),
      createdAt,
      reason: textField(reason, "reason", 80),
      label: textField(label, "label", 240),
      fingerprint: textField(fingerprint, "fingerprint", 256, false),
      snapshot: payloadField(snapshot, "snapshot"),
      project: payloadField(project, "project"),
    };
    if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
      throw new TypeError("createdAt must be a nonnegative millisecond timestamp.");
    }
    if (!record.snapshot && !record.project) throw new TypeError("A recovery backup needs a snapshot or workspace project.");

    return this.#transact([RECORDS, METADATA], "readwrite", "save", (transaction, finish) => {
      const records = transaction.objectStore(RECORDS);
      const metadata = transaction.objectStore(METADATA);
      const add = records.add(record);
      add.onsuccess = () => {
        const id = add.result;
        const saved = metadataOf({ ...record, id });
        const put = metadata.put({ schema: SCHEMA, ...saved });
        put.onsuccess = () => {
          const all = metadata.getAll();
          all.onsuccess = () => {
            // Both stores are updated in this one transaction. A quota error,
            // failed write, or abort leaves all earlier backups untouched.
            const oldest = all.result.slice().sort(newestFirst).reverse();
            let excess = oldest.length - this.limit;
            for (const item of oldest) {
              if (excess <= 0) break;
              if (item.id === id) continue; // Never discard the save just requested.
              metadata.delete(item.id);
              records.delete(item.id);
              excess--;
            }
            finish(saved);
          };
        };
      };
    });
  }

  async list() {
    return this.#transact([METADATA], "readonly", "list", (transaction, finish) => {
      const request = transaction.objectStore(METADATA).getAll();
      request.onsuccess = () => finish(request.result.map(metadataOf).sort(newestFirst));
    });
  }

  async get(id) {
    validateId(id);
    return this.#transact([RECORDS], "readonly", "load", (transaction, finish) => {
      const request = transaction.objectStore(RECORDS).get(id);
      request.onsuccess = () => {
        const record = request.result;
        if (record === undefined) { finish(null); return; }
        metadataOf(record);
        finish(record);
      };
    });
  }

  async remove(id) {
    validateId(id);
    return this.#transact([RECORDS, METADATA], "readwrite", "remove", (transaction, finish) => {
      const metadata = transaction.objectStore(METADATA);
      const existed = metadata.get(id);
      existed.onsuccess = () => {
        transaction.objectStore(RECORDS).delete(id);
        metadata.delete(id);
        finish(existed.result !== undefined);
      };
    });
  }
}

export const RECOVERY_SCHEMA = SCHEMA;
