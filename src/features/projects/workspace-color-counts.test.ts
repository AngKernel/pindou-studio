import { describe, expect, it } from 'vitest';
import { calculateWorkspaceColorStatistics } from './workspace-color-counts';

describe('workspace color statistics', () => {
  it('always indexes colors by normalized hex instead of vendor code', () => {
    const result = calculateWorkspaceColorStatistics([
      [
        { key: 'A01', color: '#aabbcc' },
        { key: 'COCO-7', color: '#AABBCC' },
        { key: 'ERASE', color: '#FFFFFF', isExternal: true },
      ],
    ]);

    expect(result).toEqual({
      counts: {
        '#AABBCC': { count: 2, color: '#AABBCC' },
      },
      total: 2,
    });
  });
});
