/**
 * Build optimized brand assets from public/logo-source.png (or .jpg).
 * Run: npm run setup:logo
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

const SOURCE_CANDIDATES = [
  'logo-source.png',
  'logo-source.jpg',
  'logo-source.jpeg',
  'logo-source.webp',
];

function findSource() {
  for (const name of SOURCE_CANDIDATES) {
    const full = path.join(publicDir, name);
    if (fs.existsSync(full) && fs.statSync(full).size > 0) return full;
  }
  return null;
}

async function main() {
  const source = findSource();
  if (!source) {
    console.error('No logo source found. Save your image as public/logo-source.png');
    process.exit(1);
  }

  console.log(`Processing ${path.basename(source)}…`);
  const meta = await sharp(source).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 512;

  // Full horizontal logo — used by BrandLogo (navbar, auth, footer)
  await sharp(source)
    .resize({ height: 96, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, quality: 88 })
    .toFile(path.join(publicDir, 'logo-full.png'));

  await sharp(source)
    .resize({ height: 64, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, quality: 88 })
    .toFile(path.join(publicDir, 'logo.png'));

  // Icon mark — left crop for compact headers + favicon
  const iconWidth = Math.min(width, Math.max(Math.round(width * 0.22), 120));
  await sharp(source)
    .extract({ left: 0, top: 0, width: iconWidth, height })
    .resize(256, 256, { fit: 'contain', background: { r: 10, g: 14, b: 26, alpha: 1 } })
    .png({ compressionLevel: 9, quality: 88 })
    .toFile(path.join(publicDir, 'logo-icon.png'));

  for (const [name, size] of [
    ['favicon.png', 32],
    ['apple-touch-icon.png', 180],
    ['favicon-192.png', 192],
  ]) {
    await sharp(path.join(publicDir, 'logo-icon.png'))
      .resize(size, size, { fit: 'contain', background: { r: 10, g: 14, b: 26, alpha: 1 } })
      .png({ compressionLevel: 9, palette: size <= 32, quality: 80 })
      .toFile(path.join(publicDir, name));
  }

  await sharp(path.join(publicDir, 'favicon.png')).toFile(path.join(publicDir, 'favicon.ico'));

  const stats = fs.statSync(path.join(publicDir, 'logo-full.png'));
  console.log(`✓ public/logo-full.png (${Math.round(stats.size / 1024)} KB)`);
  console.log('✓ public/logo.png, logo-icon.png, favicon assets');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
