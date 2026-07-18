'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  createDefaultImageTransform,
  type CropRect,
  type ImageTransformSettings,
  type RightAngleRotation,
} from '../core/image/transform';

interface ImageTransformControlsProps {
  readonly imageSrc: string;
  readonly sourceDimensions: { readonly width: number; readonly height: number };
  readonly settings: ImageTransformSettings;
  readonly onChange: (settings: ImageTransformSettings) => void;
}

type DragMode = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

interface DragState {
  readonly mode: DragMode;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startCrop: CropRect;
}

const cropHandles: ReadonlyArray<{
  mode: Exclude<DragMode, 'move'>;
  label: string;
  className: string;
}> = [
  { mode: 'nw', label: '调整左上角', className: 'left-0 top-0 cursor-nwse-resize' },
  { mode: 'n', label: '调整上边界', className: 'left-1/2 top-0 -translate-x-1/2 cursor-ns-resize' },
  { mode: 'ne', label: '调整右上角', className: 'right-0 top-0 cursor-nesw-resize' },
  { mode: 'e', label: '调整右边界', className: 'right-0 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { mode: 'se', label: '调整右下角', className: 'bottom-0 right-0 cursor-nwse-resize' },
  { mode: 's', label: '调整下边界', className: 'bottom-0 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { mode: 'sw', label: '调整左下角', className: 'bottom-0 left-0 cursor-nesw-resize' },
  { mode: 'w', label: '调整左边界', className: 'left-0 top-1/2 -translate-y-1/2 cursor-ew-resize' },
];

const rotations: RightAngleRotation[] = [0, 90, 180, 270];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundCrop(crop: CropRect): CropRect {
  return {
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    width: Math.round(crop.width),
    height: Math.round(crop.height),
  };
}

export default function ImageTransformControls({
  imageSrc,
  sourceDimensions,
  settings,
  onChange,
}: ImageTransformControlsProps) {
  const [draft, setDraft] = useState(settings);
  const draftRef = useRef(settings);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    setDraft(settings);
    draftRef.current = settings;
  }, [settings]);

  const updateDraft = (next: ImageTransformSettings) => {
    draftRef.current = next;
    setDraft(next);
  };

  const commit = (next = draftRef.current) => {
    const normalized = { ...next, crop: roundCrop(next.crop) };
    updateDraft(normalized);
    onChange(normalized);
  };

  const startDrag = (event: PointerEvent<HTMLElement>, mode: DragMode) => {
    if (!stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic touch events and older embedded browsers may not expose pointer capture.
      // Stage-level listeners still keep the drag interaction functional.
    }
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCrop: draftRef.current.crop,
    };
  };

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const bounds = stage.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;

    const dx = (event.clientX - drag.startClientX) * sourceDimensions.width / bounds.width;
    const dy = (event.clientY - drag.startClientY) * sourceDimensions.height / bounds.height;
    const start = drag.startCrop;
    const minimumWidth = Math.max(1, sourceDimensions.width * 24 / bounds.width);
    const minimumHeight = Math.max(1, sourceDimensions.height * 24 / bounds.height);

    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;

    if (drag.mode === 'move') {
      left = clamp(start.x + dx, 0, sourceDimensions.width - start.width);
      top = clamp(start.y + dy, 0, sourceDimensions.height - start.height);
      right = left + start.width;
      bottom = top + start.height;
    } else {
      if (drag.mode.includes('w')) left = clamp(start.x + dx, 0, right - minimumWidth);
      if (drag.mode.includes('e')) right = clamp(start.x + start.width + dx, left + minimumWidth, sourceDimensions.width);
      if (drag.mode.includes('n')) top = clamp(start.y + dy, 0, bottom - minimumHeight);
      if (drag.mode.includes('s')) bottom = clamp(start.y + start.height + dy, top + minimumHeight, sourceDimensions.height);
    }

    updateDraft({
      ...draftRef.current,
      crop: { x: left, y: top, width: right - left, height: bottom - top },
    });
  };

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    commit();
  };

  const nudgeCrop = (event: KeyboardEvent<HTMLElement>, mode: DragMode) => {
    const direction = event.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(direction)) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const crop = draftRef.current.crop;
    let next = crop;

    if (mode === 'move') {
      const dx = direction === 'ArrowLeft' ? -step : direction === 'ArrowRight' ? step : 0;
      const dy = direction === 'ArrowUp' ? -step : direction === 'ArrowDown' ? step : 0;
      next = {
        ...crop,
        x: clamp(crop.x + dx, 0, sourceDimensions.width - crop.width),
        y: clamp(crop.y + dy, 0, sourceDimensions.height - crop.height),
      };
    } else {
      let left = crop.x;
      let top = crop.y;
      let right = crop.x + crop.width;
      let bottom = crop.y + crop.height;
      if (mode.includes('w') && direction === 'ArrowLeft') left = Math.max(0, left - step);
      if (mode.includes('w') && direction === 'ArrowRight') left = Math.min(right - 1, left + step);
      if (mode.includes('e') && direction === 'ArrowLeft') right = Math.max(left + 1, right - step);
      if (mode.includes('e') && direction === 'ArrowRight') right = Math.min(sourceDimensions.width, right + step);
      if (mode.includes('n') && direction === 'ArrowUp') top = Math.max(0, top - step);
      if (mode.includes('n') && direction === 'ArrowDown') top = Math.min(bottom - 1, top + step);
      if (mode.includes('s') && direction === 'ArrowUp') bottom = Math.max(top + 1, bottom - step);
      if (mode.includes('s') && direction === 'ArrowDown') bottom = Math.min(sourceDimensions.height, bottom + step);
      next = { x: left, y: top, width: right - left, height: bottom - top };
    }

    commit({ ...draftRef.current, crop: next });
  };

  const setAspectRatio = (ratio: number | null) => {
    if (ratio === null) return;
    const current = draftRef.current.crop;
    let width = current.width;
    let height = width / ratio;
    if (height > current.height) {
      height = current.height;
      width = height * ratio;
    }
    const crop = {
      x: clamp(current.x + (current.width - width) / 2, 0, sourceDimensions.width - width),
      y: clamp(current.y + (current.height - height) / 2, 0, sourceDimensions.height - height),
      width,
      height,
    };
    commit({ ...draftRef.current, crop });
  };

  const reset = () => commit(createDefaultImageTransform(sourceDimensions.width, sourceDimensions.height));
  const crop = draft.crop;
  const left = crop.x / sourceDimensions.width * 100;
  const top = crop.y / sourceDimensions.height * 100;
  const width = crop.width / sourceDimensions.width * 100;
  const height = crop.height / sourceDimensions.height * 100;
  const rotatedWidth = draft.rotation === 90 || draft.rotation === 270 ? crop.height : crop.width;
  const rotatedHeight = draft.rotation === 90 || draft.rotation === 270 ? crop.width : crop.height;

  return (
    <section
      data-testid="visual-cropper"
      className="sm:col-span-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-200/70 dark:border-slate-700 dark:shadow-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#ff5c35] text-xs font-bold">1</span>
            <h2 className="font-semibold">先选好画面</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">拖动画框或八个控制点，松手后自动更新拼豆预览</p>
        </div>
        <button
          data-testid="crop-reset"
          type="button"
          onClick={reset}
          className="min-h-10 rounded-full border border-white/15 bg-white/5 px-4 text-sm text-slate-200 transition hover:bg-white/10"
        >
          重置画面
        </button>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="flex min-h-[280px] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,_#293449_0,_#111827_60%,_#080d16_100%)] p-5 sm:min-h-[420px] sm:p-8">
          <div
            ref={stageRef}
            data-testid="crop-stage"
            className="relative w-full max-w-3xl select-none touch-none overflow-hidden rounded-lg shadow-2xl"
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt="待裁剪原图"
              draggable={false}
              className="block h-auto w-full object-contain"
            />
            <div
              data-testid="crop-box"
              role="group"
              aria-label="图片裁剪区域，可拖动位置"
              tabIndex={0}
              onKeyDown={(event) => nudgeCrop(event, 'move')}
              onPointerDown={(event) => startDrag(event, 'move')}
              className="absolute cursor-move touch-none border-2 border-white outline-none ring-[#ff5c35] focus:ring-2"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
                boxShadow: '0 0 0 9999px rgb(2 6 23 / 0.72)',
              }}
            >
              <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/40" />
              <div className="pointer-events-none absolute inset-y-0 right-1/3 border-l border-white/40" />
              <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/40" />
              <div className="pointer-events-none absolute inset-x-0 bottom-1/3 border-t border-white/40" />
              <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[11px] font-medium">
                {Math.round(crop.width)} × {Math.round(crop.height)} px
              </div>
              {cropHandles.map((handle) => (
                <button
                  key={handle.mode}
                  type="button"
                  aria-label={handle.label}
                  onKeyDown={(event) => nudgeCrop(event, handle.mode)}
                  onPointerDown={(event) => startDrag(event, handle.mode)}
                  className={`absolute z-10 h-7 w-7 touch-none rounded-full border-[7px] border-transparent bg-white bg-clip-content shadow-md outline-none focus:ring-2 focus:ring-[#ff5c35] ${handle.className}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5 border-t border-white/10 bg-slate-900 p-4 lg:border-l lg:border-t-0">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">裁剪比例</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['自由', null],
                ['1 : 1', 1],
                ['3 : 4', 3 / 4],
                ['4 : 3', 4 / 3],
                ['9 : 16', 9 / 16],
                ['原图', sourceDimensions.width / sourceDimensions.height],
              ].map(([label, ratio]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => setAspectRatio(ratio as number | null)}
                  className="min-h-10 rounded-lg border border-white/10 bg-white/5 text-xs text-slate-200 transition hover:border-[#ff5c35] hover:bg-[#ff5c35]/10"
                >
                  {label as string}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">方向</p>
            <div className="grid grid-cols-4 gap-2">
              {rotations.map((rotation) => (
                <button
                  key={rotation}
                  type="button"
                  aria-label={`顺时针旋转至 ${rotation} 度`}
                  onClick={() => commit({ ...draftRef.current, rotation })}
                  className={`min-h-10 rounded-lg border text-xs transition ${
                    draft.rotation === rotation
                      ? 'border-[#ff5c35] bg-[#ff5c35] text-white'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {rotation}°
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={draft.flipHorizontal}
                onClick={() => commit({ ...draftRef.current, flipHorizontal: !draftRef.current.flipHorizontal })}
                className={`min-h-10 rounded-lg border text-xs ${draft.flipHorizontal ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-white/10 bg-white/5 text-slate-300'}`}
              >
                ↔ 水平翻转
              </button>
              <button
                type="button"
                aria-pressed={draft.flipVertical}
                onClick={() => commit({ ...draftRef.current, flipVertical: !draftRef.current.flipVertical })}
                className={`min-h-10 rounded-lg border text-xs ${draft.flipVertical ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-white/10 bg-white/5 text-slate-300'}`}
              >
                ↕ 垂直翻转
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">构图微调</p>
            <label className="block text-xs text-slate-300">
              缩放 <span className="float-right font-mono text-white">{draft.scale.toFixed(2)}×</span>
              <input
                aria-label="图片缩放"
                className="mt-2 w-full accent-[#ff5c35]"
                type="range"
                min="0.25"
                max="3"
                step="0.05"
                value={draft.scale}
                onChange={(event) => updateDraft({ ...draftRef.current, scale: Number(event.target.value) })}
                onPointerUp={() => commit()}
                onKeyUp={() => commit()}
              />
            </label>
            <label className="block text-xs text-slate-300">
              左右位置 <span className="float-right font-mono text-white">{draft.offsetX}</span>
              <input
                aria-label="图片左右位置"
                className="mt-2 w-full accent-[#ff5c35]"
                type="range"
                min={-Math.max(1, Math.round(rotatedWidth))}
                max={Math.max(1, Math.round(rotatedWidth))}
                value={draft.offsetX}
                onChange={(event) => updateDraft({ ...draftRef.current, offsetX: Number(event.target.value) })}
                onPointerUp={() => commit()}
                onKeyUp={() => commit()}
              />
            </label>
            <label className="block text-xs text-slate-300">
              上下位置 <span className="float-right font-mono text-white">{draft.offsetY}</span>
              <input
                aria-label="图片上下位置"
                className="mt-2 w-full accent-[#ff5c35]"
                type="range"
                min={-Math.max(1, Math.round(rotatedHeight))}
                max={Math.max(1, Math.round(rotatedHeight))}
                value={draft.offsetY}
                onChange={(event) => updateDraft({ ...draftRef.current, offsetY: Number(event.target.value) })}
                onPointerUp={() => commit()}
                onKeyUp={() => commit()}
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">透明区域</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => commit({ ...draftRef.current, background: { mode: 'preserve-alpha' } })}
                className={`min-h-10 rounded-lg border text-xs ${draft.background.mode === 'preserve-alpha' ? 'border-[#ff5c35] bg-[#ff5c35]/15 text-orange-100' : 'border-white/10 bg-white/5 text-slate-300'}`}
              >
                保留透明
              </button>
              <button
                type="button"
                onClick={() => commit({ ...draftRef.current, background: { mode: 'solid', color: { r: 255, g: 255, b: 255 } } })}
                className={`min-h-10 rounded-lg border text-xs ${draft.background.mode === 'solid' ? 'border-[#ff5c35] bg-[#ff5c35]/15 text-orange-100' : 'border-white/10 bg-white/5 text-slate-300'}`}
              >
                填充白色
              </button>
            </div>
          </div>

          <p className="rounded-lg bg-white/5 px-3 py-2 text-xs leading-5 text-slate-400">
            输出画面 {Math.round(rotatedWidth)} × {Math.round(rotatedHeight)} px
          </p>
        </div>
      </div>
    </section>
  );
}
