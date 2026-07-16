import { describe, expect, it } from 'vitest';
import { ProjectError } from '../core/project';
import { IndexedDbProjectStore } from './indexeddb-project-store';

describe('IndexedDbProjectStore', () => {
  it('reports unavailable storage without requiring React or a browser global', async () => {
    const store = new IndexedDbProjectStore({ factory: null });

    await expect(store.list()).rejects.toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
    } satisfies Partial<ProjectError>);
  });
});
