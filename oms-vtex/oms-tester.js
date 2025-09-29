#!/usr/bin/env node
'use strict';

const fs = require('fs');
const axios = require('axios');
const http  = require('http');
const https = require('https');
const crypto = require('crypto');

const argv = process.argv.slice(2);
const URL = getArg('--url') || 'http://api-gateway:8080/api/oms-service/orders';
const FILE = getArg('--file') || 'payload.json';
const COUNT = parseInt(getArg('--count') || '0', 10);         // 0 si usas --durationSec
const DURATION_SEC = parseInt(getArg('--durationSec') || '0', 10);
const CONCURRENCY = Math.max(1, parseInt(getArg('--concurrency') || '1', 10));
const INTERVAL = parseInt(getArg('--interval') || '0', 10);   // think-time entre requests por worker
const MODE = (getArg('--mode') || 'keepalive').toLowerCase(); // keepalive | close
const BASE_REF = getArg('--baseRef') || null;

// Tuning del agente (cliente → gateway)
const keepAliveMsecs = parseInt(getArg('--keepAliveMsecs') || '20000', 10);
const maxSockets = parseInt(getArg('--maxSockets') || '100', 10);
const maxFreeSockets = parseInt(getArg('--maxFreeSockets') || '20', 10);
const freeSocketTimeout = parseInt(getArg('--freeSocketTimeout') || '5000', 10);
const socketActiveTTL = parseInt(getArg('--socketActiveTTL') || '30000', 10);

function getArg(name) {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) return null;
  return v;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function nowNs() { return process.hrtime.bigint(); }
function diffMs(a, b) { return Number(b - a) / 1e6; }

if (!fs.existsSync(FILE)) {
  console.error(`❌ No se encontró ${FILE}. Crea payload.json o usa --file <ruta>.`);
  process.exit(1);
}

// payload base
const BASE_PAYLOAD = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// Agents
function makeAgents(mode) {
  if (mode === 'close') {
    return {
      httpAgent:  new http.Agent({ keepAlive: false }),
      httpsAgent: new https.Agent({ keepAlive: false }),
      extraHeaders: { Connection: 'close' }
    };
  }
  const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs,
    maxSockets,
    maxFreeSockets,
    freeSocketTimeout,
    socketActiveTTL,
    scheduling: 'lifo'
  });
  const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs,
    maxSockets,
    maxFreeSockets,
    freeSocketTimeout,
    socketActiveTTL,
    scheduling: 'lifo'
  });
  return { httpAgent, httpsAgent, extraHeaders: {} };
}
const { httpAgent, httpsAgent, extraHeaders } = makeAgents(MODE);

const client = axios.create({
  baseURL: URL.replace(/\/+$/,''),
  timeout: parseInt(process.env.OMS_TIMEOUT_MS || '15000', 10),
  httpAgent, httpsAgent
});

// Métricas
const results = [];
let ok = 0, e504 = 0, e409 = 0, otherErr = 0;
let sent = 0;
let globalStart;

// Helpers p/ payload único
function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function mkRef(i){ return BASE_REF ? `${BASE_REF}-${Date.now()}-${process.pid}-${i}-${Math.random().toString(36).slice(2,6)}` : crypto.randomUUID(); }
function makePayload(i){
  const p = clone(BASE_PAYLOAD);
  if (BASE_REF) {
    // u_ref1 / salesChannelReferenceId / etc.
    if (p.u_ref1) p.u_ref1 = mkRef(i);
    if (p.salesChannelReferenceId && p.salesChannelReferenceId.startsWith('VTEX')) {
      p.salesChannelReferenceId = BASE_REF;
    }
    // items[].uniqueId
    if (Array.isArray(p.items)) {
      p.items = p.items.map((it, idx) => {
        const cp = { ...it };
        const tag = `${i}-${idx}-${Math.random().toString(36).slice(2,6)}`;
        cp.uniqueId = `${(it.uniqueId||'itm')}-${tag}`;
        return cp;
      });
    }
  }
  return p;
}

function percentile(msArray, p){
  if (msArray.length === 0) return 0;
  const arr = [...msArray].sort((a,b)=>a-b);
  const idx = Math.min(arr.length-1, Math.max(0, Math.ceil((p/100)*arr.length)-1));
  return arr[idx];
}

async function oneRequest(i){
  const idemKey = crypto.randomUUID();
  const corrId  = crypto.randomUUID();
  const payload = makePayload(i);
  const t0 = nowNs();
  try {
    const res = await client.post('', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey,
        'X-Correlation-Id': corrId,
        ...extraHeaders
      }
    });
    const d = diffMs(t0, nowNs());
    ok++;
    results.push(d);
    // imprime solo si pocos o cada 50
    if (CONCURRENCY <= 4 || (i % 50 === 0)) {
      console.log(`[OK ] #${i} status=${res.status} durMs=${d.toFixed(1)} corrId=${corrId} ${safeBody(res.data)}`);
    }
  } catch (e) {
    const d = diffMs(t0, nowNs());
    const status = e?.response?.status || 'N/A';
    const code = e?.code || 'N/A';
    const msg = e?.response?.data?.message || e?.message || 'error';
    if (status === 504) e504++; else if (status === 409) e409++; else otherErr++;
    results.push(d);
    console.log(`[FAIL] #${i} status=${status} code=${code} durMs=${d.toFixed(1)} msg="${msg}"`);
  }
}

function safeBody(d){
  try{
    if (d == null) return '';
    const s = typeof d === 'string' ? d : JSON.stringify(d);
    return s.length > 200 ? s.slice(0,200)+'…' : s;
  }catch{return '';}
}

async function worker(id, maxToSend, endTime){
  while (true){
    // chequeo de fin por duración o por cantidad
    if (DURATION_SEC > 0) {
      if (Date.now() >= endTime) break;
    } else {
      if (sent >= maxToSend) break;
    }
    const i = ++sent; // índice global (1..N)
    await oneRequest(i);
    if (INTERVAL > 0) await sleep(INTERVAL);
  }
}

(async () => {
  const targetDesc = DURATION_SEC > 0 ? `${DURATION_SEC}s` : `${COUNT} POST(s)`;
  console.log(`▶️  Enviando ${targetDesc} a ${URL} (mode=${MODE}, conc=${CONCURRENCY})`);
  console.log(`    keepAliveMsecs=${keepAliveMsecs} freeSocketTimeout=${freeSocketTimeout} socketActiveTTL=${socketActiveTTL}`);

  globalStart = Date.now();
  const endTime = DURATION_SEC > 0 ? (globalStart + DURATION_SEC*1000) : 0;
  const maxToSend = DURATION_SEC > 0 ? Number.MAX_SAFE_INTEGER : COUNT;

  const workers = [];
  for (let w=1; w<=CONCURRENCY; w++) workers.push(worker(w, maxToSend, endTime));
  await Promise.all(workers);

  const wallMs = Date.now() - globalStart;
  const rps = results.length ? (results.length / (wallMs/1000)).toFixed(2) : '0';
  const p50 = percentile(results, 50).toFixed(1);
  const p90 = percentile(results, 90).toFixed(1);
  const p99 = percentile(results, 99).toFixed(1);
  console.log('');
  console.log(`Resumen → total=${results.length} | OK=${ok} | 504=${e504} | 409=${e409} | otros=${otherErr}`);
  console.log(`           wall=${wallMs} ms | RPS=${rps} | p50=${p50} ms | p90=${p90} ms | p99=${p99} ms`);
})().catch(err => {
  console.error('💥 Error en runner:', err);
  process.exit(1);
});
