export type SupportedImageFormat = 'jpeg' | 'png' | 'webp';

export interface ImageImportLimits {
  readonly maxBytes: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly maxPixels: number;
}

export interface ImageFileCandidate {
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly bytes: Uint8Array;
}

export interface ValidatedImageFile {
  readonly format: SupportedImageFormat;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly extension: '.jpg' | '.jpeg' | '.png' | '.webp';
  readonly width: number;
  readonly height: number;
  readonly size: number;
}

export type ImageImportErrorCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_EXTENSION'
  | 'UNSUPPORTED_MIME'
  | 'UNSUPPORTED_FORMAT'
  | 'TYPE_MISMATCH'
  | 'TRUNCATED_IMAGE'
  | 'DECODE_FAILED'
  | 'INVALID_DIMENSIONS'
  | 'IMAGE_TOO_LARGE';

export class ImageImportError extends Error {
  constructor(
    readonly code: ImageImportErrorCode,
    readonly userMessage: string,
  ) {
    super(userMessage);
    this.name = 'ImageImportError';
  }
}

export const DEFAULT_IMAGE_IMPORT_LIMITS: ImageImportLimits = Object.freeze({
  maxBytes: 20 * 1024 * 1024,
  maxWidth: 12_000,
  maxHeight: 12_000,
  maxPixels: 40_000_000,
});

const MIME_BY_FORMAT = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

const EXTENSIONS_BY_FORMAT = {
  jpeg: ['.jpg', '.jpeg'],
  png: ['.png'],
  webp: ['.webp'],
} as const;

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    (bytes[offset + 1] << 8) +
    (bytes[offset + 2] << 16) +
    bytes[offset + 3] * 0x1000000
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) {
    return null;
  }
  if (ascii(bytes, 12, 4) !== 'IHDR' || readUint32BigEndian(bytes, 8) !== 13) {
    throw new ImageImportError('TRUNCATED_IMAGE', 'PNG 文件头损坏或不完整。');
  }
  return {
    width: readUint32BigEndian(bytes, 16),
    height: readUint32BigEndian(bytes, 20),
  };
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw new ImageImportError('TRUNCATED_IMAGE', 'JPEG 文件头损坏或不完整。');
    }
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) {
        throw new ImageImportError('TRUNCATED_IMAGE', 'JPEG 尺寸信息损坏。');
      }
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += segmentLength;
  }

  throw new ImageImportError('TRUNCATED_IMAGE', 'JPEG 缺少可识别的尺寸信息。');
}

function parseWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 20 ||
    ascii(bytes, 0, 4) !== 'RIFF' ||
    ascii(bytes, 8, 4) !== 'WEBP'
  ) {
    return null;
  }

  const declaredFileSize = readUint32LittleEndian(bytes, 4) + 8;
  if (declaredFileSize > bytes.length) {
    throw new ImageImportError('TRUNCATED_IMAGE', 'WebP 文件不完整。');
  }

  const chunkType = ascii(bytes, 12, 4);
  if (chunkType === 'VP8X') {
    if (bytes.length < 30) {
      throw new ImageImportError('TRUNCATED_IMAGE', 'WebP VP8X 文件头不完整。');
    }
    return {
      width: readUint24LittleEndian(bytes, 24) + 1,
      height: readUint24LittleEndian(bytes, 27) + 1,
    };
  }

  if (chunkType === 'VP8L') {
    if (bytes.length < 25 || bytes[20] !== 0x2f) {
      throw new ImageImportError('TRUNCATED_IMAGE', 'WebP VP8L 文件头不完整。');
    }
    return {
      width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
      height:
        1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
    };
  }

  if (chunkType === 'VP8 ') {
    if (
      bytes.length < 30 ||
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    ) {
      throw new ImageImportError('TRUNCATED_IMAGE', 'WebP VP8 文件头不完整。');
    }
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }

  throw new ImageImportError('UNSUPPORTED_FORMAT', '不支持此 WebP 编码结构。');
}

function detectFormat(bytes: Uint8Array): {
  format: SupportedImageFormat;
  width: number;
  height: number;
} {
  const png = parsePngDimensions(bytes);
  if (png) return { format: 'png', ...png };

  const jpeg = parseJpegDimensions(bytes);
  if (jpeg) return { format: 'jpeg', ...jpeg };

  const webp = parseWebpDimensions(bytes);
  if (webp) return { format: 'webp', ...webp };

  throw new ImageImportError(
    'UNSUPPORTED_FORMAT',
    '无法识别图片内容。仅支持 JPG、PNG 和 WebP 文件，SVG 与 GIF 不受支持。',
  );
}

function extensionOf(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}

export function validateImageFileCandidate(
  candidate: ImageFileCandidate,
  limits: ImageImportLimits = DEFAULT_IMAGE_IMPORT_LIMITS,
): ValidatedImageFile {
  if (candidate.size <= 0 || candidate.bytes.length === 0) {
    throw new ImageImportError('EMPTY_FILE', '图片文件为空。');
  }
  if (candidate.size !== candidate.bytes.length) {
    throw new ImageImportError('TRUNCATED_IMAGE', '读取到的图片数据不完整。');
  }
  if (candidate.size > limits.maxBytes) {
    throw new ImageImportError(
      'FILE_TOO_LARGE',
      `图片文件不能超过 ${Math.floor(limits.maxBytes / 1024 / 1024)} MB。`,
    );
  }

  const extension = extensionOf(candidate.name);
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new ImageImportError(
      'UNSUPPORTED_EXTENSION',
      '文件扩展名不受支持。请选择 .jpg、.jpeg、.png 或 .webp 文件。',
    );
  }

  const mimeType = candidate.mimeType.toLowerCase();
  if (!(SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new ImageImportError(
      'UNSUPPORTED_MIME',
      '文件 MIME 类型不受支持。请选择浏览器可识别的 JPG、PNG 或 WebP 图片。',
    );
  }

  const detected = detectFormat(candidate.bytes);
  const expectedMime = MIME_BY_FORMAT[detected.format];
  const expectedExtensions = EXTENSIONS_BY_FORMAT[detected.format] as readonly string[];
  if (mimeType !== expectedMime || !expectedExtensions.includes(extension)) {
    throw new ImageImportError(
      'TYPE_MISMATCH',
      '文件扩展名、MIME 类型与图片内容不一致，已拒绝导入。',
    );
  }

  if (!Number.isInteger(detected.width) || !Number.isInteger(detected.height) || detected.width < 1 || detected.height < 1) {
    throw new ImageImportError('INVALID_DIMENSIONS', '图片宽高无效。');
  }
  if (
    detected.width > limits.maxWidth ||
    detected.height > limits.maxHeight ||
    detected.width * detected.height > limits.maxPixels
  ) {
    throw new ImageImportError(
      'IMAGE_TOO_LARGE',
      `图片尺寸过大，最大允许 ${limits.maxWidth}×${limits.maxHeight}，且总像素不能超过 ${limits.maxPixels.toLocaleString('zh-CN')}。`,
    );
  }

  return {
    format: detected.format,
    mimeType: expectedMime,
    extension: extension as ValidatedImageFile['extension'],
    width: detected.width,
    height: detected.height,
    size: candidate.size,
  };
}
