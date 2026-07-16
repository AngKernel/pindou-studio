export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface XyzColor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface LabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export class ColorValueError extends RangeError {
  readonly code = 'INVALID_COLOR_VALUE';

  constructor(message: string) {
    super(message);
    this.name = 'ColorValueError';
  }
}

export function assertRgbColor(rgb: RgbColor): void {
  for (const [channel, value] of Object.entries(rgb)) {
    if (!Number.isFinite(value) || value < 0 || value > 255) {
      throw new ColorValueError(
        `RGB channel ${channel} must be a finite number between 0 and 255.`,
      );
    }
  }
}

export function assertLabColor(lab: LabColor): void {
  if (
    !Number.isFinite(lab.l) ||
    !Number.isFinite(lab.a) ||
    !Number.isFinite(lab.b)
  ) {
    throw new ColorValueError('Lab components must be finite numbers.');
  }
}
