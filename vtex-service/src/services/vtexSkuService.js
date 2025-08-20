// src/services/vtexSkuService.js
const axios = require('axios');
const http  = require('http');
const https = require('https');
const dns   = require('dns');
require('dotenv').config();

if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

const httpAgent  = new http.Agent({  keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

const vtex = axios.create({
  baseURL: `https://${process.env.VTEX_ACCOUNT}.vtexcommercestable.com.br`,
  headers: {
    'X-VTEX-API-AppKey'  : process.env.VTEX_APP_KEY,
    'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
    Accept               : 'application/json'
  },
  timeout: 60000,
  httpAgent,
  httpsAgent,
});

const VERBOSE = /^1|true|yes$/i.test(process.env.VERBOSE || '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isTransient(err) {
  const code = err.code || err.cause?.code;
  const status = err.response?.status;
  return (
    ['ECONNRESET','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','EHOSTUNREACH','ESOCKETTIMEDOUT'].includes(code) ||
    status === 429 || (status >= 500 && status < 600)
  );
}

// ✅ helper: siempre 9 dígitos
const to9 = x => String(x).replace(/\D/g, '').padStart(9, '0');

async function fetchVtexSkuInfo(sku) {
  const maxAttempts = 5;
  const sku9 = to9(sku);                    // ← normaliza a 9 dígitos

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data } = await vtex.get(
        `/api/catalog_system/pvt/sku/stockkeepingunitbyid/${sku9}` // ← usa 9 dígitos
      );

      const firstPath    = (data.CategoriesFullPath?.[0] ?? '').trim();
      const parts        = firstPath.split('/').filter(Boolean);
      const PrimerNivel  = parts[0] ?? null;
      const Categoria    = parts[1] ?? parts[0] ?? null;
      const Subcategoria = parts[2] ?? parts[1] ?? null;

      const img0   = data.Images?.[0] || {};
      const Imagen = img0.ImageUrl || img0.imageUrl || img0.URL || null;

      return {
        Sku        : to9(data.Id ?? sku9),  // ← devuelve 9 dígitos
        Name       : data.NameComplete ?? data.Name ?? null,
        PrimerNivel,
        Categoria,
        Subcategoria,
        Imagen,
        ReleaseDate: data.ReleaseDate ?? null,
        BrandId    : data.BrandId ?? null,
      };
    } catch (e) {
      if (e.response?.status === 404) {
        if (VERBOSE) console.warn(`[VTEX] SKU ${sku9} 404 (no existe)`);
        return null;
      }
      if (isTransient(e) && attempt < maxAttempts) {
        const code   = e.code || e.cause?.code || e.response?.status || 'ERR';
        const waitMs = 400 * attempt + Math.floor(Math.random() * 200);
        console.warn(`[VTEX] SKU ${sku9} intento ${attempt}/${maxAttempts} falló (${code}). Reintentando en ${waitMs}ms…`);
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }
  return null;
}

module.exports = { fetchVtexSkuInfo, to9 };
