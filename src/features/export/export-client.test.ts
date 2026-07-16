import { describe, expect, it, vi } from 'vitest';
import type { PatternProject } from '../../core/project';
import { EXPORT_PROTOCOL_VERSION, type ExportWorkerResponse } from '../../workers/export-protocol';
import { ExportClient, type ExportWorkerLike } from './export-client';

class FakeWorker implements ExportWorkerLike {
  onmessage: ((event: MessageEvent<ExportWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

const project = { name: 'test' } as PatternProject;

describe('export client', () => {
  it('keeps progress monotonic and resolves the matching artifact', async () => {
    const worker = new FakeWorker();
    const progress = vi.fn();
    const client = new ExportClient(() => worker);
    const pending = client.export({ project, format: 'csv' }, { onProgress: progress });
    worker.onmessage?.({ data: { type: 'progress', protocolVersion: EXPORT_PROTOCOL_VERSION, taskId: 1, completed: 50, total: 100, stage: '统计' } } as MessageEvent<ExportWorkerResponse>);
    worker.onmessage?.({ data: { type: 'progress', protocolVersion: EXPORT_PROTOCOL_VERSION, taskId: 1, completed: 20, total: 100, stage: '旧进度' } } as MessageEvent<ExportWorkerResponse>);
    const data = new ArrayBuffer(1);
    worker.onmessage?.({ data: { type: 'result', protocolVersion: EXPORT_PROTOCOL_VERSION, taskId: 1, data, mimeType: 'text/csv', fileName: 'test.csv' } } as MessageEvent<ExportWorkerResponse>);
    await expect(pending).resolves.toEqual({ data, mimeType: 'text/csv', fileName: 'test.csv' });
    expect(progress).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates and rejects a cancelled task', async () => {
    const worker = new FakeWorker();
    const client = new ExportClient(() => worker);
    const pending = client.export({ project, format: 'pdf' });
    client.cancel();
    await expect(pending).rejects.toMatchObject({ code: 'EXPORT_CANCELLED' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
