import { describe, expect, it } from 'vitest';
import { MAX_PROJECT_DIMENSION, MAX_PROJECT_FILE_BYTES } from '../core/project';
import { importCsvData, parseCsvData } from './imageDownloader';

describe('parseCsvData', () => {
  it('parses CRLF rows and transparent cells', () => {
    expect(parseCsvData('#ffffff,TRANSPARENT\r\n#000000,')).toEqual({
      mappedPixelData: [
        [
          { key: '#FFFFFF', color: '#FFFFFF', isExternal: false },
          { key: 'TRANSPARENT', color: '#FFFFFF', isExternal: true },
        ],
        [
          { key: '#000000', color: '#000000', isExternal: false },
          { key: 'TRANSPARENT', color: '#FFFFFF', isExternal: true },
        ],
      ],
      gridDimensions: { N: 2, M: 2 },
    });
  });

  it('rejects dimensions before allocating an oversized grid', () => {
    const tooManyRows = Array.from({ length: MAX_PROJECT_DIMENSION + 1 }, () => '#FFFFFF').join('\n');
    const tooManyColumns = Array.from({ length: MAX_PROJECT_DIMENSION + 1 }, () => '#FFFFFF').join(',');

    expect(() => parseCsvData(tooManyRows)).toThrow(`CSV行数不能超过${MAX_PROJECT_DIMENSION}行`);
    expect(() => parseCsvData(tooManyColumns)).toThrow(`CSV列数不能超过${MAX_PROJECT_DIMENSION}列`);
  });

  it('rejects oversized files before creating a FileReader', async () => {
    const file = { size: MAX_PROJECT_FILE_BYTES + 1 } as File;
    await expect(importCsvData(file)).rejects.toThrow('CSV文件不能超过5 MB');
  });
});
