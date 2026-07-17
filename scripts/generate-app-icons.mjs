import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const source = await readFile(new URL('../public/icon.svg', import.meta.url));
const manifestUrl = new URL('../public/manifest.json', import.meta.url);
const check = process.argv.includes('--check');
const sizes = [192, 256, 384, 512];

for (const size of sizes) {
  const output = await sharp(source)
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const path = `${publicDirectory}icon-${size}x${size}.png`;
  if (check) {
    const existing = await readFile(path).catch(() => null);
    if (!existing?.equals(output)) {
      throw new Error(`PWA icon is missing or stale: public/icon-${size}x${size}.png`);
    }
  } else {
    await writeFile(path, output);
  }
}

const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const manifestAssets = [...(manifest.icons ?? []), ...(manifest.screenshots ?? [])];

for (const asset of manifestAssets) {
  if (typeof asset?.src !== 'string' || !asset.src.startsWith('/')) {
    throw new Error('PWA manifest assets must use root-relative src paths.');
  }

  const relativePath = decodeURIComponent(asset.src.slice(1));
  if (
    relativePath.length === 0
    || relativePath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`PWA manifest asset path is invalid: ${asset.src}`);
  }

  const assetUrl = new URL(`../public/${relativePath}`, import.meta.url);
  const contents = await readFile(assetUrl).catch(() => null);
  if (!contents) {
    throw new Error(`PWA manifest asset is missing: public/${relativePath}`);
  }
}

console.log(
  `${check ? 'Verified' : 'Generated'} ${sizes.length} reproducible PWA icons and `
  + `${manifestAssets.length} manifest assets.`,
);
