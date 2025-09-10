// helpers para tomar campos sin romper si faltan
const pick = (obj, path, dflt=null) =>
  path.split('.').reduce((o,k)=> (o && o[k] != null ? o[k] : dflt), obj);

function normalizePhone(p){ return p ? String(p).replace(/\s+/g,' ').trim() : null; }


function computeTotals(vtex) {
  const orderValue = Number.isFinite(vtex?.value) ? vtex.value : null;

  return {
    doctotalsy: orderValue,
    valuesInCents: true,
  };
}

function mapFulfillment(vtex) {
  const client = vtex?.clientProfileData || {};
  const addr   = vtex?.shippingData?.address || {};
  const currencyCode = vtex?.storePreferencesData?.currencyCode || 'CLP';

  const isCorporate = client.isCorporate === true || client.isCorporate === 1 || client.isCorporate === '1';

  return {
    firstName: client.firstName || null,
    lastName : client.lastName || null,
    email    : client.email || null,
    phone    : normalizePhone(client.phone || null),
    isCorporate, 
    currencyCode,
    documentType: client.documentType || 'RUT',
    document: isCorporate
      ? client.corporateDocument || null
      : client.document || null,
    addressType: addr.addressType ,
    receiverName:addr.receiverName ||null,
    street: addr.street || null,
    number: addr.number || null,
    neighborhood: addr.neighborhood || null,
    city: addr.city || null,
    state: addr.state || null,
    country: addr.country || 'CL',
    postalCode: addr.postalCode || null,
    referenceAddress: addr.reference || null, 
    notes: null, 
}
};

function mapShipping(vtex) {
  const li = Array.isArray(vtex?.shippingData?.logisticsInfo) ? vtex.shippingData.logisticsInfo : [];

  const first = li.find(x => x?.selectedSla) || li[0] || {};
  const selected = (first?.slas || []).find(s => s?.name === first?.selectedSla) || first?.slas?.[0] || {};
  const shippingEstimate = selected?.shippingEstimate || null;
  const deliveryCompany = selected?.name || selected?.courierName || null;
  const deliveryDate = selected?.shippingEstimateDate  || null;

  return { shippingEstimate, deliveryCompany, deliveryDate };
}

const normalizeCategoryPath = (raw) => {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^\d/]/g, "/").replace(/\/+/g, "/");
  if (!cleaned.replace(/\//g, "")) return null;
  const withLeading = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  const withTrailing = withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
  return withTrailing;
};

const splitIds = (path) => (path ? path.split("/").filter(Boolean) : []);

function mapItems(vtex) {
  const items = Array.isArray(vtex?.items) ? vtex.items : [];


  return items.map((it, idx) => {
    const rawPath =
      it?.productCategoryIds ??
      it?.additionalInfo?.categoriesIds ??
      it?.categoryPathIds ??
      null;

    const categoryPathIds = normalizeCategoryPath(rawPath);
    const ids = splitIds(categoryPathIds);

    const productCategories = it?.productCategories || null;


    const categoryPathNames = productCategories
      ? ids.map((id) => productCategories[id]).filter(Boolean).join(" > ")
      : null;

    const firstId = ids.length ? ids[0] : null;
    const categoryLeafId = firstId ? Number(firstId) : null;
    const categoryLeafName = ((firstId && productCategories) ? productCategories[firstId] : undefined) ?? it?.categoryLeafName ?? null;
    return {
      itemIndex: idx,
      uniqueId: it?.uniqueId || null,
      itemcode: it?.refId || it?.id || null,
      dscription: it?.name || it?.skuName || null,
      quantity: Number(it?.quantity ?? 0),
      priceAfterVAT: Number(it?.sellingPrice ?? it?.price ?? 0),
      codebars: it?.ean || null,
      imageUrl: it?.imageUrl || null,

      // 👉 formato final para BD
      categoryLeafId,
      categoryLeafName,
      categoryPathIds,
      categoryPathNames,
    };
  });
}

exports.buildOmsPayload = (vtex, { orderId}) => {
  const { doctotalsy, valuesInCents } = computeTotals(vtex);
  const { shippingEstimate, deliveryCompany, deliveryDate } = mapShipping(vtex);

  return {
    salesChannelReferenceId: 'VTEX-001',                 
    u_ref1: orderId,                                     
    orderStatusCode: 'ready-for-handling',
    //orderStatusID: '1',                                  
    doctotalsy,
    valuesInCents,                                       // true → el OMS divide por 100
    deliveryDate: deliveryDate || null,                  
    origin: 'VTEX',
    hostname: 'mimbralb2c',
    shippingEstimate: shippingEstimate,         // fallback por si no viene
    deliveryCompany: deliveryCompany,    // fallback

    fulfillment: mapFulfillment(vtex),
    items: mapItems(vtex),
  };
};