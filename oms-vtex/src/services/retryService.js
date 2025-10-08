// src/services/retryService.js
const { fetchVtexOrder } = require('./vtexService');
const { buildOmsPayload, buildFinancePaymentDTO } = require('./omsMapper');
const { postOrderToOms } = require('./omsService');
const { postPaymentToFinance } = require('./financeService');

const {
  findOrderByCommerceId,
  updateOrderWithOmsId,
  setOrderErrorIntegration,
  markPaymentQueued,
  markPaymentOk,
  markPaymentFailed,
} = require('../models/orderRepo.models');

function getResponseData(resp) {
  if (!resp) return null;
  if (resp && typeof resp === 'object' && 'data' in resp && resp.data != null) return resp.data;
  return resp;
}
function extractOmsOrderOutcome(resp) {
  const data = getResponseData(resp);
  const id = data?.id ?? null;
  const message = data?.message ?? null;
  if (message === 'ORDER_EXISTS') return { status: 'ORDER_EXISTS', id: id != null ? String(id) : null, message };
  if (id != null) return { status: 'CREATED', id: String(id), message: message ?? null, itemsInserted: data?.itemsInserted ?? null };
  return { status: 'UNKNOWN', id: null, message };
}

async function retryIntegrationByCommerceId(commerceId, { forceOms = false, forceFinance = true } = {}) {
  const order = await findOrderByCommerceId(commerceId);
  if (!order) return { ok: false, code: 'ORDER_NOT_FOUND', commerceId };

  const orderPkId = Number(order.id);
  const result = {
    ok: true,
    commerceId,
    orderPkId,
    oms:     { attempted: false, status: 'SKIPPED', message: null, id: order.ref_omsOrderId || null },
    finance: { attempted: false, status: 'SKIPPED', message: null },
  };

  // 1) Traer detalle VTEX (necesario para ambos payloads)
  const vtexData = await fetchVtexOrder(commerceId);

  // 2) OMS
  const alreadyIntegratedOms = Number(order.statusIntegration) === 1 && order.ref_omsOrderId;
  if (!alreadyIntegratedOms || forceOms) {
    try {
      const payload = buildOmsPayload(vtexData, { orderId: commerceId });
      const response = await postOrderToOms(payload);
      const outcome  = extractOmsOrderOutcome(response);

      result.oms.attempted = true;
      result.oms.status    = outcome.status;
      result.oms.message   = outcome.message || null;
      result.oms.id        = outcome.id || result.oms.id;

      if (outcome.status === 'CREATED' && outcome.id) {
        await updateOrderWithOmsId(orderPkId, outcome.id);
        await setOrderErrorIntegration(orderPkId, null);
      } else if (outcome.status === 'ORDER_EXISTS') {
        await setOrderErrorIntegration(orderPkId, 'ORDER_EXISTS');
        if (outcome.id) await updateOrderWithOmsId(orderPkId, outcome.id);
      } else {
        await setOrderErrorIntegration(orderPkId, outcome.message ?? 'UNKNOWN_RESPONSE');
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'OMS_POST_FAILED';
      result.oms.attempted = true;
      result.oms.status    = 'ERROR';
      result.oms.message   = msg;
      await setOrderErrorIntegration(orderPkId, msg);
    }
  }

  // 3) Finanzas
  const alreadyIntegratedFin = Number(order.paymentStatusIntegration) === 1;
  if (forceFinance || !alreadyIntegratedFin) {
    try {
      const finPayload = buildFinancePaymentDTO(vtexData); 
      await markPaymentQueued(orderPkId);
      await postPaymentToFinance(finPayload);
      await markPaymentOk(orderPkId);
      result.finance.attempted = true;
      result.finance.status    = 'OK';
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'FINANCE_POST_FAILED';
      await markPaymentFailed(orderPkId, msg);
      result.finance.attempted = true;
      result.finance.status    = 'ERROR';
      result.finance.message   = msg;
    }
  }

  return result;
}

module.exports = { retryIntegrationByCommerceId };
