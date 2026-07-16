import { assertRgbColor, type RgbColor } from './types';

export function srgbChannelToLinear(channel: number): number {
  if (!Number.isFinite(channel) || channel < 0 || channel > 255) {
    throw new RangeError('sRGB channel must be between 0 and 255.');
  }

  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function rgbToLinearRgb(rgb: RgbColor): RgbColor {
  assertRgbColor(rgb);
  return {
    r: srgbChannelToLinear(rgb.r),
    g: srgbChannelToLinear(rgb.g),
    b: srgbChannelToLinear(rgb.b),
  };
}
