// src/integrations/sapB1.js
// ESM module
import https from 'https';
import { URL } from 'url';

/* ================== ENV ================== */
const baseURL   = process.env.SAP_BASE_URL;
const CompanyDB = process.env.SAP_COMPANY_DB;
const UserName  = process.env.SAP_USERNAME;
const Password  = process.env.SAP_PASSWORD;
const GIRO_UDF  = process.env.SAP_GIRO_UDF || 'U_Giro'; // ← nombre del UDF de "Giro" (OCRD)

/* SSL agent */
const rejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0';
const agent = new https.Agent({ keepAlive: true, rejectUnauthorized });

/* ================== HTTP CORE ================== */
function httpRequest(method, urlStr, body, cookie) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = body ? JSON.stringify(body) : null;

    const req = https.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      agent,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookie ? { 'Cookie': cookie } : {})
      },
      timeout: 20000
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (buf += chunk));
      res.on('end', () => {
        let parsed = buf;
        try { parsed = buf ? JSON.parse(buf) : null; } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          raw: buf
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    if (data) req.write(data);
    req.end();
  });
}

/* ================== HELPERS ================== */
function nz(s, fallback = '') {
  const v = (s == null ? '' : String(s)).trim();
  return v || fallback;
}
function clip(s, max) {
  const v = String(s ?? '');
  return v.length > max ? v.slice(0, max) : v;
}

// RUT helpers (opcional, formatea si viene RUT válido)
function formatRut(raw = '') {
  const c = String(raw).replace(/[^0-9kK]/g, '').toUpperCase();
  if (c.length < 2) return raw;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  return `${body}-${dv}`; // 👈 ya sin puntos
}

/* ================== ADDRESS MAPPING ================== */
function mapAddressType(t) {
  const v = String(t || '').toUpperCase();
  if (v === 'B' || v === 'BILL' || v === 'BO_BILLTO') return 'bo_BillTo';
  if (v === 'S' || v === 'SHIP' || v === 'O' || v === 'BO_SHIPTO') return 'bo_ShipTo';
  return 'bo_ShipTo';
}

function makeBPAddresses(addresses = []) {
  // Acepta estructuras flexibles desde controllers (ship/bill), con defaults sensatos
  return addresses.map((a, i) => {
    const AddressName = a.AddressName || a.AddressCode || a.addressName || a.addressCode || (i === 0 ? 'DESPACHO' : 'FACTURACION');
    const AddressType = mapAddressType(a.AddressType || a.addressType || (i === 0 ? 'S' : 'B'));

    const Street   = a.Street   || a.street   || null;
    const StreetNo = a.StreetNo || a.streetNo || a.Number || a.number || null;
    const Block    = a.Block    || a.block    || a.Neighborhood || a.neighborhood || null;

    // City: si no viene, usa Neighborhood; si no, “Santiago”
    const City     = a.City     || a.city     || Block || 'Santiago';
    const ZipCode  = a.ZipCode  || a.zipCode  || a.PostalCode || a.postalCode || '8320000';

    return {
      AddressName: clip(AddressName, 50),
      AddressType,
      Street:      clip(Street ?? '', 100) || null,
      StreetNo:    clip(StreetNo ?? '', 50) || null,
      Block:       clip(Block ?? '', 100) || null,
      City:        clip(City ?? '', 100) || null,
      ZipCode:     clip(ZipCode ?? '', 20) || null,
      Country:     'CL' // SIEMPRE código SAP
    };
  });
}

function ensureShipTo(addresses) {
  const hasShip = addresses.some(a => a.AddressType === 'bo_ShipTo');
  if (hasShip) return addresses;
  if (!addresses.length) {
    return [{ AddressName: 'DESPACHO', AddressType: 'bo_ShipTo', Street: null, City: 'Santiago', ZipCode: '8320000', Country: 'CL' }];
  }
  const first = addresses[0];
  return [{ ...first, AddressName: 'DESPACHO', AddressType: 'bo_ShipTo' }, ...addresses];
}

function ensureBillTo(addresses) {
  const hasBill = addresses.some(a => a.AddressType === 'bo_BillTo');
  if (hasBill) return addresses;
  if (!addresses.length) {
    return [{ AddressName: 'FACTURACION', AddressType: 'bo_BillTo', Street: null, City: 'Santiago', ZipCode: '8320000', Country: 'CL' }];
  }
  const first = addresses[0];
  return [{ ...first, AddressName: 'FACTURACION', AddressType: 'bo_BillTo' }, ...addresses];
}

