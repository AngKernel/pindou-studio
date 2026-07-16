import type { ImageTransformSettings } from '../core/image/transform';
import type { PaletteDefinition } from '../core/palette';
import type { PatternGenerationSettings } from '../core/pattern/generate';

export const GENERATOR_PROTOCOL_VERSION = 1 as const;

export interface SerializableRgbaImage {
  readonly width: number;
  readonly height: number;
  readonly buffer: ArrayBuffer;
}

export interface GeneratePatternRequest {
  readonly type: 'generate';
  readonly protocolVersion: typeof GENERATOR_PROTOCOL_VERSION;
  readonly taskId: number;
  readonly image: SerializableRgbaImage;
  readonly transform: ImageTransformSettings;
  readonly palette: PaletteDefinition;
  readonly settings: PatternGenerationSettings;
}

export interface CancelPatternRequest {
  readonly type: 'cancel';
  readonly protocolVersion: typeof GENERATOR_PROTOCOL_VERSION;
  readonly taskId: number;
}

export type GeneratorWorkerRequest = GeneratePatternRequest | CancelPatternRequest;

export interface GenerationProgressResponse {
  readonly type: 'progress';
  readonly protocolVersion: typeof GENERATOR_PROTOCOL_VERSION;
  readonly taskId: number;
  readonly completed: number;
  readonly total: number;
}

export interface GenerationResultResponse {
  readonly type: 'result';
  readonly protocolVersion: typeof GENERATOR_PROTOCOL_VERSION;
  readonly taskId: number;
  readonly grid: {
    readonly width: number;
    readonly height: number;
    readonly paletteIndexes: ArrayBuffer;
    readonly external: ArrayBuffer;
  };
  readonly processedImage: SerializableRgbaImage;
  readonly processingMs: number;
}

export interface GenerationErrorResponse {
  readonly type: 'error';
  readonly protocolVersion: typeof GENERATOR_PROTOCOL_VERSION;
  readonly taskId: number;
  readonly code: string;
  readonly message: string;
}

export type GeneratorWorkerResponse =
  | GenerationProgressResponse
  | GenerationResultResponse
  | GenerationErrorResponse;
