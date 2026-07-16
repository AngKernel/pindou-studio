import {
  ProjectError,
  parseProject,
  toSerializableProject,
  type PatternProject,
  type SerializablePatternProject,
} from '../core/project';
import type { ProjectStore, ProjectSummary } from './project-store';

const DATABASE_NAME = 'pindou-studio';
const DATABASE_VERSION = 1;
const PROJECT_STORE_NAME = 'projects';

interface StoreOptions {
  readonly factory?: IDBFactory | null;
  readonly now?: () => Date;
  readonly randomUUID?: () => string;
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

function storageError(error: unknown): ProjectError {
  if (error instanceof ProjectError) return error;
  return new ProjectError('STORAGE_FAILED', '本地项目存储失败。请导出备份后检查浏览器存储空间。', { cause: error });
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized || normalized.length > 200) {
    throw new ProjectError('INVALID_PROJECT', '项目名称必须为 1 到 200 个字符。');
  }
  return normalized;
}

function summaryOf(project: SerializablePatternProject): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    width: project.width,
    height: project.height,
    paletteId: project.palette.id,
    paletteVersion: project.palette.version,
    thumbnailDataUrl: project.thumbnailDataUrl,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export class IndexedDbProjectStore implements ProjectStore {
  private readonly factory: IDBFactory | undefined;
  private readonly now: () => Date;
  private readonly randomUUID: () => string;
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(options: StoreOptions = {}) {
    this.factory = options.factory === undefined ? globalThis.indexedDB : options.factory ?? undefined;
    this.now = options.now ?? (() => new Date());
    this.randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
  }

  private open(): Promise<IDBDatabase> {
    if (!this.factory) {
      return Promise.reject(new ProjectError(
        'STORAGE_UNAVAILABLE',
        '当前浏览器无法使用本地项目存储，编辑功能仍可继续，请及时导出备份。',
      ));
    }
    if (this.databasePromise) return this.databasePromise;

    const databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROJECT_STORE_NAME)) {
          const store = database.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      });
      request.addEventListener('success', () => {
        request.result.addEventListener('versionchange', () => request.result.close());
        resolve(request.result);
      }, { once: true });
      request.addEventListener('blocked', () => reject(new Error('IndexedDB upgrade blocked')), { once: true });
      request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB open failed')), { once: true });
    }).catch((error) => {
      this.databasePromise = null;
      throw storageError(error);
    });
    this.databasePromise = databasePromise;
    return databasePromise;
  }

  private async transact<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    try {
      const database = await this.open();
      const transaction = database.transaction(PROJECT_STORE_NAME, mode);
      const completed = transactionComplete(transaction);
      try {
        const result = await operation(transaction.objectStore(PROJECT_STORE_NAME));
        await completed;
        return result;
      } catch (error) {
        await completed.catch(() => undefined);
        throw error;
      }
    } catch (error) {
      throw storageError(error);
    }
  }

  async list(): Promise<readonly ProjectSummary[]> {
    const projects = await this.transact('readonly', async (store) => {
      const values = await requestResult<unknown[]>(store.getAll());
      return values.map((value) => toSerializableProject(parseProject(value)));
    });
    return projects
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(summaryOf);
  }

  async get(id: string): Promise<PatternProject | null> {
    return this.transact('readonly', async (store) => {
      const value = await requestResult<unknown>(store.get(id));
      return value === undefined ? null : parseProject(value);
    });
  }

  async put(project: PatternProject): Promise<void> {
    const serializable = toSerializableProject(project);
    await this.transact('readwrite', async (store) => {
      await requestResult(store.put(serializable));
    });
  }

  async rename(id: string, name: string): Promise<PatternProject> {
    const normalizedName = normalizeName(name);
    return this.transact('readwrite', async (store) => {
      const value = await requestResult<unknown>(store.get(id));
      if (value === undefined) throw new ProjectError('PROJECT_NOT_FOUND', '找不到要重命名的本地项目。');
      const source = parseProject(value);
      const renamed: PatternProject = {
        ...source,
        name: normalizedName,
        updatedAt: this.now().toISOString(),
      };
      await requestResult(store.put(toSerializableProject(renamed)));
      return renamed;
    });
  }

  async duplicate(id: string): Promise<PatternProject> {
    return this.transact('readwrite', async (store) => {
      const value = await requestResult<unknown>(store.get(id));
      if (value === undefined) throw new ProjectError('PROJECT_NOT_FOUND', '找不到要复制的本地项目。');
      const source = parseProject(value);
      const timestamp = this.now().toISOString();
      const copy: PatternProject = {
        ...source,
        id: this.randomUUID(),
        name: normalizeName(`${source.name.slice(0, 197)} 副本`),
        cells: source.cells.slice(),
        external: source.external.slice(),
        completed: source.completed.slice(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await requestResult(store.add(toSerializableProject(copy)));
      return copy;
    });
  }

  async delete(id: string): Promise<void> {
    await this.transact('readwrite', async (store) => {
      await requestResult(store.delete(id));
    });
  }
}
