import { describe, expect, it } from 'vitest';
import { compilePalette } from '../palette';
import type { RgbaImage } from '../image/transform';
import { cleanupSmallRegions, countSmallRegions } from './cleanup';
import { findConnectedComponents } from './components';
import { generatePattern, GenerationCancelledError } from './generate';
import { countPatternColors, limitPatternColors } from './quantize';
import type { PatternGrid } from './types';

const palette = compilePalette({
  id: 'pattern-tests',
  version: '1',
  colors: [
    { id: 'black', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
    { id: 'gray', hex: '#888888', rgb: { r: 136, g: 136, b: 136 } },
    { id: 'white', hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } },
    { id: 'blue', hex: '#101080', rgb: { r: 16, g: 16, b: 128 } },
  ],
}).colors;

function grid(rows: number[][], externalRows?: number[][]): PatternGrid {
  return {
    width: rows[0].length,
    height: rows.length,
    paletteIndexes: Uint16Array.from(rows.flat()),
    external: Uint8Array.from(externalRows?.flat() ?? rows.flat().map(() => 0)),
  };
}

function image(width: number, height: number, pixels: number[][]): RgbaImage {
  return { width, height, data: Uint8ClampedArray.from(pixels.flat()) };
}

const settings = {
  gridWidth: 2,
  gridHeight: 2,
  mode: 'realistic' as const,
  maximumColors: 4,
  similarColorDeltaE: 0,
  minimumRegionSize: 1,
  cleanupPasses: 0,
  alphaThreshold: 128,
};

describe('pattern components and cleanup', () => {
  it('finds four-connected components without crossing external cells', () => {
    const value = grid([[0, 0, 1], [0, 1, 1]], [[0, 1, 0], [0, 0, 0]]);
    expect(findConnectedComponents(value).map((component) => component.cells.length)).toEqual([
      2,
      3,
    ]);
  });

  it('replaces isolated regions with the neighborhood majority', () => {
    const value = grid([[2, 2, 2], [2, 1, 2], [2, 2, 2]]);
    const cleaned = cleanupSmallRegions(value, palette, {
      minimumRegionSize: 2,
      passes: 1,
      protectDarkOutlines: false,
    });
    expect([...cleaned.paletteIndexes]).toEqual(new Array(9).fill(2));
    expect(countSmallRegions(cleaned, 1)).toBe(0);
  });

  it('keeps a connected dark outline instead of replacing it with gray', () => {
    const value = grid([[2, 0, 2], [2, 0, 2], [2, 2, 2]]);
    const cleaned = cleanupSmallRegions(value, palette, {
      minimumRegionSize: 3,
      passes: 1,
      protectDarkOutlines: true,
    });
    expect([...cleaned.paletteIndexes]).toEqual([...value.paletteIndexes]);
  });

  it('removes an isolated dark speck even when outline protection is enabled', () => {
    const value = grid([[2, 2, 2], [2, 0, 2], [2, 2, 2]]);
    const cleaned = cleanupSmallRegions(value, palette, {
      minimumRegionSize: 2,
      passes: 1,
      protectDarkOutlines: true,
    });
    expect([...cleaned.paletteIndexes]).toEqual(new Array(9).fill(2));
  });
});

describe('pattern quantization and generation', () => {
  it('limits the final pattern to the requested number of colors', () => {
    const value = grid([[0, 1, 2, 3]]);
    expect(countPatternColors(limitPatternColors(value, palette, 2))).toBe(2);
  });

  it.each(['realistic', 'cartoon', 'limited', 'dither'] as const)(
    'generates deterministic %s output',
    (mode) => {
      const source = image(2, 2, [
        [0, 0, 0, 255],
        [255, 255, 255, 255],
        [16, 16, 128, 255],
        [136, 136, 136, 255],
      ]);
      const first = generatePattern(source, palette, { ...settings, mode });
      const second = generatePattern(source, palette, { ...settings, mode });
      expect([...first.paletteIndexes]).toEqual([...second.paletteIndexes]);
      expect([...first.external]).toEqual([...second.external]);
    },
  );

  it('marks transparent samples external and does not count them as colors', () => {
    const source = image(2, 1, [[255, 255, 255, 0], [0, 0, 0, 255]]);
    const result = generatePattern(source, palette, {
      ...settings,
      gridWidth: 2,
      gridHeight: 1,
    });
    expect([...result.external]).toEqual([1, 0]);
    expect(countPatternColors(result)).toBe(1);
  });

  it('reports monotonic row progress and supports cancellation', () => {
    const source = image(2, 2, new Array(4).fill([0, 0, 0, 255]));
    const progress: number[] = [];
    generatePattern(source, palette, settings, {
      onProgress: ({ completed }) => progress.push(completed),
    });
    expect(progress).toEqual([1, 2]);

    expect(() =>
      generatePattern(source, palette, settings, { isCancelled: () => true }),
    ).toThrowError(GenerationCancelledError);
  });

  it('does not overlap source sampling bounds for a non-divisible image', () => {
    const source = image(3, 1, [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);
    const result = generatePattern(source, palette, {
      ...settings,
      gridWidth: 2,
      gridHeight: 1,
      mode: 'realistic',
    });
    expect([...result.paletteIndexes]).toEqual([0, 2]);
  });
});
