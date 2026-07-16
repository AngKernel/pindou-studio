export type ExportFormat = 'png' | 'csv' | 'pdf';
export type PngStyle = 'pattern' | 'grid' | 'codes';
export type PngBackground = 'transparent' | 'white';
export type PdfPrintMode = 'color' | 'monochrome';

export interface PngExportOptions {
  readonly style: PngStyle;
  readonly scale: number;
  readonly background: PngBackground;
}

export interface PdfExportOptions {
  readonly printMode: PdfPrintMode;
}

export interface ExportArtifact {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
  readonly fileName: string;
}

export class PatternExportError extends Error {
  constructor(readonly code: string, readonly userMessage: string) {
    super(userMessage);
    this.name = 'PatternExportError';
  }
}
