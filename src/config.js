export const DERIV_APP_ID = '34c3rTXvfnC6XKk5nbzJM'; // Replace with your own (app.deriv.com). EMRON's works for local testing only.
export const DERIV_API_BASE = 'https://api.derivws.com';
export const ACCOUNTS_ENDPOINT = '/trading/v1/options/accounts';

export const PAT_STORAGE_KEY = 'nexora_pat';
export const KILL_STORAGE_KEY = 'nexora_kill';
export const ACTIVE_CONTRACTS_KEY = 'nexora_active';

export const TRADE_WINDOW_MS = 60_000;
export const TRADE_CAP = 300;      // docs cap is 360/min; stay under
export const PING_MS = 30_000;
export const SILENT_MS = 45_000;   // silent-death watchdog
export const MIN_STAKE = 0.35;
export const MAX_MARTINGALE_STEPS = 3;
