import { forEachNeighborIndex } from '../pattern/components';
import { assertPatternGrid, type PatternGrid } from '../pattern/types';
import { commandResult, createEditorPatch } from './patch';
import type {
  EditorCellValue,
  EditorClipboard,
  GridPoint,
  PatchCommandResult,
  SelectionRect,
} from './types';

function indexOf(grid: PatternGrid, point: GridPoint): number | null {
  if (!Number.isInteger(point.row) || !Number.isInteger(point.column)) return null;
  if (point.row < 0 || point.column < 0 || point.row >= grid.height || point.column >= grid.width) return null;
  return point.row * grid.width + point.column;
}

function normalizedRect(rect: SelectionRect, grid: PatternGrid): SelectionRect | null {
  const startX = Math.max(0, Math.min(grid.width, Math.floor(rect.x)));
  const startY = Math.max(0, Math.min(grid.height, Math.floor(rect.y)));
  const endX = Math.max(startX, Math.min(grid.width, Math.ceil(rect.x + rect.width)));
  const endY = Math.max(startY, Math.min(grid.height, Math.ceil(rect.y + rect.height)));
  if (endX <= startX || endY <= startY) return null;
  return { x: startX, y: startY, width: endX - startX, height: endY - startY };
}

function solidCell(paletteIndex: number): EditorCellValue {
  return { paletteIndex, external: false };
}

const erasedCell: EditorCellValue = { paletteIndex: 0, external: true };

export function readEditorCell(grid: PatternGrid, point: GridPoint): EditorCellValue | null {
  assertPatternGrid(grid);
  const index = indexOf(grid, point);
  return index === null ? null : { paletteIndex: grid.paletteIndexes[index], external: Boolean(grid.external[index]) };
}

export function paintCells(
  grid: PatternGrid,
  points: readonly GridPoint[],
  paletteIndex: number,
  label = '画笔',
): PatchCommandResult {
  const changes = new Map<number, EditorCellValue>();
  for (const point of points) {
    const index = indexOf(grid, point);
    if (index !== null) changes.set(index, solidCell(paletteIndex));
  }
  return commandResult(grid, createEditorPatch(grid, label, changes));
}

export function eraseCells(
  grid: PatternGrid,
  points: readonly GridPoint[],
  label = '橡皮擦',
): PatchCommandResult {
  const changes = new Map<number, EditorCellValue>();
  for (const point of points) {
    const index = indexOf(grid, point);
    if (index !== null) changes.set(index, erasedCell);
  }
  return commandResult(grid, createEditorPatch(grid, label, changes));
}

export function fillConnected(
  grid: PatternGrid,
  start: GridPoint,
  replacement: EditorCellValue,
  label = '油漆桶',
): PatchCommandResult {
  assertPatternGrid(grid);
  const startIndex = indexOf(grid, start);
  if (startIndex === null) return commandResult(grid, createEditorPatch(grid, label, new Map()));
  const targetPalette = grid.paletteIndexes[startIndex];
  const targetExternal = grid.external[startIndex];
  const visited = new Uint8Array(grid.paletteIndexes.length);
  const queue = [startIndex];
  visited[startIndex] = 1;
  const changes = new Map<number, EditorCellValue>();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    changes.set(index, replacement);
    forEachNeighborIndex(index, grid.width, grid.height, (neighbor) => {
      if (!visited[neighbor] && grid.paletteIndexes[neighbor] === targetPalette && grid.external[neighbor] === targetExternal) {
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    });
  }
  return commandResult(grid, createEditorPatch(grid, label, changes));
}

export function replaceAll(
  grid: PatternGrid,
  source: EditorCellValue,
  replacement: EditorCellValue,
  label = '同色全局替换',
): PatchCommandResult {
  assertPatternGrid(grid);
  const changes = new Map<number, EditorCellValue>();
  for (let index = 0; index < grid.paletteIndexes.length; index += 1) {
    if (grid.paletteIndexes[index] === source.paletteIndex && Boolean(grid.external[index]) === source.external) {
      changes.set(index, replacement);
    }
  }
  return commandResult(grid, createEditorPatch(grid, label, changes));
}

