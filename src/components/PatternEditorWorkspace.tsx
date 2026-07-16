'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  copyRegion,
  EditorPatchHistory,
  eraseCells,
  fillConnected,
  flipRegion,
  moveRegion,
  paintCells,
  pasteRegion,
  pinchViewport,
  readEditorCell,
  replaceAll,
  screenToGrid,
  wholeGridSelection,
  zoomViewportAt,
  type EditorClipboard,
  type EditorViewport,
  type GridPoint,
  type PatchCommandResult,
  type SelectionRect,
} from '../core/editor';
import type { PatternGrid } from '../core/pattern/types';
import type { MappedPixel, PaletteColor } from '../utils/pixelation';

type EditorTool = 'pencil' | 'eraser' | 'eyedropper' | 'fill' | 'select' | 'move' | 'pan';
type CellStyle = 'solid' | 'bead';

interface WorkspaceColor { readonly key: string; readonly hex: string }

interface PatternEditorWorkspaceProps {
  readonly initialData: MappedPixel[][];
  readonly gridDimensions: { readonly N: number; readonly M: number };
  readonly palette: readonly PaletteColor[];
  readonly originalImageSrc: string | null;
  readonly onChange: (data: MappedPixel[][]) => void;
  readonly onExit: () => void;
}

const toolLabels: Readonly<Record<EditorTool, string>> = {
  pencil: '画笔',
  eraser: '橡皮擦',
  eyedropper: '吸管',
  fill: '油漆桶',
  select: '矩形选择',
  move: '区域移动',
  pan: '平移',
};

function createWorkspaceState(
  data: MappedPixel[][],
  dimensions: { readonly N: number; readonly M: number },
  palette: readonly PaletteColor[],
): { grid: PatternGrid; colors: WorkspaceColor[] } {
  const colorsByHex = new Map<string, WorkspaceColor>();
  for (const color of palette) colorsByHex.set(color.hex.toUpperCase(), { key: color.key, hex: color.hex.toUpperCase() });
  for (const row of data) {
    for (const cell of row) {
      if (!cell?.isExternal) colorsByHex.set(cell.color.toUpperCase(), { key: cell.key, hex: cell.color.toUpperCase() });
    }
  }
  if (colorsByHex.size === 0) colorsByHex.set('#000000', { key: 'BLACK', hex: '#000000' });
  const colors = [...colorsByHex.values()];
  const indexByHex = new Map(colors.map((color, index) => [color.hex, index]));
  const paletteIndexes = new Uint16Array(dimensions.N * dimensions.M);
  const external = new Uint8Array(dimensions.N * dimensions.M);
  for (let row = 0; row < dimensions.M; row += 1) {
    for (let column = 0; column < dimensions.N; column += 1) {
      const index = row * dimensions.N + column;
      const cell = data[row]?.[column];
      if (!cell || cell.isExternal) {
        external[index] = 1;
      } else {
        paletteIndexes[index] = indexByHex.get(cell.color.toUpperCase()) ?? 0;
      }
    }
  }
  return { grid: { width: dimensions.N, height: dimensions.M, paletteIndexes, external }, colors };
}

function toMappedData(grid: PatternGrid, colors: readonly WorkspaceColor[]): MappedPixel[][] {
  return Array.from({ length: grid.height }, (_, row) =>
    Array.from({ length: grid.width }, (_, column) => {
      const index = row * grid.width + column;
      if (grid.external[index]) return { key: 'ERASE', color: '#FFFFFF', isExternal: true };
      const color = colors[grid.paletteIndexes[index]] ?? colors[0];
      return { key: color.key, color: color.hex, isExternal: false };
    }),
  );
}

function selectionBetween(first: GridPoint, second: GridPoint): SelectionRect {
  const x = Math.min(first.column, second.column);
  const y = Math.min(first.row, second.row);
  return { x, y, width: Math.abs(first.column - second.column) + 1, height: Math.abs(first.row - second.row) + 1 };
}

