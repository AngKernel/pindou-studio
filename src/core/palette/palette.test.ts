import { beforeEach, describe, expect, it } from 'vitest';
import {
  PaletteError,
  clearCompiledPaletteCache,
  compilePalette,
  findNearestCompiledColor,
  type PaletteDefinition,
} from './index';

const definition: PaletteDefinition = {
  id: 'test-palette',
  version: '1',
  colors: [
    { id: 'black', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
    { id: 'white', hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } },
  ],
};

describe('compiled palettes', () => {
  beforeEach(() => clearCompiledPaletteCache());

  it('precomputes Lab values and reuses the versioned cache', () => {
    const first = compilePalette(definition);
    const second = compilePalette({ ...definition, colors: [...definition.colors] });

    expect(first).toBe(second);
    expect(first.colors[0].lab).toEqual({ l: 0, a: 0, b: 0 });
  });

  it('rejects data changes without a palette version change', () => {
    compilePalette(definition);
    expect(() =>
      compilePalette({
        ...definition,
        colors: [
          ...definition.colors.slice(0, 1),
          { id: 'white', hex: '#FEFEFE', rgb: { r: 254, g: 254, b: 254 } },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'PALETTE_VERSION_CONFLICT' }));
  });

  it('uses CIEDE2000 matching and a stable id tie-break', () => {
    const compiled = compilePalette({
      id: 'tie-palette',
      version: '1',
      colors: [
        { id: 'z-color', hex: '#112233', rgb: { r: 17, g: 34, b: 51 } },
        { id: 'a-color', hex: '#112233', rgb: { r: 17, g: 34, b: 51 } },
      ],
    });

    expect(findNearestCompiledColor({ r: 17, g: 34, b: 51 }, compiled.colors).id).toBe(
      'a-color',
    );
  });

  it('returns a typed error for an empty palette', () => {
    expect(() =>
      compilePalette({ id: 'empty', version: '1', colors: [] }),
    ).toThrowError(PaletteError);
    expect(() =>
      compilePalette({ id: 'empty', version: '1', colors: [] }),
    ).toThrowError(expect.objectContaining({ code: 'EMPTY_PALETTE' }));
  });
});
