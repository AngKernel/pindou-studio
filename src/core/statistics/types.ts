import type { RgbColor } from '../color';

export type StatisticsSort = 'code' | 'count';

export interface ColorUsage {
  readonly paletteIndex: number;
  readonly brand: string;
  readonly code: string;
  readonly name: string;
  readonly rgb: RgbColor;
  readonly count: number;
  readonly percentage: number;
}

export interface PatternStatistics {
  readonly totalBeads: number;
  readonly usedColors: number;
  readonly colors: readonly ColorUsage[];
}

export class StatisticsError extends Error {
  constructor(readonly code: 'INVALID_DATA', readonly userMessage: string) {
    super(userMessage);
    this.name = 'StatisticsError';
  }
}