export default function PatternEditorWorkspace({
  initialData,
  gridDimensions,
  palette,
  originalImageSrc,
  onChange,
  onExit,
}: PatternEditorWorkspaceProps) {
  const [initial] = useState(() => createWorkspaceState(initialData, gridDimensions, palette)); // keyed by the parent session
  const [grid, setGrid] = useState(initial.grid);
  const colors = initial.colors;
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(0);
  const [tool, setTool] = useState<EditorTool>('pencil');
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [clipboard, setClipboard] = useState<EditorClipboard | null>(null);
  const [cursor, setCursor] = useState<GridPoint | null>(null);
  const [locked, setLocked] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showCodes, setShowCodes] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [highlightSelected, setHighlightSelected] = useState(false);
  const [cellStyle, setCellStyle] = useState<CellStyle>('solid');
  const [renderVersion, setRenderVersion] = useState(0);
  const [viewport, setViewport] = useState<EditorViewport>(() => ({
    zoom: Math.max(0.5, Math.min(2, 700 / (gridDimensions.N * 12))),
    panX: 16,
    panY: 16,
    baseCellSize: 12,
  }));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef(new EditorPatchHistory(100));
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const previousPinchRef = useRef<readonly [{ x: number; y: number }, { x: number; y: number }] | null>(null);
  const pinchingRef = useRef(false);
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null);
  const selectionStartRef = useRef<GridPoint | null>(null);
  const strokeRef = useRef(new Map<string, GridPoint>());
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!originalImageSrc) {
      originalImageRef.current = null;
      return;
    }
    const image = new window.Image();
    image.onload = () => {
      originalImageRef.current = image;
      setRenderVersion((version) => version + 1);
    };
    image.src = originalImageSrc;
    return () => { image.onload = null; };
  }, [originalImageSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setRenderVersion((version) => version + 1));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const emitGrid = useCallback((nextGrid: PatternGrid) => {
    setGrid(nextGrid);
    onChange(toMappedData(nextGrid, colors));
  }, [colors, onChange]);

  const commit = useCallback((result: PatchCommandResult) => {
    if (!historyRef.current.record(result.patch)) return;
    emitGrid(result.grid);
  }, [emitGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = '#111827';
    context.fillRect(0, 0, rect.width, rect.height);
    const cellSize = viewport.baseCellSize * viewport.zoom;
    const startColumn = Math.max(0, Math.floor(-viewport.panX / cellSize));
    const startRow = Math.max(0, Math.floor(-viewport.panY / cellSize));
    const endColumn = Math.min(grid.width, Math.ceil((rect.width - viewport.panX) / cellSize));
    const endRow = Math.min(grid.height, Math.ceil((rect.height - viewport.panY) / cellSize));

    for (let row = startRow; row < endRow; row += 1) {
      for (let column = startColumn; column < endColumn; column += 1) {
        const index = row * grid.width + column;
        const x = viewport.panX + column * cellSize;
        const y = viewport.panY + row * cellSize;
        const color = colors[grid.paletteIndexes[index]] ?? colors[0];
        const external = Boolean(grid.external[index]);
        context.globalAlpha = highlightSelected && !external && grid.paletteIndexes[index] !== selectedPaletteIndex ? 0.2 : 1;
        context.fillStyle = external ? '#374151' : color.hex;
        if (cellStyle === 'bead' && !external) {
          context.fillStyle = '#1f2937';
          context.fillRect(x, y, cellSize, cellSize);
          context.beginPath();
          context.arc(x + cellSize / 2, y + cellSize / 2, Math.max(1, cellSize * 0.42), 0, Math.PI * 2);
          context.fillStyle = color.hex;
          context.fill();
        } else {
          context.fillRect(x, y, cellSize, cellSize);
        }
        context.globalAlpha = 1;
        if (showGrid && cellSize >= 4) {
          context.strokeStyle = 'rgba(255,255,255,0.23)';
          context.lineWidth = 1;
          context.strokeRect(x + 0.5, y + 0.5, cellSize, cellSize);
        }
        if (showCodes && !external && cellSize >= 20) {
          context.fillStyle = '#111827';
          context.font = `${Math.max(8, Math.min(12, cellSize * 0.28))}px sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(color.key, x + cellSize / 2, y + cellSize / 2, cellSize - 2);
        }
      }
    }

    if (showOriginal && originalImageRef.current) {
      context.globalAlpha = 0.32;
      context.drawImage(originalImageRef.current, viewport.panX, viewport.panY, grid.width * cellSize, grid.height * cellSize);
      context.globalAlpha = 1;
    }
    if (selection) {
      context.strokeStyle = '#fbbf24';
      context.lineWidth = 2;
      context.setLineDash([6, 4]);
      context.strokeRect(
        viewport.panX + selection.x * cellSize,
        viewport.panY + selection.y * cellSize,
        selection.width * cellSize,
        selection.height * cellSize,
      );
      context.setLineDash([]);
    }
    if (cursor) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.strokeRect(
        viewport.panX + cursor.column * cellSize + 1,
        viewport.panY + cursor.row * cellSize + 1,
        Math.max(1, cellSize - 2),
        Math.max(1, cellSize - 2),
      );
    }
  }, [cellStyle, colors, cursor, grid, highlightSelected, renderVersion, selectedPaletteIndex, selection, showCodes, showGrid, showOriginal, viewport]);

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const addStrokePoint = (point: GridPoint | null) => {
    if (!point) return;
    strokeRef.current.set(`${point.row},${point.column}`, point);
    setCursor(point);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic tests and a few embedded browsers may not expose an active native pointer.
    }
    const screen = canvasPoint(event);
    activePointersRef.current.set(event.pointerId, screen);
    if (activePointersRef.current.size >= 2) {
      pinchingRef.current = true;
      strokeRef.current.clear();
      const points = [...activePointersRef.current.values()].slice(0, 2) as [{ x: number; y: number }, { x: number; y: number }];
      previousPinchRef.current = points;
      return;
    }
    const point = screenToGrid(viewport, screen, grid.width, grid.height);
    setCursor(point);
    if (tool === 'pan') {
      lastPanPointRef.current = screen;
      return;
    }
    if (locked) return;
    if (tool === 'pencil' || tool === 'eraser') {
      strokeRef.current.clear();
      addStrokePoint(point);
    } else if (tool === 'eyedropper' && point) {
      const cell = readEditorCell(grid, point);
      if (cell && !cell.external) {
        setSelectedPaletteIndex(cell.paletteIndex);
        setTool('pencil');
      }
    } else if (tool === 'fill' && point) {
      commit(fillConnected(grid, point, { paletteIndex: selectedPaletteIndex, external: false }));
    } else if (tool === 'select' && point) {
      selectionStartRef.current = point;
      setSelection(selectionBetween(point, point));
    } else if (tool === 'move' && point && selection) {
      commit(moveRegion(grid, selection, point));
      setSelection({ ...selection, x: point.column, y: point.row });
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const screen = canvasPoint(event);
    if (activePointersRef.current.has(event.pointerId)) activePointersRef.current.set(event.pointerId, screen);
    if (activePointersRef.current.size >= 2) {
      const next = [...activePointersRef.current.values()].slice(0, 2) as [{ x: number; y: number }, { x: number; y: number }];
      if (previousPinchRef.current) setViewport((current) => pinchViewport(current, previousPinchRef.current![0], previousPinchRef.current![1], next[0], next[1]));
      previousPinchRef.current = next;
      return;
    }
    const point = screenToGrid(viewport, screen, grid.width, grid.height);
    setCursor(point);
    if (tool === 'pan' && lastPanPointRef.current && activePointersRef.current.has(event.pointerId)) {
      const previous = lastPanPointRef.current;
      setViewport((current) => ({ ...current, panX: current.panX + screen.x - previous.x, panY: current.panY + screen.y - previous.y }));
      lastPanPointRef.current = screen;
    } else if (!locked && (tool === 'pencil' || tool === 'eraser') && activePointersRef.current.has(event.pointerId)) {
      addStrokePoint(point);
    } else if (!locked && tool === 'select' && selectionStartRef.current && point) {
      setSelection(selectionBetween(selectionStartRef.current, point));
    }
  };

  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) previousPinchRef.current = null;
    if (activePointersRef.current.size === 0) {
      if (!pinchingRef.current && !locked && strokeRef.current.size > 0) {
        const points = [...strokeRef.current.values()];
        commit(tool === 'eraser' ? eraseCells(grid, points) : paintCells(grid, points, selectedPaletteIndex));
      }
      strokeRef.current.clear();
      selectionStartRef.current = null;
      lastPanPointRef.current = null;
      pinchingRef.current = false;
    }
  };

  const undo = () => {
    const result = historyRef.current.undo(grid);
    if (result.patch) emitGrid(result.grid);
  };
  const redo = () => {
    const result = historyRef.current.redo(grid);
    if (result.patch) emitGrid(result.grid);
  };
  const replaceAtCursor = (connected: boolean) => {
    if (locked || !cursor) return;
    const source = readEditorCell(grid, cursor);
    if (!source) return;
    commit(connected
      ? fillConnected(grid, cursor, { paletteIndex: selectedPaletteIndex, external: false }, '连通区域替换')
      : replaceAll(grid, source, { paletteIndex: selectedPaletteIndex, external: false }));
  };
  const flip = (axis: 'horizontal' | 'vertical') => {
    if (locked) return;
    commit(flipRegion(grid, selection ?? wholeGridSelection(grid), axis));
  };

  const toolbarButton = (active = false) => `min-h-11 rounded-lg border px-3 py-2 text-sm transition ${
    active ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
  }`;

  return (
    <section data-testid="editor-workspace" className="w-full space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(toolLabels) as EditorTool[]).map((currentTool) => (
          <button key={currentTool} data-testid={`tool-${currentTool}`} type="button" className={toolbarButton(tool === currentTool)} aria-pressed={tool === currentTool} onClick={() => setTool(currentTool)}>
            {toolLabels[currentTool]}
          </button>
        ))}
        <button data-testid="editor-lock" type="button" className={toolbarButton(locked)} aria-pressed={locked} onClick={() => setLocked((value) => !value)}>
          {locked ? '已锁定' : '防误触锁'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-800">
          当前颜色
          <select data-testid="editor-color" className="max-w-44 bg-transparent" value={selectedPaletteIndex} onChange={(event) => setSelectedPaletteIndex(Number(event.target.value))}>
            {colors.map((color, index) => <option key={`${color.hex}-${index}`} value={index}>{color.key} {color.hex}</option>)}
          </select>
          <span className="h-6 w-6 rounded border" style={{ backgroundColor: colors[selectedPaletteIndex]?.hex }} />
        </label>
        <button data-testid="editor-undo" type="button" className={toolbarButton()} onClick={undo} disabled={!historyRef.current.canUndo}>撤销</button>
        <button data-testid="editor-redo" type="button" className={toolbarButton()} onClick={redo} disabled={!historyRef.current.canRedo}>重做</button>
        <button type="button" className={toolbarButton()} onClick={() => selection && setClipboard(copyRegion(grid, selection))} disabled={!selection}>复制</button>
        <button type="button" className={toolbarButton()} onClick={() => clipboard && commit(pasteRegion(grid, clipboard, cursor ?? { row: 0, column: 0 }))} disabled={!clipboard || locked}>粘贴</button>
        <button type="button" className={toolbarButton()} onClick={() => replaceAtCursor(false)} disabled={!cursor || locked}>同色替换</button>
        <button type="button" className={toolbarButton()} onClick={() => replaceAtCursor(true)} disabled={!cursor || locked}>连通替换</button>
        <button type="button" className={toolbarButton()} onClick={() => flip('horizontal')} disabled={locked}>水平翻转</button>
        <button type="button" className={toolbarButton()} onClick={() => flip('vertical')} disabled={locked}>垂直翻转</button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />网格</label>
        <label className="flex min-h-11 items-center gap-2"><input data-testid="toggle-codes" type="checkbox" checked={showCodes} onChange={(event) => setShowCodes(event.target.checked)} />色号</label>
        <label className="flex min-h-11 items-center gap-2"><input data-testid="toggle-original" type="checkbox" checked={showOriginal} onChange={(event) => setShowOriginal(event.target.checked)} />原图叠加</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={highlightSelected} onChange={(event) => setHighlightSelected(event.target.checked)} />当前颜色高亮</label>
        <label className="flex min-h-11 items-center gap-2">预览
          <select value={cellStyle} onChange={(event) => setCellStyle(event.target.value as CellStyle)} className="rounded border bg-white p-2 dark:bg-gray-800">
            <option value="solid">纯色块</option><option value="bead">豆子圆形</option>
          </select>
        </label>
        <span data-testid="editor-position">位置：{cursor ? `${cursor.column + 1}, ${cursor.row + 1}` : '—'}</span>
        <span>工具：{toolLabels[tool]}</span>
        <span data-testid="editor-zoom">缩放：{Math.round(viewport.zoom * 100)}%</span>
        <span data-testid="editor-history">历史：{historyRef.current.undoDepth}/{historyRef.current.redoDepth}</span>
      </div>

      <canvas
        ref={canvasRef}
        data-testid="editor-canvas"
        className="block h-[60vh] min-h-96 w-full rounded-lg border border-gray-600 bg-gray-900"
        style={{ touchAction: 'none', cursor: tool === 'pan' ? 'grab' : locked ? 'not-allowed' : 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={(event) => { if (event.buttons === 0) setCursor(null); }}
        onWheel={(event) => {
          event.preventDefault();
          const screen = canvasPoint(event);
          setViewport((current) => zoomViewportAt(current, screen, current.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>单指使用当前工具；选择“平移”可单指移动；双指始终缩放和平移。普通历史使用类型化 patch，保留 100 步。</span>
        <button type="button" className={toolbarButton()} onClick={onExit}>完成编辑</button>
      </div>
    </section>
  );
}
