import type { RgbaImage } from '../../core/image/transform';
import type { PatternGrid } from '../../core/pattern/types';
import {
  GENERATOR_PROTOCOL_VERSION,
  type GeneratePatternRequest,
  type GeneratorWorkerResponse,
} from '../../workers/generator-protocol';

export interface WorkerLike {
  onmessage: ((event: MessageEvent<GeneratorWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: GeneratePatternRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export type GeneratorClientRequest = Omit<
  GeneratePatternRequest,
  'type' | 'protocolVersion' | 'taskId'
>;

export interface GeneratorClientResult {
  readonly taskId: number;
  readonly grid: PatternGrid;
  readonly processedImage: RgbaImage;
  readonly processingMs: number;
}

export interface GeneratorClientOptions {
  readonly onProgress?: (completed: number, total: number) => void;
}

export class GeneratorClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GeneratorClientError';
  }
}

type WorkerFactory = () => WorkerLike;

function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL('../../workers/generator.worker.ts', import.meta.url), {
    type: 'module',
  });
}

export class GeneratorClient {
  private nextTaskId = 1;
  private active:
    | {
        readonly taskId: number;
        readonly worker: WorkerLike;
        readonly reject: (error: Error) => void;
      }
    | undefined;

  constructor(private readonly createWorker: WorkerFactory = defaultWorkerFactory) {}

  generate(
    request: GeneratorClientRequest,
    options: GeneratorClientOptions = {},
  ): Promise<GeneratorClientResult> {
    this.cancel();
    const taskId = this.nextTaskId;
    this.nextTaskId += 1;
    const worker = this.createWorker();

    return new Promise((resolve, reject) => {
      this.active = { taskId, worker, reject };
      let lastProgress = 0;

      worker.onmessage = (event) => {
        const response = event.data;
        if (
          response.protocolVersion !== GENERATOR_PROTOCOL_VERSION ||
          response.taskId !== taskId ||
          this.active?.taskId !== taskId
        ) {
          return;
        }
        if (response.type === 'progress') {
          if (response.completed >= lastProgress) {
            lastProgress = response.completed;
            options.onProgress?.(response.completed, response.total);
          }
          return;
        }

        this.active = undefined;
        worker.terminate();
        if (response.type === 'error') {
          reject(new GeneratorClientError(response.code, response.message));
          return;
        }
        resolve({
          taskId,
          grid: {
            width: response.grid.width,
            height: response.grid.height,
            paletteIndexes: new Uint16Array(response.grid.paletteIndexes),
            external: new Uint8Array(response.grid.external),
          },
          processedImage: {
            width: response.processedImage.width,
            height: response.processedImage.height,
            data: new Uint8ClampedArray(response.processedImage.buffer),
          },
          processingMs: response.processingMs,
        });
      };

      worker.onerror = (event) => {
        if (this.active?.taskId !== taskId) return;
        this.active = undefined;
        worker.terminate();
        reject(new GeneratorClientError('WORKER_FAILED', event.message || '生成线程异常。'));
      };

      const message: GeneratePatternRequest = {
        ...request,
        type: 'generate',
        protocolVersion: GENERATOR_PROTOCOL_VERSION,
        taskId,
      };
      worker.postMessage(message, [request.image.buffer]);
    });
  }

  cancel(): void {
    if (!this.active) return;
    const { worker, reject } = this.active;
    this.active = undefined;
    worker.terminate();
    reject(new GeneratorClientError('GENERATION_CANCELLED', '生成任务已取消。'));
  }

  dispose(): void {
    this.cancel();
  }
}