export function paintRectangle(
  grid: PatternGrid,
  rect: SelectionRect,
  value: EditorCellValue,
  label = '矩形填充',
): PatchCommandResult {
  const selection = normalizedRect(rect, grid);
  const changes = new Map<number, EditorCellValue>();
  if (selection) {
    for (let y = selection.y; y < selection.y + selection.height; y += 1) {
      for (let x = selection.x; x < selection.x + selection.width; x += 1) {
        changes.set(y * grid.width + x, value);
      }
    }
  }
  return commandResult(grid, createEditorPatch(grid, label, changes));
}

export function copyRegion(grid: PatternGrid, rect: SelectionRect): EditorClipboard | null {
  assertPatternGrid(grid);
  const selection = normalizedRect(rect, grid);
  if (!selection) return null;
  const paletteIndexes = new Uint16Array(selection.width * selection.height);
  const external = new Uint8Array(selection.width * selection.height);
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      const source = (selection.y + y) * grid.width + selection.x + x;
      const target = y * selection.width + x;
      paletteIndexes[target] = grid.paletteIndexes[source];
      external[target] = grid.external[source];
    }
  }
  return { formatVersion: 1, width: selection.width, height: selection.height, paletteIndexes, external };
}

function pasteChanges(
  grid: PatternGrid,
  clipboard: EditorClipboard,
  destination: GridPoint,
  changes: Map<number, EditorCellValue>,
): void {
  for (let y = 0; y < clipboard.height; y += 1) {
    for (let x = 0; x < clipboard.width; x += 1) {
      const point = { row: destination.row + y, column: destination.column + x };
      const target = indexOf(grid, point);
      if (target === null) continue;
      const source = y * clipboard.width + x;
      changes.set(target, { paletteIndex: clipboard.paletteIndexes[source], external: Boolean(clipboard.external[source]) });
    }
  }
}

export function pasteRegion(
  grid: PatternGrid,
  clipboard: EditorClipboard,
  destination: GridPoint,
  label = '粘贴',
): PatchCommandResult {
  const changes = new Map<number, EditorCellValue>();
  pasteChanges(grid, clipboard, destination, changes);
  return commandResult(grid, createEditorPatch(grid, label, changes));
}

export function moveRegion(
  grid: PatternGrid,
  rect: SelectionRect,
  destination: GridPoint,
  label = '移动区域',
): PatchCommandResult {
  const selection = normalizedRect(rect, grid);
  if (!selection) return commandResult(grid, createEditorPatch(grid, label, new Map()));
  const clipboard = copyRegion(grid, selection);
  if (!clipboard) return commandResult(grid, createEditorPatch(grid, label, new Map()));
  const changes = new Map<number, EditorCellValue>();
  for (let y = selection.y; y < selection.y + selection.height; y += 1) {
    for (let x = selection.x; x < selection.x + selection.width; x += 1) changes.set(y * grid.width + x, erasedCell);
  }
  pasteChanges(grid, clipboard, destination, changes);
  return commandResult(grid, createEditorPatch(grid, label, changes));
}

export function flipRegion(
  grid: PatternGrid,
  rect: SelectionRect,
  axis: 'horizontal' | 'vertical',
  label = axis === 'horizontal' ? '水平翻转' : '垂直翻转',
): PatchCommandResult {
  const selection = normalizedRect(rect, grid);
  if (!selection) return commandResult(grid, createEditorPatch(grid, label, new Map()));
  const clipboard = copyRegion(grid, selection);
  if (!clipboard) return commandResult(grid, createEditorPatch(grid, label, new Map()));
  const changes = new Map<number, EditorCellValue>();
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      const sourceX = axis === 'horizontal' ? selection.width - 1 - x : x;
      const sourceY = axis === 'vertical' ? selection.height - 1 - y : y;
      const source = sourceY * selection.width + sourceX;
      changes.set((selection.y + y) * grid.width + selection.x + x, {
        paletteIndex: clipboard.paletteIndexes[source],
        external: Boolean(clipboard.external[source]),
      });
    }
  }
  return commandResult(grid, createEditorPatch(grid, label, changes));
}

export function wholeGridSelection(grid: PatternGrid): SelectionRect {
  return { x: 0, y: 0, width: grid.width, height: grid.height };
}
