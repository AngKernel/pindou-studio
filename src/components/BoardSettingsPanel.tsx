'use client';

import { BOARD_PRESETS, calculateFinishedSize, partitionPattern, type BoardSettings } from '../core/board';

interface BoardSettingsPanelProps {
  readonly settings: BoardSettings;
  readonly patternWidth: number;
  readonly patternHeight: number;
  readonly canEnterMaker: boolean;
  readonly onChange: (settings: BoardSettings) => void;
  readonly onEnterMaker: () => void;
}

function formatCentimetres(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

export default function BoardSettingsPanel({
  settings,
  patternWidth,
  patternHeight,
  canEnterMaker,
  onChange,
  onEnterMaker,
}: BoardSettingsPanelProps) {
  const layout = partitionPattern(patternWidth, patternHeight, settings);
  const finished = calculateFinishedSize(patternWidth, patternHeight, settings.beadDiameterMm);
  const selectedPreset = BOARD_PRESETS.find((preset) => preset.width === settings.width && preset.height === settings.height) ?? null;

  return (
    <section data-testid="board-settings" className="w-full md:max-w-2xl rounded-xl border border-violet-200 bg-white p-4 shadow-sm dark:border-violet-900 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">豆板与成品尺寸</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">蓝紫色粗线表示实体豆板边界</p>
        </div>
        <span data-testid="board-count" className="rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200">
          {layout.columns}×{layout.rows}，共 {layout.total} 块
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          豆板预设
          <select
            aria-label="豆板预设"
            value={selectedPreset?.id ?? 'custom'}
            onChange={(event) => {
              const preset = BOARD_PRESETS.find((item) => item.id === event.target.value);
              if (preset) onChange({ width: preset.width, height: preset.height, beadDiameterMm: settings.beadDiameterMm });
            }}
            className="mt-1 min-h-11 w-full rounded border bg-white px-2 dark:bg-gray-900"
          >
            {BOARD_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            <option value="custom">自定义</option>
          </select>
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          豆板宽×高
          <span className="mt-1 flex gap-2">
            <input data-testid="board-width" aria-label="豆板宽度" type="number" min={1} max={300} value={settings.width} onChange={(event) => onChange({ ...settings, width: Math.max(1, Math.min(300, Number(event.target.value) || 1)) })} className="min-h-11 min-w-0 flex-1 rounded border px-2 dark:bg-gray-900" />
            <input data-testid="board-height" aria-label="豆板高度" type="number" min={1} max={300} value={settings.height} onChange={(event) => onChange({ ...settings, height: Math.max(1, Math.min(300, Number(event.target.value) || 1)) })} className="min-h-11 min-w-0 flex-1 rounded border px-2 dark:bg-gray-900" />
          </span>
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          豆子直径
          <input aria-label="豆子直径" list="bead-diameter-presets" type="number" min={0.5} max={20} step={0.1} value={settings.beadDiameterMm} onChange={(event) => onChange({ ...settings, beadDiameterMm: Math.max(0.5, Math.min(20, Number(event.target.value) || 0.5)) })} className="mt-1 min-h-11 w-full rounded border bg-white px-2 dark:bg-gray-900" />
          <datalist id="bead-diameter-presets"><option value="2.6" /><option value="5" /><option value="10" /></datalist>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/60">
        <p data-testid="finished-size" className="text-sm text-gray-700 dark:text-gray-300">
          成品约 <strong>{formatCentimetres(finished.widthCm)}×{formatCentimetres(finished.heightCm)} cm</strong>
          <span className="ml-2 text-xs text-gray-500">（{finished.widthMm}×{finished.heightMm} mm）</span>
        </p>
        <button data-testid="enter-maker" disabled={!canEnterMaker} onClick={onEnterMaker} className="min-h-11 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
          {canEnterMaker ? '进入制作模式' : '等待项目保存后进入'}
        </button>
      </div>
    </section>
  );
}
