import type { GridPoint } from './types';

export interface EditorViewport {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly baseCellSize: number;
}

export interface ScreenPoint { readonly x: number; readonly y: number }

export function clampZoom(zoom: number): number {
  return Math.max(0.5, Math.min(32, zoom));
}

export function panViewport(viewport: EditorViewport, deltaX: number, deltaY: number): EditorViewport {
  return { ...viewport, panX: viewport.panX + deltaX, panY: viewport.panY + deltaY };
}

export function zoomViewportAt(
  viewport: EditorViewport,
  screen: ScreenPoint,
  nextZoom: number,
): EditorViewport {
  const zoom = clampZoom(nextZoom);
  const ratio = zoom / viewport.zoom;
  return {
    ...viewport,
    zoom,
    panX: screen.x - (screen.x - viewport.panX) * ratio,
    panY: screen.y - (screen.y - viewport.panY) * ratio,
  };
}

export function screenToGrid(
  viewport: EditorViewport,
  screen: ScreenPoint,
  width: number,
  height: number,
): GridPoint | null {
  const cellSize = viewport.baseCellSize * viewport.zoom;
  const column = Math.floor((screen.x - viewport.panX) / cellSize);
  const row = Math.floor((screen.y - viewport.panY) / cellSize);
  return row >= 0 && column >= 0 && row < height && column < width ? { row, column } : null;
}

export function pinchViewport(
  viewport: EditorViewport,
  previousFirst: ScreenPoint,
  previousSecond: ScreenPoint,
  nextFirst: ScreenPoint,
  nextSecond: ScreenPoint,
): EditorViewport {
  const midpoint = (first: ScreenPoint, second: ScreenPoint) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
  const distance = (first: ScreenPoint, second: ScreenPoint) => Math.hypot(first.x - second.x, first.y - second.y);
  const previousMidpoint = midpoint(previousFirst, previousSecond);
  const nextMidpoint = midpoint(nextFirst, nextSecond);
  const previousDistance = Math.max(1, distance(previousFirst, previousSecond));
  const zoomed = zoomViewportAt(viewport, previousMidpoint, viewport.zoom * distance(nextFirst, nextSecond) / previousDistance);
  return panViewport(zoomed, nextMidpoint.x - previousMidpoint.x, nextMidpoint.y - previousMidpoint.y);
}
