import type { PatternProject } from '../../core/project';
import { PatternExportError, type PngExportOptions } from './types';

const BASE_CELL_PIXELS = 8;
const MAX_PNG_PIXELS = 32 * 1024 * 1024;
const MAX_PNG_DIMENSION = 16_384;

export interface PngLayout {
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: number;
}

interface Canvas2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  imageSmoothingEnabled: boolean;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
}

export function calculatePngLayout(project: PatternProject, options: PngExportOptions): PngLayout {
  if (!Number.isInteger(options.scale) || options.scale < 1 || options.scale > 8) {
    throw new PatternExportError('INVALID_PNG_OPTIONS', 'PNG 缩放倍数必须是 1 到 8 的整数。');
  }
  if (options.style === 'codes' && options.scale < 2) {
    throw new PatternExportError('INVALID_PNG_OPTIONS', '带色号 PNG 至少需要 2 倍缩放以保持可读。');
  }
  const cellSize = BASE_CELL_PIXELS * options.scale;
  const width = project.width * cellSize;
  const height = project.height * cellSize;
  const pixels = width * height;
  if (width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION || pixels > MAX_PNG_PIXELS) {
    throw new PatternExportError('PNG_TOO_LARGE', 'PNG 像素尺寸过大，请降低缩放倍数或图纸尺寸。');
  }
  return { cellSize, width, height, pixels };
}

function contrastColor(rgb: { readonly r: number; readonly g: number; readonly b: number }): string {
  const luminance = (rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722) / 255;
  return luminance > 0.52 ? '#111827' : '#ffffff';
}

export function drawProjectPng(
  context: Canvas2DLike,
  project: PatternProject,
  options: PngExportOptions,
): PngLayout {
  const layout = calculatePngLayout(project, options);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, layout.width, layout.height);
  if (options.background === 'white') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, layout.width, layout.height);
  }
  for (let row = 0; row < project.height; row += 1) {
    for (let column = 0; column < project.width; column += 1) {
      const index = row * project.width + column;
      if (project.external[index]) continue;
      const color = project.palette.colors[project.cells[index]];
      if (!color) throw new PatternExportError('INVALID_PROJECT', '项目包含无效色板索引，无法导出 PNG。');
      const x = column * layout.cellSize;
      const y = row * layout.cellSize;
      context.fillStyle = `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`;
      context.fillRect(x, y, layout.cellSize, layout.cellSize);
      if (options.style === 'codes') {
        context.fillStyle = contrastColor(color.rgb);
        context.font = `600 ${Math.max(7, Math.floor(layout.cellSize * 0.28))}px sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(color.code, x + layout.cellSize / 2, y + layout.cellSize / 2, layout.cellSize - 2);
      }
    }
  }
  if (options.style !== 'pattern') {
    context.strokeStyle = 'rgba(17, 24, 39, 0.55)';
    context.lineWidth = Math.max(1, options.scale);
    context.beginPath();
    for (let column = 0; column <= project.width; column += 1) {
      const x = column * layout.cellSize;
      context.moveTo(x, 0);
      context.lineTo(x, layout.height);
    }
    for (let row = 0; row <= project.height; row += 1) {
      const y = row * layout.cellSize;
      context.moveTo(0, y);
      context.lineTo(layout.width, y);
    }
    context.stroke();
  }
  return layout;
}
