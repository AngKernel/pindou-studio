'use client';

import { useEffect, useRef, type PointerEvent } from 'react';
import type { BoardLayout, BoardRegion } from '../core/board';
import type { PatternProject } from '../core/project';

interface MakerOverviewCanvasProps {
  readonly project: PatternProject;
  readonly layout: BoardLayout;
  readonly activeRegion: BoardRegion;
  readonly selectedPaletteIndex: number | null;
  readonly hideCompleted: boolean;
  readonly cellSize: number;
  readonly onNavigate: (row: number, column: number) => void;
}

interface MakerBoardMiniMapProps {
  readonly project: PatternProject;
  readonly layout: BoardLayout;
  readonly activeRegion: BoardRegion;
  readonly onNavigate: (row: number, column: number) => void;
}

const MAX_BACKING_DIMENSION = 8192;
const MAX_BACKING_PIXELS = 16 * 1024 * 1024;

function rgbCss(rgb: { readonly r: number; readonly g: number; readonly b: number }): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function codeColor(rgb: { readonly r: number; readonly g: number; readonly b: number }): string {
  const luminance = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
  return luminance > 150 ? '#111827' : '#ffffff';
}

function regionAt(layout: BoardLayout, row: number, column: number): BoardRegion | undefined {
  return layout.regions.find((region) => (
    row >= region.startRow
    && row < region.startRow + region.height
    && column >= region.startColumn
    && column < region.startColumn + region.width
  ));
}

