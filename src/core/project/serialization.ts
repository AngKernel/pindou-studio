import {
  projectV1Schema,
  projectV2Schema,
  projectV3Schema,
  type ParsedProjectV1,
  type ParsedProjectV2,
  type ParsedProjectV3,
} from './schema';
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

function assertCellSemantics(project: ParsedProjectV3): void {
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
  if (project.board.beadDiameterMm < 0.5 || project.board.beadDiameterMm > 20) {
    throw new ProjectError('INVALID_PROJECT', '项目豆子直径必须在 0.5 mm 到 20 mm 之间。');
  }
  const boardCount = Math.ceil(project.width / project.board.width) * Math.ceil(project.height / project.board.height);
  if (project.makerState.activeBoardIndex >= boardCount) {
    throw new ProjectError('INVALID_PROJECT', '项目记录的当前豆板超出分板范围。');
  }
  const lastPosition = project.makerState.lastPosition;
  if (lastPosition && (lastPosition.row >= project.height || lastPosition.column >= project.width)) {
    throw new ProjectError('INVALID_PROJECT', '项目记录的上次制作位置超出画布范围。');
  }
  const sourceImage = project.sourceImage;
  if (sourceImage) {
    const crop = sourceImage.transform.crop;
    if (
      crop.x + crop.width > sourceImage.width
      || crop.y + crop.height > sourceImage.height
      || Math.abs(sourceImage.transform.offsetX) > Math.max(crop.width, crop.height)
      || Math.abs(sourceImage.transform.offsetY) > Math.max(crop.width, crop.height)
    ) {
      throw new ProjectError('INVALID_PROJECT', '项目保存的原图裁剪参数超出图片范围。');
    }
  }
}

function migrateV1(project: ParsedProjectV1): ParsedProjectV2 {
  return {
    formatVersion: 2,
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

function migrateV2(project: ParsedProjectV2): ParsedProjectV3 {
  return {
    ...project,
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    makerState: { activeBoardIndex: 0, lastPosition: null },
  };
}

function parseUnknownProject(value: unknown): ParsedProjectV3 {
  assertSafeObject(value);
  if (!value || typeof value !== 'object' || !('formatVersion' in value)) {
    throw new ProjectError('INVALID_PROJECT', '这不是有效的拼豆项目文件。');
  }
  const version = (value as { formatVersion?: unknown }).formatVersion;
  const parsed = version === 1
    ? projectV1Schema.safeParse(value)
    : version === 2
      ? projectV2Schema.safeParse(value)
      : version === CURRENT_PROJECT_FORMAT_VERSION
        ? projectV3Schema.safeParse(value)
        : null;
  if (!parsed) throw new ProjectError('UNSUPPORTED_VERSION', `不支持项目格式版本 ${String(version)}。`);
  if (!parsed.success) {
    throw new ProjectError('INVALID_PROJECT', `项目字段校验失败：${parsed.error.issues[0]?.message ?? '未知字段错误'}`);
  }
  const previous = version === 1 ? migrateV1(parsed.data as ParsedProjectV1) : parsed.data as ParsedProjectV2;
  const current = version === CURRENT_PROJECT_FORMAT_VERSION
    ? parsed.data as ParsedProjectV3
    : migrateV2(previous);
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
      throw new ProjectError('PROJECT_TOO_LARGE', '项目文件不能超过 32 MB。');
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
