import { describe, expect, it } from 'vitest';
import type { PatternProject } from '../../core/project';
import { A4_HEIGHT_PT, A4_WIDTH_PT, buildPatternPdf, createPdfPagePlans, pdfCoveredCellIndexes } from './pdf';

function project(width = 60, height = 35): PatternProject {
  const count = width * height;
  return {
    formatVersion: 3,
    appVersion: 'test',
    id: '11111111-1111-4111-8111-111111111111',
    name: 'PDF 测试',
    width,
    height,
    palette: { id: 'test', version: '1', colors: [
      { id: 'red', brand: 'TEST', code: 'A1', name: 'Red', rgb: { r: 255, g: 0, b: 0 } },
      { id: 'blue', brand: 'TEST', code: 'B2', name: 'Blue', rgb: { r: 0, g: 0, b: 255 } },
    ] },
    cells: Uint16Array.from({ length: count }, (_, index) => index % 2),
    external: new Uint8Array(count),
    completed: new Uint8Array(count),
    board: { width: 29, height: 29, beadDiameterMm: 5 },
    makerState: { activeBoardIndex: 0, lastPosition: null },
    generationSettings: {},
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  };
}

describe('A4 PDF export', () => {
  it('plans one exact page per board with global coordinates and joins', () => {
    const source = project();
    const plans = createPdfPagePlans(source);
    expect(plans).toHaveLength(6);
    expect(plans[0]).toMatchObject({ pageNumber: 1, totalPages: 6, joins: { top: false, right: true, bottom: true, left: false } });
    expect(plans.at(-1)?.region).toMatchObject({ startColumn: 58, startRow: 29, width: 2, height: 6 });
    expect(plans.at(-1)?.columnTicks.map((tick) => tick.value)).toEqual([59, 60]);
    const indexes = [...pdfCoveredCellIndexes(source)];
    expect(indexes).toHaveLength(source.width * source.height);
    expect(new Set(indexes).size).toBe(source.width * source.height);
  });

  it('writes a parseable multi-page A4 PDF with board labels and coordinates', () => {
    const bytes = buildPatternPdf(project());
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Type /Pages /Count 6');
    expect(text).toContain(`/MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}]`);
    expect(text).toContain('(Pindou Studio - Board 1 / 6)');
    expect(text).toContain('(Rows 1-29 | Columns 1-29 | TOP ^)');
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });

  it('keeps the monochrome interface available', () => {
    const text = new TextDecoder().decode(buildPatternPdf(project(1, 1), 'monochrome'));
    expect(text).toMatch(/0\.213 g/);
    expect(text).toContain('/Count 1');
  });

  it('fits the maximum 291-color board statistics on its board page', () => {
    const source = project(29, 29);
    const colors = Array.from({ length: 291 }, (_, index) => ({
      id: `color-${index}`,
      brand: 'TEST',
      code: `C${index + 1}`,
      name: `Color ${index + 1}`,
      rgb: { r: index % 256, g: index * 3 % 256, b: index * 7 % 256 },
    }));
    const dense = {
      ...source,
      palette: { ...source.palette, colors },
      cells: Uint16Array.from({ length: source.width * source.height }, (_, index) => index % colors.length),
    };
    expect(createPdfPagePlans(dense)[0].statistics.usedColors).toBe(291);
    const text = new TextDecoder().decode(buildPatternPdf(dense));
    expect(text).toContain('(C291:2)');
    expect(text).toContain('/Count 1');
  });
});
