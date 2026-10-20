import {
  DERIV_API_BASE, ACCOUNTS_ENDPOINT, DERIV_APP_ID,
  PING_MS, SILENT_MS, TRADE_WINDOW_MS, TRADE_CAP,
} from './config.js';

let ws = null;
let token = null;
let accountId = null;
let reqId = 1;
let manualClose = false;
let reconnectAttempt = 0;
let reconnectTimer = null;
let pingTimer = null;
let watchdogTimer = null;
let lastMsgAt = 0;
let tradeTimestamps = [];

const handlers = { onOpen: () => {}, onClose: () => {}, onMessage: () => {}, onError: () => {} };
const extraListeners = new Set();

export function setHandlers(h) { Object.assign(handlers, h); }
export function subscribe(fn) { extraListeners.add(fn); }

export async function connect(pat, account) {
  token = pat;
  accountId = account.account_id;
  manualClose = false;
  await openSocket();
}

export function close() {
  manualClose = true;
  clearTimers();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { try { ws.close(); } catch (_) { /* ignore */ } ws = null; }
}

export function send(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  if (isTradeRequest(obj) && !allowTrade()) return false;
  if (obj.req_id == null) obj.req_id = reqId++;
  try { ws.send(JSON.stringify(obj)); return true; } catch (_) { return false; }
}

export function nextReqId() { return reqId++; }
export function isOpen() { return !!(ws && ws.readyState === WebSocket.OPEN); }

async function openSocket() {
  try {
    const res = await fetch(`${DERIV_API_BASE}${ACCOUNTS_ENDPOINT}/${encodeURIComponent(accountId)}/otp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Deriv-App-ID': DERIV_APP_ID,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = formatError(json, res.statusText || 'Failed to get OTP');
      const err = new Error(msg);
      err.fatal = [400, 401, 403, 404].includes(res.status);
      throw err;
    }
    const url = json?.data?.url;
    if (!url) throw new Error('Deriv did not return an authenticated WebSocket URL.');
    openWebSocket(url);
  } catch (e) {
    handlers.onError(e);
    if (e && e.fatal) { manualClose = true; return; }
    scheduleReconnect();
  }
}

function openWebSocket(url) {
  if (ws) { try { ws.onclose = null; ws.close(); } catch (_) { /* ignore */ } ws = null; }
  ws = new WebSocket(url);
  ws.onopen = () => {
    reconnectAttempt = 0;
    lastMsgAt = Date.now();
    startTimers();
    handlers.onOpen();
  };
  ws.onmessage = (ev) => {
    lastMsgAt = Date.now();
    let data;
    try { data = JSON.parse(ev.data); } catch (_) { return; }
    handlers.onMessage(data);
    extraListeners.forEach(fn => { try { fn(data); } catch (_) { /* ignore */ } });
  };
  ws.onclose = () => {
    clearTimers();
    handlers.onClose();
    if (!manualClose) scheduleReconnect();
  };
  ws.onerror = () => { /* onclose will fire next */ };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const attempt = reconnectAttempt++;
  const delay = Math.round(Math.min(30_000, 1000 * Math.pow(2, attempt)) * (0.7 + Math.random() * 0.6));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!manualClose && token && accountId) openSocket();
  }, delay);
}

function startTimers() {
  clearTimers();
  pingTimer = setInterval(() => { if (isOpen()) send({ ping: 1 }); }, PING_MS);
  watchdogTimer = setInterval(() => {
    if (!isOpen()) return;
    if (Date.now() - lastMsgAt > SILENT_MS) {
      try { ws.close(); } catch (_) { /* ignore */ }
    }
  }, 5_000);
}

function clearTimers() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
}

function isTradeRequest(obj) {
  return obj.proposal === 1 || 'buy' in obj || 'sell' in obj;
}

function allowTrade() {
  const now = Date.now();
  tradeTimestamps = tradeTimestamps.filter(t => now - t < TRADE_WINDOW_MS);
  if (tradeTimestamps.length >= TRADE_CAP) return false;
  tradeTimestamps.push(now);
  return true;
}

function formatError(json, fallback) {
  const list = Array.isArray(json?.errors) ? json.errors : [];
  return list.length
    ? list.map(e => `${e.code || 'Error'}: ${e.message || 'Request failed'}`).join('; ')
    : fallback;
}
