import type { BoardRegion } from '../board';
import type { PatternProject } from '../project';
import { type ColorUsage, type PatternStatistics, type StatisticsSort, StatisticsError } from './types';

function compareText(left: string, right: string): number {
  const a = left.toUpperCase();
  const b = right.toUpperCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareColorCodes(left: string, right: string): number {
  const leftMatch = /^(.*?)(\d+)$/.exec(left);
  const rightMatch = /^(.*?)(\d+)$/.exec(right);
  if (leftMatch && rightMatch) {
    const prefix = compareText(leftMatch[1], rightMatch[1]);
    if (prefix !== 0) return prefix;
    const numeric = Number(leftMatch[2]) - Number(rightMatch[2]);
    if (numeric !== 0) return numeric;
  }
  return compareText(left, right);
}

function assertRegion(project: PatternProject, region: BoardRegion): void {
  if (region.startRow < 0 || region.startColumn < 0 || region.width < 1 || region.height < 1
    || region.startRow + region.height > project.height
    || region.startColumn + region.width > project.width) {
    throw new StatisticsError('INVALID_DATA', '统计豆板范围超出项目画布。');
  }
}

export function calculatePatternStatistics(
  project: PatternProject,
  sort: StatisticsSort = 'code',
  region?: BoardRegion,
): PatternStatistics {
  const expected = project.width * project.height;
  if (project.cells.length !== expected || project.external.length !== expected) {
    throw new StatisticsError('INVALID_DATA', '项目格子数据与画布尺寸不一致。');
  }
  if (region) assertRegion(project, region);

  const counts = new Map<number, number>();
  let totalBeads = 0;
  const startRow = region?.startRow ?? 0;
  const endRow = startRow + (region?.height ?? project.height);
  const startColumn = region?.startColumn ?? 0;
  const endColumn = startColumn + (region?.width ?? project.width);
  for (let row = startRow; row < endRow; row += 1) {
    for (let column = startColumn; column < endColumn; column += 1) {
      const index = row * project.width + column;
      if (project.external[index]) continue;
      const paletteIndex = project.cells[index];
      if (!project.palette.colors[paletteIndex]) {
        throw new StatisticsError('INVALID_DATA', `项目第 ${row + 1} 行、第 ${column + 1} 列引用了不存在的色板颜色。`);
      }
      counts.set(paletteIndex, (counts.get(paletteIndex) ?? 0) + 1);
      totalBeads += 1;
    }
  }

  const colors: ColorUsage[] = [...counts].map(([paletteIndex, count]) => {
    const color = project.palette.colors[paletteIndex];
    return {
      paletteIndex,
      brand: color.brand,
      code: color.code,
      name: color.name,
      rgb: color.rgb,
      count,
      percentage: totalBeads === 0 ? 0 : count / totalBeads * 100,
    };
  });
  colors.sort((left, right) => {
    if (sort === 'count' && left.count !== right.count) return right.count - left.count;
    return compareColorCodes(left.code, right.code) || left.paletteIndex - right.paletteIndex;
  });
  return { totalBeads, usedColors: colors.length, colors };
}
