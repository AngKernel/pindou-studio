import {
  CURRENT_PROJECT_FORMAT_VERSION,
  type JsonValue,
  type PatternProject,
  type ProjectPaletteColor,
} from '../../core/project';
import type { ColorSystem, MappedPixel } from '../../utils/pixelation';

export const PROJECT_APP_VERSION = '0.1.0';
export const DEFAULT_BOARD = { width: 29, height: 29, beadDiameterMm: 5 } as const;

interface WorkspaceProjectInput {
  readonly id: string;
  readonly name: string;
  readonly mappedPixelData: readonly (readonly MappedPixel[])[];
  readonly width: number;
  readonly height: number;
  readonly paletteId: ColorSystem;
  readonly generationSettings: Readonly<Record<string, JsonValue>>;
  readonly board?: PatternProject['board'];
  readonly thumbnailDataUrl?: string;
  readonly previous?: PatternProject | null;
  readonly now: string;
}

export interface RestoredWorkspace {
  readonly mappedPixelData: MappedPixel[][];
  readonly gridDimensions: { readonly N: number; readonly M: number };
  readonly selectedColorSystem: ColorSystem;
}

function normalizeHex(hex: string): string {
  const value = hex.toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(value)) throw new Error(`无效的项目颜色：${hex}`);
  return value;
}

function rgbFromHex(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function hexFromRgb(rgb: { readonly r: number; readonly g: number; readonly b: number }): string {
  return `#${[rgb.r, rgb.g, rgb.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function isColorSystem(value: string): value is ColorSystem {
  return ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝'].includes(value);
}

export function createProjectFromWorkspace(input: WorkspaceProjectInput): PatternProject {
  if (input.mappedPixelData.length !== input.height || input.mappedPixelData.some((row) => row.length !== input.width)) {
    throw new Error('项目网格尺寸与像素数据不一致。');
  }

  const palette: ProjectPaletteColor[] = [];
  const indexByHex = new Map<string, number>();
  for (const row of input.mappedPixelData) {
    for (const cell of row) {
      if (cell.isExternal) continue;
      const hex = normalizeHex(cell.color);
      if (!indexByHex.has(hex)) {
        indexByHex.set(hex, palette.length);
        palette.push({
          id: hex,
          brand: input.paletteId,
          code: cell.key || '?',
          name: cell.key || hex,
          rgb: rgbFromHex(hex),
        });
      }
    }
  }
  if (palette.length === 0) {
    palette.push({ id: '#FFFFFF', brand: input.paletteId, code: 'EMPTY', name: '空白', rgb: { r: 255, g: 255, b: 255 } });
    indexByHex.set('#FFFFFF', 0);
  }

  const cellCount = input.width * input.height;
  const cells = new Uint16Array(cellCount);
  const external = new Uint8Array(cellCount);
  for (let row = 0; row < input.height; row += 1) {
    for (let column = 0; column < input.width; column += 1) {
      const index = row * input.width + column;
      const cell = input.mappedPixelData[row][column];
      if (cell.isExternal) {
        external[index] = 1;
      } else {
        cells[index] = indexByHex.get(normalizeHex(cell.color)) ?? 0;
      }
    }
  }

  const canPreserveCompleted = input.previous?.width === input.width && input.previous.height === input.height;
  const board = input.board ?? input.previous?.board ?? DEFAULT_BOARD;
  const boardCount = Math.ceil(input.width / board.width) * Math.ceil(input.height / board.height);
  const previousMakerState = input.previous?.makerState ?? { activeBoardIndex: 0, lastPosition: null };
  const lastPosition = previousMakerState.lastPosition;
  const canPreservePosition = lastPosition !== null
    && lastPosition.row < input.height && lastPosition.column < input.width;
  return {
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    appVersion: PROJECT_APP_VERSION,
    id: input.id,
    name: input.name.trim(),
    width: input.width,
    height: input.height,
    palette: {
      id: input.paletteId,
      version: `embedded-${PROJECT_APP_VERSION}`,
      colors: palette,
    },
    cells,
    external,
    completed: canPreserveCompleted ? input.previous!.completed.slice() : new Uint8Array(cellCount),
    board,
    makerState: {
      activeBoardIndex: Math.min(previousMakerState.activeBoardIndex, boardCount - 1),
      lastPosition: canPreservePosition ? lastPosition : null,
    },
    generationSettings: input.generationSettings,
    thumbnailDataUrl: input.thumbnailDataUrl,
    createdAt: input.previous?.createdAt ?? input.now,
    updatedAt: input.now,
  };
}

export function restoreProjectToWorkspace(project: PatternProject): RestoredWorkspace {
  const mappedPixelData = Array.from({ length: project.height }, (_, row) =>
    Array.from({ length: project.width }, (_, column): MappedPixel => {
      const index = row * project.width + column;
      if (project.external[index]) return { key: 'ERASE', color: '#FFFFFF', isExternal: true };
      const color = project.palette.colors[project.cells[index]];
      if (!color) throw new Error('项目包含无效的色板索引。');
      return { key: color.code, color: hexFromRgb(color.rgb) };
    }),
  );

  return {
    mappedPixelData,
    gridDimensions: { N: project.width, M: project.height },
    selectedColorSystem: isColorSystem(project.palette.id) ? project.palette.id : 'MARD',
  };
}
