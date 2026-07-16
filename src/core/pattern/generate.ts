import type { RgbColor } from '../color';
import {
  findNearestCompiledColor,
  type CompiledPaletteColor,
} from '../palette';
import type { RgbaImage } from '../image/transform';
import { cleanupSmallRegions } from './cleanup';
import { limitPatternColors, mergeSimilarPaletteColors } from './quantize';
import type { PatternGrid } from './types';

export type GenerationMode = 'realistic' | 'cartoon' | 'limited' | 'dither';

export interface PatternGenerationSettings {
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly mode: GenerationMode;
  readonly maximumColors: number;
  readonly similarColorDeltaE: number;
  readonly minimumRegionSize: number;
  readonly cleanupPasses: number;
  readonly alphaThreshold: number;
}

export interface GenerationProgress {
  readonly completed: number;
  readonly total: number;
}

export interface GenerationHooks {
  readonly isCancelled?: () => boolean;
  readonly onProgress?: (progress: GenerationProgress) => void;
}

export class GenerationCancelledError extends Error {
  readonly code = 'GENERATION_CANCELLED';

  constructor() {
    super('Pattern generation was cancelled.');
    this.name = 'GenerationCancelledError';
  }
}

interface SampledGrid {
  readonly colors: Array<RgbColor | null>;
  readonly external: Uint8Array;
}

function assertGenerationSettings(
  image: RgbaImage,
  palette: readonly CompiledPaletteColor[],
  settings: PatternGenerationSettings,
): void {
  if (image.data.length !== image.width * image.height * 4) {
    throw new RangeError('Image dimensions do not match its RGBA buffer.');
  }
  if (palette.length === 0) throw new RangeError('Palette cannot be empty.');
  if (
    !Number.isInteger(settings.gridWidth) ||
    !Number.isInteger(settings.gridHeight) ||
    settings.gridWidth < 1 ||
    settings.gridHeight < 1
  ) {
    throw new RangeError('Grid dimensions must be positive integers.');
  }
  if (settings.maximumColors < 1 || settings.maximumColors > palette.length) {
    throw new RangeError('Maximum colors must fit within the palette.');
  }
  if (settings.alphaThreshold < 0 || settings.alphaThreshold > 255) {
    throw new RangeError('Alpha threshold must be between 0 and 255.');
  }
}

function sampleCell(
  image: RgbaImage,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  mode: GenerationMode,
  alphaThreshold: number,
): RgbColor | null {
  let count = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>();

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * image.width + x) * 4;
      if (image.data[index + 3] < alphaThreshold) continue;
      const currentRed = image.data[index];
      const currentGreen = image.data[index + 1];
      const currentBlue = image.data[index + 2];
      count += 1;
      red += currentRed;
      green += currentGreen;
      blue += currentBlue;

      if (mode === 'cartoon' || mode === 'limited') {
        const bucketKey =
          ((currentRed >> 3) << 10) | ((currentGreen >> 3) << 5) | (currentBlue >> 3);
        const bucket = buckets.get(bucketKey) ?? { count: 0, red: 0, green: 0, blue: 0 };
        bucket.count += 1;
        bucket.red += currentRed;
        bucket.green += currentGreen;
        bucket.blue += currentBlue;
        buckets.set(bucketKey, bucket);
      }
    }
  }

  if (count === 0) return null;
  if (mode !== 'cartoon' && mode !== 'limited') {
    return { r: Math.round(red / count), g: Math.round(green / count), b: Math.round(blue / count) };
  }

  const dominant = [...buckets.entries()].sort(
    ([firstKey, first], [secondKey, second]) => second.count - first.count || firstKey - secondKey,
  )[0][1];
  return {
    r: Math.round(dominant.red / dominant.count),
    g: Math.round(dominant.green / dominant.count),
    b: Math.round(dominant.blue / dominant.count),
  };
}

