import { rgbToLab } from '../color';
import {
  PaletteError,
  type CompiledPalette,
  type PaletteDefinition,
} from './types';

interface CacheEntry {
  readonly fingerprint: string;
  readonly palette: CompiledPalette;
}

const compiledPaletteCache = new Map<string, CacheEntry>();

function paletteFingerprint(definition: PaletteDefinition): string {
  return definition.colors
    .map(({ id, hex, rgb }) => `${id}\u0000${hex}\u0000${rgb.r},${rgb.g},${rgb.b}`)
    .join('\u0001');
}

export function compilePalette(definition: PaletteDefinition): CompiledPalette {
  if (!definition.id.trim() || !definition.version.trim()) {
    throw new PaletteError(
      'INVALID_PALETTE_ID',
      'Palette id and version must be non-empty strings.',
    );
  }
  if (definition.colors.length === 0) {
    throw new PaletteError('EMPTY_PALETTE', 'Palette must contain at least one color.');
  }

  const cacheKey = `${definition.id}@${definition.version}`;
  const fingerprint = paletteFingerprint(definition);
  const cached = compiledPaletteCache.get(cacheKey);
  if (cached) {
    if (cached.fingerprint !== fingerprint) {
      throw new PaletteError(
        'PALETTE_VERSION_CONFLICT',
        `Palette ${cacheKey} changed without a version change.`,
      );
    }
    return cached.palette;
  }

  const seenIds = new Set<string>();
  const colors = definition.colors.map((color) => {
    if (seenIds.has(color.id)) {
      throw new PaletteError(
        'DUPLICATE_COLOR_ID',
        `Palette color id ${color.id} is duplicated.`,
      );
    }
    seenIds.add(color.id);
    return Object.freeze({ ...color, lab: rgbToLab(color.rgb) });
  });

  const palette = Object.freeze({
    id: definition.id,
    version: definition.version,
    colors: Object.freeze(colors),
  });
  compiledPaletteCache.set(cacheKey, { fingerprint, palette });
  return palette;
}

export function clearCompiledPaletteCache(): void {
  compiledPaletteCache.clear();
}
