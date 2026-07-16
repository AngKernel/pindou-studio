'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { partitionPattern } from '../core/board';
import type { PatternProject } from '../core/project';
import { calculatePatternStatistics, type StatisticsSort } from '../core/statistics';
import { ExportClient, ExportClientError } from '../features/export/export-client';
import type { ExportFormat, PdfPrintMode, PngBackground, PngStyle } from '../features/export/types';

interface ExportPanelProps {
  readonly project: PatternProject | null;
}

type StatisticsScope = 'project' | 'board';

function downloadArtifact(data: ArrayBuffer, mimeType: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function ExportPanel({ project }: ExportPanelProps) {
  const [scope, setScope] = useState<StatisticsScope>('project');
  const [sort, setSort] = useState<StatisticsSort>('code');
  const [pngStyle, setPngStyle] = useState<PngStyle>('pattern');
  const [pngScale, setPngScale] = useState(2);
  const [pngBackground, setPngBackground] = useState<PngBackground>('white');
  const [pdfPrintMode, setPdfPrintMode] = useState<PdfPrintMode>('color');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 100, stage: '等待导出' });
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<ExportClient | null>(null);
  if (!clientRef.current) clientRef.current = new ExportClient();

  useEffect(() => () => clientRef.current?.dispose(), []);

  const activeRegion = useMemo(() => {
    if (!project || scope === 'project') return undefined;
    const layout = partitionPattern(project.width, project.height, project.board);
    return layout.regions[Math.min(project.makerState.activeBoardIndex, layout.total - 1)];
  }, [project, scope]);
  const statistics = useMemo(() => project
    ? calculatePatternStatistics(project, sort, activeRegion)
    : null, [activeRegion, project, sort]);

  const startExport = async (format: ExportFormat) => {
    if (!project || !clientRef.current || running) return;
    setRunning(true);
    setError(null);
    setProgress({ completed: 0, total: 100, stage: '准备导出' });
    try {
      const artifact = await clientRef.current.export({
        project,
        format,
        pngOptions: format === 'png' ? { style: pngStyle, scale: pngScale, background: pngBackground } : undefined,
        pdfOptions: format === 'pdf' ? { printMode: pdfPrintMode } : undefined,
      }, {
        onProgress: (completed, total, stage) => setProgress({ completed, total, stage }),
      });
      downloadArtifact(artifact.data, artifact.mimeType, artifact.fileName);
      setProgress({ completed: 100, total: 100, stage: '导出完成' });
    } catch (exportError) {
      const message = exportError instanceof ExportClientError ? exportError.userMessage : '导出失败，请重试。';
      setError(message);
      setProgress({ completed: 0, total: 100, stage: message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <section data-testid="export-panel" className="w-full rounded-xl border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-900 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">统计与导出</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">统计始终从当前项目格子现算，不使用预览缓存</p>
        </div>
        {!project && <span className="text-xs text-amber-700 dark:text-amber-300">等待项目保存后可导出</span>}
      </div>

      {statistics && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <button data-testid="stats-project" onClick={() => setScope('project')} className={`min-h-11 rounded px-3 ${scope === 'project' ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-900'}`}>全项目</button>
            <button data-testid="stats-board" onClick={() => setScope('board')} className={`min-h-11 rounded px-3 ${scope === 'board' ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-900'}`}>当前豆板</button>
            <select data-testid="stats-sort" aria-label="统计排序" value={sort} onChange={(event) => setSort(event.target.value as StatisticsSort)} className="min-h-11 rounded border bg-white px-2 dark:bg-gray-900">
              <option value="code">按色号排序</option>
              <option value="count">按数量排序</option>
            </select>
            <span data-testid="stats-summary" className="ml-auto font-medium">{statistics.totalBeads} 颗 · {statistics.usedColors} 色</span>
          </div>
          <div className="mt-3 max-h-56 overflow-auto rounded-lg border dark:border-gray-700">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="sticky top-0 bg-gray-100 dark:bg-gray-900"><tr><th className="p-2">品牌/色号</th><th className="p-2">名称</th><th className="p-2">RGB</th><th className="p-2 text-right">数量</th><th className="p-2 text-right">占比</th></tr></thead>
              <tbody data-testid="stats-rows">{statistics.colors.map((color) => (
                <tr key={color.paletteIndex} className="border-t dark:border-gray-700">
                  <td className="p-2"><span className="mr-2 inline-block h-3 w-3 rounded-sm border align-middle" style={{ backgroundColor: `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})` }} />{color.brand} {color.code}</td>
                  <td className="p-2">{color.name}</td>
                  <td className="p-2">{color.rgb.r},{color.rgb.g},{color.rgb.b}</td>
                  <td className="p-2 text-right">{color.count}</td>
                  <td className="p-2 text-right">{color.percentage.toFixed(2)}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/60">
          <h3 className="text-sm font-medium">高清 PNG</h3>
          <select data-testid="png-style" aria-label="PNG 样式" value={pngStyle} onChange={(event) => {
            const style = event.target.value as PngStyle;
            setPngStyle(style);
            if (style === 'codes') setPngScale((value) => Math.max(2, value));
          }} className="mt-2 min-h-11 w-full rounded border bg-white px-2 dark:bg-gray-950">
            <option value="pattern">纯图案</option><option value="grid">带网格</option><option value="codes">带色号</option>
          </select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs">缩放<input data-testid="png-scale" aria-label="PNG 缩放倍数" type="number" min={pngStyle === 'codes' ? 2 : 1} max={8} value={pngScale} onChange={(event) => setPngScale(Math.max(pngStyle === 'codes' ? 2 : 1, Math.min(8, Number(event.target.value) || 1)))} className="mt-1 min-h-11 w-full rounded border px-2 dark:bg-gray-950" /></label>
            <label className="text-xs">背景<select data-testid="png-background" aria-label="PNG 背景" value={pngBackground} onChange={(event) => setPngBackground(event.target.value as PngBackground)} className="mt-1 min-h-11 w-full rounded border bg-white px-2 dark:bg-gray-950"><option value="white">白色</option><option value="transparent">透明</option></select></label>
          </div>
          <button data-testid="export-png" disabled={!project || running} onClick={() => { void startExport('png'); }} className="mt-3 min-h-11 w-full rounded bg-emerald-600 px-3 text-white disabled:opacity-50">导出 PNG</button>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/60">
          <h3 className="text-sm font-medium">采购 CSV</h3>
          <p className="mt-2 text-xs text-gray-500">UTF-8 BOM、中文 Excel 兼容，包含品牌、色号、RGB、数量和占比。</p>
          <button data-testid="export-csv" disabled={!project || running} onClick={() => { void startExport('csv'); }} className="mt-3 min-h-11 w-full rounded bg-sky-600 px-3 text-white disabled:opacity-50">导出 CSV</button>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/60">
          <h3 className="text-sm font-medium">A4 分板 PDF</h3>
          <select data-testid="pdf-mode" aria-label="PDF 打印模式" value={pdfPrintMode} onChange={(event) => setPdfPrintMode(event.target.value as PdfPrintMode)} className="mt-2 min-h-11 w-full rounded border bg-white px-2 dark:bg-gray-950"><option value="color">彩色打印</option><option value="monochrome">黑白预览接口</option></select>
          <button data-testid="export-pdf" disabled={!project || running} onClick={() => { void startExport('pdf'); }} className="mt-3 min-h-11 w-full rounded bg-violet-600 px-3 text-white disabled:opacity-50">导出 PDF</button>
        </div>
      </div>

      <div className="mt-3 flex min-h-11 items-center gap-3 rounded-lg bg-gray-50 px-3 dark:bg-gray-900/60">
        <progress data-testid="export-progress" className="h-2 flex-1" max={progress.total} value={progress.completed} />
        <span data-testid="export-status" role="status" className="text-xs">{progress.stage}</span>
        {running && <button data-testid="export-cancel" onClick={() => clientRef.current?.cancel()} className="min-h-11 rounded bg-red-600 px-3 text-sm text-white">取消导出</button>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
