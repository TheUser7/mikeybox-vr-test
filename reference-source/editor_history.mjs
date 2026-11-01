// Keep document snapshots separate from the browser's text-field undo stack.
// A drag or slider gesture is one step, even if it renders many intermediate frames.
export function editorDocumentSignature(snapshot) {
  // Selection, the next generated ID and the add-parent target are restored with
  // a document edit, but moving among them is not itself an undoable mutation.
  // Keep every other snapshot field in the signature, including named groups
  // and any future multi-invention workspace state.
  const { selectedUid, selectedUids, parentTargetUid, nextUid, ...document } = snapshot;
  return JSON.stringify(document);
}

export class EditorHistory {
  constructor(limit = 40) {
    this.limit = limit;
    this.undo = [];
    this.redo = [];
    this.current = null;
    this.groupDepth = 0;
    this.groupActive = false;
    this.groupChanged = false;
  }

  observe(snapshot, signature) {
    if (!this.current) {
      this.current = { snapshot, signature };
      return;
    }
    if (signature === this.current.signature) {
      // A selection change should be restored with the next document edit.
      this.current.snapshot = snapshot;
      return;
    }
    if (!this.groupActive || !this.groupChanged) {
      this.undo.push(this.current);
      if (this.undo.length > this.limit) this.undo.shift();
      this.redo.length = 0;
    }
    this.current = { snapshot, signature };
    this.groupChanged = this.groupActive;
  }

  beginGroup() {
    if (this.groupDepth++ === 0) {
      this.groupActive = true;
      this.groupChanged = false;
    }
  }

  endGroup() {
    if (this.groupDepth > 0 && --this.groupDepth === 0) {
      this.groupActive = false;
      this.groupChanged = false;
    }
  }

  step(direction) {
    this.groupDepth = 0;
    this.groupActive = false;
    this.groupChanged = false;
    const from = direction === "undo" ? this.undo : this.redo;
    const to = direction === "undo" ? this.redo : this.undo;
    if (!from.length) return null;
    if (this.current) to.push(this.current);
    this.current = from.pop();
    return this.current.snapshot;
  }
}
