// src/services/finance.js
import axios from 'axios';

const baseURL = process.env.FIN_BASE_URL || 'http://192.168.0.102:5012';
const API_KEY = process.env.FIN_API_KEY || ''; // opcional

export async function postPayment(finPayload) {
  const url = `${baseURL}/api/finance/payments`;
  const { data } = await axios.post(url, finPayload, {
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'x-api-key': API_KEY } : {})
    },
    timeout: 20000
    
  });
  console.log("url post finance:"+url+ " body: "+finPayload[0])
  return data;
  
}

/**
 * Construye el payload para Finance a partir del checkout Multivende.
 * - orderId: usamos el uRef1 (externalOrderNumber) si existe; de lo contrario, fallback.
 * - idempotencyKey: determinista para evitar duplicados ("pay-<uRef1>-01").
 */
export function toFinancePayload(mvOrder, { orderIdForFinance }) {
  // Intentamos mapear info de pago con tolerancia a estructuras distintas
  const vendedor = (mvOrder?.origin || '').toLowerCase();
  const pay =
    mvOrder?.CheckoutLinks?.externalContent?.total_amount_with_shipping ||
    mvOrder?.totalPayment
    {};
  
  const tarjetaPago = vendedor === 'mercadolibre' ? 'MercadoPago' :vendedor === 'fcom' ? 'Falabella' :'';
  

  /*const centsFrom = (val) => {
    if (val == null) return null;
    const n = Number(val);
    if (!isFinite(n)) return null;
    // si parece venir en pesos, pásalo a centavos
    return n >= 1e4 ? Math.round(n) : Math.round(n * 100);
  };*/

  /*const valueCents =
    centsFrom(pay.amountPaid) ?? 0;*/

  //const last4 =pay.cardNumber || '1111';
    
  return {
    orderId: orderIdForFinance,
    idempotencyKey: `pay-${orderIdForFinance}-01`,
    payments: {
      acquirer: tarjetaPago,
      message:  'Aprobado',
      installments: Number(pay.installments || 0),
      //tid:     pay.tid || pay.transactionId || pay.authorizationCode || '1111',
      tid:'1111',
      last4:'1111',
      valueCents:pay,
      paymentSystem:     pay.paymentSystem     || pay.method || 'OTHER',
      paymentSystemName: pay.paymentSystemName || pay.methodName || pay.method || 'Other'
    }
  };
}
