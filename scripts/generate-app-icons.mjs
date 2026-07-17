import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const source = await readFile(new URL('../public/icon.svg', import.meta.url));
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

console.log(`${check ? 'Verified' : 'Generated'} ${sizes.length} reproducible PWA icons from public/icon.svg.`);
