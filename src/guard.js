import { KILL_STORAGE_KEY } from './config.js';

const state = { killed: false, reason: '', killedAt: 0 };

export function isKilled() { return state.killed; }
export function killReason() { return state.reason; }

export function engage(reason) {
  state.killed = true;
  state.reason = reason || 'manually stopped';
  state.killedAt = Date.now();
  persist();
}

export function rearm() {
  state.killed = false;
  state.reason = '';
  state.killedAt = 0;
  persist();
}

export function restore() {
  try {
    const raw = JSON.parse(localStorage.getItem(KILL_STORAGE_KEY) || 'null');
    // 24h expiry prevents a crash mid-kill from permanently locking the account.
    if (raw && raw.killed && Date.now() - raw.killedAt < 24 * 3600 * 1000) {
      state.killed = true;
      state.reason = raw.reason;
      state.killedAt = raw.killedAt;
    }
  } catch (_) { /* ignore */ }
}

function persist() {
  try {
    localStorage.setItem(KILL_STORAGE_KEY, JSON.stringify({
      killed: state.killed, reason: state.reason, killedAt: state.killedAt,
    }));
  } catch (_) { /* ignore */ }
}