/* ================== BP BODY ================== */
// Siempre cliente (partnerType 'P' corporativo también es customer en B1 en tu caso)
function cardTypeFromPartnerType(_pt) {
  return 'cCustomer';
}

function makeBPBody(customer, addresses) {
  const c = {
    Id:            customer.Id ?? customer.id ?? undefined,
    PartnerType:   customer.PartnerType ?? customer.partnerType,
    RUT:           customer.RUT ?? customer.rut ?? undefined,
    FirstName:     customer.FirstName ?? customer.firstName,
    LastName:      customer.LastName ?? customer.lastName,
    Email:         customer.Email ?? customer.email,
    Phone:         customer.Phone ?? customer.phone,
    GroupCode:     customer.GroupCode ?? customer.groupCode ?? null,
    GroupNum:      customer.GroupNum ?? customer.groupNum ?? null,
    ListNum:       customer.ListNum ?? customer.listNum ?? null,
    Currency:      customer.Currency ?? customer.currency ?? 'CLP',
    Notes:         customer.Notes ?? customer.notes ?? null,   // ← puede venir vacío
    // si en tu flujo original venía “Giro” en algún lado, úsalo como respaldo de Notes
     CreditLimit:  customer.CreditLimit ?? customer.creditLimit ?? null,
    Giro:          customer.Giro ?? customer.giro ?? customer.businessGiro ?? customer.activity ?? null
  };

  let bpAddrs = makeBPAddresses(addresses);
  bpAddrs = ensureShipTo(bpAddrs);
  bpAddrs = ensureBillTo(bpAddrs);

  const ship = bpAddrs.find(a => a.AddressType === 'bo_ShipTo');
  const bill = bpAddrs.find(a => a.AddressType === 'bo_BillTo');
  const ShipToDefault  = ship?.AddressName || 'DESPACHO';
  const BilltoDefault  = bill?.AddressName || 'FACTURACION';

  // ↓↓↓ Fallback para Notes: usa Notes, o Giro, o un texto genérico
  const notesFallback = (c.Notes ?? c.Giro ?? `PARTICULAR`).toString();
  const safeNotes = clip(notesFallback, 254); // OCRD.Notes suele ser ~254 chars

  const cardName = `${nz(c.FirstName)} ${nz(c.LastName)}`.trim();
  const bp = {
    ...(c.Id ? { CardCode: c.Id } : {}),
    CardName:     clip(cardName || c.Id || 'CLIENTE SIN NOMBRE', 100),
    CardType:     cardTypeFromPartnerType(c.PartnerType),
    FederalTaxID: c.RUT ? formatRut(c.RUT) : undefined,
    Currency:     c.Currency,
    BPAddresses:  bpAddrs,
    ShipToDefault,
    BilltoDefault,
    Notes:        safeNotes, // ← SIEMPRE lo enviamos, con fallback
    ...(c.GroupCode != null ? { GroupCode: Number(c.GroupCode) } : {}),
    ...(c.Phone ? { Phone1: c.Phone } : {}),
    ...(c.Email ? { EmailAddress: c.Email } : {}),
    ...(c.GroupNum != null ? { PayTermsGrpCode: Number(c.GroupNum) } : {}),
    ...(c.CreditLimit != null ? { CreditLimit: Number(c.CreditLimit) } : {}),
    ...(c.ListNum != null ? { PriceListNum: Number(c.ListNum) } : {})
  };

  return bp;
}


/* ================== SAP SESSION ================== */
async function sapLogin() {
  if (!baseURL || !CompanyDB || !UserName || !Password) {
    throw new Error('SAP_ENV_MISSING: Faltan SAP_BASE_URL / SAP_COMPANY_DB / SAP_USERNAME / SAP_PASSWORD');
  }
  const res = await httpRequest('POST', `${baseURL}/Login`, { CompanyDB, UserName, Password });
  if (res.status !== 200) {
    throw new Error(`[SAP Login] ${res.status} ${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`);
  }
  const setCookie = res.headers['set-cookie'] || [];
  const cookie = Array.isArray(setCookie) ? setCookie.map(c => c.split(';')[0]).join('; ') : '';
  if (!cookie.includes('B1SESSION')) throw new Error('[SAP Login] No se recibió cookie B1SESSION');
  return cookie;
}

async function sapLogout(cookie) {
  try { await httpRequest('POST', `${baseURL}/Logout`, {}, cookie); } catch (e) { console.warn('[SAP Logout] warn:', e?.message || e); }
}

