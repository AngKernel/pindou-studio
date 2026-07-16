import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'tests', 'fixtures', 'phase1');
const manifestPath = path.join(outputDirectory, 'manifest.json');
const checkOnly = process.argv.includes('--check');
const categories = [
  'anime-avatar',
  'human-portrait',
  'pet',
  'logo',
  'meme',
  'landscape',
  'transparent',
  'dark',
  'gradient',
  'low-resolution',
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const insideEllipse = (x, y, centerX, centerY, radiusX, radiusY) =>
  ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <= 1;

function fixtureDimensions(category, variant) {
  if (category === 'low-resolution') return [8 + variant * 4, 8 + variant * 4];
  if (category === 'landscape' || category === 'gradient') return [144, 96];
  return [96, 96];
}

function pixelFor(category, variant, x, y, width, height) {
  const nx = (x + 0.5) / width;
  const ny = (y + 0.5) / height;
  const px = nx * 2 - 1;
  const py = ny * 2 - 1;
  const accent = [[238, 88, 124], [62, 166, 224], [244, 174, 62]][variant];

  if (category === 'anime-avatar') {
    let color = [225 - variant * 12, 235, 250, 255];
    const face = insideEllipse(px, py, 0, 0.08, 0.53, 0.68);
    const hair = insideEllipse(px, py, 0, -0.18, 0.63, 0.67) && (py < -0.24 || Math.abs(px) > 0.45);
    if (face) color = [255, 220 - variant * 6, 194 - variant * 2, 255];
    if (hair) color = variant === 1 ? [35, 63, 112, 255] : [58 + variant * 28, 36, 63, 255];
    if (insideEllipse(px, py, -0.2, 0.05, 0.085, 0.12) || insideEllipse(px, py, 0.2, 0.05, 0.085, 0.12)) color = [24, 28, 45, 255];
    if (insideEllipse(px, py, -0.18, 0.03, 0.025, 0.04) || insideEllipse(px, py, 0.18, 0.03, 0.025, 0.04)) color = [245, 250, 255, 255];
    if (py > 0.36 && py < 0.42 && Math.abs(px) < 0.16) color = [188, 68, 87, 255];
    return color;
  }

  if (category === 'human-portrait') {
    let color = [76 + 55 * nx, 92 + 45 * ny, 112 + variant * 18, 255];
    const face = insideEllipse(px, py, 0, -0.05, 0.43, 0.58);
    const skinBase = [[224, 171, 132], [155, 103, 73], [242, 199, 165]][variant];
    if (face) {
      const shade = 0.78 + 0.26 * nx - 0.08 * Math.abs(py);
      color = [...skinBase.map((channel) => clamp(channel * shade)), 255];
    }
    if (insideEllipse(px, py, 0, -0.38, 0.49, 0.36) && (py < -0.31 || Math.abs(px) > 0.38)) color = [35 + variant * 15, 27 + variant * 9, 24 + variant * 8, 255];
    if (insideEllipse(px, py, -0.16, -0.08, 0.045, 0.032) || insideEllipse(px, py, 0.16, -0.08, 0.045, 0.032)) color = [31, 24, 22, 255];
    if (py > 0.25 && py < 0.29 && Math.abs(px) < 0.13) color = [126, 54, 58, 255];
    if (py > 0.5 && Math.abs(px) < 0.65 - py * 0.3) color = [...accent, 255];
    return color;
  }

  if (category === 'pet') {
    const fur = [[203, 139, 71], [116, 91, 70], [228, 226, 218]][variant];
    let color = [220, 234 - variant * 8, 224 + variant * 6, 255];
    const head = insideEllipse(px, py, 0, 0.08, 0.59, 0.54);
    const ears = py < -0.2 && (Math.abs(px) > 0.3) && Math.abs(px) < 0.7 && py > -0.9 + Math.abs(px) * 0.75;
    if (head || ears) color = [...fur, 255];
    if ((variant === 0 && px < -0.05 && py < 0.2 && head) || (variant === 1 && Math.abs(px) > 0.32 && head)) color = [...fur.map((channel) => clamp(channel * 0.7)), 255];
    if (insideEllipse(px, py, -0.21, 0, 0.075, 0.09) || insideEllipse(px, py, 0.21, 0, 0.075, 0.09)) color = [24, 31, 28, 255];
    if (insideEllipse(px, py, 0, 0.23, 0.1, 0.07)) color = [45, 31, 32, 255];
    if (py > 0.31 && py < 0.35 && Math.abs(px) < 0.18) color = [185, 77, 91, 255];
    return color;
  }

  if (category === 'logo') {
    let color = variant === 0 ? [247, 247, 242, 255] : [24, 29, 39, 255];
    const radius = Math.hypot(px, py);
    if (variant === 0 && radius > 0.31 && radius < 0.62) color = [...accent, 255];
    if (variant === 1 && Math.abs(px) + Math.abs(py) < 0.72) color = [...accent, 255];
    if (variant === 2 && ((x >> 3) + (y >> 3)) % 3 === 0) color = [...accent, 255];
    if (Math.abs(px) < 0.12 || Math.abs(py) < 0.12) color = variant === 0 ? [35, 40, 52, 255] : [248, 244, 225, 255];
    return color;
  }

  if (category === 'meme') {
    let color = [250, 245, 224, 255];
    if (insideEllipse(px, py, 0, 0.02, 0.67, 0.62)) color = [246, 204 - variant * 12, 119 + variant * 18, 255];
    if (insideEllipse(px, py, -0.23, -0.1, 0.11, 0.13) || insideEllipse(px, py, 0.23, -0.1, 0.11, 0.13)) color = [29, 32, 35, 255];
    if (variant === 1 && py > 0.14 && py < 0.42 && Math.abs(px) < 0.3) color = [245, 245, 250, 255];
    if (variant !== 1 && py > 0.25 && py < 0.32 && Math.abs(px) < 0.31) color = [72, 38, 38, 255];
    if (variant === 2 && Math.abs(px) > 0.5 && Math.abs(py) < 0.12) color = [85, 170, 238, 255];
    return color;
  }

  if (category === 'landscape') {
    let color = [70 + 90 * ny, 145 + 80 * ny, 220 + 25 * ny, 255];
    const ridge1 = 0.47 + 0.16 * Math.sin(nx * Math.PI * (2 + variant));
    const ridge2 = 0.63 + 0.11 * Math.sin(nx * Math.PI * 5 + variant);
    if (ny > ridge1) color = [73 + variant * 10, 92, 112 - variant * 8, 255];
    if (ny > ridge2) color = [54, 117 + variant * 15, 66, 255];
    if (insideEllipse(nx, ny, 0.77 - variant * 0.18, 0.21, 0.09, 0.13)) color = [255, 219, 104, 255];
    if (ny > 0.84) color = variant === 2 ? [42, 86, 130, 255] : [48, 92, 51, 255];
    return color;
  }

  if (category === 'transparent') {
    let color = [0, 0, 0, 0];
    const ring = Math.hypot(px, py);
    if (variant === 0 && ring > 0.25 && ring < 0.7) color = [...accent, 210];
    if (variant === 1 && Math.abs(px) + Math.abs(py) < 0.75) color = [...accent, 180 + Math.round(70 * nx)];
    if (variant === 2 && (insideEllipse(px, py, -0.24, 0, 0.42, 0.42) || insideEllipse(px, py, 0.24, 0, 0.42, 0.42))) color = [...accent, 225];
    return color;
  }

  if (category === 'dark') {
    let color = [5 + variant * 2, 7, 14 + variant * 4, 255];
    const wave = Math.abs(py - 0.22 * Math.sin(px * 8 + variant));
    if (wave < 0.08) color = variant === 0 ? [18, 46, 115, 255] : [61, 22, 105 + variant * 18, 255];
    if (insideEllipse(px, py, -0.35 + variant * 0.35, -0.28, 0.22, 0.22)) color = [20, 35 + variant * 9, 88 + variant * 13, 255];
    if (Math.abs(px) > 0.72 || Math.abs(py) > 0.72) color = [1, 2, 5, 255];
    return color;
  }

  if (category === 'gradient') {
    if (variant === 0) return [255 * nx, 255 * ny, 255 * (1 - nx), 255];
    if (variant === 1) return [255 * (1 - ny), 80 + 150 * nx, 40 + 190 * ny, 255];
    const radius = Math.min(1, Math.hypot(px, py));
    return [25 + 210 * radius, 30 + 120 * (1 - radius), 80 + 160 * nx, 255];
  }

  const cell = (x + y * width + variant) % (3 + variant);
  if (cell === 0) return [26, 35, 58, 255];
  if (cell === 1) return [...accent, 255];
  if (cell === 2) return [242, 231, 181, 255];
  return [76, 156, 91, 255];
}

function createRawFixture(category, variant) {
  const [width, height] = fixtureDimensions(category, variant);
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = pixelFor(category, variant, x, y, width, height);
      const offset = (y * width + x) * 4;
      data[offset] = clamp(color[0]);
      data[offset + 1] = clamp(color[1]);
      data[offset + 2] = clamp(color[2]);
      data[offset + 3] = clamp(color[3]);
    }
  }
  return { width, height, data };
}

