import { describe, expect, it } from 'vitest';
import { createProjectFromWorkspace, restoreProjectToWorkspace } from './project-adapter';

describe('workspace project adapter', () => {
  it('embeds the used palette and restores external cells without loss', () => {
    const mappedPixelData = [
      [{ key: 'A1', color: '#FFFFFF' }, { key: 'A2', color: '#000000' }],
      [{ key: 'ERASE', color: '#FFFFFF', isExternal: true }, { key: 'A1', color: '#FFFFFF' }],
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
    expect([...project.cells]).toEqual([0, 1, 0, 0]);
    expect([...project.external]).toEqual([0, 0, 1, 0]);
    expect(restoreProjectToWorkspace(project)).toEqual({
      mappedPixelData,
      gridDimensions: { N: 2, M: 2 },
      selectedColorSystem: 'MARD',
    });
  });

  it('preserves completion data only when the grid dimensions still match', () => {
    const first = createProjectFromWorkspace({
      id: '11111111-1111-4111-8111-111111111111',
      name: '保留进度',
      mappedPixelData: [[{ key: 'A1', color: '#FFFFFF' }]],
      width: 1,
      height: 1,
      paletteId: 'MARD',
      generationSettings: {},
      now: '2026-07-16T03:00:00.000Z',
    });
    first.completed[0] = 1;

    const saved = createProjectFromWorkspace({
      id: first.id,
      name: first.name,
      mappedPixelData: [[{ key: 'A1', color: '#FFFFFF' }]],
      width: 1,
      height: 1,
      paletteId: 'MARD',
      generationSettings: {},
      previous: first,
      now: '2026-07-16T04:00:00.000Z',
    });
    expect([...saved.completed]).toEqual([1]);
    expect(saved.createdAt).toBe(first.createdAt);
  });
});
