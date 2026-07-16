import { describe, expect, it } from 'vitest';
import {
  ImageImportError,
  validateImageFileCandidate,
  type ImageFileCandidate,
} from './import-policy';

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([82, 73, 70, 70]);
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set([87, 69, 66, 80, 86, 80, 56, 88], 8);
  new DataView(bytes.buffer).setUint32(16, 10, true);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  bytes.set([
    widthMinusOne & 0xff,
    (widthMinusOne >> 8) & 0xff,
    (widthMinusOne >> 16) & 0xff,
  ], 24);
  bytes.set([
    heightMinusOne & 0xff,
    (heightMinusOne >> 8) & 0xff,
    (heightMinusOne >> 16) & 0xff,
  ], 27);
  return bytes;
}

function candidate(
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): ImageFileCandidate {
  return { name, mimeType, size: bytes.length, bytes };
}

describe('image import policy', () => {
  it.each([
    ['photo.jpg', 'image/jpeg', jpeg(640, 480), 'jpeg'],
    ['art.png', 'image/png', png(320, 240), 'png'],
    ['sprite.webp', 'image/webp', webpVp8x(128, 96), 'webp'],
  ] as const)('accepts a valid %s image', (name, mime, bytes, format) => {
    expect(validateImageFileCandidate(candidate(name, mime, bytes))).toMatchObject({
      format,
      width: format === 'jpeg' ? 640 : format === 'png' ? 320 : 128,
    });
  });

  it('rejects MIME, extension and magic-byte mismatches', () => {
    expect(() =>
      validateImageFileCandidate(candidate('renamed.png', 'image/png', jpeg(20, 20))),
    ).toThrowError(expect.objectContaining({ code: 'TYPE_MISMATCH' }));
  });

  it.each([
    ['vector.svg', 'image/svg+xml', new TextEncoder().encode('<svg></svg>')],
    ['animation.gif', 'image/gif', Uint8Array.from([71, 73, 70, 56, 57, 97])],
    ['empty.png', 'image/png', new Uint8Array()],
  ] as const)('rejects unsupported or empty input %s', (name, mime, bytes) => {
    expect(() => validateImageFileCandidate(candidate(name, mime, bytes))).toThrowError(
      ImageImportError,
    );
  });

  it('rejects truncated and oversized images before browser decoding', () => {
    const truncated = jpeg(100, 100).slice(0, 8);
    expect(() =>
      validateImageFileCandidate(candidate('bad.jpg', 'image/jpeg', truncated)),
    ).toThrowError(expect.objectContaining({ code: 'TRUNCATED_IMAGE' }));

    expect(() =>
      validateImageFileCandidate(candidate('huge.png', 'image/png', png(10_000, 10_000))),
    ).toThrowError(expect.objectContaining({ code: 'IMAGE_TOO_LARGE' }));
  });

  it('rejects a byte-count mismatch', () => {
    const bytes = png(10, 10);
    expect(() =>
      validateImageFileCandidate({
        name: 'truncated.png',
        mimeType: 'image/png',
        size: bytes.length + 1,
        bytes,
      }),
    ).toThrowError(expect.objectContaining({ code: 'TRUNCATED_IMAGE' }));
  });
});
