import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateAndDecodeBrowserImageFile } from './validate-browser-image';

function jpegFile(width: number, height: number): File {
  const bytes = Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0,
    0x00, 0x11,
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  return {
    name: 'phone.jpg',
    type: 'image/jpeg',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(0),
  } as File;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser image validation', () => {
  it('accepts decoded dimensions swapped by EXIF orientation', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 300, height: 400, close })));

    await expect(validateAndDecodeBrowserImageFile(jpegFile(400, 300))).resolves.toMatchObject({
      width: 300,
      height: 400,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('still rejects unrelated decoded dimensions', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 200, height: 200, close })));

    await expect(validateAndDecodeBrowserImageFile(jpegFile(400, 300))).rejects.toMatchObject({
      code: 'DECODE_FAILED',
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
