import { z } from 'zod';
import { MAX_PROJECT_CELLS, MAX_PROJECT_DIMENSION, type JsonValue } from './types';

const nonEmptyText = z.string().trim().min(1).max(200);
const rgbSchema = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
}).strict();
const paletteColorSchema = z.object({
  id: nonEmptyText,
  brand: z.string().max(100),
  code: nonEmptyText,
  name: z.string().max(200),
  rgb: rgbSchema,
}).strict();
const paletteSchema = z.object({
  id: nonEmptyText,
  version: nonEmptyText,
  colors: z.array(paletteColorSchema).min(1).max(65_535),
}).strict();
const boardSchema = z.object({
  width: z.number().int().min(1).max(MAX_PROJECT_DIMENSION),
  height: z.number().int().min(1).max(MAX_PROJECT_DIMENSION),
  beadDiameterMm: z.number().positive().max(100),
}).strict();

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema).max(10_000),
  z.record(z.string().max(200), jsonValueSchema),
]));

const commonShape = {
  appVersion: nonEmptyText,
  id: z.uuid(),
  name: nonEmptyText,
  width: z.number().int().min(1).max(MAX_PROJECT_DIMENSION),
  height: z.number().int().min(1).max(MAX_PROJECT_DIMENSION),
  cells: z.array(z.number().int().min(0).max(65_535)).max(MAX_PROJECT_CELLS),
  completed: z.array(z.number().int().min(0).max(1)).max(MAX_PROJECT_CELLS),
  board: boardSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

export const projectV1Schema = z.object({
  formatVersion: z.literal(1),
  ...commonShape,
  paletteId: nonEmptyText,
  paletteVersion: nonEmptyText,
  paletteColors: z.array(paletteColorSchema).min(1).max(65_535),
  generationSettings: z.record(z.string().max(200), jsonValueSchema).optional().default({}),
}).strict();

export const projectV2Schema = z.object({
  formatVersion: z.literal(2),
  ...commonShape,
  palette: paletteSchema,
  external: z.array(z.number().int().min(0).max(1)).max(MAX_PROJECT_CELLS),
  generationSettings: z.record(z.string().max(200), jsonValueSchema),
  thumbnailDataUrl: z.string().max(700_000).regex(
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
  ).optional(),
}).strict();

export type ParsedProjectV1 = z.infer<typeof projectV1Schema>;
export type ParsedProjectV2 = z.infer<typeof projectV2Schema>;
