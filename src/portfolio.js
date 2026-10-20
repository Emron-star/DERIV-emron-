import { ACTIVE_CONTRACTS_KEY } from './config.js';

export const active = new Map();

export function remember(contractId, meta) {
  active.set(String(contractId), meta);
  persist();
}

export function forget(contractId) {
  active.delete(String(contractId));
  persist();
}

export function restore() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(ACTIVE_CONTRACTS_KEY) || '{}');
    Object.entries(raw).forEach(([id, m]) => active.set(id, m));
  } catch (_) { /* ignore */ }
}

function persist() {
  try {
    const obj = {};
    active.forEach((v, k) => { obj[k] = v; });
    sessionStorage.setItem(ACTIVE_CONTRACTS_KEY, JSON.stringify(obj));
  } catch (_) { /* ignore */ }
}
