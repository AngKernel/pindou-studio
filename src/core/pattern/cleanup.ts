import type { CompiledPaletteColor } from '../palette';
import { findConnectedComponents, forEachNeighborIndex } from './components';
import { assertPatternGrid, type PatternComponent, type PatternGrid } from './types';

export interface CleanupSettings {
  readonly minimumRegionSize: number;
  readonly passes: number;
  readonly protectDarkOutlines: boolean;
}

function replacementForComponent(
  grid: PatternGrid,
  component: PatternComponent,
): number | null {
  const counts = new Map<number, number>();
  for (const index of component.cells) {
    forEachNeighborIndex(index, grid.width, grid.height, (neighborIndex) => {
      if (grid.external[neighborIndex]) return;
      const neighborPaletteIndex = grid.paletteIndexes[neighborIndex];
      if (neighborPaletteIndex === component.paletteIndex) return;
      counts.set(neighborPaletteIndex, (counts.get(neighborPaletteIndex) ?? 0) + 1);
    });
  }

  let replacement: number | null = null;
  let replacementCount = -1;
  for (const [paletteIndex, count] of counts) {
    if (
      count > replacementCount ||
      (count === replacementCount && replacement !== null && paletteIndex < replacement)
    ) {
      replacement = paletteIndex;
      replacementCount = count;
    }
  }
  return replacement;
}

function isProtectedOutline(
  component: PatternComponent,
  palette: readonly CompiledPaletteColor[],
): boolean {
  const sourceLightness = palette[component.paletteIndex]?.lab.l;
  if (sourceLightness === undefined) return false;
  return sourceLightness < 22 && component.cells.length > 1;
}

export function cleanupSmallRegions(
  grid: PatternGrid,
  palette: readonly CompiledPaletteColor[],
  settings: CleanupSettings,
): PatternGrid {
  assertPatternGrid(grid);
  if (!Number.isInteger(settings.minimumRegionSize) || settings.minimumRegionSize < 1) {
    throw new RangeError('Minimum region size must be a positive integer.');
  }
  if (!Number.isInteger(settings.passes) || settings.passes < 0 || settings.passes > 8) {
    throw new RangeError('Cleanup passes must be an integer between 0 and 8.');
  }

  const paletteIndexes = grid.paletteIndexes.slice();
  for (let pass = 0; pass < settings.passes; pass += 1) {
    const passGrid = { ...grid, paletteIndexes };
    const components = findConnectedComponents(passGrid).filter(
      ({ cells }) => cells.length < settings.minimumRegionSize,
    );
    let changed = false;

    for (const component of components) {
      const replacement = replacementForComponent(passGrid, component);
      if (replacement === null) continue;
      if (
        settings.protectDarkOutlines &&
        isProtectedOutline(component, palette)
      ) {
        continue;
      }
      for (const index of component.cells) paletteIndexes[index] = replacement;
      changed = true;
    }

    if (!changed) break;
  }

  return { ...grid, paletteIndexes };
}

export function countSmallRegions(grid: PatternGrid, maximumSize: number): number {
  return findConnectedComponents(grid).filter(({ cells }) => cells.length <= maximumSize)
    .length;
}
