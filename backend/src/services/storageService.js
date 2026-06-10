import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { config } from '../config.js';

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_DOC_MIMES = new Set([...ALLOWED_IMAGE_MIMES, 'application/pdf']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL = 900;

let s3Client = null;

function r2Configured() {
  return Boolean(
    config.storage.r2AccountId
    && config.storage.r2AccessKeyId
    && config.storage.r2SecretAccessKey
    && config.storage.r2Bucket,
  );
}

function getS3() {
  if (!r2Configured()) return null;
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.storage.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.storage.r2AccessKeyId,
        secretAccessKey: config.storage.r2SecretAccessKey,
      },
    });
  }
  return s3Client;
}

function isExecutableMime(mime, originalName = '') {
  const ext = path.extname(originalName).toLowerCase();
  const blocked = new Set(['.exe', '.bat', '.cmd', '.sh', '.php', '.js', '.html', '.svg']);
  return blocked.has(ext) || mime.includes('javascript') || mime.includes('svg');
}

export function validateUpload(file, { allowPdf = false, maxBytes = MAX_IMAGE_BYTES } = {}) {
  if (!file?.buffer?.length) throw Object.assign(new Error('File is required'), { status: 400 });
  const mime = String(file.mimetype || '').toLowerCase();
  const allowed = allowPdf ? ALLOWED_DOC_MIMES : ALLOWED_IMAGE_MIMES;
  if (!allowed.has(mime)) throw Object.assign(new Error('Unsupported file type'), { status: 400 });
  if (isExecutableMime(mime, file.originalname)) throw Object.assign(new Error('Executable files are not allowed'), { status: 400 });
  if (file.buffer.length > maxBytes) throw Object.assign(new Error(`File exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit`), { status: 400 });
  return mime;
}

/** Always output webp for photos; jpeg for thumbs */
async function optimizeImage(buffer, mime) {
  const image = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const main = await image
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
  const thumb = await sharp(main).resize(320, 320, { fit: 'cover' }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  const blurScore = await computeBlurScore(main);
  const perceptualHash = await computePerceptualHash(main);
  return {
    buffer: main,
    thumbBuffer: thumb,
    mime: 'image/webp',
    thumbMime: 'image/jpeg',
    width: meta.width || null,
    height: meta.height || null,
    blurScore,
    perceptualHash,
  };
}

export async function computePerceptualHash(buffer) {
  try {
    const { data } = await sharp(buffer).greyscale().resize(8, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    let bits = '';
    for (const px of data) bits += px >= avg ? '1' : '0';
    return bits;
  } catch {
    return null;
  }
}

async function computeBlurScore(buffer) {
  try {
    const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    let sum = 0;
    let count = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = Math.abs(4 * data[idx] - data[idx - 1] - data[idx + 1] - data[idx - w] - data[idx + w]);
        sum += lap;
        count++;
      }
    }
    return count ? Math.round((sum / count) * 100) / 100 : 0;
  } catch {
    return 0;
  }
}

export function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) if (hashA[i] !== hashB[i]) dist++;
  return dist;
}

export function hashSimilarityPercent(hashA, hashB) {
  const dist = hammingDistance(hashA, hashB);
  return Math.max(0, Math.min(100, Math.round((1 - dist / 64) * 100)));
}

