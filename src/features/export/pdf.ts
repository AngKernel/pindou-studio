import { boardCellIndexes, partitionPattern, type BoardRegion } from '../../core/board';
import type { PatternProject } from '../../core/project';
import { calculatePatternStatistics, type PatternStatistics } from '../../core/statistics';
import { PatternExportError, type PdfPrintMode } from './types';

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

export interface PdfCoordinateTick {
  readonly offset: number;
  readonly value: number;
}

export interface PdfPagePlan {
  readonly pageNumber: number;
  readonly totalPages: number;
  readonly region: BoardRegion;
  readonly rowTicks: readonly PdfCoordinateTick[];
  readonly columnTicks: readonly PdfCoordinateTick[];
  readonly joins: { readonly top: boolean; readonly right: boolean; readonly bottom: boolean; readonly left: boolean };
  readonly statistics: PatternStatistics;
}

function coordinateTicks(start: number, length: number): PdfCoordinateTick[] {
  const interval = length <= 30 ? 5 : length <= 100 ? 10 : 25;
  const offsets = new Set<number>([0, length - 1]);
  for (let offset = 0; offset < length; offset += 1) {
    const globalValue = start + offset + 1;
    if (globalValue % interval === 0) offsets.add(offset);
  }
  return [...offsets].sort((left, right) => left - right).map((offset) => ({ offset, value: start + offset + 1 }));
}

export function createPdfPagePlans(project: PatternProject): readonly PdfPagePlan[] {
  const layout = partitionPattern(project.width, project.height, project.board);
  return layout.regions.map((region) => ({
    pageNumber: region.index + 1,
    totalPages: layout.total,
    region,
    rowTicks: coordinateTicks(region.startRow, region.height),
    columnTicks: coordinateTicks(region.startColumn, region.width),
    joins: {
      top: region.boardRow > 0,
      right: region.boardColumn < layout.columns - 1,
      bottom: region.boardRow < layout.rows - 1,
      left: region.boardColumn > 0,
    },
    statistics: calculatePatternStatistics(project, 'code', region),
  }));
}

function pdfNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function asciiText(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
}

function rgbCommand(rgb: { readonly r: number; readonly g: number; readonly b: number }, mode: PdfPrintMode): string {
  if (mode === 'monochrome') {
    const gray = (rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722) / 255;
    return `${pdfNumber(gray)} g`;
  }
  return `${pdfNumber(rgb.r / 255)} ${pdfNumber(rgb.g / 255)} ${pdfNumber(rgb.b / 255)} rg`;
}

function textCommand(text: string, size: number, x: number, y: number): string {
  return `BT /F1 ${pdfNumber(size)} Tf ${pdfNumber(x)} ${pdfNumber(y)} Td (${asciiText(text)}) Tj ET`;
}

function lineCommand(x1: number, y1: number, x2: number, y2: number): string {
  return `${pdfNumber(x1)} ${pdfNumber(y1)} m ${pdfNumber(x2)} ${pdfNumber(y2)} l S`;
}

function renderJoinMarker(commands: string[], side: keyof PdfPagePlan['joins'], x: number, y: number): void {
  const size = 5;
  commands.push('0.486 0.227 0.929 RG', '0.8 w');
  if (side === 'left' || side === 'right') {
    commands.push(lineCommand(x, y - size, x, y + size), lineCommand(x - 3, y, x + 3, y));
  } else {
    commands.push(lineCommand(x - size, y, x + size, y), lineCommand(x, y - 3, x, y + 3));
  }
}