async function encodeFixture(category, variant) {
  const raw = createRawFixture(category, variant);
  const format = category === 'transparent' || category === 'low-resolution'
    ? 'png'
    : ['jpg', 'png', 'webp'][variant];
  let pipeline = sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } });
  if (format === 'jpg') pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 90, chromaSubsampling: '4:4:4' });
  if (format === 'png') pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: false });
  if (format === 'webp') pipeline = pipeline.webp({ lossless: true });
  const bytes = await pipeline.toBuffer();
  return { ...raw, format, bytes };
}

async function generate() {
  await mkdir(outputDirectory, { recursive: true });
  const fixtures = [];
  for (const category of categories) {
    for (let variant = 0; variant < 3; variant += 1) {
      const fixture = await encodeFixture(category, variant);
      const id = `${category}-${variant + 1}`;
      const file = `${id}.${fixture.format}`;
      await writeFile(path.join(outputDirectory, file), fixture.bytes);
      fixtures.push({
        id,
        category,
        file,
        format: fixture.format === 'jpg' ? 'jpeg' : fixture.format,
        mimeType: fixture.format === 'jpg' ? 'image/jpeg' : `image/${fixture.format}`,
        width: fixture.width,
        height: fixture.height,
        sha256: sha256(fixture.bytes),
        sourcePixelSha256: sha256(fixture.data),
        sourceType: 'procedural',
        creator: 'Pindou Studio contributors',
        source: 'scripts/generate-phase1-fixtures.mjs',
        license: 'AGPL-3.0-only',
      });
    }
  }
  const manifest = {
    formatVersion: 1,
    generator: 'scripts/generate-phase1-fixtures.mjs',
    fixtureCount: fixtures.length,
    categories: Object.fromEntries(categories.map((category) => [category, 3])),
    provenance: 'All pixels are generated deterministically in this repository; no external images, fonts, or model outputs are used.',
    fixtures,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`Generated ${fixtures.length} phase 1 fixtures.\n`);
}

async function check() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.fixtureCount !== 30 || manifest.fixtures.length !== 30) throw new Error('Phase 1 fixture manifest must contain exactly 30 images.');
  for (const category of categories) {
    if (manifest.categories[category] !== 3) throw new Error(`Category ${category} must contain three fixtures.`);
  }
  for (const fixture of manifest.fixtures) {
    const bytes = await readFile(path.join(outputDirectory, fixture.file));
    if (sha256(bytes) !== fixture.sha256) throw new Error(`Fixture hash mismatch: ${fixture.file}`);
    const metadata = await sharp(bytes).metadata();
    if (metadata.width !== fixture.width || metadata.height !== fixture.height || metadata.format !== fixture.format) {
      throw new Error(`Fixture metadata mismatch: ${fixture.file}`);
    }
  }
  process.stdout.write('Verified 30 phase 1 fixtures and provenance hashes.\n');
}

await (checkOnly ? check() : generate());
