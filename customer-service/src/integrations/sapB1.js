// src/integrations/sapB1.js
import https from 'https';
import { URL } from 'url';

const baseURL   = process.env.SAP_BASE_URL;
const CompanyDB = process.env.SAP_COMPANY_DB;
const UserName  = process.env.SAP_USERNAME;
const Password  = process.env.SAP_PASSWORD;

// Rechazo de certs (self-signed) controlado por env
const rejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0';
const agent = new https.Agent({ keepAlive: true, rejectUnauthorized });

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

function mapAddressType(t) {
  if (t === 'B') return 'bo_BillTo';
  if (t === 'S' || t === 'O') return 'bo_ShipTo';
  return 'bo_ShipTo';
}

function makeBPAddresses(addresses = []) {
  return addresses.map(a => ({
    AddressName: a.AddressName || a.AddressCode || a.addressName || a.addressCode || 'MAIN',
    AddressType: mapAddressType(a.AddressType || a.addressType),
    Street:      a.Street || a.street || null,
    City:        a.City   || a.city   || null,
    Country:     a.Country|| a.country|| 'CL'
  }));
}

// Asegura que al menos una dirección sea Bill-To
function ensureBillTo(addresses /* array de objetos con AddressType/AddressName */) {
  const hasBillTo = addresses.some(a => a.AddressType === 'bo_BillTo');
  if (hasBillTo) return addresses;

  if (addresses.length === 0) {
    // sin direcciones: crea una mínima Bill-To
    return [{
      AddressName: 'B1',
      AddressType: 'bo_BillTo',
      Street: null,
      City: null,
      Country: 'CL'
    }];
  }

  // duplica la primera como Bill-To si no existe
  const first = addresses[0];
  return [
    { ...first, AddressName: first.AddressName || 'B1', AddressType: 'bo_BillTo' },
    ...addresses
  ];
}

function cardTypeFromPartnerType(pt) {
  return pt === 'P' ? 'cSupplier' : 'cCustomer';
}

function makeBPBody(customer, addresses) {
  const c = {
    Id:            customer.Id ?? customer.id,
    PartnerType:   customer.PartnerType ?? customer.partnerType,
    RUT:           customer.RUT ?? customer.rut, // ej: "19788750-8"
    FirstName:     customer.FirstName ?? customer.firstName,
    LastName:      customer.LastName ?? customer.lastName,
    Email:         customer.Email ?? customer.email,
    Phone:         customer.Phone ?? customer.phone,
    GroupCode:     customer.GroupCode ?? customer.groupCode ?? null, // OCRD.GroupCode
    GroupNum:      customer.GroupNum ?? customer.groupNum ?? null,   // OCTG (condición de pago)
    ListNum:       customer.ListNum ?? customer.listNum ?? null,     // OPLN (lista de precios)
    Currency:      customer.Currency ?? customer.currency ?? 'CLP',
    DefaultBillToCode: customer.DefaultBillToCode ?? customer.defaultBillToCode ?? null,
    DefaultShipToCode: customer.DefaultShipToCode ?? customer.defaultShipToCode ?? null,
    Notes:         customer.Notes ?? customer.notes ?? undefined      // “Giro”
  };

  let bpAddrs = makeBPAddresses(addresses);
  bpAddrs = ensureBillTo(bpAddrs);

  const bp = {
    CardCode:     c.Id,
    CardName:     `${c.FirstName || ''} ${c.LastName || ''}`.trim() || c.Id,
    CardType:     cardTypeFromPartnerType(c.PartnerType),
    // Campos opcionales si existen valores válidos:
    ...(c.GroupCode != null ? { GroupCode: c.GroupCode } : {}),
    ...(c.Phone ? { Phone1: c.Phone } : {}),
    ...(c.Email ? { EmailAddress: c.Email } : {}),
    FederalTaxID: c.RUT,
    BPAddresses:  bpAddrs,
    Currency:     c.Currency,
    ...(c.GroupNum != null ? { PayTermsGrpCode: c.GroupNum } : {}),
    ...(c.ListNum != null ? { PriceListNum: c.ListNum } : {}),
    ...(c.DefaultBillToCode ? { DefaultBillingAddress: c.DefaultBillToCode } : {}),
    ...(c.DefaultShipToCode ? { DefaultShipToAddress: c.DefaultShipToCode } : {})
  };

  if (c.Notes) bp.Notes = c.Notes;
  return bp;
}

async function sapLogin() {
  const res = await httpRequest('POST', `${baseURL}/Login`, { CompanyDB, UserName, Password });
  if (res.status !== 200) {
    throw new Error(`[SAP Login] ${res.status} ${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`);
  }
  const setCookie = res.headers['set-cookie'] || [];
  const cookie = Array.isArray(setCookie)
    ? setCookie.map(c => c.split(';')[0]).join('; ')
    : '';
  if (!cookie.includes('B1SESSION')) {
    throw new Error('[SAP Login] No se recibió cookie B1SESSION');
  }
  return cookie;
}

async function sapLogout(cookie) {
  try {
    await httpRequest('POST', `${baseURL}/Logout`, {}, cookie);
  } catch (e) {
    console.warn('[SAP Logout] warn:', e?.message || e);
  }
}

export async function createBusinessPartner(customer, addresses = []) {
  if (!baseURL || !CompanyDB || !UserName || !Password) {
    return { ok: false, error: 'SAP_ENV_MISSING', details: 'Faltan variables de entorno de SAP' };
  }

  let cookie;
  try {
    const body = makeBPBody(customer, addresses);

    cookie = await sapLogin();

    console.log('[SAP BP][REQ]', {
      CardCode: body.CardCode,
      CardType: body.CardType,
      GroupCode: body.GroupCode,
      PayTermsGrpCode: body.PayTermsGrpCode,
      PriceListNum: body.PriceListNum,
      HasAddrs: (body.BPAddresses || []).length
    });

    const res = await httpRequest('POST', `${baseURL}/BusinessPartners`, body, cookie);

    if (res.status === 201) {
      console.log('[SAP BP][OK]', res.data?.CardCode || body.CardCode);
      return { ok: true, cardCode: res.data?.CardCode || body.CardCode, data: res.data };
    }

    // Mensajes 400/… enriquecidos
    const msg = res?.data?.error?.message?.value || JSON.stringify(res.data);
    console.error('[SAP BP][ERR]', res.status, msg);
    return { ok: false, status: res.status, message: msg, data: res.data };
  } catch (err) {
    console.error('[SAP BP][EX]', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  } finally {
    if (cookie) await sapLogout(cookie);
  }
}
