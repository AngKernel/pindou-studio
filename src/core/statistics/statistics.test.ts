import { describe, expect, it } from 'vitest';
import { partitionPattern } from '../board';
import type { PatternProject } from '../project';
import { calculatePatternStatistics } from './statistics';

function project(): PatternProject {
  return {
    formatVersion: 3,
    appVersion: 'test',
    id: '11111111-1111-4111-8111-111111111111',
    name: '统计测试',
    width: 3,
    height: 2,
    palette: {
      id: 'test',
      version: '1',
      colors: [
        { id: 'a10', brand: '测试', code: 'A10', name: '红,色', rgb: { r: 255, g: 0, b: 0 } },
        { id: 'a2', brand: '测试', code: 'A2', name: '蓝色', rgb: { r: 0, g: 0, b: 255 } },
        { id: 'b1', brand: '测试', code: 'B1', name: '绿色', rgb: { r: 0, g: 255, b: 0 } },
      ],
    },
    cells: Uint16Array.from([0, 1, 1, 2, 0, 2]),
    external: Uint8Array.from([0, 0, 1, 0, 0, 0]),
    completed: new Uint8Array(6),
    board: { width: 2, height: 2, beadDiameterMm: 5 },
    makerState: { activeBoardIndex: 0, lastPosition: null },
    generationSettings: {},
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  };
}

describe('pattern statistics', () => {
  it('calculates the current project directly and sorts codes naturally', () => {
    const result = calculatePatternStatistics(project());
    expect(result).toMatchObject({ totalBeads: 5, usedColors: 3 });
    expect(result.colors.map((color) => [color.code, color.count])).toEqual([
      ['A2', 1], ['A10', 2], ['B1', 2],
    ]);
    expect(result.colors.reduce((sum, color) => sum + color.percentage, 0)).toBeCloseTo(100);
  });

  it('sorts by descending count with code tie-breaking and scopes a board', () => {
    expect(calculatePatternStatistics(project(), 'count').colors.map((color) => color.code)).toEqual(['A10', 'B1', 'A2']);
    const region = partitionPattern(3, 2, project().board).regions[0];
    expect(calculatePatternStatistics(project(), 'code', region)).toMatchObject({ totalBeads: 4, usedColors: 3 });
  });

  it('handles an external-only board and rejects invalid project semantics', () => {
    const source = project();
    const externalOnly = { ...source, external: Uint8Array.from([1, 1, 1, 1, 1, 1]) };
    expect(calculatePatternStatistics(externalOnly)).toEqual({ totalBeads: 0, usedColors: 0, colors: [] });
    expect(() => calculatePatternStatistics({ ...source, cells: Uint16Array.from([0]) })).toThrow('画布尺寸');
    expect(() => calculatePatternStatistics({ ...source, cells: Uint16Array.from([9, 1, 1, 2, 0, 2]) })).toThrow('不存在的色板颜色');
  });
});
