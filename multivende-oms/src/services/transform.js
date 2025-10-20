// src/services/transform.js
export function toOmsFormat(mvOrder) {
  const client = mvOrder?.Client || {};
  const addr   = mvOrder?.BillingAddress?.[0] || mvOrder?.ShippingAddress || {};

  const isCorporate = String(client?.type || '').toLowerCase() === 'company';
  const vendedor = (mvOrder?.origin || '').toLowerCase();

  const sellerCode = vendedor === 'mercadolibre' ? '355' : vendedor === 'fcom' ? '371' : '';
  const canalVenta = vendedor === 'mercadolibre' ? 'MER-002' : vendedor === 'fcom' ? 'FAL-001' : null;
  // 🚚 Total de envíos desde externalContent.shipmentPayments (si existe)
  const shipmentPayments =
    mvOrder?.CheckoutLinks?.[0]?.externalContent?.shipmentPayments;

  const shippingAmount = Array.isArray(shipmentPayments)
    ? shipmentPayments.reduce((acc, sp) => acc + Number(sp?.amount || 0), 0)
    : 0;

  // ---- Ítems base (productos) ----
  const baseItems = (mvOrder?.CheckoutItems || []).map((it, idx) => {
    const pv  = it?.ProductVersion || {};
    const prd = pv?.Product || {};
    return {
      itemIndex: idx,
      uniqueId: it?._id || '',
      itemcode: pv?.code || prd?.code || '',
      dscription: prd?.name || '',
      quantity: it?.count || 1,
      priceAfterVAT: it?.gross ?? it?.total ?? 0,
      codebars: prd?.code || '',
      imageUrl: '',
      whscode: "03",
      categoryLeafId: null,
      categoryLeafName: null,
      categoryPathIds: null,
      categoryPathNames: null,
      seller: sellerCode,
      CostingCode: "CC",
      CostingCode2: "FERR",
      TaxCode: "IVA",
    };
  });

  // 🚚 Agregar envío como ítem al final (si hay monto > 0)
  if (shippingAmount > 0) {
    baseItems.push({
      itemIndex: baseItems.length,
      uniqueId: `SHIP-${mvOrder?.code || mvOrder?._id || Date.now()}`,
      itemcode: "701001008",
      dscription: "Flete",
      quantity: 1,
      priceAfterVAT: Number(shippingAmount) || 0,
      codebars: "701001008",
      imageUrl: "",
      whscode: "03",
      categoryLeafId: null,
      categoryLeafName: null,
      categoryPathIds: null,
      categoryPathNames: null,
      seller: sellerCode,
      CostingCode: "CC",
      CostingCode2: "FERR",
      TaxCode: "IVA", // ajusta si tu regla de impuestos para flete es distinta
    });
  }

  return {
    salesChannelReferenceId:canalVenta,
    u_ref1: mvOrder?.CheckoutLinks?.[0]?.externalOrderNumber || mvOrder?.code,
    orderStatusCode: 'Pedido Nuevo',
    doctotalsy: mvOrder?.CheckoutLinks?.externalContent?.total_amount_with_shipping || 0,
    valuesInCents: false,
    deliveryDate:
      mvOrder?.DeliveryOrderInCheckouts?.[0]?.DeliveryOrder?.promisedDeliveryDate ||
      mvOrder?.soldAt ||
      mvOrder?.createdAt,
    origin: mvOrder?.origin || 'web',
    hostname: 'mimbral.cl',
    shippingEstimate: '3db',
    deliveryCompany: mvOrder?.courierName || 'Bluexpress',
    seller: sellerCode,
    isReservationInvoice: "1",

    fulfillment: {
      firstName: client?.name || addr?.name || '',
      lastName: client?.lastName || '',
      email: client?.email || '',
      phone: client?.phoneNumber || '',
      isCorporate,
      currencyCode: mvOrder?.Currency?.PlatformCurrency?.code || 'CLP',
      documentType: client?.documentType || 'RUT',
      document: client?.taxId || '',
      addressType: 'residential',
      receiverName:
      addr?.receiverName || `${client?.name || ''} ${client?.lastName || ''}`.trim(),
      street: addr?.street || addr?.address_1 || '',
      number: addr?.number || addr?.address_2 || '',
      neighborhood: addr?.neighborhood || '',
      city: addr?.city || '',
      state: addr?.state || '',
      country: addr?.country || 'CL',
      postalCode: addr?.zipCode || '',
      referenceAddress: addr?.description || '',
      notes: mvOrder?.comment || ''
    },

    items: baseItems,
  };
}

export function toFinanceFormat(mvOrder, { u_ref1 }) {
  const pay = mvOrder?.CheckoutPayments?.[0];
  const authCode = pay?.authorizationCode || pay?.code || '';
  const installments = Number(pay?.installments || 0);
  const paymentSystem = (pay?.PaymentMethod?.codeTranslated || '')
    .toUpperCase()
    .replace(/\s+/g, '_') || 'UNKNOWN';
  const last4 = pay?.cardNumber || pay?.last4 || '';

  return {
    orderId: u_ref1 || mvOrder?.code || mvOrder?.CheckoutLinks?.[0]?.externalOrderNumber,
    idempotencyKey: `pay-${u_ref1 || mvOrder?.code}-01`,
    payments: {
      acquirer: 'Transbank',
      message: pay?.paymentStatus === 'completed' ? 'Aprobado' : (pay?.paymentStatus || 'Desconocido'),
      installments,
      tid: authCode ? `TBK-${authCode}` : '',
      last4: String(last4),
      valueCents: Math.round(Number(mvOrder?.gross ?? mvOrder?.total ?? 0)) * 1,
      paymentSystem,
      paymentSystemName: pay?.PaymentMethod?.codeTranslated || 'N/A',
    }
  };
}
