// src/domain/paymentRules.js
const paymentMap = require("./paymentMap");

/** case-insensitive key finder */
function findKeyInsensitive(obj, k) {
  if (k === undefined || k === null) return null;
  const low = String(k).trim().toLowerCase();
  return Object.keys(obj).find(pk => pk.toLowerCase() === low) || null;
}

/** Parsea acquirer tipo "VN - 3" (code y cuotas) o cae a message */
function parseAcquirer({ acquirer, message }) {
  const raw = (acquirer || message || "").trim();
  const [codeRaw, cuotasRaw] = raw.split("-").map(s => (s || "").trim());
  return { code: codeRaw || "", cuotasTxt: cuotasRaw || undefined, raw };
}

/** Cuotas efectivas: detectadas > 0; fallback installments; regla VC>12 => 1  */
function deriveCuotas({ detected, installments, rule }) {
  const parsed = Number.isFinite(+detected) ? parseInt(detected, 10) : null;
  const base = (parsed && parsed > 0) ? parsed : (Number(installments) || 1);
  if (rule?.isVC && base > 12) return 1;
  return base;
}

/** Últimos 4 dígitos: prioriza last4 válido; si no, sufijo de tid */
function deriveLast4({ last4, tid }) {
  if (last4 && /^\d{4}$/.test(String(last4))) return String(last4);
  const t = String(tid || "");
  return t.length >= 4 ? t.slice(-4) : "";
}

/** Selecciona regla de forma de pago según code/message/paymentSystemName */
function pickRule({ code, message, paymentSystemName }) {
  const key =
    findKeyInsensitive(paymentMap, code) ||
    findKeyInsensitive(paymentMap, message) ||
    findKeyInsensitive(paymentMap, paymentSystemName) ||
    "VN";
  return paymentMap[key] || paymentMap["VN"];
}

module.exports = {
  parseAcquirer,
  deriveCuotas,
  deriveLast4,
  pickRule,
  findKeyInsensitive
};
