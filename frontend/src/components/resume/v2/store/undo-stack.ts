// frontend/src/components/resume/v2/store/undo-stack.ts
import type { ResumeDoc } from '../types';

export type UndoEntry = {
  doc: ResumeDoc;
  label: string;       // 'moveBullet', 'deleteEntry', etc.
  // ★ Optional fields added in v0 AI integration (spec § 8.3). Only set by
  //   _aiApplyTransaction. Existing _pushUndo callers leave these undefined
  //   so behavior is bit-for-bit identical to pre-v0-AI for structural undo.
  kind?: 'aiApply';
  runId?: string;
  suggestionIds?: string[];
};

const MAX_DEPTH = 100;

export class UndoStack {
  private past: UndoEntry[] = [];
  private future: UndoEntry[] = [];

  push(entry: UndoEntry): void {
    this.past.push(entry);
    if (this.past.length > MAX_DEPTH) this.past.shift();
    this.future = [];   // any new structural op clears redo
  }

  popPast(): UndoEntry | null {
    return this.past.pop() ?? null;
  }

  pushFuture(entry: UndoEntry): void {
    this.future.push(entry);
  }

  popFuture(): UndoEntry | null {
    return this.future.pop() ?? null;
  }

  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }
  clear(): void { this.past = []; this.future = []; }
}
