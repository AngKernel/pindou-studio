import type { RgbColor } from '../color';

export const CURRENT_PROJECT_FORMAT_VERSION = 3 as const;
export const MAX_PROJECT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PROJECT_DIMENSION = 300;
export const MAX_PROJECT_CELLS = MAX_PROJECT_DIMENSION * MAX_PROJECT_DIMENSION;

export interface ProjectPaletteColor {
  readonly id: string;
  readonly brand: string;
  readonly code: string;
  readonly name: string;
  readonly rgb: RgbColor;
}

export interface ProjectPalette {
  readonly id: string;
  readonly version: string;
  readonly colors: readonly ProjectPaletteColor[];
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { readonly [key: string]: JsonValue };

export interface SerializablePatternProject {
  readonly formatVersion: typeof CURRENT_PROJECT_FORMAT_VERSION;
  readonly appVersion: string;
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly palette: ProjectPalette;
  readonly cells: readonly number[];
  readonly external: readonly number[];
  readonly completed: readonly number[];
  readonly board: {
    readonly width: number;
    readonly height: number;
    readonly beadDiameterMm: number;
  };
  readonly makerState: {
    readonly activeBoardIndex: number;
    readonly lastPosition: { readonly row: number; readonly column: number } | null;
  };
  readonly generationSettings: Readonly<Record<string, JsonValue>>;
  readonly thumbnailDataUrl?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PatternProject extends Omit<SerializablePatternProject, 'cells' | 'external' | 'completed'> {
  readonly cells: Uint16Array;
  readonly external: Uint8Array;
  readonly completed: Uint8Array;
}

export type ProjectErrorCode =
  | 'PROJECT_TOO_LARGE'
  | 'INVALID_JSON'
  | 'INVALID_PROJECT'
  | 'UNSUPPORTED_VERSION'
  | 'UNSAFE_FIELD'
  | 'INVALID_CELL_DATA'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_FAILED'
  | 'PROJECT_NOT_FOUND';

export class ProjectError extends Error {
  constructor(readonly code: ProjectErrorCode, readonly userMessage: string, options?: ErrorOptions) {
    super(userMessage, options);
    this.name = 'ProjectError';
  }
}
