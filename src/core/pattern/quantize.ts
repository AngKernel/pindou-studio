import { deltaE2000 } from '../color';
import type { CompiledPaletteColor } from '../palette';
import { assertPatternGrid, type PatternGrid } from './types';

function paletteUsage(grid: PatternGrid): Map<number, number> {
  const counts = new Map<number, number>();
  for (let index = 0; index < grid.paletteIndexes.length; index += 1) {
    if (grid.external[index]) continue;
    const paletteIndex = grid.paletteIndexes[index];
    counts.set(paletteIndex, (counts.get(paletteIndex) ?? 0) + 1);
  }
  return counts;
}

function nearestAllowedPaletteIndex(
  sourceIndex: number,
  allowed: readonly number[],
  palette: readonly CompiledPaletteColor[],
): number {
  const source = palette[sourceIndex];
  let closest = allowed[0];
  let closestDistance = deltaE2000(source.lab, palette[closest].lab);
  for (let index = 1; index < allowed.length; index += 1) {
    const candidate = allowed[index];
    const distance = deltaE2000(source.lab, palette[candidate].lab);
    if (distance < closestDistance || (distance === closestDistance && candidate < closest)) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

export function mergeSimilarPaletteColors(
  grid: PatternGrid,
  palette: readonly CompiledPaletteColor[],
  maximumDeltaE: number,
): PatternGrid {
  assertPatternGrid(grid);
  if (!Number.isFinite(maximumDeltaE) || maximumDeltaE < 0) {
    throw new RangeError('Maximum Delta E must be a non-negative number.');
  }
  const usage = paletteUsage(grid);
  const ordered = [...usage.keys()].sort(
    (first, second) =>
      (usage.get(second) ?? 0) - (usage.get(first) ?? 0) || first - second,
  );
  const replacements = new Map<number, number>();

  for (let lowIndex = ordered.length - 1; lowIndex >= 0; lowIndex -= 1) {
    const sourceIndex = ordered[lowIndex];
    let replacement: number | null = null;
    let replacementDistance = Infinity;
    for (let highIndex = 0; highIndex < lowIndex; highIndex += 1) {
      const candidateIndex = ordered[highIndex];
      const distance = deltaE2000(palette[sourceIndex].lab, palette[candidateIndex].lab);
      if (
        distance <= maximumDeltaE &&
        (distance < replacementDistance ||
          (distance === replacementDistance &&
            replacement !== null &&
            candidateIndex < replacement))
      ) {
        replacement = candidateIndex;
        replacementDistance = distance;
      }
    }
    if (replacement !== null) replacements.set(sourceIndex, replacement);
  }

  if (replacements.size === 0) return grid;
  const paletteIndexes = grid.paletteIndexes.slice();
  for (let index = 0; index < paletteIndexes.length; index += 1) {
    if (!grid.external[index]) {
      paletteIndexes[index] = replacements.get(paletteIndexes[index]) ?? paletteIndexes[index];
    }
  }
  return { ...grid, paletteIndexes };
}

export function limitPatternColors(
  grid: PatternGrid,
  palette: readonly CompiledPaletteColor[],
  maximumColors: number,
): PatternGrid {
  assertPatternGrid(grid);
  if (!Number.isInteger(maximumColors) || maximumColors < 1) {
    throw new RangeError('Maximum colors must be a positive integer.');
  }
  const usage = paletteUsage(grid);
  if (usage.size <= maximumColors) return grid;

  const allowed = [...usage.keys()]
    .sort(
      (first, second) =>
        (usage.get(second) ?? 0) - (usage.get(first) ?? 0) || first - second,
    )
    .slice(0, maximumColors);
  const allowedSet = new Set(allowed);
  const replacementCache = new Map<number, number>();
  const paletteIndexes = grid.paletteIndexes.slice();

  for (let index = 0; index < paletteIndexes.length; index += 1) {
    if (grid.external[index] || allowedSet.has(paletteIndexes[index])) continue;
    const sourceIndex = paletteIndexes[index];
    let replacement = replacementCache.get(sourceIndex);
    if (replacement === undefined) {
      replacement = nearestAllowedPaletteIndex(sourceIndex, allowed, palette);
      replacementCache.set(sourceIndex, replacement);
    }
    paletteIndexes[index] = replacement;
  }

  return { ...grid, paletteIndexes };
}

export function countPatternColors(grid: PatternGrid): number {
  return paletteUsage(grid).size;
}
