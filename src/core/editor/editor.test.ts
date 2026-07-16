import { describe, expect, it } from 'vitest';
import type { PatternGrid } from '../pattern/types';
import {
  copyRegion,
  EditorPatchHistory,
  eraseCells,
  fillConnected,
  flipRegion,
  moveRegion,
  paintCells,
  paintRectangle,
  pasteRegion,
  pinchViewport,
  readEditorCell,
  replaceAll,
  screenToGrid,
  wholeGridSelection,
  zoomViewportAt,
  type EditorViewport,
} from './index';

function grid(rows: number[][], externalRows?: number[][]): PatternGrid {
  return {
    width: rows[0].length,
    height: rows.length,
    paletteIndexes: Uint16Array.from(rows.flat()),
    external: Uint8Array.from(externalRows?.flat() ?? rows.flat().map(() => 0)),
  };
}

describe('editor patch commands', () => {
  it('paints a deduplicated stroke and records only changed cells', () => {
    const source = grid([[1, 1, 1]]);
    const result = paintCells(source, [
      { row: 0, column: 0 },
      { row: 0, column: 0 },
      { row: 0, column: 2 },
      { row: 4, column: 4 },
    ], 2);
    expect([...result.grid.paletteIndexes]).toEqual([2, 1, 2]);
    expect([...result.patch.indices]).toEqual([0, 2]);
    expect([...result.patch.beforePaletteIndexes]).toEqual([1, 1]);
  });

  it('erases and can repaint an external cell', () => {
    const erased = eraseCells(grid([[3]]), [{ row: 0, column: 0 }]);
    expect(readEditorCell(erased.grid, { row: 0, column: 0 })).toEqual({ paletteIndex: 0, external: true });
    const painted = paintCells(erased.grid, [{ row: 0, column: 0 }], 4);
    expect(readEditorCell(painted.grid, { row: 0, column: 0 })).toEqual({ paletteIndex: 4, external: false });
  });

  it('fills only the four-connected matching region', () => {
    const source = grid([[1, 1, 2], [1, 2, 1], [2, 1, 1]]);
    const result = fillConnected(source, { row: 0, column: 0 }, { paletteIndex: 7, external: false });
    expect([...result.grid.paletteIndexes]).toEqual([7, 7, 2, 7, 2, 1, 2, 1, 1]);
  });

  it('replaces all matching cells and fills a clipped rectangle', () => {
    const replaced = replaceAll(grid([[1, 2], [1, 3]]), { paletteIndex: 1, external: false }, { paletteIndex: 8, external: false });
    expect([...replaced.grid.paletteIndexes]).toEqual([8, 2, 8, 3]);
    const rectangle = paintRectangle(replaced.grid, { x: 1, y: 1, width: 10, height: 10 }, { paletteIndex: 9, external: false });
    expect([...rectangle.grid.paletteIndexes]).toEqual([8, 2, 8, 9]);
  });

  it('copies, clips paste and preserves external cells', () => {
    const source = grid([[1, 2], [3, 4]], [[0, 1], [0, 0]]);
    const clipboard = copyRegion(source, wholeGridSelection(source));
    expect(clipboard).not.toBeNull();
    const target = grid([[9, 9, 9], [9, 9, 9], [9, 9, 9]]);
    const pasted = pasteRegion(target, clipboard!, { row: 1, column: 2 });
    expect([...pasted.grid.paletteIndexes]).toEqual([9, 9, 9, 9, 9, 1, 9, 9, 3]);
    expect([...pasted.grid.external]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('moves overlapping regions without reading already-cleared cells', () => {
    const source = grid([[1, 2, 3], [4, 5, 6]]);
    const result = moveRegion(source, { x: 0, y: 0, width: 2, height: 1 }, { row: 0, column: 1 });
    expect([...result.grid.paletteIndexes]).toEqual([0, 1, 2, 4, 5, 6]);
    expect([...result.grid.external]).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('flips a selection horizontally and vertically', () => {
    const source = grid([[1, 2, 3], [4, 5, 6]]);
    expect([...flipRegion(source, wholeGridSelection(source), 'horizontal').grid.paletteIndexes]).toEqual([3, 2, 1, 6, 5, 4]);
    expect([...flipRegion(source, wholeGridSelection(source), 'vertical').grid.paletteIndexes]).toEqual([4, 5, 6, 1, 2, 3]);
  });
});

describe('editor patch history', () => {
  it('retains 100 compact patches, supports redo and clears redo after a new edit', () => {
    const history = new EditorPatchHistory(100);
    let current = grid([[0]]);
    for (let index = 1; index <= 105; index += 1) {
      const command = paintCells(current, [{ row: 0, column: 0 }], index);
      current = command.grid;
      history.record(command.patch);
    }
    expect(history.undoDepth).toBe(100);
    expect(history.retainedChangedCells).toBe(100);
    expect(history.retainedPatchBytes).toBe(1_000);
    const undone = history.undo(current);
    expect(undone.grid.paletteIndexes[0]).toBe(104);
    expect(history.canRedo).toBe(true);
    const redone = history.redo(undone.grid);
    expect(redone.grid.paletteIndexes[0]).toBe(105);
    const undoneAgain = history.undo(redone.grid);
    const newCommand = paintCells(undoneAgain.grid, [{ row: 0, column: 0 }], 200);
    history.record(newCommand.patch);
    expect(history.canRedo).toBe(false);
  });

  it('does not record no-op edits', () => {
    const history = new EditorPatchHistory();
    const command = paintCells(grid([[2]]), [{ row: 0, column: 0 }], 2);
    expect(history.record(command.patch)).toBe(false);
    expect(history.canUndo).toBe(false);
  });
});

describe('editor viewport', () => {
  const viewport: EditorViewport = { zoom: 1, panX: 10, panY: 20, baseCellSize: 10 };

  it('keeps the zoom anchor stable and maps screen positions to cells', () => {
    const next = zoomViewportAt(viewport, { x: 30, y: 40 }, 2);
    expect(next).toEqual({ zoom: 2, panX: -10, panY: 0, baseCellSize: 10 });
    expect(screenToGrid(next, { x: 31, y: 41 }, 10, 10)).toEqual({ row: 2, column: 2 });
    expect(screenToGrid(next, { x: -20, y: 0 }, 10, 10)).toBeNull();
  });

  it('combines pinch zoom with midpoint pan', () => {
    const next = pinchViewport(
      viewport,
      { x: 20, y: 20 }, { x: 40, y: 20 },
      { x: 20, y: 30 }, { x: 60, y: 30 },
    );
    expect(next.zoom).toBe(2);
    expect(next.panX).toBe(0);
    expect(next.panY).toBe(30);
  });
});
