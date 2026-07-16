import type { PatternGrid } from '../pattern/types';
import { applyEditorPatch } from './patch';
import { isEmptyPatch, type EditorPatch } from './types';

export interface HistoryResult {
  readonly grid: PatternGrid;
  readonly patch: EditorPatch | null;
}

export class EditorPatchHistory {
  private readonly past: EditorPatch[] = [];
  private readonly future: EditorPatch[] = [];

  constructor(readonly limit = 100) {
    if (!Number.isInteger(limit) || limit < 100) throw new RangeError('Editor history must retain at least 100 steps.');
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get undoDepth(): number { return this.past.length; }
  get redoDepth(): number { return this.future.length; }
  get retainedChangedCells(): number {
    return [...this.past, ...this.future].reduce((total, patch) => total + patch.indices.length, 0);
  }
  get retainedPatchBytes(): number {
    return [...this.past, ...this.future].reduce(
      (total, patch) => total
        + patch.indices.byteLength
        + patch.beforePaletteIndexes.byteLength
        + patch.beforeExternal.byteLength
        + patch.afterPaletteIndexes.byteLength
        + patch.afterExternal.byteLength,
      0,
    );
  }

  record(patch: EditorPatch): boolean {
    if (isEmptyPatch(patch)) return false;
    this.past.push(patch);
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
    return true;
  }

  undo(grid: PatternGrid): HistoryResult {
    const patch = this.past.pop() ?? null;
    if (!patch) return { grid, patch: null };
    this.future.push(patch);
    return { grid: applyEditorPatch(grid, patch, 'reverse'), patch };
  }

  redo(grid: PatternGrid): HistoryResult {
    const patch = this.future.pop() ?? null;
    if (!patch) return { grid, patch: null };
    this.past.push(patch);
    return { grid: applyEditorPatch(grid, patch, 'forward'), patch };
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}
