/**
 * Build optimized brand assets from a source image.
 * Place your logo at public/logo-source.jpg (or .png) then run: npm run setup:logo
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

const SOURCE_CANDIDATES = [
  'logo-source.jpg',
  'logo-source.jpeg',
  'logo-source.png',
  'logo-source.webp',
];

function findSource() {
  for (const name of SOURCE_CANDIDATES) {
    const full = path.join(publicDir, name);
    if (fs.existsSync(full) && fs.statSync(full).size > 0) return full;
  }
  return null;
}

async function writePng(input, outPath, size, options = {}) {
  await sharp(input)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true, quality: 80, ...options })
    .toFile(outPath);
}

async function main() {
  const source = findSource();
  if (!source) {
    console.error('No logo source found. Save your image as public/logo-source.jpg or .png');
    process.exit(1);
  }

  console.log(`Processing ${path.basename(source)}…`);

  const pipeline = sharp(source).ensureAlpha();

  await pipeline
    .clone()
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, quality: 85 })
    .toFile(path.join(publicDir, 'logo.png'));

  await writePng(source, path.join(publicDir, 'favicon.png'), 32);
  await writePng(source, path.join(publicDir, 'apple-touch-icon.png'), 180);
  await writePng(source, path.join(publicDir, 'favicon-192.png'), 192);

  // Multi-size ICO (16 + 32)
  const icon16 = await sharp(source)
    .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const icon32 = await sharp(source)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp(icon32).toFile(path.join(publicDir, 'favicon.ico'));

  const stats = fs.statSync(path.join(publicDir, 'logo.png'));
  console.log(`✓ public/logo.png (${Math.round(stats.size / 1024)} KB)`);
  console.log('✓ public/favicon.png, favicon.ico, apple-touch-icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
