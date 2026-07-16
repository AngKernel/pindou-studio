import { describe, expect, it } from 'vitest';
import { deltaE2000, rgbToLab, rgbToXyz, xyzToLab } from './index';
import type { LabColor } from './types';

describe('sRGB, XYZ and Lab conversions', () => {
  it('converts D65 sRGB reference colors', () => {
    expect(rgbToXyz({ r: 255, g: 0, b: 0 })).toEqual({
      x: expect.closeTo(41.24564, 5),
      y: expect.closeTo(21.26729, 5),
      z: expect.closeTo(1.93339, 5),
    });
    expect(rgbToLab({ r: 255, g: 0, b: 0 })).toEqual({
      l: expect.closeTo(53.2408, 3),
      a: expect.closeTo(80.0925, 3),
      b: expect.closeTo(67.2032, 3),
    });
    expect(xyzToLab({ x: 95.047, y: 100, z: 108.883 })).toEqual({
      l: 100,
      a: 0,
      b: 0,
    });
  });

  it('rejects non-finite and out-of-range color input', () => {
    expect(() => rgbToLab({ r: -1, g: 0, b: 0 })).toThrow(/between 0 and 255/);
    expect(() => rgbToLab({ r: 0, g: Number.NaN, b: 0 })).toThrow(
      /between 0 and 255/,
    );
  });
});

describe('CIEDE2000', () => {
  const reference: Array<[LabColor, LabColor, number]> = [
    [{ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ l: 50, a: 2.8361, b: -74.02 }, { l: 50, a: 0, b: -82.7485 }, 3.4412],
    [{ l: 50, a: -1.3802, b: -84.2814 }, { l: 50, a: 0, b: -82.7485 }, 1],
    [{ l: 50, a: -1.1848, b: -84.8006 }, { l: 50, a: 0, b: -82.7485 }, 1],
    [{ l: 50, a: -0.9009, b: -85.5211 }, { l: 50, a: 0, b: -82.7485 }, 1],
  ];

  it.each(reference)('matches the Sharma reference pair %#', (first, second, expected) => {
    expect(deltaE2000(first, second)).toBeCloseTo(expected, 4);
    expect(deltaE2000(second, first)).toBeCloseTo(expected, 4);
  });

  it('returns zero for identical Lab colors', () => {
    const color = { l: 42, a: -7, b: 19 };
    expect(deltaE2000(color, color)).toBe(0);
  });
});