function renderPage(project: PatternProject, plan: PdfPagePlan, printMode: PdfPrintMode): string {
  const commands: string[] = ['1 1 1 rg', `0 0 ${pdfNumber(A4_WIDTH_PT)} ${pdfNumber(A4_HEIGHT_PT)} re f`];
  const margin = 28;
  const contentWidth = A4_WIDTH_PT - margin * 2;
  const headerHeight = 48;
  const footerHeight = 14;
  const coordinateGutter = 18;
  const statsColumns = Math.max(1, Math.floor(contentWidth / 48));
  const statsRows = Math.ceil(plan.statistics.colors.length / statsColumns);
  const statsHeight = 24 + Math.max(1, statsRows) * 8;
  const gridAreaTop = margin + headerHeight;
  const gridAreaHeight = A4_HEIGHT_PT - margin * 2 - headerHeight - footerHeight - statsHeight - 10;
  const cellSize = Math.min(
    (contentWidth - coordinateGutter) / plan.region.width,
    (gridAreaHeight - coordinateGutter) / plan.region.height,
  );
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new PatternExportError('PDF_LAYOUT_FAILED', 'PDF 豆板布局空间不足。');
  }
  const gridWidth = plan.region.width * cellSize;
  const gridHeight = plan.region.height * cellSize;
  const gridX = margin + coordinateGutter + (contentWidth - coordinateGutter - gridWidth) / 2;
  const gridTop = gridAreaTop + coordinateGutter + (gridAreaHeight - coordinateGutter - gridHeight) / 2;
  const gridBottom = A4_HEIGHT_PT - gridTop - gridHeight;

  commands.push('0.067 0.094 0.153 rg');
  commands.push(textCommand(`Pindou Studio - Board ${plan.pageNumber} / ${plan.totalPages}`, 15, margin, A4_HEIGHT_PT - margin - 16));
  commands.push('0.294 0.333 0.408 rg');
  commands.push(textCommand(
    `Rows ${plan.region.startRow + 1}-${plan.region.startRow + plan.region.height} | Columns ${plan.region.startColumn + 1}-${plan.region.startColumn + plan.region.width} | TOP ^`,
    8,
    margin,
    A4_HEIGHT_PT - margin - 32,
  ));
  const joinLabels = (Object.keys(plan.joins) as (keyof PdfPagePlan['joins'])[]).filter((side) => plan.joins[side]).map((side) => side.toUpperCase());
  commands.push(textCommand(`JOIN: ${joinLabels.length ? joinLabels.join(' ') : 'NONE'}`, 8, A4_WIDTH_PT - margin - 110, A4_HEIGHT_PT - margin - 32));

  const pathsByPalette = new Map<number, string[]>();
  for (let localRow = 0; localRow < plan.region.height; localRow += 1) {
    for (let localColumn = 0; localColumn < plan.region.width; localColumn += 1) {
      const row = plan.region.startRow + localRow;
      const column = plan.region.startColumn + localColumn;
      const index = row * project.width + column;
      if (project.external[index]) continue;
      const paletteIndex = project.cells[index];
      if (!project.palette.colors[paletteIndex]) throw new PatternExportError('INVALID_PROJECT', '项目包含无效色板索引，无法导出 PDF。');
      const x = gridX + localColumn * cellSize;
      const y = gridBottom + (plan.region.height - localRow - 1) * cellSize;
      const paths = pathsByPalette.get(paletteIndex) ?? [];
      paths.push(`${pdfNumber(x)} ${pdfNumber(y)} ${pdfNumber(cellSize)} ${pdfNumber(cellSize)} re`);
      pathsByPalette.set(paletteIndex, paths);
    }
  }
  for (const [paletteIndex, paths] of pathsByPalette) {
    commands.push(rgbCommand(project.palette.colors[paletteIndex].rgb, printMode), ...paths, 'f');
  }

  commands.push('0.067 0.094 0.153 RG', `${pdfNumber(Math.min(0.35, Math.max(0.08, cellSize * 0.12)))} w`);
  for (let column = 0; column <= plan.region.width; column += 1) {
    const x = gridX + column * cellSize;
    commands.push(lineCommand(x, gridBottom, x, gridBottom + gridHeight));
  }
  for (let row = 0; row <= plan.region.height; row += 1) {
    const y = gridBottom + row * cellSize;
    commands.push(lineCommand(gridX, y, gridX + gridWidth, y));
  }

  commands.push('0.067 0.094 0.153 rg');
  for (const tick of plan.columnTicks) {
    const x = gridX + (tick.offset + 0.5) * cellSize;
    commands.push(textCommand(String(tick.value), Math.min(7, Math.max(4, cellSize * 0.45)), x - 4, gridBottom + gridHeight + 5));
  }
  for (const tick of plan.rowTicks) {
    const y = gridBottom + gridHeight - (tick.offset + 0.65) * cellSize;
    commands.push(textCommand(String(tick.value), Math.min(7, Math.max(4, cellSize * 0.45)), gridX - coordinateGutter + 1, y));
  }

  if (plan.joins.left) renderJoinMarker(commands, 'left', gridX - 7, gridBottom + gridHeight / 2);
  if (plan.joins.right) renderJoinMarker(commands, 'right', gridX + gridWidth + 7, gridBottom + gridHeight / 2);
  if (plan.joins.top) renderJoinMarker(commands, 'top', gridX + gridWidth / 2, gridBottom + gridHeight + 12);
  if (plan.joins.bottom) renderJoinMarker(commands, 'bottom', gridX + gridWidth / 2, gridBottom - 8);

  const statsTop = A4_HEIGHT_PT - (gridAreaTop + gridAreaHeight + 8);
  commands.push('0.067 0.094 0.153 rg', textCommand(`BOARD COLORS - ${plan.statistics.usedColors} colors / ${plan.statistics.totalBeads} beads`, 9, margin, statsTop));
  plan.statistics.colors.forEach((color, index) => {
    const column = index % statsColumns;
    const row = Math.floor(index / statsColumns);
    const itemWidth = contentWidth / statsColumns;
    const x = margin + column * itemWidth;
    const y = statsTop - 12 - row * 8;
    const count = String(color.count);
    const maximumCodeLength = Math.max(3, 10 - count.length);
    const code = color.code.length > maximumCodeLength
      ? `${color.code.slice(0, maximumCodeLength - 2)}..`
      : color.code;
    commands.push(rgbCommand(color.rgb, printMode), `${pdfNumber(x)} ${pdfNumber(y - 1)} 6 6 re f`);
    commands.push('0.067 0.094 0.153 rg', textCommand(`${code}:${count}`, 5.5, x + 8, y));
  });
  commands.push('0.294 0.333 0.408 rg', textCommand(`Board ${plan.pageNumber} / ${plan.totalPages} - Page ${plan.pageNumber}`, 7, margin, margin - 4));
  return commands.join('\n');
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function buildPatternPdf(project: PatternProject, printMode: PdfPrintMode = 'color'): Uint8Array {
  const plans = createPdfPagePlans(project);
  if (plans.length === 0) throw new PatternExportError('PDF_LAYOUT_FAILED', '项目没有可导出的豆板。');
  const encoder = new TextEncoder();
  const objectCount = 3 + plans.length * 2;
  const objects = new Array<string>(objectCount + 1);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const pageReferences = plans.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
  objects[2] = `<< /Type /Pages /Count ${plans.length} /Kids [${pageReferences}] >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  plans.forEach((plan, index) => {
    const pageObject = 4 + index * 2;
    const contentObject = pageObject + 1;
    const content = renderPage(project, plan, printMode);
    const contentLength = encoder.encode(content).length;
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(A4_WIDTH_PT)} ${pdfNumber(A4_HEIGHT_PT)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`;
  });

  const parts: Uint8Array[] = [encoder.encode('%PDF-1.4\n%PINDOU\n')];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let offset = parts[0].length;
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    offsets[objectNumber] = offset;
    const bytes = encoder.encode(`${objectNumber} 0 obj\n${objects[objectNumber]}\nendobj\n`);
    parts.push(bytes);
    offset += bytes.length;
  }
  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objectCount + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map((item) => `${String(item).padStart(10, '0')} 00000 n `),
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join('\n');
  parts.push(encoder.encode(xref));
  return concatBytes(parts);
}

export function pdfCoveredCellIndexes(project: PatternProject): Uint32Array {
  const plans = createPdfPagePlans(project);
  const indexes = plans.flatMap((plan) => [...boardCellIndexes(plan.region, project.width)]);
  return Uint32Array.from(indexes);
}
