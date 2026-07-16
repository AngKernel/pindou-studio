import { transformRgbaImage } from '../core/image/transform';
import { compilePalette } from '../core/palette';
import { generatePattern } from '../core/pattern/generate';
import {
  GENERATOR_PROTOCOL_VERSION,
  type GeneratorWorkerRequest,
  type GeneratorWorkerResponse,
} from './generator-protocol';

interface WorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<GeneratorWorkerRequest>) => void,
  ): void;
  postMessage(message: GeneratorWorkerResponse, transfer?: Transferable[]): void;
}

const workerScope = globalThis as unknown as WorkerScope;
const cancelledTasks = new Set<number>();

workerScope.addEventListener('message', (event) => {
  const request = event.data;
  if (request.protocolVersion !== GENERATOR_PROTOCOL_VERSION) return;
  if (request.type === 'cancel') {
    cancelledTasks.add(request.taskId);
    return;
  }

  const startedAt = performance.now();
  try {
    const sourceImage = {
      width: request.image.width,
      height: request.image.height,
      data: new Uint8ClampedArray(request.image.buffer),
    };
    const processedImage = transformRgbaImage(sourceImage, request.transform);
    const palette = compilePalette(request.palette);
    const grid = generatePattern(processedImage, palette.colors, request.settings, {
      isCancelled: () => cancelledTasks.has(request.taskId),
      onProgress: ({ completed, total }) => {
        workerScope.postMessage({
          type: 'progress',
          protocolVersion: GENERATOR_PROTOCOL_VERSION,
          taskId: request.taskId,
          completed,
          total,
        });
      },
    });

    const paletteIndexes = grid.paletteIndexes.buffer as ArrayBuffer;
    const external = grid.external.buffer as ArrayBuffer;
    const processedBuffer = processedImage.data.buffer as ArrayBuffer;
    workerScope.postMessage(
      {
        type: 'result',
        protocolVersion: GENERATOR_PROTOCOL_VERSION,
        taskId: request.taskId,
        grid: {
          width: grid.width,
          height: grid.height,
          paletteIndexes,
          external,
        },
        processedImage: {
          width: processedImage.width,
          height: processedImage.height,
          buffer: processedBuffer,
        },
        processingMs: performance.now() - startedAt,
      },
      [paletteIndexes, external, processedBuffer],
    );
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'GENERATION_FAILED';
    workerScope.postMessage({
      type: 'error',
      protocolVersion: GENERATOR_PROTOCOL_VERSION,
      taskId: request.taskId,
      code,
      message: error instanceof Error ? error.message : 'Unknown generation error.',
    });
  } finally {
    cancelledTasks.delete(request.taskId);
  }
});
