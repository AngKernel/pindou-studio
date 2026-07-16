import { describe, expect, it } from 'vitest';
import { boardCellIndexes, calculateFinishedSize, partitionPattern, validateBoardSettings } from './calculations';

describe('board layout', () => {
  it('partitions non-divisible dimensions without gaps or duplicates', () => {
    const layout = partitionPattern(60, 35, { width: 29, height: 29, beadDiameterMm: 5 });
    expect(layout).toMatchObject({ columns: 3, rows: 2, total: 6 });
    expect(layout.regions.at(-1)).toMatchObject({ startColumn: 58, startRow: 29, width: 2, height: 6 });
    const indexes = layout.regions.flatMap((region) => [...boardCellIndexes(region, 60)]);
    expect(indexes).toHaveLength(60 * 35);
    expect(new Set(indexes).size).toBe(60 * 35);
    expect(Math.min(...indexes)).toBe(0);
    expect(Math.max(...indexes)).toBe(60 * 35 - 1);
  });

  it('handles a one-cell pattern and exact board multiples', () => {
    expect(partitionPattern(1, 1, { width: 29, height: 29, beadDiameterMm: 2.6 }).total).toBe(1);
    expect(partitionPattern(58, 58, { width: 29, height: 29, beadDiameterMm: 5 })).toMatchObject({ columns: 2, rows: 2, total: 4 });
  });

  it('covers the maximum 300×300 canvas exactly once', () => {
    const layout = partitionPattern(300, 300, { width: 29, height: 29, beadDiameterMm: 5 });
    expect(layout).toMatchObject({ columns: 11, rows: 11, total: 121 });
    const indexes = layout.regions.flatMap((region) => [...boardCellIndexes(region, 300)]);
    expect(indexes).toHaveLength(90_000);
    expect(new Set(indexes).size).toBe(90_000);
  });

  it('calculates millimetre and centimetre dimensions', () => {
    expect(calculateFinishedSize(80, 60, 2.6)).toEqual({ widthMm: 208, heightMm: 156, widthCm: 20.8, heightCm: 15.6 });
    expect(calculateFinishedSize(10, 12, 10)).toEqual({ widthMm: 100, heightMm: 120, widthCm: 10, heightCm: 12 });
  });

  it('rejects invalid custom settings', () => {
    expect(() => validateBoardSettings({ width: 0, height: 29, beadDiameterMm: 5 })).toThrow('豆板宽高');
    expect(() => validateBoardSettings({ width: 29, height: 29, beadDiameterMm: 25 })).toThrow('豆子直径');
  });
});
