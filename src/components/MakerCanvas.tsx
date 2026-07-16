'use client';

import { useEffect, useRef } from 'react';
import type { BoardRegion } from '../core/board';
import type { PatternProject } from '../core/project';

interface MakerCanvasProps {
  readonly project: PatternProject;
  readonly region: BoardRegion;
  readonly selectedPaletteIndex: number | null;
  readonly cursor: { readonly row: number; readonly column: number } | null;
  readonly locked: boolean;
  readonly hideCompleted: boolean;
  readonly cellSize: number;
  readonly onCell: (row: number, column: number) => void;
}

const MAX_BACKING_DIMENSION = 8192;
const MAX_BACKING_PIXELS = 16 * 1024 * 1024;

function rgbCss(rgb: { readonly r: number; readonly g: number; readonly b: number }): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

export default function MakerCanvas({
  project,
  region,
  selectedPaletteIndex,
  cursor,
  locked,
  hideCompleted,
  cellSize,
  onCell,
}: MakerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerStartRef = useRef<{ readonly id: number; readonly x: number; readonly y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = region.width * cellSize;
    const height = region.height * cellSize;
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

    for (let localRow = 0; localRow < region.height; localRow += 1) {
      for (let localColumn = 0; localColumn < region.width; localColumn += 1) {
        const row = region.startRow + localRow;
        const column = region.startColumn + localColumn;
        const index = row * project.width + column;
        const x = localColumn * cellSize;
        const y = localRow * cellSize;
        const external = Boolean(project.external[index]);
        const completed = Boolean(project.completed[index]);
        const paletteIndex = project.cells[index];
        const color = project.palette.colors[paletteIndex];
        const dimmed = selectedPaletteIndex !== null && selectedPaletteIndex !== paletteIndex;

        context.globalAlpha = completed && hideCompleted ? 0.08 : dimmed ? 0.22 : 1;
        context.fillStyle = external ? '#d1d5db' : rgbCss(color?.rgb ?? { r: 0, g: 0, b: 0 });
        context.fillRect(x, y, cellSize, cellSize);
        context.globalAlpha = 1;
        context.strokeStyle = 'rgba(17,24,39,0.25)';
        context.lineWidth = 1;
        context.strokeRect(x + 0.5, y + 0.5, cellSize, cellSize);

        if (completed && !hideCompleted && !external) {
          context.fillStyle = 'rgba(17,24,39,0.58)';
          context.fillRect(x, y, cellSize, cellSize);
          context.strokeStyle = '#ffffff';
          context.lineWidth = Math.max(1.5, cellSize / 10);
          context.beginPath();
          context.moveTo(x + cellSize * 0.22, y + cellSize * 0.52);
          context.lineTo(x + cellSize * 0.43, y + cellSize * 0.72);
          context.lineTo(x + cellSize * 0.8, y + cellSize * 0.3);
          context.stroke();
        }
        if (!external && cellSize >= 24 && !completed) {
          context.fillStyle = '#111827';
          context.font = `${Math.max(8, Math.floor(cellSize * 0.3))}px sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(color?.code ?? '?', x + cellSize / 2, y + cellSize / 2, cellSize - 2);
        }
      }
    }

    if (cursor && cursor.row >= region.startRow && cursor.row < region.startRow + region.height
      && cursor.column >= region.startColumn && cursor.column < region.startColumn + region.width) {
      const localRow = cursor.row - region.startRow;
      const localColumn = cursor.column - region.startColumn;
      context.fillStyle = 'rgba(250,204,21,0.2)';
      context.fillRect(0, localRow * cellSize, width, cellSize);
      context.fillRect(localColumn * cellSize, 0, cellSize, height);
      context.strokeStyle = '#facc15';
      context.lineWidth = 3;
      context.strokeRect(localColumn * cellSize + 1.5, localRow * cellSize + 1.5, cellSize - 3, cellSize - 3);
    }
    context.strokeStyle = '#7c3aed';
    context.lineWidth = 4;
    context.strokeRect(2, 2, width - 4, height - 4);
  }, [cellSize, cursor, hideCompleted, project, region, selectedPaletteIndex]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="maker-canvas"
      aria-label={`豆板 ${region.index + 1} 制作画布`}
      className={locked ? 'cursor-not-allowed' : 'cursor-crosshair'}
      style={{ touchAction: 'pan-x pan-y', imageRendering: 'pixelated' }}
      onPointerDown={(event) => {
        pointerStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerCancel={() => { pointerStartRef.current = null; }}
      onPointerUp={(event) => {
        const start = pointerStartRef.current;
        pointerStartRef.current = null;
        if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const localColumn = Math.floor((event.clientX - rect.left) / rect.width * region.width);
        const localRow = Math.floor((event.clientY - rect.top) / rect.height * region.height);
        if (localRow >= 0 && localRow < region.height && localColumn >= 0 && localColumn < region.width) {
          onCell(region.startRow + localRow, region.startColumn + localColumn);
        }
      }}
    />
  );
}
