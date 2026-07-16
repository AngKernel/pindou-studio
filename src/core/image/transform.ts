import { assertRgbColor, type RgbColor } from '../color';

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type RightAngleRotation = 0 | 90 | 180 | 270;

export type ImageBackground =
  | { readonly mode: 'preserve-alpha' }
  | { readonly mode: 'solid'; readonly color: RgbColor };

export interface ImageTransformSettings {
  readonly crop: CropRect;
  readonly rotation: RightAngleRotation;
  readonly flipHorizontal: boolean;
  readonly flipVertical: boolean;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly background: ImageBackground;
}

export type ImageTransformErrorCode =
  | 'INVALID_IMAGE_BUFFER'
  | 'INVALID_CROP'
  | 'INVALID_SCALE'
  | 'INVALID_OFFSET';

export class ImageTransformError extends Error {
  constructor(
    readonly code: ImageTransformErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImageTransformError';
  }
}

export function createDefaultImageTransform(
  width: number,
  height: number,
): ImageTransformSettings {
  return {
    crop: { x: 0, y: 0, width, height },
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    background: { mode: 'preserve-alpha' },
  };
}

function assertImage(image: RgbaImage): void {
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.data.length !== image.width * image.height * 4
  ) {
    throw new ImageTransformError(
      'INVALID_IMAGE_BUFFER',
      'RGBA image dimensions do not match its buffer.',
    );
  }
}

function assertSettings(image: RgbaImage, settings: ImageTransformSettings): void {
  const { crop } = settings;
  if (
    !Number.isInteger(crop.x) ||
    !Number.isInteger(crop.y) ||
    !Number.isInteger(crop.width) ||
    !Number.isInteger(crop.height) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x + crop.width > image.width ||
    crop.y + crop.height > image.height
  ) {
    throw new ImageTransformError('INVALID_CROP', 'Crop rectangle is outside the image.');
  }
  if (!Number.isFinite(settings.scale) || settings.scale <= 0 || settings.scale > 8) {
    throw new ImageTransformError('INVALID_SCALE', 'Scale must be greater than 0 and at most 8.');
  }
  if (!Number.isInteger(settings.offsetX) || !Number.isInteger(settings.offsetY)) {
    throw new ImageTransformError('INVALID_OFFSET', 'Image offsets must be integers.');
  }
  if (settings.background.mode === 'solid') {
    assertRgbColor(settings.background.color);
  }
}

function createBuffer(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

function copyPixel(
  source: Uint8ClampedArray,
  sourceIndex: number,
  target: Uint8ClampedArray,
  targetIndex: number,
): void {
  target[targetIndex] = source[sourceIndex];
  target[targetIndex + 1] = source[sourceIndex + 1];
  target[targetIndex + 2] = source[sourceIndex + 2];
  target[targetIndex + 3] = source[sourceIndex + 3];
}

function cropImage(image: RgbaImage, crop: CropRect): RgbaImage {
  const data = createBuffer(crop.width, crop.height);
  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const sourceIndex = ((crop.y + y) * image.width + crop.x + x) * 4;
      copyPixel(image.data, sourceIndex, data, (y * crop.width + x) * 4);
    }
  }
  return { width: crop.width, height: crop.height, data };
}

function rotateImage(image: RgbaImage, rotation: RightAngleRotation): RgbaImage {
  if (rotation === 0) return image;
  const width = rotation === 90 || rotation === 270 ? image.height : image.width;
  const height = rotation === 90 || rotation === 270 ? image.width : image.height;
  const data = createBuffer(width, height);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      let targetX: number;
      let targetY: number;
      if (rotation === 90) {
        targetX = image.height - 1 - y;
        targetY = x;
      } else if (rotation === 180) {
        targetX = image.width - 1 - x;
        targetY = image.height - 1 - y;
      } else {
        targetX = y;
        targetY = image.width - 1 - x;
      }
      copyPixel(
        image.data,
        (y * image.width + x) * 4,
        data,
        (targetY * width + targetX) * 4,
      );
    }
  }
  return { width, height, data };
}

function flipImage(image: RgbaImage, horizontal: boolean, vertical: boolean): RgbaImage {
  if (!horizontal && !vertical) return image;
  const data = createBuffer(image.width, image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const targetX = horizontal ? image.width - 1 - x : x;
      const targetY = vertical ? image.height - 1 - y : y;
      copyPixel(
        image.data,
        (y * image.width + x) * 4,
        data,
        (targetY * image.width + targetX) * 4,
      );
    }
  }
  return { ...image, data };
}

function fillBackground(
  data: Uint8ClampedArray,
  background: ImageBackground,
): void {
  if (background.mode !== 'solid') return;
  for (let index = 0; index < data.length; index += 4) {
    data[index] = background.color.r;
    data[index + 1] = background.color.g;
    data[index + 2] = background.color.b;
    data[index + 3] = 255;
  }
}

function compositePixel(
  source: Uint8ClampedArray,
  sourceIndex: number,
  target: Uint8ClampedArray,
  targetIndex: number,
  background: ImageBackground,
): void {
  if (background.mode === 'preserve-alpha') {
    copyPixel(source, sourceIndex, target, targetIndex);
    return;
  }

  const alpha = source[sourceIndex + 3] / 255;
  target[targetIndex] = Math.round(
    source[sourceIndex] * alpha + background.color.r * (1 - alpha),
  );
  target[targetIndex + 1] = Math.round(
    source[sourceIndex + 1] * alpha + background.color.g * (1 - alpha),
  );
  target[targetIndex + 2] = Math.round(
    source[sourceIndex + 2] * alpha + background.color.b * (1 - alpha),
  );
  target[targetIndex + 3] = 255;
}

function positionAndComposite(
  image: RgbaImage,
  settings: Pick<ImageTransformSettings, 'scale' | 'offsetX' | 'offsetY' | 'background'>,
): RgbaImage {
  const data = createBuffer(image.width, image.height);
  fillBackground(data, settings.background);
  const centerX = image.width / 2;
  const centerY = image.height / 2;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sourceX = Math.floor(
        (x + 0.5 - centerX - settings.offsetX) / settings.scale + centerX,
      );
      const sourceY = Math.floor(
        (y + 0.5 - centerY - settings.offsetY) / settings.scale + centerY,
      );
      if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX >= image.width ||
        sourceY >= image.height
      ) {
        continue;
      }
      compositePixel(
        image.data,
        (sourceY * image.width + sourceX) * 4,
        data,
        (y * image.width + x) * 4,
        settings.background,
      );
    }
  }
  return { width: image.width, height: image.height, data };
}

export function transformRgbaImage(
  image: RgbaImage,
  settings: ImageTransformSettings,
): RgbaImage {
  assertImage(image);
  assertSettings(image, settings);

  const cropped = cropImage(image, settings.crop);
  const rotated = rotateImage(cropped, settings.rotation);
  const flipped = flipImage(
    rotated,
    settings.flipHorizontal,
    settings.flipVertical,
  );
  return positionAndComposite(flipped, settings);
}
