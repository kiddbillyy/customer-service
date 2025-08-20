// src/services/vtexService.js
const axios = require('axios');
require('dotenv').config();

/* ────────── config dominio ────────── */
const ACCOUNT = process.env.VTEX_ACCOUNT;
const ENV     = process.env.VTEX_ENVIRONMENT || 'vtexcommercestable';
const BASEURL = `https://${ACCOUNT}.${ENV}.com.br`;

/* ────────── cliente VTEX ────────── */
const vtex = axios.create({
  baseURL: BASEURL,
  headers: {
    'X-VTEX-API-AppKey'  : process.env.VTEX_APP_KEY,
    'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
    Accept               : 'application/json'
  },
  timeout: 60000
});

/* ────────── util reintentos ────────── */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, tries = 5) {
  let lastErr;
  for (let a = 0; a < tries; a++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const retryable =
        [429, 500, 502, 503, 504].includes(status) ||
        err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
      if (!retryable || a === tries - 1) throw err;
      const backoff = Math.min(30000, 500 * 2 ** a);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

/* ────────── categorías ────────── */
async function fetchCategories(level = 3) {
  const { data } = await withRetry(() =>
    vtex.get(`/api/catalog_system/pub/category/tree/${level}`)
  );
  return flatten(data);
}

/* ────────── marcas (paginado) ────────── */
async function fetchBrands() {
  const acc = [];
  let page = 1;
  while (true) {
    const { data } = await withRetry(() =>
      vtex.get('/api/catalog_system/pvt/brand/list', { params: { page } })
    );

    if (!Array.isArray(data) || data.length === 0) break;

    const mapped = data.map(b => ({
      BrandId : b.Id ?? b.id,
      Name    : b.Name ?? b.name,
      IsActive: (b.IsActive ?? b.isActive) ? 1 : 0
    }));
    acc.push(...mapped);
    page++;
  }
  return acc;
}

/* ────────── SKU por ID ────────── */
async function fetchSkuById(skuId) {
  const { data } = await withRetry(() =>
    vtex.get(`/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`)
  );
  return data; // crudo
}

/* ────────── normalizador SKU (opcional) ────────── */
function normalizeSku(dto) {
  // CategoriesFullPath suele traer algo tipo "Dept/Cat/Subcat"
  const parts = Array.isArray(dto.CategoriesFullPath) && dto.CategoriesFullPath[0]
    ? dto.CategoriesFullPath[0].split('/').filter(Boolean)
    : [];

  const primerNivel = parts[0] || null;
  const categoria   = parts[1] || primerNivel;
  const subcategoria= parts[2] || parts[1] || null;

  const imageUrl = Array.isArray(dto.Images) && dto.Images[0]?.ImageUrl
    ? dto.Images[0].ImageUrl
    : null;

  return {
    SkuId       : dto.Id,
    Name        : dto.NameComplete || dto.Name || null,
    BrandId     : dto.BrandId ?? null,
    ReleaseDate : dto.ReleaseDate ? new Date(dto.ReleaseDate) : null,
    ImageUrl    : imageUrl,
    PrimerNivel : primerNivel,
    Categoria   : categoria,
    Subcategoria: subcategoria
  };
}

/* ────────── helper recursivo categorías ────────── */
function flatten(nodes, parentId = null, level = 1) {
  return nodes.flatMap(n => [
    {
      CategoryId: n.id,
      ParentId  : parentId,
      Level     : level,
      Name      : n.name,
      IsActive  : !!(n.IsActive ?? n.isActive)
    },
    ...flatten(n.children || [], n.id, level + 1)
  ]);
}

module.exports = {
  vtex,
  fetchCategories,
  fetchBrands,
  fetchSkuById,
  normalizeSku
};
