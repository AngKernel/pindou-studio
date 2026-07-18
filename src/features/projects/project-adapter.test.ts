import { describe, expect, it } from 'vitest';
import { createProjectFromWorkspace, restoreProjectToWorkspace } from './project-adapter';

describe('workspace project adapter', () => {
  it('embeds the used palette and restores external cells without loss', () => {
    const mappedPixelData = [
      [{ key: 'T01', color: '#FFFFFF' }, { key: 'H07', color: '#000000' }],
      [{ key: 'ERASE', color: '#FFFFFF', isExternal: true }, { key: 'T01', color: '#FFFFFF' }],
    ];
    const project = createProjectFromWorkspace({
      id: '11111111-1111-4111-8111-111111111111',
      name: '适配测试',
      mappedPixelData,
      width: 2,
      height: 2,
      paletteId: 'MARD',
      generationSettings: { mode: 'dominant' },
      now: '2026-07-16T03:00:00.000Z',
    });

    expect(project.palette.colors).toHaveLength(2);
    expect(project.palette.colors[0]).toMatchObject({ code: 'T01', name: '未提供（色号 T01）' });
    expect([...project.cells]).toEqual([0, 1, 0, 0]);
    expect([...project.external]).toEqual([0, 0, 1, 0]);
    expect(restoreProjectToWorkspace(project)).toEqual({
      mappedPixelData,
      gridDimensions: { N: 2, M: 2 },
      selectedColorSystem: 'MARD',
    });
  });

  it('preserves completion data only for unchanged cells in a matching grid', () => {
    const first = createProjectFromWorkspace({
      id: '11111111-1111-4111-8111-111111111111',
      name: '保留进度',
      mappedPixelData: [[{ key: 'A1', color: '#FFFFFF' }, { key: 'B1', color: '#000000' }]],
      width: 2,
      height: 1,
      paletteId: 'MARD',
      generationSettings: {},
      now: '2026-07-16T03:00:00.000Z',
    });
    first.completed[0] = 1;
    first.completed[1] = 1;

    const saved = createProjectFromWorkspace({
      id: first.id,
      name: first.name,
      mappedPixelData: [[{ key: 'A1', color: '#FFFFFF' }, { key: 'C1', color: '#FF0000' }]],
      width: 2,
      height: 1,
      paletteId: 'MARD',
      generationSettings: {},
      previous: first,
      now: '2026-07-16T04:00:00.000Z',
    });
    expect([...saved.completed]).toEqual([1, 0]);
    expect(saved.createdAt).toBe(first.createdAt);
  });

  it('clamps maker state when board settings reduce the number of regions', () => {
    const pixels = [[{ key: 'A1', color: '#FFFFFF' }, { key: 'A1', color: '#FFFFFF' }]];
    const previous = createProjectFromWorkspace({
      id: '11111111-1111-4111-8111-111111111111',
      name: '分板调整',
      mappedPixelData: pixels,
      width: 2,
      height: 1,
      paletteId: 'MARD',
      generationSettings: {},
      board: { width: 1, height: 1, beadDiameterMm: 5 },
      now: '2026-07-16T03:00:00.000Z',
    });
    const activePrevious = { ...previous, makerState: { activeBoardIndex: 1, lastPosition: { row: 0, column: 1 } } };
    const saved = createProjectFromWorkspace({
      id: previous.id,
      name: previous.name,
      mappedPixelData: pixels,
      width: 2,
      height: 1,
      paletteId: 'MARD',
      generationSettings: {},
      board: { width: 29, height: 29, beadDiameterMm: 5 },
      previous: activePrevious,
      now: '2026-07-16T04:00:00.000Z',
    });
    expect(saved.makerState).toEqual({ activeBoardIndex: 0, lastPosition: { row: 0, column: 1 } });
  });
});
