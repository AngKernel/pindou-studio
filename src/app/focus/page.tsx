'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import MakerCanvas from '../../components/MakerCanvas';
import { partitionPattern } from '../../core/board';
import { calculateMakerProgress, toggleCompletedCell } from '../../core/maker';
import { ProjectError, type PatternProject } from '../../core/project';
import { IndexedDbProjectStore } from '../../storage';

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

type SaveState = 'saved' | 'saving' | 'error';

function progressLabel(completed: number, total: number, percentage: number): string {
  return `${completed}/${total}（${percentage}%）`;
}

export default function FocusMode() {
  const [project, setProject] = useState<PatternProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [cellSize, setCellSize] = useState(24);
  const [wakeMessage, setWakeMessage] = useState('屏幕常亮未启用');
  const storeRef = useRef<IndexedDbProjectStore | null>(null);
  const skipFirstSaveRef = useRef(true);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    const store = new IndexedDbProjectStore();
    storeRef.current = store;
    const id = new URLSearchParams(window.location.search).get('project');
    if (!id) {
      setError('缺少要制作的本地项目，请返回项目列表重新进入。');
      return;
    }
    void store.get(id)
      .then((value) => {
        if (!value) throw new ProjectError('PROJECT_NOT_FOUND', '找不到要制作的本地项目。');
        const layout = partitionPattern(value.width, value.height, value.board);
        const activeBoardIndex = Math.min(value.makerState.activeBoardIndex, layout.total - 1);
        const restored = activeBoardIndex === value.makerState.activeBoardIndex
          ? value
          : { ...value, makerState: { ...value.makerState, activeBoardIndex } };
        setProject(restored);
        const activeRegion = layout.regions[activeBoardIndex];
        const firstIndex = activeRegion.startRow * value.width + activeRegion.startColumn;
        setSelectedPaletteIndex(value.external[firstIndex] ? null : value.cells[firstIndex]);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof ProjectError ? loadError.userMessage : '无法加载本地制作项目。');
      });
  }, []);

  useEffect(() => {
    if (!project) return;
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;
    setSaveState('saving');
    const timeout = window.setTimeout(() => {
      const next = { ...project, updatedAt: new Date().toISOString() };
      const store = storeRef.current;
      if (!store) return;
      const write = saveQueueRef.current
        .catch(() => undefined)
        .then(() => store.put(next));
      saveQueueRef.current = write;
      void write
        .then(() => {
          if (revision === saveRevisionRef.current) setSaveState('saved');
        })
        .catch((saveError: unknown) => {
          if (revision !== saveRevisionRef.current) return;
          setError(saveError instanceof ProjectError ? saveError.userMessage : '制作进度保存失败，请返回并导出备份。');
          setSaveState('error');
        });
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [project]);

  useEffect(() => () => {
    void wakeLockRef.current?.release();
  }, []);

  const layout = useMemo(() => project ? partitionPattern(project.width, project.height, project.board) : null, [project]);
  const activeRegion = project && layout ? layout.regions[project.makerState.activeBoardIndex] : null;
  const overallProgress = useMemo(() => project
    ? calculateMakerProgress(project.completed, project.external, project.width)
    : null, [project]);
  const boardProgress = useMemo(() => project && activeRegion
    ? calculateMakerProgress(project.completed, project.external, project.width, activeRegion)
    : null, [activeRegion, project]);
  const usedPaletteIndexes = useMemo(() => {
    if (!project) return [];
    const used = new Set<number>();
    for (let index = 0; index < project.cells.length; index += 1) {
      if (!project.external[index]) used.add(project.cells[index]);
    }
    return [...used].sort((left, right) => project.palette.colors[left].code.localeCompare(project.palette.colors[right].code));
  }, [project]);

  const updateActiveBoard = useCallback((activeBoardIndex: number) => {
    setProject((current) => current ? {
      ...current,
      makerState: { ...current.makerState, activeBoardIndex, lastPosition: null },
    } : current);
  }, []);

  const handleCell = useCallback((row: number, column: number) => {
    setProject((current) => {
      if (!current) return current;
      const index = row * current.width + column;
      if (locked || current.external[index]) return current;
      return {
        ...current,
        completed: toggleCompletedCell(current.completed, current.external, index),
        makerState: { ...current.makerState, lastPosition: { row, column } },
      };
    });
  }, [locked]);

  const toggleWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeMessage('屏幕常亮未启用');
      return;
    }
    const wakeLockApi = (navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
    }).wakeLock;
    if (!wakeLockApi) {
      setWakeMessage('当前浏览器不支持屏幕常亮，请关闭系统自动锁屏或定期触摸屏幕。');
      return;
    }
    try {
      const sentinel = await wakeLockApi.request('screen');
      wakeLockRef.current = sentinel;
      sentinel.addEventListener('release', () => {
        wakeLockRef.current = null;
        setWakeMessage('屏幕常亮已由系统释放，可再次启用。');
      });
      setWakeMessage('屏幕常亮已启用');
    } catch {
      setWakeMessage('无法启用屏幕常亮，请保持页面可见并检查浏览器权限。');
    }
  };

  if (error && !project) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white">
        <div className="max-w-md rounded-xl border border-red-800 bg-red-950/40 p-5 text-center">
          <h1 className="text-xl font-semibold">无法进入制作模式</h1>
          <p role="alert" className="mt-2 text-sm text-red-200">{error}</p>
          <Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-gray-900">返回项目列表</Link>
        </div>
      </main>
    );
  }
  if (!project || !layout || !activeRegion || !overallProgress || !boardProgress) {
    return <main className="flex min-h-screen items-center justify-center bg-gray-950 text-white">正在加载本地项目…</main>;
  }

  const cursor = project.makerState.lastPosition;
  const activeBoard = project.makerState.activeBoardIndex;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <button disabled={saveState === 'saving'} onClick={() => window.history.back()} className="min-h-11 rounded-lg border border-gray-700 px-4 disabled:opacity-50">退出制作</button>
          <div className="min-w-0 text-center">
            <h1 className="truncate font-semibold">{project.name} · 制作模式</h1>
            <p data-testid="maker-save-state" className="text-xs text-gray-400">{saveState === 'saved' ? '进度已保存到本地项目' : saveState === 'saving' ? '正在保存进度…' : '进度保存失败'}</p>
          </div>
          <button data-testid="maker-lock" onClick={() => setLocked((value) => !value)} className={`min-h-11 rounded-lg px-4 ${locked ? 'bg-amber-500 text-gray-950' : 'bg-gray-800'}`}>{locked ? '已锁定' : '防误触锁'}</button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 p-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <section>
            <h2 data-testid="maker-board-label" className="font-medium">豆板 {activeBoard + 1}/{layout.total}</h2>
            <p className="mt-1 text-xs text-gray-400">第 {activeRegion.boardRow + 1} 行，第 {activeRegion.boardColumn + 1} 列 · {activeRegion.width}×{activeRegion.height}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button data-testid="previous-board" disabled={activeBoard === 0} onClick={() => updateActiveBoard(activeBoard - 1)} className="min-h-11 rounded bg-gray-800 disabled:opacity-40">上一板</button>
              <button data-testid="next-board" disabled={activeBoard === layout.total - 1} onClick={() => updateActiveBoard(activeBoard + 1)} className="min-h-11 rounded bg-gray-800 disabled:opacity-40">下一板</button>
            </div>
          </section>

          <section className="rounded-lg bg-gray-950 p-3 text-sm">
            <p>当前板：<strong data-testid="board-progress">{progressLabel(boardProgress.completed, boardProgress.total, boardProgress.percentage)}</strong></p>
            <p className="mt-2">整体：<strong data-testid="overall-progress">{progressLabel(overallProgress.completed, overallProgress.total, overallProgress.percentage)}</strong></p>
            <p className="mt-2 text-gray-400">未完成 {overallProgress.remaining} 格</p>
          </section>

          <label className="block text-sm">
            高亮颜色
            <select data-testid="maker-color" value={selectedPaletteIndex ?? ''} onChange={(event) => setSelectedPaletteIndex(event.target.value === '' ? null : Number(event.target.value))} className="mt-1 min-h-11 w-full rounded bg-gray-800 px-2">
              <option value="">显示全部颜色</option>
              {usedPaletteIndexes.map((index) => <option key={index} value={index}>{project.palette.colors[index].code}</option>)}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input data-testid="hide-completed" type="checkbox" checked={hideCompleted} onChange={(event) => setHideCompleted(event.target.checked)} />隐藏已完成格</label>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setCellSize((value) => Math.max(12, value - 4))} className="min-h-11 rounded bg-gray-800">缩小</button>
            <button onClick={() => setCellSize((value) => Math.min(40, value + 4))} className="min-h-11 rounded bg-gray-800">放大</button>
          </div>
          <button data-testid="wake-lock" onClick={() => { void toggleWakeLock(); }} className="min-h-11 w-full rounded bg-indigo-600 px-3 text-sm">切换屏幕常亮</button>
          <p data-testid="wake-status" role="status" className="text-xs text-gray-400">{wakeMessage}</p>
          {cursor && <p data-testid="maker-position" className="text-xs text-amber-300">当前位置：第 {cursor.row + 1} 行，第 {cursor.column + 1} 列</p>}
          {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        </aside>

        <section className="min-h-[65vh] overflow-auto rounded-xl border border-gray-800 bg-gray-900 p-3">
          <div className="mx-auto w-max">
            <MakerCanvas
              project={project}
              region={activeRegion}
              selectedPaletteIndex={selectedPaletteIndex}
              cursor={cursor}
              locked={locked}
              hideCompleted={hideCompleted}
              cellSize={cellSize}
              onCell={handleCell}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
