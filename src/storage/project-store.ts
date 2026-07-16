import type { PatternProject } from '../core/project';

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly paletteId: string;
  readonly paletteVersion: string;
  readonly thumbnailDataUrl?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectStore {
  list(): Promise<readonly ProjectSummary[]>;
  get(id: string): Promise<PatternProject | null>;
  put(project: PatternProject): Promise<void>;
  rename(id: string, name: string): Promise<PatternProject>;
  duplicate(id: string): Promise<PatternProject>;
  delete(id: string): Promise<void>;
}
