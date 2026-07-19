import { describe, expect, it } from 'vitest';
import {
  MAX_PROJECT_FILE_BYTES,
  ProjectError,
  parseProject,
  serializeProject,
  toSerializableProject,
  type PatternProject,
} from '.';

const id = '11111111-1111-4111-8111-111111111111';

function makeProject(): PatternProject {
  return {
    formatVersion: 3,
    appVersion: '0.1.0',
    id,
    name: '测试图纸',
    width: 2,
    height: 2,
    palette: {
      id: 'MARD',
      version: '2026-07-16',
      colors: [
        { id: 'white', brand: 'MARD', code: 'A1', name: '白色', rgb: { r: 255, g: 255, b: 255 } },
        { id: 'black', brand: 'MARD', code: 'A2', name: '黑色', rgb: { r: 0, g: 0, b: 0 } },
      ],
    },
    cells: Uint16Array.from([0, 1, 1, 0]),
    external: Uint8Array.from([0, 0, 0, 1]),
    completed: Uint8Array.from([1, 0, 0, 0]),
    board: { width: 29, height: 29, beadDiameterMm: 5 },
    makerState: { activeBoardIndex: 0, lastPosition: { row: 1, column: 0 } },
    generationSettings: { mode: 'cartoon', maximumColors: 12, nested: { enabled: true } },
    sourceImage: {
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      width: 2,
      height: 2,
      transform: {
        crop: { x: 0, y: 0, width: 2, height: 2 },
        rotation: 90,
        flipHorizontal: true,
        flipVertical: false,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        background: { mode: 'preserve-alpha' },
      },
    },
    thumbnailDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    createdAt: '2026-07-16T01:00:00.000Z',
    updatedAt: '2026-07-16T02:00:00.000Z',
  };
}

function expectCode(action: () => unknown, code: ProjectError['code']): void {
  try {
    action();
    throw new Error('expected project parsing to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectError);
    expect((error as ProjectError).code).toBe(code);
  }
}

describe('project serialization', () => {
  it('round-trips typed cell arrays through portable JSON', () => {
    const source = makeProject();
    const serialized = serializeProject(source);
    const restored = parseProject(serialized);

    expect(restored).toEqual(source);
    expect(restored.cells).toBeInstanceOf(Uint16Array);
    expect(restored.external).toBeInstanceOf(Uint8Array);
    expect(restored.completed).toBeInstanceOf(Uint8Array);
    expect(JSON.parse(serialized).cells).toEqual([0, 1, 1, 0]);
  });

  it('migrates the previous flat palette format and initializes external cells', () => {
    const current = toSerializableProject(makeProject());
    const previous = {
      formatVersion: 1,
      appVersion: current.appVersion,
      id: current.id,
      name: current.name,
      width: current.width,
      height: current.height,
      paletteId: current.palette.id,
      paletteVersion: current.palette.version,
      paletteColors: current.palette.colors,
      cells: current.cells,
      completed: current.completed,
      board: current.board,
      generationSettings: current.generationSettings,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    };

    const migrated = parseProject(JSON.stringify(previous));
    expect(migrated.formatVersion).toBe(3);
    expect(migrated.palette.id).toBe('MARD');
    expect([...migrated.external]).toEqual([0, 0, 0, 0]);
    expect(migrated.makerState).toEqual({ activeBoardIndex: 0, lastPosition: null });
  });

  it('migrates V2 projects to the maker-state format', () => {
    const current = toSerializableProject(makeProject());
    const previous = {
      ...current,
      formatVersion: 2,
    } as Record<string, unknown>;
    delete previous.makerState;
    delete previous.sourceImage;

    const migrated = parseProject(JSON.stringify(previous));
    expect(migrated.formatVersion).toBe(3);
    expect(migrated.makerState).toEqual({ activeBoardIndex: 0, lastPosition: null });
  });

  it('returns stable errors for invalid JSON, oversized files, and future versions', () => {
    expectCode(() => parseProject('{'), 'INVALID_JSON');
    expectCode(() => parseProject(' '.repeat(MAX_PROJECT_FILE_BYTES + 1)), 'PROJECT_TOO_LARGE');
    expectCode(() => parseProject({ formatVersion: 99 }), 'UNSUPPORTED_VERSION');
  });

  it('strictly rejects unknown fields and prototype-pollution keys', () => {
    const serializable = toSerializableProject(makeProject());
    expectCode(() => parseProject({ ...serializable, surprise: true }), 'INVALID_PROJECT');

    const unsafe = JSON.parse(serializeProject(makeProject())) as Record<string, unknown>;
    unsafe.generationSettings = JSON.parse('{"__proto__":{"polluted":true}}') as unknown;
    expectCode(() => parseProject(unsafe), 'UNSAFE_FIELD');
    expectCode(() => parseProject({
      ...serializable,
      thumbnailDataUrl: 'data:image/png;base64,<script>alert(1)</script>',
    }), 'INVALID_PROJECT');
  });

  it('rejects inconsistent cell lengths, invalid palette indexes, and reversed dates', () => {
    const serializable = toSerializableProject(makeProject());
    expectCode(() => parseProject({ ...serializable, cells: [0] }), 'INVALID_CELL_DATA');
    expectCode(() => parseProject({ ...serializable, cells: [0, 2, 1, 0] }), 'INVALID_CELL_DATA');
    expectCode(() => parseProject({
      ...serializable,
      updatedAt: '2026-07-15T00:00:00.000Z',
    }), 'INVALID_PROJECT');
    expectCode(() => parseProject({
      ...serializable,
      makerState: { activeBoardIndex: 1, lastPosition: null },
    }), 'INVALID_PROJECT');
    expectCode(() => parseProject({
      ...serializable,
      makerState: { activeBoardIndex: 0, lastPosition: { row: 2, column: 0 } },
    }), 'INVALID_PROJECT');
    expectCode(() => parseProject({
      ...serializable,
      board: { ...serializable.board, beadDiameterMm: 20.1 },
    }), 'INVALID_PROJECT');
    expectCode(() => parseProject({
      ...serializable,
      sourceImage: {
        ...serializable.sourceImage,
        width: 1,
      },
    }), 'INVALID_PROJECT');
  });
});
