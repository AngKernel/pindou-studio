'use client';

import type { ChangeEvent } from 'react';
import type { ProjectSummary } from '../storage';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface LocalProjectsPanelProps {
  readonly projects: readonly ProjectSummary[];
  readonly activeProjectId: string | null;
  readonly activeProjectName: string;
  readonly saveState: SaveState;
  readonly message: string | null;
  readonly onOpen: (id: string) => void;
  readonly onRename: (id: string, currentName: string) => void;
  readonly onDuplicate: (id: string) => void;
  readonly onDelete: (id: string, name: string) => void;
  readonly onExport: (id: string) => void;
  readonly onImport: (file: File) => void;
}

const saveLabels: Record<SaveState, string> = {
  idle: '等待项目内容',
  saving: '正在自动保存…',
  saved: '已保存到此浏览器',
  error: '自动保存失败',
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function LocalProjectsPanel({
  projects,
  activeProjectId,
  activeProjectName,
  saveState,
  message,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
}: LocalProjectsPanelProps) {
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onImport(file);
    event.target.value = '';
  };

  return (
    <section data-testid="local-projects" className="w-full rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">本地项目</h2>
          <p data-testid="active-project-name" className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            当前：{activeProjectId ? activeProjectName : '尚未建立项目'} · {saveLabels[saveState]}
          </p>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900">
          导入 .bead.json
          <input data-testid="project-import-input" className="hidden" type="file" accept=".bead.json,application/json" onChange={handleFile} />
        </label>
      </div>

      <p className="mt-3 rounded-lg border border-amber-300 bg-white/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-gray-900/50 dark:text-amber-200">
        项目只保存在当前浏览器。清除站点数据、重装浏览器或设备损坏都可能导致项目丢失，请定期导出项目文件备份。
      </p>
      {message && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{message}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {projects.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">还没有本地项目。生成图纸后会在 750 毫秒无操作时自动保存。</p>}
        {projects.map((project) => (
          <article data-testid="project-card" key={project.id} className={`rounded-lg border bg-white p-3 dark:bg-gray-900 ${project.id === activeProjectId ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex gap-3">
              {project.thumbnailDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.thumbnailDataUrl} alt="" className="h-16 w-16 rounded border border-gray-200 object-contain [image-rendering:pixelated] dark:border-gray-700" />
              ) : <div className="h-16 w-16 rounded bg-gray-100 dark:bg-gray-800" />}
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-medium text-gray-900 dark:text-gray-100">{project.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{project.width}×{project.height} · {project.paletteId}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatTime(project.updatedAt)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button data-testid="project-open" className="min-h-9 rounded bg-blue-600 px-3 text-white" onClick={() => onOpen(project.id)}>打开</button>
              <button data-testid="project-rename" className="min-h-9 rounded border px-3" onClick={() => onRename(project.id, project.name)}>重命名</button>
              <button data-testid="project-duplicate" className="min-h-9 rounded border px-3" onClick={() => onDuplicate(project.id)}>复制项目</button>
              <button data-testid="project-export" className="min-h-9 rounded border px-3" onClick={() => onExport(project.id)}>导出</button>
              <button data-testid="project-delete" className="min-h-9 rounded border border-red-300 px-3 text-red-700" onClick={() => onDelete(project.id, project.name)}>删除</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
