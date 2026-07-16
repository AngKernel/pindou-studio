export interface PatternGrid {
  readonly width: number;
  readonly height: number;
  readonly paletteIndexes: Uint16Array;
  readonly external: Uint8Array;
}

export interface PatternComponent {
  readonly paletteIndex: number;
  readonly cells: readonly number[];
}

export function assertPatternGrid(grid: PatternGrid): void {
  const cellCount = grid.width * grid.height;
  if (
    !Number.isInteger(grid.width) ||
    !Number.isInteger(grid.height) ||
    grid.width < 1 ||
    grid.height < 1 ||
    grid.paletteIndexes.length !== cellCount ||
    grid.external.length !== cellCount
  ) {
    throw new RangeError('Pattern grid dimensions do not match its buffers.');
  }
}