function sampleImage(
  image: RgbaImage,
  settings: PatternGenerationSettings,
  hooks: GenerationHooks,
): SampledGrid {
  const cellCount = settings.gridWidth * settings.gridHeight;
  const colors: Array<RgbColor | null> = new Array(cellCount);
  const external = new Uint8Array(cellCount);

  for (let gridY = 0; gridY < settings.gridHeight; gridY += 1) {
    const startY = Math.min(image.height - 1, Math.floor((gridY * image.height) / settings.gridHeight));
    const endY = Math.max(startY + 1, Math.floor(((gridY + 1) * image.height) / settings.gridHeight));
    for (let gridX = 0; gridX < settings.gridWidth; gridX += 1) {
      if (hooks.isCancelled?.()) throw new GenerationCancelledError();
      const startX = Math.min(image.width - 1, Math.floor((gridX * image.width) / settings.gridWidth));
      const endX = Math.max(startX + 1, Math.floor(((gridX + 1) * image.width) / settings.gridWidth));
      const index = gridY * settings.gridWidth + gridX;
      const color = sampleCell(
        image,
        startX,
        Math.min(image.width, endX),
        startY,
        Math.min(image.height, endY),
        settings.mode,
        settings.alphaThreshold,
      );
      colors[index] = color;
      external[index] = color === null ? 1 : 0;
    }
    hooks.onProgress?.({ completed: gridY + 1, total: settings.gridHeight });
  }
  return { colors, external };
}

function mapWithoutDither(
  sampled: SampledGrid,
  palette: readonly CompiledPaletteColor[],
): Uint16Array {
  const indexesById = new Map(palette.map((color, index) => [color.id, index]));
  const colorCache = new Map<string, number>();
  const paletteIndexes = new Uint16Array(sampled.colors.length);
  sampled.colors.forEach((color, index) => {
    if (!color) return;
    const key = `${color.r},${color.g},${color.b}`;
    let paletteIndex = colorCache.get(key);
    if (paletteIndex === undefined) {
      const nearest = findNearestCompiledColor(color, palette);
      paletteIndex = indexesById.get(nearest.id);
      if (paletteIndex === undefined) throw new Error('Compiled palette index is missing.');
      colorCache.set(key, paletteIndex);
    }
    paletteIndexes[index] = paletteIndex;
  });
  return paletteIndexes;
}

function mapWithDither(
  sampled: SampledGrid,
  palette: readonly CompiledPaletteColor[],
  width: number,
  height: number,
): Uint16Array {
  const indexesById = new Map(palette.map((color, index) => [color.id, index]));
  const errors = new Float32Array(sampled.colors.length * 3);
  const paletteIndexes = new Uint16Array(sampled.colors.length);
  const distribute = (index: number, error: readonly number[], weight: number) => {
    if (index < 0 || index >= sampled.colors.length || sampled.external[index]) return;
    errors[index * 3] += error[0] * weight;
    errors[index * 3 + 1] += error[1] * weight;
    errors[index * 3 + 2] += error[2] * weight;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const color = sampled.colors[index];
      if (!color) continue;
      const adjusted: RgbColor = {
        r: Math.max(0, Math.min(255, Math.round(color.r + errors[index * 3]))),
        g: Math.max(0, Math.min(255, Math.round(color.g + errors[index * 3 + 1]))),
        b: Math.max(0, Math.min(255, Math.round(color.b + errors[index * 3 + 2]))),
      };
      const nearest = findNearestCompiledColor(adjusted, palette);
      const paletteIndex = indexesById.get(nearest.id);
      if (paletteIndex === undefined) throw new Error('Compiled palette index is missing.');
      paletteIndexes[index] = paletteIndex;
      const error = [
        adjusted.r - nearest.rgb.r,
        adjusted.g - nearest.rgb.g,
        adjusted.b - nearest.rgb.b,
      ];
      if (x + 1 < width) distribute(index + 1, error, 7 / 16);
      if (y + 1 < height) {
        if (x > 0) distribute(index + width - 1, error, 3 / 16);
        distribute(index + width, error, 5 / 16);
        if (x + 1 < width) distribute(index + width + 1, error, 1 / 16);
      }
    }
  }
  return paletteIndexes;
}

export function generatePattern(
  image: RgbaImage,
  palette: readonly CompiledPaletteColor[],
  settings: PatternGenerationSettings,
  hooks: GenerationHooks = {},
): PatternGrid {
  assertGenerationSettings(image, palette, settings);
  const sampled = sampleImage(image, settings, hooks);
  const paletteIndexes =
    settings.mode === 'dither'
      ? mapWithDither(sampled, palette, settings.gridWidth, settings.gridHeight)
      : mapWithoutDither(sampled, palette);
  let grid: PatternGrid = {
    width: settings.gridWidth,
    height: settings.gridHeight,
    paletteIndexes,
    external: sampled.external,
  };
  grid = mergeSimilarPaletteColors(grid, palette, settings.similarColorDeltaE);
  grid = limitPatternColors(grid, palette, settings.maximumColors);
  grid = cleanupSmallRegions(grid, palette, {
    minimumRegionSize: settings.minimumRegionSize,
    passes: settings.cleanupPasses,
    protectDarkOutlines: true,
  });
  return grid;
}
