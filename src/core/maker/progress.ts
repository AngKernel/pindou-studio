import type { BoardRegion } from '../board';

export interface MakerProgress {
  readonly completed: number;
  readonly total: number;
  readonly remaining: number;
  readonly percentage: number;
}

function inRegion(index: number, patternWidth: number, region: BoardRegion): boolean {
  const row = Math.floor(index / patternWidth);
  const column = index % patternWidth;
  return row >= region.startRow && row < region.startRow + region.height
    && column >= region.startColumn && column < region.startColumn + region.width;
}

export function calculateMakerProgress(
  completed: Uint8Array,
  external: Uint8Array,
  patternWidth: number,
  region?: BoardRegion,
): MakerProgress {
  if (completed.length !== external.length) throw new Error('完成位图与外部格位图长度不一致。');
  let total = 0;
  let completedCount = 0;
  for (let index = 0; index < completed.length; index += 1) {
    if (external[index] || (region && !inRegion(index, patternWidth, region))) continue;
    total += 1;
    if (completed[index]) completedCount += 1;
  }
  return {
    completed: completedCount,
    total,
    remaining: total - completedCount,
    percentage: total === 0 ? 100 : Math.round(completedCount / total * 100),
  };
}

export function toggleCompletedCell(
  completed: Uint8Array,
  external: Uint8Array,
  index: number,
): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index >= completed.length || completed.length !== external.length) {
    throw new Error('制作格索引无效。');
  }
  const next = completed.slice();
  if (!external[index]) next[index] = next[index] ? 0 : 1;
  return next;
}
