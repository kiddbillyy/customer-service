// services/pricingService.js
const axios = require('axios');
const https = require('https');

/* ---------------- ENV ---------------- */
const {
  // VTEX
  VTEX_ACCOUNT,
  VTEX_ENVIRONMENT,
  VTEX_APP_KEY,
  VTEX_APP_TOKEN,
  // SAP
  SAP_BASE_URL,
  SAP_COMPANY_DB,
  SAP_USERNAME,
  SAP_PASSWORD,
} = process.env;

/* ---------- VTEX helpers ---------- */
const vtexHeaders = {
  'X-VTEX-API-AppKey': VTEX_APP_KEY,
  'X-VTEX-API-AppToken': VTEX_APP_TOKEN,
};

const buildCatalogUrl = (path) =>
  `https://${VTEX_ACCOUNT}.${VTEX_ENVIRONMENT}.com.br${path}`;

const buildPricingUrl = (path) =>
  `https://api.vtex.com/${VTEX_ACCOUNT}.${VTEX_ENVIRONMENT}${path}`;

/* ---------- SAP helpers ---------- */
const sapHttpsAgent = new https.Agent({ rejectUnauthorized: false }); // certificados self-signed

const SapService = {
  /** Inicia sesión y devuelve la cookie `B1SESSION=…` */
  login: async () => {
    const { headers } = await axios.post(
      `${SAP_BASE_URL}/Login`,
      {
        CompanyDB: SAP_COMPANY_DB,
        UserName : SAP_USERNAME,
        Password : SAP_PASSWORD,
      },
      { httpsAgent: sapHttpsAgent }
    );

    const rawCookie = headers['set-cookie']?.find((c) => c.startsWith('B1SESSION'));
    if (!rawCookie) throw new Error('No se recibió cookie B1SESSION desde SAP');
    return rawCookie.split(';')[0]; // "B1SESSION=xxxx"
  },

  /** Actualiza el precio de un item en SAP */
  updateItemPrice: async (sessionCookie, { itemCode, priceList, price }) => {
    await axios.patch(
      `${SAP_BASE_URL}/Items('${itemCode}')`,
      {
        ItemPrices: [
          {
            PriceList: priceList, // p.ej. 4
            Price    : price,     // p.ej. 2000.0
            Currency : 'CLP',
          },
        ],
      },
      {
        headers: { Cookie: sessionCookie },
        httpsAgent: sapHttpsAgent,
      }
    );
  },
};

/* ---------- VTEX sub-service ---------- */
const VtexService = {
  /** Lee precio */
  getPriceByItemId: async (itemId) => {
    const { data } = await axios.get(
      buildPricingUrl(`/pricing/prices/${itemId}`),
      { headers: vtexHeaders }
    );
    return data;
  },

  /** Escribe precio */
  updatePrice: async ({ itemId, costPrice, basePrice, listPrice }) => {
    await axios.put(
      buildPricingUrl(`/pricing/prices/${itemId}`),
      { itemId, costPrice, basePrice, listPrice },
      { headers: vtexHeaders }
    );
  },

  /** Lee SKU por RefId desde Catálogo */
  getSkuByRefId: async (refId) => {
    const { data } = await axios.get(
      buildCatalogUrl(`/api/catalog/pvt/stockkeepingunit?RefId=${refId}`),
      { headers: vtexHeaders }
    );
    if (Array.isArray(data) && data.length === 0) return null;
    return Array.isArray(data) ? data[0] : data;
  },
};

/* ---------- EXPORTADO ---------- */
const PricingService = {
  /* === READ === */
  /** Une Catálogo (SKU) + Pricing */
  fetchSkuAndPrice: async (refId) => {
    const sku = await VtexService.getSkuByRefId(refId);
    if (!sku) return null;

    const price = await VtexService.getPriceByItemId(sku.Id);

    return { ...sku, price };
  },

  /* === WRITE === */
  /**
   * Actualiza precios en VTEX y SAP.
   * @param {{ vtex: {itemId,costPrice,basePrice,listPrice}, sap: {itemCode,priceList,price} }}
   */
  updatePrices: async ({ vtex, sap }) => {
    /* 1️⃣  VTEX */
    await VtexService.updatePrice(vtex);

    /* 2️⃣  SAP */
    const sessionCookie = await SapService.login();
    await SapService.updateItemPrice(sessionCookie, sap);

    return { message: 'Precios actualizados en VTEX y SAP', vtex, sap };
  },
};

module.exports = PricingService;