/* ================== BP CRUD ================== */
async function getBusinessPartner(cardCode, cookie) {
  const key = encodeURIComponent(cardCode);
  return httpRequest('GET', `${baseURL}/BusinessPartners('${key}')`, null, cookie);
}

// PATCH conservador (no toca BPAddresses para no reemplazar colecciones)
function pickPatchFromBody(bp) {
  const patch = {};
  const keys = [
    'CardName', 'Phone1', 'EmailAddress', 'FederalTaxID', 'GroupCode',
    'PayTermsGrpCode', 'PriceListNum', 'Currency', 'ShipToDefault', 'BilltoDefault',
    'Notes',
    'CreditLimit' // 👈 AÑADIDO
  ];
  for (const k of keys) if (bp[k] !== undefined) patch[k] = bp[k];
  return patch;
}

async function updateBusinessPartner(cardCode, patch, cookie) {
  const key = encodeURIComponent(cardCode);
  return httpRequest('PATCH', `${baseURL}/BusinessPartners('${key}')`, patch, cookie);
}

/* ================== PUBLIC API ================== */
// UPSERT: si existe → PATCH; si no → POST
export async function upsertBusinessPartner(customer, addresses = []) {
  if (!baseURL || !CompanyDB || !UserName || !Password) {
    return { ok: false, error: 'SAP_ENV_MISSING', details: 'Faltan variables de entorno de SAP' };
  }
  let cookie;
  try {
    cookie = await sapLogin();
    const body = makeBPBody(customer, addresses);

    // ¿Existe?
    const getRes = await getBusinessPartner(body.CardCode ?? '', cookie);
    if (getRes.status === 200) {
      // Patch conservador + defaults + UDF Giro
      const patch = pickPatchFromBody(body);
      const patchRes = await updateBusinessPartner(body.CardCode, patch, cookie);
      if (patchRes.status === 204 || patchRes.status === 200) {
        console.log('[SAP BP][PATCH OK]', body.CardCode);
        return { ok: true, action: 'updated', cardCode: body.CardCode };
      }
      const msg = patchRes?.data?.error?.message?.value || JSON.stringify(patchRes.data);
      console.error('[SAP BP][PATCH ERR]', patchRes.status, msg);
      return { ok: false, status: patchRes.status, message: msg, data: patchRes.data };
    }

    if (getRes.status !== 404) {
      const msg = getRes?.data?.error?.message?.value || JSON.stringify(getRes.data);
      console.error('[SAP BP][GET ERR]', getRes.status, msg);
      return { ok: false, status: getRes.status, message: msg, data: getRes.data };
    }

    // Crear
    const postRes = await httpRequest('POST', `${baseURL}/BusinessPartners`, body, cookie);
    if (postRes.status === 201 || postRes.status === 200) {
      console.log('[SAP BP][POST OK]', postRes.data?.CardCode || body.CardCode);
      return { ok: true, action: 'created', cardCode: postRes.data?.CardCode || body.CardCode, data: postRes.data };
    } else {
      const msg = postRes?.data?.error?.message?.value || JSON.stringify(postRes.data);
      console.error('[SAP BP][POST ERR]', postRes.status, msg);
      return { ok: false, status: postRes.status, message: msg, data: postRes.data, bodyTried: body };
    }
  } catch (err) {
    console.error('[SAP BP][EX]', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  } finally {
    if (cookie) await sapLogout(cookie);
  }
}

// Creador “simple” (mantener compatibilidad con tu controller actual)
export async function createBusinessPartner(customer, addresses = []) {
  if (!baseURL || !CompanyDB || !UserName || !Password) {
    return { ok: false, error: 'SAP_ENV_MISSING', details: 'Faltan variables de entorno de SAP' };
  }
  let cookie;
  try {
    const body = makeBPBody(customer, addresses);
    cookie = await sapLogin();
    const res = await httpRequest('POST', `${baseURL}/BusinessPartners`, body, cookie);
    if (res.status === 201 || res.status === 200) {
      console.log('[SAP BP][OK]', res.data?.CardCode || body.CardCode);
      return { ok: true, cardCode: res.data?.CardCode || body.CardCode, data: res.data };
    }
    const msg = res?.data?.error?.message?.value || JSON.stringify(res.data);
    console.error('[SAP BP][ERR]', res.status, msg);
    return { ok: false, status: res.status, message: msg, data: res.data, bodyTried: body };
  } catch (err) {
    console.error('[SAP BP][EX]', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  } finally {
    if (cookie) await sapLogout(cookie);
  }
}
