import { projectV1Schema, projectV2Schema, type ParsedProjectV1, type ParsedProjectV2 } from './schema';
import {
  CURRENT_PROJECT_FORMAT_VERSION,
  MAX_PROJECT_FILE_BYTES,
  ProjectError,
  type PatternProject,
  type SerializablePatternProject,
} from './types';

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

function assertSafeObject(value: unknown, depth = 0): void {
  if (depth > 32) throw new ProjectError('INVALID_PROJECT', '项目数据嵌套层级过深。');
  if (Array.isArray(value)) {
    for (const item of value) assertSafeObject(item, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) throw new ProjectError('UNSAFE_FIELD', '项目包含不安全字段，已拒绝导入。');
    assertSafeObject(child, depth + 1);
  }
}

function assertCellSemantics(project: ParsedProjectV2): void {
  const expected = project.width * project.height;
  if (project.cells.length !== expected || project.external.length !== expected || project.completed.length !== expected) {
    throw new ProjectError('INVALID_CELL_DATA', '项目格子数量与画布尺寸不一致。');
  }
  if (project.cells.some((index) => index >= project.palette.colors.length)) {
    throw new ProjectError('INVALID_CELL_DATA', '项目包含不存在的色板索引。');
  }
  if (Date.parse(project.updatedAt) < Date.parse(project.createdAt)) {
    throw new ProjectError('INVALID_PROJECT', '项目修改时间不能早于创建时间。');
  }
}

function migrateV1(project: ParsedProjectV1): ParsedProjectV2 {
  return {
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    appVersion: project.appVersion,
    id: project.id,
    name: project.name,
    width: project.width,
    height: project.height,
    palette: { id: project.paletteId, version: project.paletteVersion, colors: project.paletteColors },
    cells: project.cells,
    external: new Array(project.cells.length).fill(0),
    completed: project.completed,
    board: project.board,
    generationSettings: project.generationSettings,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function parseUnknownProject(value: unknown): ParsedProjectV2 {
  assertSafeObject(value);
  if (!value || typeof value !== 'object' || !('formatVersion' in value)) {
    throw new ProjectError('INVALID_PROJECT', '这不是有效的拼豆项目文件。');
  }
  const version = (value as { formatVersion?: unknown }).formatVersion;
  const parsed = version === 1
    ? projectV1Schema.safeParse(value)
    : version === CURRENT_PROJECT_FORMAT_VERSION
      ? projectV2Schema.safeParse(value)
      : null;
  if (!parsed) throw new ProjectError('UNSUPPORTED_VERSION', `不支持项目格式版本 ${String(version)}。`);
  if (!parsed.success) {
    throw new ProjectError('INVALID_PROJECT', `项目字段校验失败：${parsed.error.issues[0]?.message ?? '未知字段错误'}`);
  }
  const current = version === 1 ? migrateV1(parsed.data as ParsedProjectV1) : parsed.data as ParsedProjectV2;
  assertCellSemantics(current);
  return current;
}

export function toPatternProject(project: SerializablePatternProject): PatternProject {
  return {
    ...project,
    cells: Uint16Array.from(project.cells),
    external: Uint8Array.from(project.external),
    completed: Uint8Array.from(project.completed),
  };
}

export function toSerializableProject(project: PatternProject): SerializablePatternProject {
  const candidate = {
    ...project,
    cells: [...project.cells],
    external: [...project.external],
    completed: [...project.completed],
  };
  return parseUnknownProject(candidate);
}

export function parseProject(input: string | unknown): PatternProject {
  let value = input;
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > MAX_PROJECT_FILE_BYTES) {
      throw new ProjectError('PROJECT_TOO_LARGE', '项目文件不能超过 5 MB。');
    }
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      throw new ProjectError('INVALID_JSON', '项目文件不是有效的 JSON。', { cause: error });
    }
  }
  return toPatternProject(parseUnknownProject(value));
}

export function serializeProject(project: PatternProject): string {
  return `${JSON.stringify(toSerializableProject(project), null, 2)}\n`;
}
