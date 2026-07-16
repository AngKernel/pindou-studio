import { BoardError, type BoardLayout, type BoardPreset, type BoardRegion, type BoardSettings, type FinishedSize } from './types';

export const BOARD_PRESETS: readonly BoardPreset[] = [
  { id: 'square-29', name: '标准方板 29×29', width: 29, height: 29, beadDiameterMm: 5 },
  { id: 'square-30', name: '方板 30×30', width: 30, height: 30, beadDiameterMm: 5 },
  { id: 'square-50', name: '大方板 50×50', width: 50, height: 50, beadDiameterMm: 5 },
];

export function validateBoardSettings(settings: BoardSettings): BoardSettings {
  if (!Number.isInteger(settings.width) || !Number.isInteger(settings.height)
    || settings.width < 1 || settings.height < 1 || settings.width > 300 || settings.height > 300) {
    throw new BoardError('豆板宽高必须是 1 到 300 的整数。');
  }
  if (!Number.isFinite(settings.beadDiameterMm)
    || settings.beadDiameterMm < 0.5 || settings.beadDiameterMm > 20) {
    throw new BoardError('豆子直径必须在 0.5 mm 到 20 mm 之间。');
  }
  return settings;
}

export function partitionPattern(width: number, height: number, settings: BoardSettings): BoardLayout {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new BoardError('图纸宽高必须是正整数。');
  }
  validateBoardSettings(settings);
  const columns = Math.ceil(width / settings.width);
  const rows = Math.ceil(height / settings.height);
  const regions: BoardRegion[] = [];
  for (let boardRow = 0; boardRow < rows; boardRow += 1) {
    for (let boardColumn = 0; boardColumn < columns; boardColumn += 1) {
      const startColumn = boardColumn * settings.width;
      const startRow = boardRow * settings.height;
      regions.push({
        index: regions.length,
        boardColumn,
        boardRow,
        startColumn,
        startRow,
        width: Math.min(settings.width, width - startColumn),
        height: Math.min(settings.height, height - startRow),
      });
    }
  }
  return { columns, rows, total: regions.length, regions };
}

export function calculateFinishedSize(width: number, height: number, beadDiameterMm: number): FinishedSize {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || !Number.isFinite(beadDiameterMm) || beadDiameterMm < 0.5 || beadDiameterMm > 20) {
    throw new BoardError('无法使用当前图纸和豆径计算成品尺寸。');
  }
  const widthMm = width * beadDiameterMm;
  const heightMm = height * beadDiameterMm;
  return { widthMm, heightMm, widthCm: widthMm / 10, heightCm: heightMm / 10 };
}

export function boardCellIndexes(region: BoardRegion, patternWidth: number): Uint32Array {
  const indexes = new Uint32Array(region.width * region.height);
  let offset = 0;
  for (let row = region.startRow; row < region.startRow + region.height; row += 1) {
    for (let column = region.startColumn; column < region.startColumn + region.width; column += 1) {
      indexes[offset] = row * patternWidth + column;
      offset += 1;
    }
  }
  return indexes;
}
