import { describe, expect, it } from 'vitest';
import type { ImageTransformSettings } from '../../core/image/transform';
import type { PaletteDefinition } from '../../core/palette';
import type { PatternGenerationSettings } from '../../core/pattern/generate';
import {
  GENERATOR_PROTOCOL_VERSION,
  type GeneratePatternRequest,
  type GeneratorWorkerResponse,
} from '../../workers/generator-protocol';
import { GeneratorClient, type WorkerLike } from './generator-client';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<GeneratorWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  request: GeneratePatternRequest | undefined;
  terminated = false;

  postMessage(message: GeneratePatternRequest): void {
    this.request = message;
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(response: GeneratorWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<GeneratorWorkerResponse>);
  }
}

const transform: ImageTransformSettings = {
  crop: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  background: { mode: 'preserve-alpha' },
};
const palette: PaletteDefinition = {
  id: 'client-test',
  version: '1',
  colors: [{ id: 'black', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } }],
};
const settings: PatternGenerationSettings = {
  gridWidth: 1,
  gridHeight: 1,
  mode: 'realistic',
  maximumColors: 1,
  similarColorDeltaE: 0,
  minimumRegionSize: 1,
  cleanupPasses: 0,
  alphaThreshold: 128,
};

function request() {
  return {
    image: { width: 1, height: 1, buffer: new Uint8ClampedArray([0, 0, 0, 255]).buffer },
    transform,
    palette,
    settings,
  };
}

function result(taskId: number): GeneratorWorkerResponse {
  return {
    type: 'result',
    protocolVersion: GENERATOR_PROTOCOL_VERSION,
    taskId,
    grid: {
      width: 1,
      height: 1,
      paletteIndexes: Uint16Array.from([0]).buffer,
      external: Uint8Array.from([0]).buffer,
    },
    processedImage: {
      width: 1,
      height: 1,
      buffer: new Uint8ClampedArray([0, 0, 0, 255]).buffer,
    },
    processingMs: 4,
  };
}

describe('generator worker client', () => {
  it('accepts only the current task and cancels the previous worker', async () => {
    const workers: FakeWorker[] = [];
    const client = new GeneratorClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const first = client.generate(request());
    const second = client.generate(request());

    await expect(first).rejects.toMatchObject({ code: 'GENERATION_CANCELLED' });
    expect(workers[0].terminated).toBe(true);
    workers[0].emit(result(1));
    workers[1].emit(result(2));
    await expect(second).resolves.toMatchObject({ taskId: 2, processingMs: 4 });
  });

  it('forwards monotonic progress and ignores decreasing updates', async () => {
    const worker = new FakeWorker();
    const progress: number[] = [];
    const client = new GeneratorClient(() => worker);
    const pending = client.generate(request(), {
      onProgress: (completed) => progress.push(completed),
    });
    worker.emit({
      type: 'progress', protocolVersion: 1, taskId: 1, completed: 2, total: 3,
    });
    worker.emit({
      type: 'progress', protocolVersion: 1, taskId: 1, completed: 1, total: 3,
    });
    worker.emit(result(1));
    await pending;
    expect(progress).toEqual([2]);
  });

  it('terminates the worker on explicit cancellation', async () => {
    const worker = new FakeWorker();
    const client = new GeneratorClient(() => worker);
    const pending = client.generate(request());
    client.cancel();
    expect(worker.terminated).toBe(true);
    await expect(pending).rejects.toMatchObject({ code: 'GENERATION_CANCELLED' });
  });
});
