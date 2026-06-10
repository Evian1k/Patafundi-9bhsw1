import multer from 'multer';

const memoryStorage = multer.memoryStorage();

export const imageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']);
    cb(allowed.has(file.mimetype) ? null : new Error('Unsupported upload type'), allowed.has(file.mimetype));
  },
});

export function mapMulterFile(file) {
  if (!file) return null;
  return {
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalname: file.originalname,
    size: file.size,
  };
}

export function mapMulterFiles(files) {
  return (files || []).map(mapMulterFile).filter(Boolean);
}
