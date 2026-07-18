import type { MappedPixel } from '../../utils/pixelation';

export interface WorkspaceColorCount {
  readonly count: number;
  readonly color: string;
}

export interface WorkspaceColorStatistics {
  readonly counts: Record<string, WorkspaceColorCount>;
  readonly total: number;
}

export function calculateWorkspaceColorStatistics(
  mappedPixelData: readonly (readonly MappedPixel[])[],
): WorkspaceColorStatistics {
  const counts: Record<string, WorkspaceColorCount> = {};
  let total = 0;

  for (const row of mappedPixelData) {
    for (const cell of row) {
      if (cell.isExternal) continue;
      const hex = cell.color.toUpperCase();
      const existing = counts[hex];
      counts[hex] = {
        count: (existing?.count ?? 0) + 1,
        color: hex,
      };
      total += 1;
    }
  }

  return { counts, total };
}
