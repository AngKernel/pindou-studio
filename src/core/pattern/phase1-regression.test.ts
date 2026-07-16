import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { compilePalette, type PaletteDefinition } from '../palette';
import { findConnectedComponents, forEachNeighborIndex } from './components';
import { generatePattern, type GenerationMode } from './generate';

interface FixtureEntry {
  readonly id: string;
  readonly category: string;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

interface FixtureManifest {
  readonly fixtureCount: number;
  readonly fixtures: readonly FixtureEntry[];
}

interface StableRegressionMetric {
  readonly id: string;
  readonly category: string;
  readonly mode: GenerationMode;
  readonly finalColorCount: number;
  readonly totalCells: number;
  readonly activeCells: number;
  readonly smallRegionCount: number;
  readonly grayAdjacentToBlack: number;
  readonly darkChromaticCells: number;
  readonly blackCells: number;
  readonly distribution: Readonly<Record<string, number>>;
  readonly semanticSha256: string;
}

interface TimedRegressionMetric extends StableRegressionMetric {
  readonly processingMs: number;
}

const fixtureDirectory = path.resolve(process.cwd(), 'tests', 'fixtures', 'phase1');
const manifestPath = path.join(fixtureDirectory, 'manifest.json');
const baselinePath = path.join(fixtureDirectory, 'baselines.json');
const reportPath = path.resolve(process.cwd(), 'test-results', 'phase1-regression.json');
const modes: readonly GenerationMode[] = ['realistic', 'cartoon', 'limited', 'dither'];

const regressionPaletteDefinition: PaletteDefinition = {
  id: 'phase1-regression-palette',
  version: '1',
  colors: [
    ['black', '#05070e'], ['charcoal', '#1d232f'], ['gray', '#7b7f86'], ['white', '#f8f6ed'],
    ['deep-blue', '#142d73'], ['blue', '#3ea6e0'], ['cyan', '#4bd3d0'], ['deep-purple', '#3d1669'],
    ['purple', '#9256c7'], ['red', '#d94355'], ['pink', '#ee587c'], ['orange', '#f49f3e'],
    ['yellow', '#ffdb68'], ['deep-green', '#30683b'], ['green', '#4c9c5b'], ['lime', '#a4ce58'],
    ['brown', '#745b46'], ['tan', '#cb8b47'], ['skin-dark', '#9b6749'], ['skin-medium', '#e0ab84'],
    ['skin-light', '#f2c7a5'], ['cream', '#f2e7b5'], ['navy', '#233f70'], ['sky', '#8fd0e8'],
  ].map(([id, hex]) => ({
    id,
    hex,
    rgb: {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    },
  })),
};

const compiledPalette = compilePalette(regressionPaletteDefinition).colors;
const blackIndex = compiledPalette.findIndex((color) => color.id === 'black');
const grayIndex = compiledPalette.findIndex((color) => color.id === 'gray');
const darkChromaticIndexes = new Set(
  compiledPalette
    .map((color, index) => ({ id: color.id, index }))
    .filter(({ id }) => ['deep-blue', 'deep-purple', 'navy'].includes(id))
    .map(({ index }) => index),
);

function hashPattern(paletteIndexes: Uint16Array, external: Uint8Array): string {
  const bytes = Buffer.alloc(paletteIndexes.length * 2 + external.length);
  paletteIndexes.forEach((value, index) => bytes.writeUInt16LE(value, index * 2));
  Buffer.from(external).copy(bytes, paletteIndexes.length * 2);
  return createHash('sha256').update(bytes).digest('hex');
}

function countGrayAdjacentToBlack(
  paletteIndexes: Uint16Array,
  external: Uint8Array,
  width: number,
  height: number,
): number {
  let count = 0;
  paletteIndexes.forEach((paletteIndex, index) => {
    if (external[index] || paletteIndex !== grayIndex) return;
    let nextToBlack = false;
    forEachNeighborIndex(index, width, height, (neighborIndex) => {
      if (!external[neighborIndex] && paletteIndexes[neighborIndex] === blackIndex) nextToBlack = true;
    });
    if (nextToBlack) count += 1;
  });
  return count;
}

describe('phase 1 fixed-image regression suite', () => {
  test('runs 30 provenance-locked fixtures and preserves semantic baselines', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as FixtureManifest;
    expect(manifest.fixtureCount).toBe(30);
    expect(manifest.fixtures).toHaveLength(30);

    const stableMetrics: StableRegressionMetric[] = [];
    const timedMetrics: TimedRegressionMetric[] = [];
    for (const [fixtureIndex, fixture] of manifest.fixtures.entries()) {
      const input = await readFile(path.join(fixtureDirectory, fixture.file));
      expect(createHash('sha256').update(input).digest('hex')).toBe(fixture.sha256);
      const decoded = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(decoded.info.width).toBe(fixture.width);
      expect(decoded.info.height).toBe(fixture.height);
      const mode = modes[fixtureIndex % modes.length];
      const startedAt = performance.now();
      const grid = generatePattern(
        { width: decoded.info.width, height: decoded.info.height, data: new Uint8ClampedArray(decoded.data) },
        compiledPalette,
        {
          gridWidth: 32,
          gridHeight: 32,
          mode,
          maximumColors: 16,
          similarColorDeltaE: 2.5,
          minimumRegionSize: 2,
          cleanupPasses: 2,
          alphaThreshold: 8,
        },
      );
      const processingMs = Number((performance.now() - startedAt).toFixed(3));
      const distributionEntries = new Map<string, number>();
      let activeCells = 0;
      let darkChromaticCells = 0;
      let blackCells = 0;
      grid.paletteIndexes.forEach((paletteIndex, index) => {
        if (grid.external[index]) return;
        activeCells += 1;
        const paletteId = compiledPalette[paletteIndex].id;
        distributionEntries.set(paletteId, (distributionEntries.get(paletteId) ?? 0) + 1);
        if (darkChromaticIndexes.has(paletteIndex)) darkChromaticCells += 1;
        if (paletteIndex === blackIndex) blackCells += 1;
      });
      const distribution = Object.fromEntries([...distributionEntries.entries()].sort(([a], [b]) => a.localeCompare(b)));
      const stable: StableRegressionMetric = {
        id: fixture.id,
        category: fixture.category,
        mode,
        finalColorCount: distributionEntries.size,
        totalCells: grid.paletteIndexes.length,
        activeCells,
        smallRegionCount: findConnectedComponents(grid).filter((component) => component.cells.length <= 2).length,
        grayAdjacentToBlack: countGrayAdjacentToBlack(grid.paletteIndexes, grid.external, grid.width, grid.height),
        darkChromaticCells,
        blackCells,
        distribution,
        semanticSha256: hashPattern(grid.paletteIndexes, grid.external),
      };
      stableMetrics.push(stable);
      timedMetrics.push({ ...stable, processingMs });
    }

    const darkMetrics = stableMetrics.filter((metric) => metric.category === 'dark');
    expect(darkMetrics).toHaveLength(3);
    for (const metric of darkMetrics) {
      expect(metric.darkChromaticCells).toBeGreaterThan(0);
      expect(metric.blackCells / metric.activeCells).toBeLessThan(0.95);
      expect(metric.grayAdjacentToBlack / metric.activeCells).toBeLessThan(0.05);
    }

    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify({ formatVersion: 1, fixtureCount: 30, fixtures: timedMetrics }, null, 2)}\n`, 'utf8');

    if (process.env.UPDATE_PHASE1_BASELINES === '1') {
      await writeFile(baselinePath, `${JSON.stringify({ formatVersion: 1, fixtures: stableMetrics }, null, 2)}\n`, 'utf8');
    } else {
      const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as { fixtures: StableRegressionMetric[] };
      expect(stableMetrics).toEqual(baseline.fixtures);
    }
  }, 30_000);
});