export default function MakerOverviewCanvas({
  project,
  layout,
  activeRegion,
  selectedPaletteIndex,
  hideCompleted,
  cellSize,
  onNavigate,
}: MakerOverviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerStartRef = useRef<{ readonly id: number; readonly x: number; readonly y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = project.width * cellSize;
    const height = project.height * cellSize;
    const backingScale = Math.min(
      window.devicePixelRatio || 1,
      MAX_BACKING_DIMENSION / Math.max(width, height),
      Math.sqrt(MAX_BACKING_PIXELS / (width * height)),
    );
    canvas.width = Math.max(1, Math.round(width * backingScale));
    canvas.height = Math.max(1, Math.round(height * backingScale));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(backingScale, 0, 0, backingScale, 0, 0);
    context.clearRect(0, 0, width, height);

    for (let row = 0; row < project.height; row += 1) {
      for (let column = 0; column < project.width; column += 1) {
        const index = row * project.width + column;
        const paletteIndex = project.cells[index];
        const color = project.palette.colors[paletteIndex];
        const external = Boolean(project.external[index]);
        const completed = Boolean(project.completed[index]);
        const dimmed = selectedPaletteIndex !== null && selectedPaletteIndex !== paletteIndex;
        const x = column * cellSize;
        const y = row * cellSize;
        context.globalAlpha = completed && hideCompleted ? 0.08 : dimmed ? 0.22 : 1;
        context.fillStyle = external ? '#d1d5db' : rgbCss(color?.rgb ?? { r: 0, g: 0, b: 0 });
        context.fillRect(x, y, cellSize, cellSize);
        context.globalAlpha = 1;
        context.strokeStyle = 'rgba(17,24,39,0.28)';
        context.lineWidth = 1;
        context.strokeRect(x + 0.5, y + 0.5, cellSize, cellSize);
        if (!external && cellSize >= 18) {
          context.fillStyle = codeColor(color?.rgb ?? { r: 0, g: 0, b: 0 });
          context.font = `600 ${Math.max(8, Math.floor(cellSize * 0.3))}px sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(color?.code ?? '?', x + cellSize / 2, y + cellSize / 2, cellSize - 2);
        }
      }
    }

    for (const region of layout.regions) {
      const x = region.startColumn * cellSize;
      const y = region.startRow * cellSize;
      const regionWidth = region.width * cellSize;
      const regionHeight = region.height * cellSize;
      context.strokeStyle = region.index === activeRegion.index ? '#facc15' : '#7c3aed';
      context.lineWidth = region.index === activeRegion.index ? 4 : 2;
      context.strokeRect(x + 1, y + 1, regionWidth - 2, regionHeight - 2);
      if (cellSize >= 18) {
        context.fillStyle = region.index === activeRegion.index ? '#facc15' : '#7c3aed';
        context.fillRect(x + 2, y + 2, Math.max(24, cellSize * 1.35), Math.max(18, cellSize * 0.75));
        context.fillStyle = region.index === activeRegion.index ? '#111827' : '#ffffff';
        context.font = `700 ${Math.max(9, Math.floor(cellSize * 0.36))}px sans-serif`;
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillText(String(region.index + 1), x + 6, y + 4);
      }
    }
  }, [activeRegion, cellSize, hideCompleted, layout, project, selectedPaletteIndex]);

  const navigate = (event: PointerEvent<HTMLCanvasElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const column = Math.floor((event.clientX - rect.left) / rect.width * project.width);
    const row = Math.floor((event.clientY - rect.top) / rect.height * project.height);
    if (row >= 0 && row < project.height && column >= 0 && column < project.width) onNavigate(row, column);
  };

  return (
    <canvas
      ref={canvasRef}
      data-testid="maker-global-canvas"
      aria-label="全局拼豆图纸，每个格子显示色号，点击可进入对应豆板"
      className="cursor-pointer"
      style={{ touchAction: 'pan-x pan-y', imageRendering: 'pixelated' }}
      onPointerDown={(event) => {
        pointerStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerCancel={() => { pointerStartRef.current = null; }}
      onPointerUp={navigate}
    />
  );
}

export function MakerBoardMiniMap({
  project,
  layout,
  activeRegion,
  onNavigate,
}: MakerBoardMiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = 240;
    const height = Math.max(48, Math.round(width * project.height / project.width));
    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(2, 0, 0, 2, 0, 0);
    context.clearRect(0, 0, width, height);
    const cellWidth = width / project.width;
    const cellHeight = height / project.height;
    for (let row = 0; row < project.height; row += 1) {
      for (let column = 0; column < project.width; column += 1) {
        const index = row * project.width + column;
        const color = project.palette.colors[project.cells[index]];
        context.fillStyle = project.external[index] ? '#4b5563' : rgbCss(color?.rgb ?? { r: 0, g: 0, b: 0 });
        context.fillRect(column * cellWidth, row * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight));
      }
    }
    for (const region of layout.regions) {
      context.strokeStyle = 'rgba(255,255,255,0.55)';
      context.lineWidth = 1;
      context.strokeRect(
        region.startColumn * cellWidth,
        region.startRow * cellHeight,
        region.width * cellWidth,
        region.height * cellHeight,
      );
    }
    context.fillStyle = 'rgba(250,204,21,0.18)';
    context.fillRect(
      activeRegion.startColumn * cellWidth,
      activeRegion.startRow * cellHeight,
      activeRegion.width * cellWidth,
      activeRegion.height * cellHeight,
    );
    context.strokeStyle = '#facc15';
    context.lineWidth = 3;
    context.strokeRect(
      activeRegion.startColumn * cellWidth + 1.5,
      activeRegion.startRow * cellHeight + 1.5,
      activeRegion.width * cellWidth - 3,
      activeRegion.height * cellHeight - 3,
    );
  }, [activeRegion, layout, project]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="maker-board-minimap"
      aria-label={`当前第 ${activeRegion.index + 1} 块豆板在全局图纸中的位置`}
      className="max-w-full cursor-pointer rounded border border-gray-700"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const column = Math.floor((event.clientX - rect.left) / rect.width * project.width);
        const row = Math.floor((event.clientY - rect.top) / rect.height * project.height);
        if (regionAt(layout, row, column)) onNavigate(row, column);
      }}
    />
  );
}
