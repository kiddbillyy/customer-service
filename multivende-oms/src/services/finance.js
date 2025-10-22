// src/services/finance.js
import axios from 'axios';
import { logger } from '../utils/logger.js';

const FIN_BASE_URL   = process.env.FIN_BASE_URL || 'https://catalogomimbral.loclx.io';
const FIN_API_KEY    = process.env.FIN_API_KEY || ''; // opcional
const FIN_PATH       = process.env.FIN_PAYMENTS_PATH || '/api/finance/payments';

/**
 * Envía el pago a Finance. Espera un payload ya formateado
 * (usa toFinanceFormat(mvOrder, { u_ref1 }) desde transform.js).
 */
export async function postFinancePayment(finPayload) {
  const url = `${FIN_BASE_URL}${FIN_PATH}`;

  try {
    const res = await axios.post(url, finPayload, {
      headers: {
        'content-type': 'application/json',
        ...(FIN_API_KEY ? { 'x-api-key': FIN_API_KEY } : {})
      },
      timeout: 20000
    });

    logger?.info(
      { url, orderId: finPayload?.orderId, idempotencyKey: finPayload?.idempotencyKey },
      '[FIN] Pago enviado'
    );
    return res.data;
  } catch (err) {
    const status = err?.response?.status;
    const body   = err?.response?.data;
    const msg    = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`FIN ${status ?? ''}: ${msg || err.message}`);
  }
}
