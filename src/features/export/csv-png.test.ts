import { describe, expect, it, vi } from 'vitest';
import type { PatternProject } from '../../core/project';
import { calculatePatternStatistics } from '../../core/statistics';
import { buildInventoryCsv } from './csv';
import { safeExportBaseName } from './filename';
import { calculatePngLayout, drawProjectPng } from './png';

function project(): PatternProject {
  return {
    formatVersion: 3,
    appVersion: 'test',
    id: '11111111-1111-4111-8111-111111111111',
    name: '导出测试',
    width: 2,
    height: 1,
    palette: { id: 'test', version: '1', colors: [
      { id: 'red', brand: '品,牌', code: 'A1', name: '红"色', rgb: { r: 255, g: 0, b: 0 } },
    ] },
    cells: Uint16Array.from([0, 0]),
    external: Uint8Array.from([0, 1]),
    completed: new Uint8Array(2),
    board: { width: 29, height: 29, beadDiameterMm: 5 },
    makerState: { activeBoardIndex: 0, lastPosition: null },
    generationSettings: {},
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  };
}

describe('CSV and PNG export planning', () => {
  it('writes Excel-compatible inventory CSV with BOM, CRLF and quoting', () => {
    const csv = buildInventoryCsv(calculatePatternStatistics(project()));
    expect(csv.startsWith('\uFEFF品牌,色号,颜色名称,RGB,数量,占比\r\n')).toBe(true);
    expect(csv).toContain('"品,牌",A1,"红""色",#FF0000,1,100.00%\r\n');
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('neutralizes spreadsheet formulas in imported palette text', () => {
    const source = project();
    const unsafe = {
      ...source,
      palette: {
        ...source.palette,
        colors: [{ ...source.palette.colors[0], brand: '=CMD()', code: '+1', name: '@SUM(A1)' }],
      },
    };
    const csv = buildInventoryCsv(calculatePatternStatistics(unsafe));
    expect(csv).toContain("'=CMD(),'+1,'@SUM(A1),#FF0000,1,100.00%");
  });

  it('validates scale and memory bounds', () => {
    expect(calculatePngLayout(project(), { style: 'pattern', scale: 8, background: 'transparent' })).toMatchObject({ width: 128, height: 64 });
    expect(() => calculatePngLayout(project(), { style: 'codes', scale: 1, background: 'white' })).toThrow('至少需要 2 倍');
    expect(() => calculatePngLayout({ ...project(), width: 300, height: 300 }, { style: 'pattern', scale: 8, background: 'white' })).toThrow('像素尺寸过大');
  });

  it('draws only current non-external project cells and selected overlays', () => {
    const context = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'start' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline, imageSmoothingEnabled: true,
      clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn(),
    };
    drawProjectPng(context, project(), { style: 'codes', scale: 2, background: 'transparent' });
    expect(context.fillRect).toHaveBeenCalledTimes(1);
    expect(context.fillText).toHaveBeenCalledWith('A1', 8, 8, 14);
    expect(context.stroke).toHaveBeenCalledOnce();
  });

  it('sanitizes user-controlled export filenames', () => {
    expect(safeExportBaseName('  ../../我的:图纸?.png  ')).toBe('_.._我的_图纸_.png');
    expect(safeExportBaseName('...')).toBe('pindou-pattern');
  });
});
