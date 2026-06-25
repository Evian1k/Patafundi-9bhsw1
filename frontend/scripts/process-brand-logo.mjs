/**
 * Build PataFundi brand assets from public/logo-source.png
 * Run: npm run setup:logo  (also runs automatically via prebuild)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

const SOURCE_CANDIDATES = ['logo-source.png', 'logo-source.jpg', 'logo-source.jpeg'];

function findSource() {
  for (const name of SOURCE_CANDIDATES) {
    const full = path.join(publicDir, name);
    if (fs.existsSync(full) && fs.statSync(full).size > 0) return full;
  }
  return null;
}

/** Remove light gray/white checkerboard background → transparent PNG */
async function transparentLogo(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const isLight = r > 210 && g > 210 && b > 210;
    const isGray = Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 180;
    if (isLight || isGray) px[i + 3] = 0;
  }
  return sharp(Buffer.from(px), {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
}

async function writePng(pipeline, outPath, resize) {
  let img = pipeline;
  if (resize) img = img.resize(resize);
  await img.png({ compressionLevel: 9, quality: 90 }).toFile(outPath);
}

async function extractIcon(base, width, height) {
  const isHorizontal = width > height * 1.15;

  if (isHorizontal) {
    // Mascot sits on the left of the horizontal wordmark logo.
    const iconWidth = Math.round(width * 0.38);
    return base
      .clone()
      .extract({ left: 0, top: 0, width: Math.min(iconWidth, width), height })
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  // Legacy vertical logo — icon above text.
  const iconHeight = Math.round(height * 0.62);
  return base
    .clone()
    .extract({ left: 0, top: 0, width, height: Math.min(iconHeight, height) })
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function main() {
  const source = findSource();
  if (!source) {
    console.error('Save your logo as public/logo-source.png');
    process.exit(1);
  }

  console.log(`Processing ${path.basename(source)}…`);
  const base = await transparentLogo(source);
  const meta = await base.clone().metadata();
  const width = meta.width ?? 800;
  const height = meta.height ?? 800;

  // Full logo — auth, footer, press
  await writePng(base.clone(), path.join(publicDir, 'logo-full.png'), {
    height: 160,
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Navbar / general
  await writePng(base.clone(), path.join(publicDir, 'logo.png'), {
    height: 48,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const iconBuf = await extractIcon(base, width, height);
  await sharp(iconBuf).toFile(path.join(publicDir, 'logo-icon.png'));

  for (const [name, size] of [
    ['favicon.png', 32],
    ['favicon-192.png', 192],
    ['apple-touch-icon.png', 180],
  ]) {
    await sharp(iconBuf)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: size <= 32, quality: 85 })
      .toFile(path.join(publicDir, name));
  }

  await sharp(path.join(publicDir, 'favicon.png')).toFile(path.join(publicDir, 'favicon.ico'));

  console.log('✓ public/logo-full.png, logo.png, logo-icon.png');
  console.log('✓ public/favicon.png, favicon.ico, apple-touch-icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
