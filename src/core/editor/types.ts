import type { PatternGrid } from '../pattern/types';

export interface GridPoint {
  readonly row: number;
  readonly column: number;
}

export interface SelectionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EditorCellValue {
  readonly paletteIndex: number;
  readonly external: boolean;
}

export interface EditorPatch {
  readonly formatVersion: 1;
  readonly label: string;
  readonly indices: Uint32Array;
  readonly beforePaletteIndexes: Uint16Array;
  readonly beforeExternal: Uint8Array;
  readonly afterPaletteIndexes: Uint16Array;
  readonly afterExternal: Uint8Array;
}

export interface EditorClipboard {
  readonly formatVersion: 1;
  readonly width: number;
  readonly height: number;
  readonly paletteIndexes: Uint16Array;
  readonly external: Uint8Array;
}

export interface PatchCommandResult {
  readonly grid: PatternGrid;
  readonly patch: EditorPatch;
}

export function isEmptyPatch(patch: EditorPatch): boolean {
  return patch.indices.length === 0;
}
