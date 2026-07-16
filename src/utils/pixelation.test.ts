import { describe, expect, it } from 'vitest';
import {
  colorDistance,
  findClosestPaletteColor,
  hexToRgb,
  type PaletteColor,
} from './pixelation';

const palette: PaletteColor[] = [
  { key: 'black', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
  { key: 'white', hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } },
];

describe('pixelation color helpers', () => {
  it('parses six-digit hex colors', () => {
    expect(hexToRgb('#12aBcD')).toEqual({ r: 18, g: 171, b: 205 });
    expect(hexToRgb('invalid')).toBeNull();
  });

  it('returns a zero, symmetric distance for identical colors', () => {
    const first = { r: 12, g: 34, b: 56 };
    const second = { r: 78, g: 90, b: 123 };

    expect(colorDistance(first, first)).toBe(0);
    expect(colorDistance(first, second)).toBeCloseTo(
      colorDistance(second, first),
      12,
    );
  });

  it('selects the nearest palette entry deterministically', () => {
    expect(findClosestPaletteColor({ r: 3, g: 4, b: 5 }, palette)).toBe(
      palette[0],
    );
    expect(findClosestPaletteColor({ r: 250, g: 251, b: 252 }, palette)).toBe(
      palette[1],
    );
  });
});
