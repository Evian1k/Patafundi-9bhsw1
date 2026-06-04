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
