// src/services/orderProcessor.js
import sql from 'mssql';
import { getPool } from '../db/connection.js';

const OMS_BASE_URL = process.env.OMS_BASE_URL;
const OMS_API_KEY  = process.env.OMS_API_KEY || '';

export async function processOrder({ id }) {
  if (!OMS_BASE_URL) throw new Error('OMS_BASE_URL no configurado');

  const pool = await getPool();

  // Trae todo lo que necesitamos para "completar" el payload
  const { recordset } = await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      SELECT TOP 1
        JSON_QUERY(omsPayload) AS omsPayloadJson,
        JSON_QUERY(rawData)    AS rawDataJson,
        ref_salesChannelId,
        source
      FROM dbo.Orders
      WHERE id = @id
    `);

  const row = recordset?.[0];
  if (!row) throw new Error(`Order ${id} no encontrada`);

  const payload = row.omsPayloadJson ? JSON.parse(row.omsPayloadJson) : {};
  const raw     = row.rawDataJson    ? JSON.parse(row.rawDataJson)    : {};

  // ---- Asegurar u_ref1 ------------------------------------------------------
  // Intenta leerlo del propio payload; si no existe, deriva de rawData.
  if (!payload.u_ref1) {
    // 1) Falabella suele tener externalCustomerOrderNumber o OrderNumber
    const fromCheckoutLink = raw?.CheckoutLink || raw?.CheckoutLinks?.[0] || {};
    payload.u_ref1 =
      fromCheckoutLink?.externalCustomerOrderNumber ||
      fromCheckoutLink?.externalOrderNumber ||
      fromCheckoutLink?.externalId ||
      raw?.Checkout?._id || // fallback ultra defensivo
      null;
  }
  if (!payload.u_ref1) {
    throw new Error(`Order ${id} no tiene u_ref1 en omsPayload ni rawData`);
  }

  // ---- Asegurar salesChannelReferenceId -------------------------------------
  // Prioridad: columna ref_salesChannelId -> raw.MarketplaceConnection._name -> raw.MarketplaceConnection.provider
  if (!payload.salesChannelReferenceId) {
    const mc = raw?.MarketplaceConnection || raw?.Checkout?.MarketplaceConnection || {};
    payload.salesChannelReferenceId =
      row.ref_salesChannelId ||
      mc._name ||
      mc.name ||
      mc.provider ||
      raw?.origin || // a veces guardas "fcom"
      null;
  }
  if (!payload.salesChannelReferenceId) {
    throw new Error(`Order ${id} sin salesChannelReferenceId (OMS lo requiere)`);
  }

  // (Opcional) Normaliza deliveryCompany, origin, etc. si tu OMS los exige.

  // ---- Enviar al OMS (misma ruta de alta) -----------------------------------
  const res = await fetch(`${OMS_BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(OMS_API_KEY ? { 'x-api-key': OMS_API_KEY } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OMS ${res.status}: ${text || 'falló reenvío'}`);
  }

  return res.json();
}
