import { describe, expect, it } from 'vitest';
import { partitionPattern } from '../board';
import { calculateMakerProgress, toggleCompletedCell } from './progress';

describe('maker progress', () => {
  it('counts only non-external cells globally and per board', () => {
    const completed = Uint8Array.from([1, 1, 0, 0, 1, 0]);
    const external = Uint8Array.from([0, 1, 0, 0, 0, 0]);
    const regions = partitionPattern(3, 2, { width: 2, height: 2, beadDiameterMm: 5 }).regions;
    expect(calculateMakerProgress(completed, external, 3)).toEqual({ completed: 2, total: 5, remaining: 3, percentage: 40 });
    expect(calculateMakerProgress(completed, external, 3, regions[0])).toEqual({ completed: 2, total: 3, remaining: 1, percentage: 67 });
    expect(calculateMakerProgress(completed, external, 3, regions[1])).toEqual({ completed: 0, total: 2, remaining: 2, percentage: 0 });
  });

  it('toggles a single valid cell without modifying external cells or the source', () => {
    const source = Uint8Array.from([0, 0]);
    expect([...toggleCompletedCell(source, Uint8Array.from([0, 1]), 0)]).toEqual([1, 0]);
    expect([...toggleCompletedCell(source, Uint8Array.from([0, 1]), 1)]).toEqual([0, 0]);
    expect([...source]).toEqual([0, 0]);
  });

  it('treats an all-external board as complete', () => {
    expect(calculateMakerProgress(Uint8Array.from([0]), Uint8Array.from([1]), 1)).toEqual({
      completed: 0,
      total: 0,
      remaining: 0,
      percentage: 100,
    });
  });
});
