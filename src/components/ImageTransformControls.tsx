'use client';

import type { ImageTransformSettings, RightAngleRotation } from '../core/image/transform';

interface ImageTransformControlsProps {
  readonly sourceDimensions: { readonly width: number; readonly height: number };
  readonly settings: ImageTransformSettings;
  readonly onChange: (settings: ImageTransformSettings) => void;
}

const inputClassName =
  'h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100';

export default function ImageTransformControls({
  sourceDimensions,
  settings,
  onChange,
}: ImageTransformControlsProps) {
  const updateCrop = (field: keyof ImageTransformSettings['crop'], value: number) => {
    const next = { ...settings.crop };
    if (field === 'x') next.x = Math.max(0, Math.min(sourceDimensions.width - 1, value || 0));
    if (field === 'y') next.y = Math.max(0, Math.min(sourceDimensions.height - 1, value || 0));
    if (field === 'width') next.width = Math.max(1, Math.min(sourceDimensions.width - next.x, value || 1));
    if (field === 'height') next.height = Math.max(1, Math.min(sourceDimensions.height - next.y, value || 1));
    next.width = Math.min(next.width, sourceDimensions.width - next.x);
    next.height = Math.min(next.height, sourceDimensions.height - next.y);
    onChange({ ...settings, crop: next });
  };
  const rotatedWidth =
    settings.rotation === 90 || settings.rotation === 270
      ? settings.crop.height
      : settings.crop.width;
  const rotatedHeight =
    settings.rotation === 90 || settings.rotation === 270
      ? settings.crop.width
      : settings.crop.height;

  return (
    <details className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
      <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200">
        图片裁剪与位置
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          原图 {sourceDimensions.width}×{sourceDimensions.height}；处理区域 {rotatedWidth}×{rotatedHeight}
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['x', 'y', 'width', 'height'] as const).map((field) => (
            <label key={field} className="text-xs text-gray-600 dark:text-gray-300">
              {field === 'x' ? '裁剪 X' : field === 'y' ? '裁剪 Y' : field === 'width' ? '裁剪宽度' : '裁剪高度'}
              <input
                className={`${inputClassName} mt-1`}
                type="number"
                min={field === 'width' || field === 'height' ? 1 : 0}
                max={
                  field === 'x' || field === 'width'
                    ? sourceDimensions.width
                    : sourceDimensions.height
                }
                value={settings.crop[field]}
                onChange={(event) => updateCrop(field, Number(event.target.value))}
              />
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {([0, 90, 180, 270] as RightAngleRotation[]).map((rotation) => (
            <button
              key={rotation}
              type="button"
              onClick={() => onChange({ ...settings, rotation })}
              className={`h-9 rounded-md border px-3 text-sm ${
                settings.rotation === rotation
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                  : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              {rotation}°
            </button>
          ))}
          <button
            type="button"
            aria-pressed={settings.flipHorizontal}
            onClick={() => onChange({ ...settings, flipHorizontal: !settings.flipHorizontal })}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            水平翻转{settings.flipHorizontal ? ' ✓' : ''}
          </button>
          <button
            type="button"
            aria-pressed={settings.flipVertical}
            onClick={() => onChange({ ...settings, flipVertical: !settings.flipVertical })}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            垂直翻转{settings.flipVertical ? ' ✓' : ''}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-gray-600 dark:text-gray-300">
            缩放 {settings.scale.toFixed(2)}×
            <input
              className="mt-2 w-full"
              type="range"
              min="0.25"
              max="3"
              step="0.05"
              value={settings.scale}
              onChange={(event) => onChange({ ...settings, scale: Number(event.target.value) })}
            />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">
            水平位置
            <input
              className={`${inputClassName} mt-1`}
              type="number"
              value={settings.offsetX}
              onChange={(event) => onChange({ ...settings, offsetX: Number(event.target.value) })}
            />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">
            垂直位置
            <input
              className={`${inputClassName} mt-1`}
              type="number"
              value={settings.offsetY}
              onChange={(event) => onChange({ ...settings, offsetY: Number(event.target.value) })}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={settings.background.mode === 'preserve-alpha'}
              onChange={() => onChange({ ...settings, background: { mode: 'preserve-alpha' } })}
            />
            保留透明背景
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={settings.background.mode === 'solid'}
              onChange={() =>
                onChange({
                  ...settings,
                  background: { mode: 'solid', color: { r: 255, g: 255, b: 255 } },
                })
              }
            />
            纯色背景
          </label>
          {settings.background.mode === 'solid' && (
            <input
              aria-label="背景颜色"
              type="color"
              value={`#${[settings.background.color.r, settings.background.color.g, settings.background.color.b]
                .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
                .join('')}`}
              onChange={(event) => {
                const value = event.target.value;
                onChange({
                  ...settings,
                  background: {
                    mode: 'solid',
                    color: {
                      r: parseInt(value.slice(1, 3), 16),
                      g: parseInt(value.slice(3, 5), 16),
                      b: parseInt(value.slice(5, 7), 16),
                    },
                  },
                });
              }}
            />
          )}
        </div>
      </div>
    </details>
  );
}
