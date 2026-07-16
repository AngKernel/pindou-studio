import { describe, expect, it } from 'vitest';
import {
  createDefaultImageTransform,
  transformRgbaImage,
  type ImageTransformSettings,
  type RgbaImage,
} from './transform';

function image(rows: number[][]): RgbaImage {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.flat().forEach((value, index) => {
    data[index * 4] = value;
    data[index * 4 + 3] = 255;
  });
  return { width, height, data };
}

function redRows(value: RgbaImage): number[][] {
  return Array.from({ length: value.height }, (_, y) =>
    Array.from({ length: value.width }, (_, x) => value.data[(y * value.width + x) * 4]),
  );
}

describe('RGBA image transforms', () => {
  const source = image([
    [1, 2, 3],
    [4, 5, 6],
  ]);

  it('crops with integer pixel boundaries', () => {
    const settings: ImageTransformSettings = {
      ...createDefaultImageTransform(source.width, source.height),
      crop: { x: 1, y: 0, width: 2, height: 2 },
    };
    expect(redRows(transformRgbaImage(source, settings))).toEqual([
      [2, 3],
      [5, 6],
    ]);
  });

  it.each([
    [90, [[4, 1], [5, 2], [6, 3]]],
    [180, [[6, 5, 4], [3, 2, 1]]],
    [270, [[3, 6], [2, 5], [1, 4]]],
  ] as const)('rotates %s degrees clockwise', (rotation, expected) => {
    const settings: ImageTransformSettings = {
      ...createDefaultImageTransform(source.width, source.height),
      rotation,
    };
    expect(redRows(transformRgbaImage(source, settings))).toEqual(expected);
  });

  it('flips horizontally and vertically', () => {
    expect(
      redRows(
        transformRgbaImage(source, {
          ...createDefaultImageTransform(source.width, source.height),
          flipHorizontal: true,
        }),
      ),
    ).toEqual([[3, 2, 1], [6, 5, 4]]);
    expect(
      redRows(
        transformRgbaImage(source, {
          ...createDefaultImageTransform(source.width, source.height),
          flipVertical: true,
        }),
      ),
    ).toEqual([[4, 5, 6], [1, 2, 3]]);
  });

  it('scales around the center and applies an integer position offset', () => {
    const square = image([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    const transformed = transformRgbaImage(square, {
      ...createDefaultImageTransform(3, 3),
      scale: 2,
      offsetX: 1,
    });
    expect(redRows(transformed)).toEqual([[4, 5, 5], [4, 5, 5], [7, 8, 8]]);
  });

  it('preserves alpha or composites onto a selected solid background', () => {
    const transparent = image([[200]]);
    transparent.data[3] = 128;

    expect(transformRgbaImage(transparent, createDefaultImageTransform(1, 1)).data[3]).toBe(
      128,
    );
    expect(
      Array.from(
        transformRgbaImage(transparent, {
          ...createDefaultImageTransform(1, 1),
          background: { mode: 'solid', color: { r: 100, g: 20, b: 10 } },
        }).data,
      ),
    ).toEqual([150, 10, 5, 255]);
  });

  it('rejects crop rectangles outside the source image', () => {
    expect(() =>
      transformRgbaImage(source, {
        ...createDefaultImageTransform(source.width, source.height),
        crop: { x: 2, y: 0, width: 2, height: 2 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_CROP' }));
  });
});
