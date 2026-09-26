import net from 'node:net';
import { spawn } from 'node:child_process';

export function getPath(source, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], source);
}

export function renderTemplate(template, request) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_m, path) => {
    const value = getPath(request, path);
    return value == null ? '' : String(value);
  });
}

export function normalizeResult(raw, mapping = {}) {
  const successValue = mapping.successPath ? getPath(raw, mapping.successPath) : raw?.success;
  const success = mapping.successEquals !== undefined
    ? String(successValue) === String(mapping.successEquals)
    : Boolean(successValue);
  const value = (path, fallback) => path ? getPath(raw, path) : fallback;
  return {
    success,
    trace: value(mapping.tracePath, raw?.trace) ?? undefined,
    rrn: value(mapping.rrnPath, raw?.rrn) ?? undefined,
    message: value(mapping.messagePath, raw?.message) ?? (success ? 'Approved' : 'Declined'),
    authCode: value(mapping.authCodePath, raw?.authCode) ?? undefined,
    terminalResponse: mapping.includeRaw === true ? raw : undefined,
  };
}

export function runCommand(executable, args, request, timeoutMs, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    if (!executable) return reject(new Error('adapter_executable_missing'));
    const child = spawn(executable, Array.isArray(args) ? args.map((v) => renderTemplate(v, request)) : [], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('terminal_timeout')); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += String(chunk); if (stdout.length > 256_000) child.kill('SIGKILL'); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); if (stderr.length > 256_000) child.kill('SIGKILL'); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim() || `adapter_exit_${code}`));
      try { resolve(JSON.parse(stdout.trim())); }
      catch { reject(new Error('adapter_result_invalid_json')); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export function tcpExchange({ host, port, payload, timeoutMs, delimiter = '\n' }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) });
    let data = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('terminal_timeout')), timeoutMs);
    socket.setNoDelay(true);
    socket.on('connect', () => socket.write(payload));
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8');
      if (data.length > 256_000) return finish(reject, new Error('terminal_response_too_large'));
      if (!delimiter || data.includes(delimiter)) finish(resolve, delimiter ? data.split(delimiter)[0] : data);
    });
    socket.on('end', () => { if (!settled) finish(resolve, data); });
    socket.on('error', (error) => finish(reject, error));
  });
}
