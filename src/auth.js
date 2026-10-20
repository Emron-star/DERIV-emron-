import { DERIV_API_BASE, ACCOUNTS_ENDPOINT, DERIV_APP_ID, PAT_STORAGE_KEY } from './config.js';

export async function fetchAccounts(pat) {
  const res = await fetch(`${DERIV_API_BASE}${ACCOUNTS_ENDPOINT}`, {
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Deriv-App-ID': DERIV_APP_ID,
      'Accept': 'application/json',
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const list = Array.isArray(json?.errors) ? json.errors : [];
    const msg = list.length
      ? list.map(e => `${e.code || 'Error'}: ${e.message}`).join('; ')
      : `Account lookup failed (${res.status})`;
    throw new Error(msg);
  }
  const raw = json?.data ?? json?.accounts ?? [];
  const arr = Array.isArray(raw)
    ? raw
    : (Array.isArray(raw?.accounts) ? raw.accounts : Object.values(raw).filter(v => v && (v.account_id || v.loginid)));
  return arr.map(a => {
    const id = a.account_id || a.loginid || '';
    const explicit = String(a.account_type || '').toLowerCase();
    const type = explicit || ((id.startsWith('DT') || id.startsWith('DO')) ? 'demo' : 'real');
    return {
      account_id: id,
      type,
      balance: Number(a.balance ?? 0),
      currency: a.currency || 'USD',
    };
  }).filter(a => a.account_id);
}

export function saveSession(pat) { sessionStorage.setItem(PAT_STORAGE_KEY, pat); }
export function loadSession() { return sessionStorage.getItem(PAT_STORAGE_KEY) || null; }
export function clearSession() { sessionStorage.removeItem(PAT_STORAGE_KEY); }
