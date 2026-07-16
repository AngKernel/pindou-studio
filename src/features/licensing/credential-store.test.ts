import { describe, expect, it } from 'vitest';
import { LicensingCredentialStore, LicensingStorageError } from './credential-store';

describe('LicensingCredentialStore', () => {
  it('fails closed for entitlements when IndexedDB is unavailable without affecting project storage', async () => {
    const store = new LicensingCredentialStore({ factory: null });
    await expect(store.loadSession()).rejects.toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
    } satisfies Partial<LicensingStorageError>);
  });
});
