// src/integrations/rpro.js
import http from 'http';
import https from 'https';
import { URL } from 'url';

const baseURL       = process.env.RPRO_BASE_URL;     // p.ej. http://hqretailpro
const user          = process.env.RPRO_USER;
const pass          = process.env.RPRO_PASS;
const workstation   = process.env.RPRO_WORKSTATION;
const appId         = process.env.RPRO_APP_ID;
const companySid    = process.env.RPRO_COMPANY_SID;

const rejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0';

function httpRequest(method, urlStr, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = body ? JSON.stringify(body) : null;
    const isHttps = u.protocol === 'https:';

    const opts = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
      timeout: 20000,
      ...(isHttps ? { agent: new https.Agent({ rejectUnauthorized }) } : {}),
    };

    const req = (isHttps ? https : http).request(opts, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (buf += chunk));
      res.on('end', () => {
        let parsed = buf;
        try { parsed = buf ? JSON.parse(buf) : null; } catch {}
        resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: buf });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    if (data) req.write(data);
    req.end();
  });
}

// --- LOGIN: obtiene **token** (o header auth-session) ---
async function rproLogin() {
  const url = `${baseURL}/api/security/login` +
              `?usr=${encodeURIComponent(user)}` +
              `&pwd=${encodeURIComponent(pass)}` +
              `&ws=${encodeURIComponent(workstation)}` +
              `&claimseat=true&appid=${encodeURIComponent(appId)}`;

  const res = await httpRequest('GET', url);
  // 1) si viene en header
  const hdrSession = res.headers['auth-session'] || res.headers['Auth-Session'];
  if (hdrSession) return hdrSession;
  // 2) si viene en JSON como token
  const token = (res.data && (res.data.token || res.data.Token || res.data.sid || res.data.SID)) || null;
  if (token) return token;

  throw new Error('[RPRO Login] token missing');
}

function mapAddresses(addresses = []) {
  if (!Array.isArray(addresses)) return [];
  return addresses.map((a, idx) => ({
    sharetype: 0,
    isdefault: idx === 0, // marca la primera como default
    address_line_1: a.address || a.street || a.Street || null,
    city:            a.city || a.City || null,
    country:         a.country || a.Country || 'CL',
  }));
}

function digitsFromRutOrId(customer) {
  const rut = customer.RUT ?? customer.rut;
  if (rut) return String(rut).split('-')[0];      // "111222333-4" -> "111222333"
  const id = customer.Id ?? customer.id ?? '';
  return String(id).replace(/[CP]$/i, '');        // "111222333C" -> "111222333"
}

function mapToRproCustomer(customer, addresses) {
  const firstName = customer.FirstName ?? customer.firstName ?? '';
  const lastName  = customer.LastName  ?? customer.lastName  ?? '';
  const email     = customer.Email     ?? customer.email     ?? undefined;
  const phone     = customer.Phone     ?? customer.phone     ?? undefined;
  const rutDigits = digitsFromRutOrId(customer);

  const emails = email ? [{ email_address: email, primary_flag: true, share_type: 0 }] : [];
  const phones = phone ? [{ phone_no: phone, phone_type: 3, primary_flag: true, share_type: 0 }] : [];

  return [{
    custid: rutDigits,
    info1:  rutDigits,
    first_name: firstName,
    last_name:  lastName,
    sharetype:  0,
    custtype:   0,
    email_address: email,
    active: true,
    companysid: process.env.RPRO_COMPANY_SID,
    origin_application: 'RProPrismWeb',
    addresses: mapAddresses(addresses),
    ...(emails.length ? { emails } : {}),
    ...(phones.length ? { phones } : {}),
  }];
}

export async function createCustomerInRpro(customer, addresses = []) {
  if (!baseURL || !user || !pass || !workstation || !appId || !companySid) {
    return { ok: false, error: 'RPRO_ENV_MISSING',
      details: 'RPRO_BASE_URL, RPRO_USER, RPRO_PASS, RPRO_WORKSTATION, RPRO_APP_ID, RPRO_COMPANY_SID' };
  }
  try {
    const token = await rproLogin();
    const body  = mapToRproCustomer(customer, addresses);
    const url   = `${baseURL}/v1/rest/customer`;

    const res = await httpRequest('POST', url, body, {
      'auth-session': token,   // 👈 RPRO espera este header
      // opcionalmente, por si tu instancia también acepta 'token':
      'token': token,
    });

    if (res.status >= 200 && res.status < 300) {
      console.log('[RPRO][OK]', res.status);
      return { ok: true, status: res.status, data: res.data };
    }
    console.error('[RPRO][ERR]', res.status, res.data ?? res.raw);
    return { ok: false, status: res.status, data: res.data ?? res.raw };
  } catch (err) {
    console.error('[RPRO][EX]', err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}
