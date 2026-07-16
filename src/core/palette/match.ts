import { deltaE2000, rgbToLab, type RgbColor } from '../color';
import { PaletteError, type CompiledPaletteColor } from './types';

const TIE_EPSILON = 1e-12;

export function findNearestCompiledColor(
  target: RgbColor,
  palette: readonly CompiledPaletteColor[],
): CompiledPaletteColor {
  if (palette.length === 0) {
    throw new PaletteError('EMPTY_PALETTE', 'Cannot match against an empty palette.');
  }

  const targetLab = rgbToLab(target);
  let closest = palette[0];
  let closestDistance = deltaE2000(targetLab, closest.lab);

  for (let index = 1; index < palette.length; index += 1) {
    const candidate = palette[index];
    const distance = deltaE2000(targetLab, candidate.lab);
    const isCloser = distance < closestDistance - TIE_EPSILON;
    const isStableTie =
      Math.abs(distance - closestDistance) <= TIE_EPSILON &&
      candidate.id.localeCompare(closest.id) < 0;

    if (isCloser || isStableTie) {
      closest = candidate;
      closestDistance = distance;
    }
  }

  return closest;
}
