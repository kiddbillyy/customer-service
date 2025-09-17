// utils/errorUtils.js
const util = require("node:util");

function normalizeSlError(err) {
  // Estructura típica de Service Layer:
  // { error: { code: -2028, message: { lang: 'en-us', value: 'No matching records found (ODBC -2028) [Message ...]' } } }
  const httpStatus = err?.response?.status;
  const sl = err?.response?.data?.error;

  const code = sl?.code ?? err?.code ?? null;
  const slMessage = sl?.message?.value || sl?.message || null;

  return {
    httpStatus,
    code,
    // mensaje final legible
    message:
      slMessage ||
      (typeof err?.message === "string" ? err.message : null) ||
      // fallback: inspección profunda para no perder nada
      util.inspect(err, { depth: null, breakLength: 120 }),
    // crudo útil para depurar (pero serializado)
    raw:
      err?.response?.data
        ? JSON.parse(JSON.stringify(err.response.data)) // quita referencias circulares
        : (typeof err?.message === "object"
            ? JSON.parse(JSON.stringify(err.message))
            : (err?.stack || String(err))),
  };
}

module.exports = { normalizeSlError };
