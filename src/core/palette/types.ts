import type { LabColor, RgbColor } from '../color';

export interface PaletteSourceColor {
  readonly id: string;
  readonly hex: string;
  readonly rgb: RgbColor;
}

export interface PaletteDefinition {
  readonly id: string;
  readonly version: string;
  readonly colors: readonly PaletteSourceColor[];
}

export interface CompiledPaletteColor extends PaletteSourceColor {
  readonly lab: LabColor;
}

export interface CompiledPalette {
  readonly id: string;
  readonly version: string;
  readonly colors: readonly CompiledPaletteColor[];
}

export type PaletteErrorCode =
  | 'EMPTY_PALETTE'
  | 'INVALID_PALETTE_ID'
  | 'DUPLICATE_COLOR_ID'
  | 'PALETTE_VERSION_CONFLICT';

export class PaletteError extends Error {
  constructor(
    readonly code: PaletteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PaletteError';
  }
}
