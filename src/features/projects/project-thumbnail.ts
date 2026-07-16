import type { MappedPixel } from '../../utils/pixelation';

export function createProjectThumbnail(
  mappedPixelData: readonly (readonly MappedPixel[])[],
  width: number,
  height: number,
): string | undefined {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context || width <= 0 || height <= 0) return undefined;

  const scale = Math.min(1, 128 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const cell = mappedPixelData[row]?.[column];
      if (!cell || cell.isExternal) continue;
      context.fillStyle = cell.color;
      const left = Math.floor(column * canvas.width / width);
      const top = Math.floor(row * canvas.height / height);
      const right = Math.ceil((column + 1) * canvas.width / width);
      const bottom = Math.ceil((row + 1) * canvas.height / height);
      context.fillRect(left, top, right - left, bottom - top);
    }
  }
  return canvas.toDataURL('image/png');
}
