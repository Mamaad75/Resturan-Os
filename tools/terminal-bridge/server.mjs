import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executeDriver } from './drivers/index.mjs';

const env = process.env;
const HOST = env.BRIDGE_HOST || '127.0.0.1';
const PORT = Number(env.BRIDGE_PORT || 17777);
const KEY = env.BRIDGE_KEY || '';
const MODE = (env.BRIDGE_MODE || 'UNIVERSAL').toUpperCase();
const TIMEOUT = Math.max(5_000, Number(env.TERMINAL_TIMEOUT_MS || 90_000));
const CONFIG_PATH = path.resolve(env.BRIDGE_CONFIG || './bridge.config.json');
const origins = new Set((env.BRIDGE_ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean));
const inFlight = new Map();
let universalConfig = null;

if (!KEY || KEY.length < 16) {
  console.error('BRIDGE_KEY must be configured with at least 16 characters.');
  process.exit(1);
}

function loadConfig() {
  if (MODE !== 'UNIVERSAL') return null;
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!config || typeof config !== 'object' || !config.profiles) throw new Error('profiles_missing');
    return config;
  } catch (error) {
    console.error(`Failed to load universal bridge config: ${CONFIG_PATH}`, error);
    process.exit(1);
  }
}
universalConfig = loadConfig();

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && origins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
}
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 64_000) throw new Error('payload_too_large');
  }
  return data ? JSON.parse(data) : {};
}
function validPayment(body) {
  return body && typeof body === 'object' &&
    typeof body.intentId === 'string' && body.intentId.length >= 12 &&
    Number.isInteger(body.amount) && body.amount > 0 &&
    typeof body.currency === 'string' && body.currency.length <= 12 &&
    typeof body.orderId === 'string' && body.orderId.length > 0;
}
function profileFor(request) {
  if (MODE === 'MOCK') return { driver: 'mock', approve: String(env.MOCK_APPROVE || 'true').toLowerCase() !== 'false' };
  if (MODE === 'COMMAND') {
    let args = [];
    try { args = JSON.parse(env.TERMINAL_ADAPTER_ARGS || '[]'); } catch { throw new Error('TERMINAL_ADAPTER_ARGS must be a JSON array'); }
    return { driver: 'command', executable: env.TERMINAL_ADAPTER_PATH, args, response: {} };
  }
  if (MODE !== 'UNIVERSAL') throw new Error(`Unsupported BRIDGE_MODE: ${MODE}`);
  const map = universalConfig.terminalMap ?? {};
  const keys = [
    request.terminalId ? `terminal:${request.terminalId}` : null,
    request.provider ? `provider:${request.provider}` : null,
  ].filter(Boolean);
  const name = keys.map((key) => map[key]).find(Boolean) ?? universalConfig.defaultProfile;
  const profile = universalConfig.profiles?.[name];
  if (!profile) throw new Error(`terminal_profile_not_found:${name ?? 'none'}`);
  return profile;
}
async function executePayment(request) {
  const profile = profileFor(request);
  const result = await executeDriver(profile, request, TIMEOUT);
  if (!result || typeof result.success !== 'boolean') throw new Error('terminal_result_invalid');
  return result;
}

const handler = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, {
      ok: true, mode: MODE, busy: inFlight.size > 0,
      drivers: ['mock', 'command', 'http-json', 'tcp-json', 'tcp-text'],
      profiles: MODE === 'UNIVERSAL' ? Object.keys(universalConfig?.profiles ?? {}) : [],
    });
  }
  if (req.method === 'GET' && req.url === '/v1/capabilities') {
    return json(res, 200, {
      apiVersion: 1,
      universal: true,
      transports: ['HTTP/Local API', 'TCP/LAN ECR', 'Vendor SDK/EXE', 'USB/Serial via vendor driver'],
      drivers: ['http-json', 'tcp-json', 'tcp-text', 'command'],
    });
  }
  if (req.method !== 'POST' || req.url !== '/v1/pay') return json(res, 404, { error: 'not_found' });

  const origin = req.headers.origin;
  if (origin && !origins.has(origin)) return json(res, 403, { error: 'origin_not_allowed' });
  const headerKey = req.headers['x-bridge-key'];
  try {
    const body = await readJson(req);
    const suppliedKey = typeof headerKey === 'string' ? headerKey : body.terminalKey;
    if (suppliedKey !== KEY) return json(res, 401, { error: 'bridge_key_invalid' });
    if (!validPayment(body)) return json(res, 400, { error: 'invalid_payment_request' });

    const existing = inFlight.get(body.intentId);
    if (existing) return json(res, 200, await existing);
    if (inFlight.size > 0) return json(res, 409, { success: false, message: 'کارتخوان در حال انجام تراکنش دیگری است.' });

    const request = {
      intentId: body.intentId,
      amount: body.amount,
      currency: body.currency,
      orderId: body.orderId,
      orderNumber: body.orderNumber ?? null,
      terminalId: body.terminalId ?? null,
      provider: body.provider ?? null,
      clientReference: body.clientReference ?? randomUUID(),
    };
    const promise = executePayment(request);
    inFlight.set(body.intentId, promise);
    try {
      const result = await promise;
      return json(res, result.success ? 200 : 402, result);
    } finally {
      setTimeout(() => inFlight.delete(body.intentId), 30_000).unref();
    }
  } catch (error) {
    console.error('[terminal-bridge]', error);
    return json(res, 500, { success: false, message: error instanceof Error ? error.message : 'terminal_error' });
  }
};

const cert = env.BRIDGE_TLS_CERT;
const key = env.BRIDGE_TLS_KEY;
const server = cert && key
  ? https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, handler)
  : http.createServer(handler);
server.listen(PORT, HOST, () => {
  const protocol = cert && key ? 'https' : 'http';
  console.log(`Restaurant OS Universal Terminal Bridge listening on ${protocol}://${HOST}:${PORT} (${MODE})`);
});
