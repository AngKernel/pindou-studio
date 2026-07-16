import { assertPatternGrid, type PatternGrid } from '../pattern/types';
import type { EditorCellValue, EditorPatch, PatchCommandResult } from './types';

function assertCellValue(value: EditorCellValue): void {
  if (!Number.isInteger(value.paletteIndex) || value.paletteIndex < 0 || value.paletteIndex > 65_535) {
    throw new RangeError('Palette index must be an unsigned 16-bit integer.');
  }
}

export function createEditorPatch(
  grid: PatternGrid,
  label: string,
  changes: ReadonlyMap<number, EditorCellValue>,
): EditorPatch {
  assertPatternGrid(grid);
  const entries = [...changes.entries()]
    .filter(([index, value]) => {
      if (!Number.isInteger(index) || index < 0 || index >= grid.paletteIndexes.length) {
        throw new RangeError('Editor patch index is outside the grid.');
      }
      assertCellValue(value);
      return grid.paletteIndexes[index] !== value.paletteIndex || Boolean(grid.external[index]) !== value.external;
    })
    .sort(([first], [second]) => first - second);
  const indices = new Uint32Array(entries.length);
  const beforePaletteIndexes = new Uint16Array(entries.length);
  const beforeExternal = new Uint8Array(entries.length);
  const afterPaletteIndexes = new Uint16Array(entries.length);
  const afterExternal = new Uint8Array(entries.length);
  entries.forEach(([index, value], patchIndex) => {
    indices[patchIndex] = index;
    beforePaletteIndexes[patchIndex] = grid.paletteIndexes[index];
    beforeExternal[patchIndex] = grid.external[index];
    afterPaletteIndexes[patchIndex] = value.paletteIndex;
    afterExternal[patchIndex] = value.external ? 1 : 0;
  });
  return {
    formatVersion: 1,
    label,
    indices,
    beforePaletteIndexes,
    beforeExternal,
    afterPaletteIndexes,
    afterExternal,
  };
}

export function applyEditorPatch(
  grid: PatternGrid,
  patch: EditorPatch,
  direction: 'forward' | 'reverse' = 'forward',
): PatternGrid {
  assertPatternGrid(grid);
  const paletteIndexes = grid.paletteIndexes.slice();
  const external = grid.external.slice();
  const sourcePalette = direction === 'forward' ? patch.afterPaletteIndexes : patch.beforePaletteIndexes;
  const sourceExternal = direction === 'forward' ? patch.afterExternal : patch.beforeExternal;
  for (let patchIndex = 0; patchIndex < patch.indices.length; patchIndex += 1) {
    const index = patch.indices[patchIndex];
    if (index >= paletteIndexes.length) throw new RangeError('Editor patch does not fit the grid.');
    paletteIndexes[index] = sourcePalette[patchIndex];
    external[index] = sourceExternal[patchIndex];
  }
  return { ...grid, paletteIndexes, external };
}

export function commandResult(grid: PatternGrid, patch: EditorPatch): PatchCommandResult {
  return { grid: applyEditorPatch(grid, patch), patch };
}
