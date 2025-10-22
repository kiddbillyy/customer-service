// src/routes/webhooks.js
import { Router } from 'express';

import {
  persistOrder,
  persistStatuses,
  persistReceipt,
  setSent,
  setError,
  findByURef1,
  saveOmsPayload, // ⬅️ aquí mismo
} from '../models/repository.js';
import { seedWithAuthCode, upsertAuthInDB } from '../services/multivendeApi.js';

import { toOmsFormat } from '../services/transform.js';
import { postToOms } from '../services/oms.js';
import { getCheckout } from '../services/multivendeApi.js';

//import { postPayment, toFinancePayload } from '../services/finance.js';
import { postFinancePayment } from '../services/finance.js';


import { toFinanceFormat } from '../services/transform.js';
import { setPaymentSent, setPaymentError } from '../models/repository.js';

// Endpoints internos ya existentes
import {
  receiveMultivende,
  retryByURef1,
  getByURef1,
} from '../controllers/mvWebhookController.js';

export const router = Router();

/* =========================================================
   1️⃣ Webhook directo desde Multivende
   - Acepta dos paths por compatibilidad:
     POST /multivende/webhook   (ruta nueva, recomendada)
     POST /mv/webhook           (alias, por si quedó configurada)
   ========================================================= */
async function webhookHandler(req, res) {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[MV WEBHOOK] ${req.method} desde ${ip}`);

    const body = req.body || {};
    console.log('--- HEADERS ---\n', req.headers);
    console.log('--- QUERY   ---\n', req.query);
    console.log('--- BODY    ---\n', body);

    const resource = body.resource;
    const CheckoutId = body.CheckoutId;

    // ✅ Solo procesar eventos de "checkouts" con CheckoutId
    if (resource !== 'checkouts' || !CheckoutId) {
      console.log('[WEBHOOK] ignorado: resource!=checkouts o sin CheckoutId');
      return res.status(200).send('ignored');
    }

    console.log(`[WEBHOOK] CheckoutId: ${CheckoutId}`);

   // (Opcional) Traer el detalle completo del checkout desde Multivende
        let mvOrder = body;
        if (String(process.env.MV_FETCH_DETAILS).toLowerCase() === 'true') {
        try {
            mvOrder = await getCheckout(CheckoutId);
            if (!mvOrder) {
            console.log(`[WARN] Checkout ${CheckoutId} no encontrado (404).`);
            return res.status(200).send('ok');
            }

            // ✅ Validar fecha del pedido
            if (mvOrder?.createdAt) {
            const createdAt = new Date(mvOrder.createdAt);
            const now = new Date();
            const diffHours = (now - createdAt) / (1000 * 60 * 60);

            if (diffHours > 24) {
                console.log(
                `[SKIP] CheckoutId ${CheckoutId} creado hace ${diffHours.toFixed(
                    1
                )}h (${mvOrder.createdAt}) — ignorado por ser anterior a hoy`
                );
                return res.status(202).send('ignored: old order');
            }
            }
        } catch (err) {
            console.error('[ERR getCheckout]', err?.response?.status, err?.message);
            // seguimos con el body básico para no perder el evento
        }
        }


    // Derivar número externo (u_ref1)
    const link = mvOrder?.CheckoutLinks?.[0] || {};
    const uRef1 = link.externalOrderNumber || mvOrder?.code || null;

    // Idempotencia: si ya fue enviado correctamente, ignorar
    if (uRef1) {
      const already = await findByURef1(uRef1);
      if (already && already.statusIntegration === 'sent') {
        console.log(`[IDEMP] ya procesado u_ref1=${uRef1} (orderId=${already.id})`);
        return res.status(202).json({ ok: true, id: already.id, msg: 'already sent' });
      }
    }

    // Persistir en base MULTIVENDE-OMS
    const orderId = await persistOrder(mvOrder);
    await persistStatuses(orderId, mvOrder);
    await persistReceipt(orderId, mvOrder);

    // Transformar al formato OMS
    const payload = toOmsFormat(mvOrder);
    console.log('[MV → OMS] Payload:', JSON.stringify(payload, null, 2));
      // 🔐 Guardar el payload que enviaremos al OMS en la misma orden
      try {
        await saveOmsPayload(orderId, payload);
        console.log(`[DB] omsPayload guardado para orderId ${orderId}`);
      } catch (e) {
        console.error('[DB] Error guardando omsPayload:', e?.message || e);
      }


    // Enviar al OMS-SERVICE
    try {
      const { orderId: omsId } = await postToOms(payload);
      await setSent(orderId, omsId);
      console.log(`[OK] Pedido ${uRef1 || CheckoutId} enviado al OMS (${omsId})`);
      //return res.status(202).json({ ok: true, orderId, omsId });

        try {
          const finOrderId = uRef1 || CheckoutId || String(omsId);
         const finPayload = toFinanceFormat(mvOrder, { orderIdForFinance: payload.u_ref1 });

          console.log('[OMS → FINANCE] Payload:', JSON.stringify(finPayload, null, 2));
          const finResp = await postFinancePayment(finPayload);

          console.log('[OK] Pago registrado en Finance:', finResp);
          await setPaymentSent(orderId); // ✅ marca como enviado
        } catch (e) {
          console.error('[FINANCE POST ERROR]', e?.response?.status, e?.response?.data || e.message);
          await setPaymentError(orderId, e?.message || String(e)); // ✅ marca error de pago
        }

        return res.status(202).json({ ok: true, orderId, omsId });
    } catch (err) {
      console.error('[OMS POST ERROR]', err?.response?.status, err?.response?.data || err.message);
      await setError(orderId, err.message);
      return res.status(202).json({ ok: false, orderId, error: err.message });
    }
  } catch (err) {
    console.error('[WEBHOOK FATAL]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// Ruta nueva recomendada
router.post('/webhook', webhookHandler);
// Alias compatibilidad con configuración antigua
//router.post('/mv/webhook', webhookHandler);

/* =========================================================
   2️⃣ Endpoints internos (simulador / retry / consulta)
   ========================================================= */
router.post('/webhooks/order', receiveMultivende); // simulador
router.post('/orders/:uRef1/retry', retryByURef1); // reintentos
router.get('/orders/:uRef1', getByURef1);          // consulta rápida


/* =========================================================
   0️⃣ Endpoints de OAuth (sembrado/seed)
   ========================================================= */
router.post('/oauth/seed', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== (process.env.REFRESH_ADMIN_KEY || '')) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { code, accessToken, refreshToken, expiresAt } = req.body || {};

    // Opción A: con authorization_code (recomendado)
    if (code) {
      const info = await seedWithAuthCode(code);
      return res.status(200).json({ ok: true, seeded: 'auth_code', ...info });
    }

    // Opción B: sembrar tokens directamente (menos común)
    if (accessToken) {
      await upsertAuthInDB({
        accessToken: String(accessToken).replace(/^Bearer\s+/i, ''),
        refreshToken: refreshToken || null,
        expiresAt: expiresAt || null,
        merchantId: null,
      });
      return res.status(200).json({ ok: true, seeded: 'tokens' });
    }

    return res.status(400).json({ ok: false, error: 'missing code or accessToken' });
  } catch (e) {
    return res.status(422).json({ ok: false, error: e?.response?.data || e.message });
  }
});
export default router;
