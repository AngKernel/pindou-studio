import type { PatternProject } from '../core/project';
import type { ExportFormat, PdfExportOptions, PngExportOptions } from '../features/export/types';

export const EXPORT_PROTOCOL_VERSION = 1 as const;

export interface ExportWorkerRequest {
  readonly type: 'export';
  readonly protocolVersion: typeof EXPORT_PROTOCOL_VERSION;
  readonly taskId: number;
  readonly project: PatternProject;
  readonly format: ExportFormat;
  readonly pngOptions?: PngExportOptions;
  readonly pdfOptions?: PdfExportOptions;
}

export interface ExportProgressResponse {
  readonly type: 'progress';
  readonly protocolVersion: typeof EXPORT_PROTOCOL_VERSION;
  readonly taskId: number;
  readonly completed: number;
  readonly total: number;
  readonly stage: string;
}

export interface ExportResultResponse {
  readonly type: 'result';
  readonly protocolVersion: typeof EXPORT_PROTOCOL_VERSION;
  readonly taskId: number;
  readonly data: ArrayBuffer;
  readonly mimeType: string;
  readonly fileName: string;
}

export interface ExportErrorResponse {
  readonly type: 'error';
  readonly protocolVersion: typeof EXPORT_PROTOCOL_VERSION;
  readonly taskId: number;
  readonly code: string;
  readonly message: string;
}

export type ExportWorkerResponse = ExportProgressResponse | ExportResultResponse | ExportErrorResponse;
