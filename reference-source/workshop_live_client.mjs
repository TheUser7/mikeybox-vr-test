import { diffLiveSnapshots, applyLiveMutation, rebaseLiveSnapshot } from "./workshop_live_diff.mjs";

const copy = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function inverseLiveMutation(mutation, previousSnapshot) {
  if (mutation.kind === "batch") {
    return { kind: "batch", operations: mutation.operations.slice().reverse()
      .map((operation) => inverseLiveMutation(operation, previousSnapshot)) };
  }
  if (mutation.kind === "object_set" || mutation.kind === "document_set") {
    return { ...copy(mutation), changes: mutation.changes.map(({ field, before, after }) =>
      ({ field, before: copy(after), after: copy(before) })) };
  }
  if (mutation.kind === "object_add") {
    return { kind: "object_remove", uid: mutation.object.uid, before: copy(mutation.object) };
  }
  if (mutation.kind === "object_remove") {
    return { kind: "object_add", object: copy(mutation.before) };
  }
  if (mutation.kind === "snapshot_replace") {
    return { kind: "snapshot_replace", snapshot: copy(previousSnapshot) };
  }
  throw new Error(`Cannot undo ${mutation.kind}.`);
}

export class LiveWorkspaceClient {
  constructor({ url, getSnapshot, applySnapshot, onStatus = () => {},
    onPresence = () => {}, onHistory = () => {}, WebSocketImpl = globalThis.WebSocket }) {
    this.url = url;
    this.getSnapshot = getSnapshot;
    this.applySnapshot = applySnapshot;
    this.onStatus = onStatus;
    this.onPresence = onPresence;
    this.onHistory = onHistory;
    this.WebSocketImpl = WebSocketImpl;
    this.socket = null;
    this.canonical = null;
    this.revision = 0;
    this.pending = null;
    this.seedAttempt = null;
    this.role = null;
    this.undoStack = [];
    this.redoStack = [];
    this.active = false;
    this.ready = false;
    this.applying = false;
    this.reconnectTimer = null;
    this.leaseTimer = null;
    this.flushTimer = null;
    this.lastPresence = "";
  }

  get canUndo() { return this.ready && !this.pending && !this.hasUnsentChanges() && this.undoStack.length > 0; }
  get canRedo() { return this.ready && !this.pending && !this.hasUnsentChanges() && this.redoStack.length > 0; }

  hasUnsentChanges() {
    return !this.ready || !this.canonical || !!diffLiveSnapshots(this.canonical, this.getSnapshot());
  }

  connect() {
    if (this.active) return;
    this.active = true;
    this.open();
  }

  open() {
    if (!this.active) return;
    const socket = new this.WebSocketImpl(this.url);
    this.socket = socket;
    this.ready = false;
    this.onStatus("Connecting live editors…");
    socket.addEventListener("message", (event) => {
      try { this.handle(JSON.parse(event.data)); }
      catch (error) { this.fail(`Live update failed: ${error.message || error}`); }
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.ready = false;
      this.lastPresence = "";
      this.onHistory();
      if (this.active) {
        this.onStatus("Connection interrupted. Reconnecting…");
        this.reconnectTimer = setTimeout(() => this.open(), 1500);
      }
    });
    socket.addEventListener("error", () => this.onStatus("Live connection error; retrying…"));
  }

  send(value) {
    if (this.socket?.readyState !== 1) return false;
    this.socket.send(JSON.stringify(value));
    return true;
  }

  stop(message = "Left live editing.") {
    this.active = false;
    this.ready = false;
    clearTimeout(this.reconnectTimer); clearTimeout(this.leaseTimer); clearTimeout(this.flushTimer);
    this.socket?.close();
    this.socket = null;
    this.pending = null;
    this.seedAttempt = null;
    this.onHistory();
    this.onStatus(message);
  }

  fail(message) {
    this.stop(message);
  }

  restore(snapshot) {
    this.applying = true;
    try { this.applySnapshot(copy(snapshot)); }
    finally { this.applying = false; }
  }

