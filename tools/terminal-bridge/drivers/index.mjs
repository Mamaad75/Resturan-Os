import { randomUUID } from 'node:crypto';
import { normalizeResult, renderTemplate, runCommand, tcpExchange } from './common.mjs';

async function mock(profile) {
  await new Promise((r) => setTimeout(r, Number(profile.delayMs ?? 500)));
  const success = profile.approve !== false;
  return success
    ? { success: true, trace: `MOCK-${Date.now()}`, rrn: randomUUID().replaceAll('-', '').slice(0, 16), message: 'Mock approved' }
    : { success: false, message: 'Mock declined' };
}

async function command(profile, request, timeoutMs) {
  const raw = await runCommand(profile.executable, profile.args ?? [], request, timeoutMs, profile.env ?? {});
  return normalizeResult(raw, profile.response ?? {});
}

async function httpJson(profile, request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json', ...(profile.headers ?? {}) };
    for (const [key, value] of Object.entries(headers)) headers[key] = renderTemplate(String(value), request);
    const bodyObject = profile.body ?? request;
    const bodyText = JSON.stringify(bodyObject, (_key, value) => typeof value === 'string' ? renderTemplate(value, request) : value);
    const response = await fetch(renderTemplate(profile.url, request), {
      method: profile.method ?? 'POST', headers, body: bodyText, signal: controller.signal,
    });
    const rawText = await response.text();
    let raw;
    try { raw = rawText ? JSON.parse(rawText) : {}; }
    catch { throw new Error(`terminal_invalid_json_response_${response.status}`); }
    const result = normalizeResult(raw, profile.response ?? {});
    if (!response.ok && result.success) result.success = false;
    return result;
  } finally { clearTimeout(timer); }
}

async function tcpJson(profile, request, timeoutMs) {
  const payloadObject = profile.body ?? request;
  const payload = JSON.stringify(payloadObject, (_key, value) => typeof value === 'string' ? renderTemplate(value, request) : value) + (profile.requestDelimiter ?? '\n');
  const text = await tcpExchange({ host: profile.host, port: profile.port, payload, timeoutMs, delimiter: profile.responseDelimiter ?? '\n' });
  let raw;
  try { raw = JSON.parse(text.trim()); } catch { throw new Error('terminal_invalid_json_response'); }
  return normalizeResult(raw, profile.response ?? {});
}

async function tcpText(profile, request, timeoutMs) {
  const payload = renderTemplate(profile.requestTemplate ?? '{{amount}}\n', request);
  const text = await tcpExchange({ host: profile.host, port: profile.port, payload, timeoutMs, delimiter: profile.responseDelimiter ?? '\n' });
  const successRegex = new RegExp(profile.response?.successRegex ?? 'APPROVED|SUCCESS|OK', 'i');
  const traceRegex = profile.response?.traceRegex ? new RegExp(profile.response.traceRegex, 'i') : null;
  const rrnRegex = profile.response?.rrnRegex ? new RegExp(profile.response.rrnRegex, 'i') : null;
  const messageRegex = profile.response?.messageRegex ? new RegExp(profile.response.messageRegex, 'i') : null;
  return {
    success: successRegex.test(text),
    trace: traceRegex?.exec(text)?.[1],
    rrn: rrnRegex?.exec(text)?.[1],
    message: messageRegex?.exec(text)?.[1] ?? text.trim().slice(0, 300),
  };
}

export async function executeDriver(profile, request, timeoutMs) {
  switch (String(profile.driver ?? '').toLowerCase()) {
    case 'mock': return mock(profile, request, timeoutMs);
    case 'command': return command(profile, request, timeoutMs);
    case 'http-json': return httpJson(profile, request, timeoutMs);
    case 'tcp-json': return tcpJson(profile, request, timeoutMs);
    case 'tcp-text': return tcpText(profile, request, timeoutMs);
    default: throw new Error(`unsupported_terminal_driver:${profile.driver}`);
  }
}
