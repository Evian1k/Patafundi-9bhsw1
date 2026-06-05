export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function forbidden(message = 'Forbidden') {
  const error = new Error(message);
  error.status = 403;
  return error;
}

export function notFound(message = 'Not found') {
  const error = new Error(message);
  error.status = 404;
  return error;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUuid(value, label = 'id') {
  const id = String(value || '').trim();
  if (!UUID_RE.test(id)) throw badRequest(`Invalid ${label}`);
  return id;
}
