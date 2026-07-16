import { EXPORT_PROTOCOL_VERSION, type ExportWorkerRequest, type ExportWorkerResponse } from '../../workers/export-protocol';
import type { ExportArtifact } from './types';

export interface ExportWorkerLike {
  onmessage: ((event: MessageEvent<ExportWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: ExportWorkerRequest): void;
  terminate(): void;
}

export type ExportClientRequest = Omit<ExportWorkerRequest, 'type' | 'protocolVersion' | 'taskId'>;

export interface ExportClientOptions {
  readonly onProgress?: (completed: number, total: number, stage: string) => void;
}

export class ExportClientError extends Error {
  constructor(readonly code: string, readonly userMessage: string) {
    super(userMessage);
    this.name = 'ExportClientError';
  }
}

type WorkerFactory = () => ExportWorkerLike;

function defaultWorkerFactory(): ExportWorkerLike {
  return new Worker(new URL('../../workers/export.worker.ts', import.meta.url), { type: 'module' });
}

export class ExportClient {
  private nextTaskId = 1;
  private active: { readonly taskId: number; readonly worker: ExportWorkerLike; readonly reject: (error: Error) => void } | undefined;

  constructor(private readonly createWorker: WorkerFactory = defaultWorkerFactory) {}

  export(request: ExportClientRequest, options: ExportClientOptions = {}): Promise<ExportArtifact> {
    this.cancel();
    const taskId = this.nextTaskId;
    this.nextTaskId += 1;
    const worker = this.createWorker();
    return new Promise((resolve, reject) => {
      this.active = { taskId, worker, reject };
      let lastProgress = 0;
      worker.onmessage = (event) => {
        const response = event.data;
        if (response.protocolVersion !== EXPORT_PROTOCOL_VERSION || response.taskId !== taskId || this.active?.taskId !== taskId) return;
        if (response.type === 'progress') {
          if (response.completed >= lastProgress) {
            lastProgress = response.completed;
            options.onProgress?.(response.completed, response.total, response.stage);
          }
          return;
        }
        this.active = undefined;
        worker.terminate();
        if (response.type === 'error') {
          reject(new ExportClientError(response.code, response.message));
          return;
        }
        resolve({ data: response.data, mimeType: response.mimeType, fileName: response.fileName });
      };
      worker.onerror = (event) => {
        if (this.active?.taskId !== taskId) return;
        this.active = undefined;
        worker.terminate();
        reject(new ExportClientError('WORKER_FAILED', event.message || '导出线程异常。'));
      };
      worker.postMessage({ ...request, type: 'export', protocolVersion: EXPORT_PROTOCOL_VERSION, taskId });
    });
  }

  cancel(): void {
    if (!this.active) return;
    const { worker, reject } = this.active;
    this.active = undefined;
    worker.terminate();
    reject(new ExportClientError('EXPORT_CANCELLED', '导出任务已取消。'));
  }

  dispose(): void {
    this.cancel();
  }
}