  handle(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "hello") {
      this.revision = message.revision;
      this.role = message.role;
      this.onPresence(message.users || []);
      this.lastPresence = "";
      this.scheduleLeaseRenewal(message.leaseExpiresAt);
      if (message.snapshot === null) {
        this.seedAttempt ??= { opId: crypto.randomUUID(), snapshot: copy(this.getSnapshot()) };
        this.send({ type: "seed", ...this.seedAttempt });
        return;
      }
      this.seedAttempt = null;
      if (this.pending) {
        // A disconnect may happen after the server commits but before its
        // broadcast arrives. Retry the original ID; its durable receipt tells
        // us whether it was already applied, without a second write.
        this.canonical = copy(message.snapshot);
        this.ready = true;
        this.send({ type: "mutate", opId: this.pending.opId,
          baseRevision: this.pending.baseRevision, mutation: this.pending.mutation });
        this.onStatus("Checking the last live edit…");
        this.sendPresence();
        return;
      }
      if (this.canonical) {
        const merged = rebaseLiveSnapshot(this.canonical, this.getSnapshot(), message.snapshot);
        this.canonical = copy(message.snapshot);
        this.restore(merged);
      } else {
        this.canonical = copy(message.snapshot);
        this.restore(message.snapshot);
      }
      this.ready = true;
      this.onStatus("Live workspace connected.");
      this.sendPresence();
      this.scheduleFlush();
      return;
    }
    if (message.type === "seeded") {
      const local = this.getSnapshot();
      const ownSeed = this.seedAttempt && same(this.seedAttempt.snapshot, message.snapshot);
      this.canonical = copy(message.snapshot);
      this.revision = message.revision;
      this.seedAttempt = null;
      if (ownSeed) {
        const merged = rebaseLiveSnapshot(message.snapshot, local, message.snapshot);
        if (!same(local, merged)) this.restore(merged);
      } else {
        this.restore(message.snapshot);
      }
      this.ready = true;
      this.onStatus(ownSeed ? "Live workspace created. Invite others to edit." :
        "Joined the live workspace created by another editor.");
      this.sendPresence();
      this.scheduleFlush();
      return;
    }
    if (message.type === "presence") { this.onPresence(message.users || []); return; }
    if (message.type === "ack") {
      if (message.duplicate && this.pending?.opId === message.opId) {
        const pending = this.pending;
        const local = this.getSnapshot();
        const expectedAfter = applyLiveMutation(pending.before, pending.mutation);
        const merged = rebaseLiveSnapshot(expectedAfter, local, this.canonical);
        this.pending = null;
        this.finishPending(pending);
        if (!same(local, merged)) this.restore(merged);
        this.onHistory();
        this.scheduleFlush();
      }
      return;
    }
    if (message.type === "pong") return;
    if (message.type === "applied") {
      const oldCanonical = this.canonical;
      const nextCanonical = applyLiveMutation(oldCanonical, message.mutation);
      const own = this.pending?.opId === message.opId;
      const local = this.getSnapshot();
      this.canonical = nextCanonical;
      this.revision = message.revision;
      let pending = null;
      if (own) {
        pending = this.pending;
        this.pending = null;
        this.finishPending(pending);
      }
      const merged = own
        ? rebaseLiveSnapshot(applyLiveMutation(pending.before, pending.mutation), local, nextCanonical)
        : rebaseLiveSnapshot(oldCanonical, local, nextCanonical);
      if (!same(local, merged)) this.restore(merged);
      this.onHistory();
      this.scheduleFlush();
      return;
    }
    if (message.type === "conflict") {
      const oldCanonical = this.canonical;
      const pending = this.pending;
      this.pending = null;
      this.canonical = copy(message.snapshot);
      this.revision = message.currentRevision;
      const local = this.getSnapshot();
      const base = pending?.kind === "undo" || pending?.kind === "redo"
        ? pending.optimisticSnapshot : pending?.before ?? oldCanonical;
      const merged = rebaseLiveSnapshot(base, local, this.canonical);
      this.restore(merged);
      this.onStatus("Another editor changed the workspace. Nonconflicting edits were merged.");
      this.onHistory();
      this.scheduleFlush();
      return;
    }
    if (message.type === "snapshot") {
      const merged = this.canonical
        ? rebaseLiveSnapshot(this.canonical, this.getSnapshot(), message.snapshot)
        : message.snapshot;
      this.canonical = copy(message.snapshot);
      this.revision = message.revision;
      this.restore(merged);
      this.ready = true;
      this.scheduleFlush();
      return;
    }
    if (message.type === "error") {
      if (this.pending && message.opId === this.pending.opId) {
        const pending = this.pending;
        this.pending = null;
        if (pending.kind === "undo" || pending.kind === "redo") {
          const local = this.getSnapshot();
          this.restore(rebaseLiveSnapshot(pending.optimisticSnapshot, local, this.canonical));
        }
      }
      const reason = `Live edit rejected: ${message.message || message.code || "unknown error"}`;
      if (["invalid_mutation", "invalid_snapshot", "too_large", "forbidden", "op_id_reuse"].includes(message.code)) {
        this.fail(reason);
        return;
      }
      this.onStatus(reason);
      this.send({ type: "resync" });
    }
  }

  finishPending(pending) {
    if (pending.kind === "normal") {
      this.undoStack.push({ forward: pending.mutation,
        inverse: inverseLiveMutation(pending.mutation, pending.before) });
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack.length = 0;
    } else if (pending.kind === "undo") {
      this.undoStack.pop(); this.redoStack.push(pending.entry);
    } else if (pending.kind === "redo") {
      this.redoStack.pop(); this.undoStack.push(pending.entry);
    }
  }

  scheduleLeaseRenewal(leaseExpiresAt) {
    clearTimeout(this.leaseTimer);
    const delay = Math.max(1000, Math.min(4 * 60_000, Number(leaseExpiresAt) - Date.now() - 30000));
    this.leaseTimer = setTimeout(() => {
      if (this.active) { this.socket?.close(); }
    }, Number.isFinite(delay) ? delay : 4 * 60_000);
  }

  sendPresence() {
    if (!this.ready) return;
    const snapshot = this.getSnapshot();
    const presence = { activeDocumentId: snapshot.activeDocumentId ?? null,
      selectedUid: snapshot.selectedUid ?? null };
    const encoded = JSON.stringify(presence);
    if (encoded !== this.lastPresence && this.send({ type: "presence", presence })) this.lastPresence = encoded;
  }

  localChanged() {
    if (!this.active || this.applying) return;
    this.sendPresence();
    this.scheduleFlush();
  }

  scheduleFlush() {
    clearTimeout(this.flushTimer);
    if (this.ready) this.flushTimer = setTimeout(() => this.flush(), 90);
  }

  flush() {
    if (!this.ready || this.pending || !this.canonical || this.socket?.readyState !== 1 ||
        (this.role !== "owner" && this.role !== "editor")) return;
    const mutation = diffLiveSnapshots(this.canonical, this.getSnapshot());
    if (!mutation) return;
    this.issue(mutation, "normal");
  }

  issue(mutation, kind, entry = null) {
    if (!this.ready || this.pending) return false;
    const opId = crypto.randomUUID();
    const beforeLocal = kind === "normal" ? null : copy(this.getSnapshot());
    const optimisticSnapshot = beforeLocal ? applyLiveMutation(beforeLocal, mutation) : null;
    if (optimisticSnapshot) this.restore(optimisticSnapshot);
    this.pending = { opId, kind, entry, mutation, before: copy(this.canonical),
      baseRevision: this.revision, optimisticSnapshot };
    if (!this.send({ type: "mutate", opId, baseRevision: this.revision, mutation })) {
      this.pending = null;
      if (beforeLocal) this.restore(beforeLocal);
      return false;
    }
    this.onHistory();
    return true;
  }

  undo() {
    if (!this.canUndo) return false;
    return this.issue(this.undoStack.at(-1).inverse, "undo", this.undoStack.at(-1));
  }

  redo() {
    if (!this.canRedo) return false;
    return this.issue(this.redoStack.at(-1).forward, "redo", this.redoStack.at(-1));
  }
}
