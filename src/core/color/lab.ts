import { assertXyzColor, rgbToXyz } from './xyz';
import type { LabColor, RgbColor, XyzColor } from './types';

const D65_REFERENCE_WHITE: XyzColor = {
  x: 95.047,
  y: 100,
  z: 108.883,
};

const DELTA = 6 / 29;
const DELTA_CUBED = DELTA ** 3;
const LINEAR_SCALE = 1 / (3 * DELTA ** 2);
const LINEAR_OFFSET = 4 / 29;

function labPivot(value: number): number {
  return value > DELTA_CUBED
    ? Math.cbrt(value)
    : value * LINEAR_SCALE + LINEAR_OFFSET;
}

export function xyzToLab(
  xyz: XyzColor,
  referenceWhite: XyzColor = D65_REFERENCE_WHITE,
): LabColor {
  assertXyzColor(xyz);
  assertXyzColor(referenceWhite);

  if (referenceWhite.x === 0 || referenceWhite.y === 0 || referenceWhite.z === 0) {
    throw new RangeError('Reference white components must be greater than zero.');
  }

  const fx = labPivot(xyz.x / referenceWhite.x);
  const fy = labPivot(xyz.y / referenceWhite.y);
  const fz = labPivot(xyz.z / referenceWhite.z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function rgbToLab(rgb: RgbColor): LabColor {
  return xyzToLab(rgbToXyz(rgb));
}
