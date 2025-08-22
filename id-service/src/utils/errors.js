// utils/errors.js
class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const ValidationError   = (msg = 'Solicitud inválida.', details) => new AppError(msg, 400, 'VALIDATION_ERROR', details);
const UnauthorizedError = (msg = 'No autorizado.') => new AppError(msg, 401, 'UNAUTHORIZED');
const ForbiddenError    = (msg = 'Acceso prohibido.') => new AppError(msg, 403, 'FORBIDDEN');
const NotFoundError     = (msg = 'Recurso no encontrado.') => new AppError(msg, 404, 'NOT_FOUND');

const sendError = (res, err) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {})
      }
    });
  }
  console.error('[UNHANDLED ERROR]', err);
  return res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Ocurrió un error interno. Inténtalo nuevamente.' }
  });
};

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  sendError,
};
