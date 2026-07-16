export interface BoardSettings {
  readonly width: number;
  readonly height: number;
  readonly beadDiameterMm: number;
}

export interface BoardPreset extends BoardSettings {
  readonly id: string;
  readonly name: string;
}

export interface BoardRegion {
  readonly index: number;
  readonly boardColumn: number;
  readonly boardRow: number;
  readonly startColumn: number;
  readonly startRow: number;
  readonly width: number;
  readonly height: number;
}

export interface BoardLayout {
  readonly columns: number;
  readonly rows: number;
  readonly total: number;
  readonly regions: readonly BoardRegion[];
}

export interface FinishedSize {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly widthCm: number;
  readonly heightCm: number;
}

export class BoardError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = 'BoardError';
  }
}
