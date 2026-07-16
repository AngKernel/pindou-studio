import { calculatePatternStatistics, StatisticsError } from '../core/statistics';
import { buildInventoryCsv } from '../features/export/csv';
import { safeExportBaseName } from '../features/export/filename';
import { buildPatternPdf } from '../features/export/pdf';
import { calculatePngLayout, drawProjectPng } from '../features/export/png';
import { PatternExportError } from '../features/export/types';
import { EXPORT_PROTOCOL_VERSION, type ExportWorkerRequest, type ExportWorkerResponse } from './export-protocol';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<ExportWorkerRequest>) => void): void;
  postMessage(message: ExportWorkerResponse, transfer?: Transferable[]): void;
}

const workerScope = globalThis as unknown as WorkerScope;
const encoder = new TextEncoder();

function progress(taskId: number, completed: number, stage: string): void {
  workerScope.postMessage({ type: 'progress', protocolVersion: EXPORT_PROTOCOL_VERSION, taskId, completed, total: 100, stage });
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

workerScope.addEventListener('message', (event) => {
  const request = event.data;
  if (request.protocolVersion !== EXPORT_PROTOCOL_VERSION || request.type !== 'export') return;
  void (async () => {
    try {
      const baseName = safeExportBaseName(request.project.name);
      progress(request.taskId, 5, '读取当前项目');
      let data: ArrayBuffer;
      let mimeType: string;
      let fileName: string;
      if (request.format === 'csv') {
        const statistics = calculatePatternStatistics(request.project, 'code');
        progress(request.taskId, 55, '生成采购统计');
        data = exactBuffer(encoder.encode(buildInventoryCsv(statistics)));
        mimeType = 'text/csv;charset=utf-8';
        fileName = `${baseName}-inventory.csv`;
      } else if (request.format === 'pdf') {
        progress(request.taskId, 30, '规划 A4 豆板页面');
        data = exactBuffer(buildPatternPdf(request.project, request.pdfOptions?.printMode ?? 'color'));
        mimeType = 'application/pdf';
        fileName = `${baseName}-boards.pdf`;
      } else {
        const options = request.pngOptions;
        if (!options) throw new PatternExportError('INVALID_PNG_OPTIONS', '缺少 PNG 导出选项。');
        if (typeof OffscreenCanvas === 'undefined') {
          throw new PatternExportError('PNG_UNSUPPORTED', '当前浏览器不支持后台 PNG 导出，请更新浏览器后重试。');
        }
        const layout = calculatePngLayout(request.project, options);
        progress(request.taskId, 25, '绘制高清 PNG');
        const canvas = new OffscreenCanvas(layout.width, layout.height);
        const context = canvas.getContext('2d');
        if (!context) throw new PatternExportError('PNG_UNSUPPORTED', '无法创建 PNG 绘图环境。');
        drawProjectPng(context, request.project, options);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        data = await blob.arrayBuffer();
        mimeType = 'image/png';
        fileName = `${baseName}-${options.style}.png`;
      }
      progress(request.taskId, 100, '导出完成');
      workerScope.postMessage({
        type: 'result', protocolVersion: EXPORT_PROTOCOL_VERSION, taskId: request.taskId, data, mimeType, fileName,
      }, [data]);
    } catch (error) {
      const known = error instanceof PatternExportError || error instanceof StatisticsError;
      workerScope.postMessage({
        type: 'error',
        protocolVersion: EXPORT_PROTOCOL_VERSION,
        taskId: request.taskId,
        code: known ? error.code : 'EXPORT_FAILED',
        message: known ? error.userMessage : '导出失败，请检查项目数据和导出选项。',
      });
    }
  })();
});
