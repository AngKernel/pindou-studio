import { licenseStatusSchema, publicDeviceJwkSchema } from '../../schemas/licensing-api';
import type { DeviceIdentity, RefreshSession } from './types';

const DATABASE_NAME = 'pindou-studio-licensing';
const DATABASE_VERSION = 1;
const STORE_NAME = 'credentials';

interface StoreOptions {
  readonly factory?: IDBFactory | null;
}

interface DeviceRecord {
  readonly key: 'device';
  readonly version: 1;
  readonly privateKey: CryptoKey;
  readonly publicKeyJwk: unknown;
}

interface SessionRecord {
  readonly key: 'session';
  readonly version: 1;
  readonly refreshToken: string;
  readonly refreshExpiresAt: string;
  readonly license: unknown;
}

export class LicensingStorageError extends Error {
  constructor(readonly code: 'STORAGE_UNAVAILABLE' | 'STORAGE_FAILED' | 'CORRUPT_CREDENTIALS', message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LicensingStorageError';
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed')), { once: true });
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed')), { once: true });
  });
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return typeof CryptoKey !== 'undefined' && value instanceof CryptoKey;
}

export class LicensingCredentialStore {
  private readonly factory: IDBFactory | undefined;
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(options: StoreOptions = {}) {
    this.factory = options.factory === undefined ? globalThis.indexedDB : options.factory ?? undefined;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new LicensingStorageError('STORAGE_UNAVAILABLE', '当前浏览器无法安全保存设备授权。'));
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener('upgradeneeded', () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB open failed')), { once: true });
      request.addEventListener('blocked', () => reject(new Error('IndexedDB upgrade blocked')), { once: true });
    }).catch((error) => {
      this.databasePromise = null;
      throw new LicensingStorageError('STORAGE_FAILED', '设备授权存储失败，基础功能仍可继续使用。', { cause: error });
    });
    return this.databasePromise;
  }

  private async transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    try {
      const database = await this.open();
      const transaction = database.transaction(STORE_NAME, mode);
      const completion = transactionComplete(transaction);
      const result = await operation(transaction.objectStore(STORE_NAME));
      await completion;
      return result;
    } catch (error) {
      if (error instanceof LicensingStorageError) throw error;
      throw new LicensingStorageError('STORAGE_FAILED', '设备授权存储失败，基础功能仍可继续使用。', { cause: error });
    }
  }

  async loadDevice(): Promise<DeviceIdentity | null> {
    const value = await this.transact('readonly', (store) => requestResult<unknown>(store.get('device')));
    if (value === undefined) return null;
    if (!value || typeof value !== 'object') throw new LicensingStorageError('CORRUPT_CREDENTIALS', '本地设备凭据已损坏。');
    const record = value as Partial<DeviceRecord>;
    const publicKeyJwk = publicDeviceJwkSchema.safeParse(record.publicKeyJwk);
    if (record.key !== 'device' || record.version !== 1 || !isCryptoKey(record.privateKey) || !publicKeyJwk.success) {
      throw new LicensingStorageError('CORRUPT_CREDENTIALS', '本地设备凭据已损坏。');
    }
    return { privateKey: record.privateKey, publicKeyJwk: publicKeyJwk.data };
  }

  saveDevice(device: DeviceIdentity): Promise<void> {
    const record: DeviceRecord = { key: 'device', version: 1, privateKey: device.privateKey, publicKeyJwk: device.publicKeyJwk };
    return this.transact('readwrite', async (store) => { await requestResult(store.put(record)); });
  }

  async loadSession(): Promise<RefreshSession | null> {
    const value = await this.transact('readonly', (store) => requestResult<unknown>(store.get('session')));
    if (value === undefined) return null;
    if (!value || typeof value !== 'object') throw new LicensingStorageError('CORRUPT_CREDENTIALS', '本地刷新凭据已损坏。');
    const record = value as Partial<SessionRecord>;
    const license = licenseStatusSchema.safeParse(record.license);
    if (
      record.key !== 'session' || record.version !== 1
      || typeof record.refreshToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(record.refreshToken)
      || typeof record.refreshExpiresAt !== 'string' || !Number.isFinite(Date.parse(record.refreshExpiresAt))
      || !license.success
    ) throw new LicensingStorageError('CORRUPT_CREDENTIALS', '本地刷新凭据已损坏。');
    return { refreshToken: record.refreshToken, refreshExpiresAt: record.refreshExpiresAt, license: license.data };
  }

  saveSession(session: RefreshSession): Promise<void> {
    const record: SessionRecord = { key: 'session', version: 1, ...session };
    return this.transact('readwrite', async (store) => { await requestResult(store.put(record)); });
  }

  clearSession(): Promise<void> {
    return this.transact('readwrite', async (store) => { await requestResult(store.delete('session')); });
  }

  clearAll(): Promise<void> {
    return this.transact('readwrite', async (store) => { await requestResult(store.clear()); });
  }
}
