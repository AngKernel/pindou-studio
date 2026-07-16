import { rgbToLinearRgb } from './srgb';
import { ColorValueError, type RgbColor, type XyzColor } from './types';

export function rgbToXyz(rgb: RgbColor): XyzColor {
  const linear = rgbToLinearRgb(rgb);

  return {
    x: (linear.r * 0.4124564 + linear.g * 0.3575761 + linear.b * 0.1804375) * 100,
    y: (linear.r * 0.2126729 + linear.g * 0.7151522 + linear.b * 0.072175) * 100,
    z: (linear.r * 0.0193339 + linear.g * 0.119192 + linear.b * 0.9503041) * 100,
  };
}

export function assertXyzColor(xyz: XyzColor): void {
  if (
    !Number.isFinite(xyz.x) ||
    !Number.isFinite(xyz.y) ||
    !Number.isFinite(xyz.z) ||
    xyz.x < 0 ||
    xyz.y < 0 ||
    xyz.z < 0
  ) {
    throw new ColorValueError('XYZ components must be finite, non-negative numbers.');
  }
}