async function localFallbackSave(key, buffer) {
  const full = path.join(process.cwd(), 'backend', 'uploads', key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return key;
}

async function putPrivateObject(key, buffer, mime) {
  const client = getS3();
  if (!client) {
    await localFallbackSave(key, buffer);
    return { r2Key: key };
  }
  await client.send(new PutObjectCommand({
    Bucket: config.storage.r2Bucket,
    Key: key,
    Body: buffer,
    ContentType: mime,
    CacheControl: 'private, no-store, max-age=0',
  }));
  return { r2Key: key };
}

export async function getObjectBuffer(r2Key) {
  const client = getS3();
  if (!client) {
    const full = path.join(process.cwd(), 'backend', 'uploads', r2Key);
    return fs.readFile(full);
  }
  const obj = await client.send(new GetObjectCommand({ Bucket: config.storage.r2Bucket, Key: r2Key }));
  return Buffer.from(await obj.Body.transformToByteArray());
}

export async function copyR2Object(sourceKey, destKey) {
  const client = getS3();
  if (!client) {
    const src = path.join(process.cwd(), 'backend', 'uploads', sourceKey);
    const dest = path.join(process.cwd(), 'backend', 'uploads', destKey);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    return destKey;
  }
  await client.send(new CopyObjectCommand({
    Bucket: config.storage.r2Bucket,
    CopySource: `${config.storage.r2Bucket}/${sourceKey}`,
    Key: destKey,
    MetadataDirective: 'REPLACE',
    CacheControl: 'public, max-age=31536000, immutable',
    ContentType: 'image/webp',
  }));
  return destKey;
}

/** Upload private file — returns r2_key only, never a public URL */
export async function uploadPrivateFile({ folder, file, allowPdf = false }) {
  const mime = validateUpload(file, { allowPdf, maxBytes: allowPdf ? MAX_DOC_BYTES : MAX_IMAGE_BYTES });
  let buffer = file.buffer;
  let width = null;
  let height = null;
  let outMime = mime;
  let thumbR2Key = null;
  let blurScore = null;
  let perceptualHash = null;

  if (ALLOWED_IMAGE_MIMES.has(mime)) {
    const optimized = await optimizeImage(buffer, mime);
    buffer = optimized.buffer;
    width = optimized.width;
    height = optimized.height;
    outMime = optimized.mime;
    blurScore = optimized.blurScore;
    perceptualHash = optimized.perceptualHash;
  }

  const id = crypto.randomUUID();
  const ext = outMime === 'application/pdf' ? 'pdf' : 'webp';
  const r2Key = `${folder}/${id}.${ext}`;
  await putPrivateObject(r2Key, buffer, outMime);

  if (ALLOWED_IMAGE_MIMES.has(mime)) {
    const thumbKey = `${folder}/thumbs/${id}.jpg`;
    await putPrivateObject(thumbKey, (await optimizeImage(file.buffer, mime)).thumbBuffer, 'image/jpeg');
    thumbR2Key = thumbKey;
  }

  return { r2Key, thumbR2Key, mimeType: outMime, fileSize: buffer.length, width, height, blurScore, perceptualHash };
}

/** Upload public profile photo (still served via signed URL or CDN path) */
export async function uploadProfilePhoto({ userId, buffer }) {
  const optimized = await optimizeImage(buffer, 'image/jpeg');
  const id = crypto.randomUUID();
  const r2Key = `profiles/public/${userId}/${id}.webp`;
  const thumbKey = `profiles/public/${userId}/thumbs/${id}.jpg`;
  await putPrivateObject(r2Key, optimized.buffer, 'image/webp');
  await putPrivateObject(thumbKey, optimized.thumbBuffer, 'image/jpeg');
  return { r2Key, thumbR2Key: thumbKey, mimeType: 'image/webp' };
}

/** Generate signed URL — NEVER expose raw R2 endpoint to clients in production */
export async function getSignedAccessUrl(r2Key, expiresIn = SIGNED_URL_TTL) {
  if (!r2Key) return null;
  const client = getS3();
  if (!client) {
    return `/api/storage/local/${encodeURIComponent(r2Key)}`;
  }
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.storage.r2Bucket, Key: r2Key }),
    { expiresIn },
  );
}

export async function getSignedThumbUrl(thumbR2Key, mainR2Key, expiresIn = SIGNED_URL_TTL) {
  const key = thumbR2Key || mainR2Key;
  return getSignedAccessUrl(key, expiresIn);
}

export function storageStatus() {
  return {
    provider: r2Configured() ? 'cloudflare_r2' : 'local_fallback',
    r2Configured: r2Configured(),
    signedUrlOnly: true,
    signedUrlTtlSeconds: SIGNED_URL_TTL,
  };
}
