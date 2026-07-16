import {
  assertPatternGrid,
  type PatternComponent,
  type PatternGrid,
} from './types';

const NEIGHBOR_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export function forEachNeighborIndex(
  index: number,
  width: number,
  height: number,
  callback: (neighborIndex: number) => void,
): void {
  const x = index % width;
  const y = Math.floor(index / width);
  for (const [offsetX, offsetY] of NEIGHBOR_OFFSETS) {
    const neighborX = x + offsetX;
    const neighborY = y + offsetY;
    if (neighborX >= 0 && neighborY >= 0 && neighborX < width && neighborY < height) {
      callback(neighborY * width + neighborX);
    }
  }
}

export function findConnectedComponents(grid: PatternGrid): PatternComponent[] {
  assertPatternGrid(grid);
  const visited = new Uint8Array(grid.paletteIndexes.length);
  const components: PatternComponent[] = [];

  for (let start = 0; start < grid.paletteIndexes.length; start += 1) {
    if (visited[start] || grid.external[start]) continue;
    const paletteIndex = grid.paletteIndexes[start];
    const cells: number[] = [];
    const queue = [start];
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      cells.push(index);
      forEachNeighborIndex(index, grid.width, grid.height, (neighborIndex) => {
        if (
          !visited[neighborIndex] &&
          !grid.external[neighborIndex] &&
          grid.paletteIndexes[neighborIndex] === paletteIndex
        ) {
          visited[neighborIndex] = 1;
          queue.push(neighborIndex);
        }
      });
    }

    components.push({ paletteIndex, cells });
  }

  return components;
}
