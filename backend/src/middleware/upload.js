import multer from 'multer';

const memoryStorage = multer.memoryStorage();

const rawUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']);
    const ok = allowed.has(file.mimetype);
    cb(ok ? null : new Error('Unsupported upload type'), ok);
  },
});

/**
 * Convert a multer error into a 4xx response error.
 * Without this, multer rejections hit the global error handler with no
 * `.status` and become 500s — which leaks implementation detail and
 * breaks API contracts.
 */
function toHttpError(err) {
  if (!err) return null;
  if (err.code === 'LIMIT_FILE_SIZE') {
    return Object.assign(new Error('File exceeds 8MB limit'), { status: 413 });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return Object.assign(new Error('Too many files in a single request'), { status: 400 });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return Object.assign(new Error('Unexpected file field name'), { status: 400 });
  }
  // fileFilter rejection — Unsupported upload type / etc.
  return Object.assign(err, { status: err.status || 400 });
}

/** Wrap a multer method so errors become 4xx instead of 500. */
function wrap(method, ...args) {
  return (req, res, next) => {
    rawUpload[method](...args)(req, res, (err) => {
      next(toHttpError(err) || undefined);
    });
  };
}

export const imageUpload = {
  any: () => wrap('any'),
  single: (name) => wrap('single', name),
  array: (name, count) => wrap('array', name, count),
  fields: (layout) => wrap('fields', layout),
};

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
