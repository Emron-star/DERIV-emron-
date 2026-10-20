import { snapshot, sellContract } from './runner.js';

const el = {};

export function bind(root) {
  el.trades = root.querySelector('#run-trades');
  el.empty = root.querySelector('#run-empty');
  el.cards = {
    stake: root.querySelector('#stat-stake'),
    payout: root.querySelector('#stat-payout'),
    runs: root.querySelector('#stat-runs'),
    lost: root.querySelector('#stat-lost'),
    won: root.querySelector('#stat-won'),
    pl: root.querySelector('#stat-pl'),
  };
  el.modal = root.querySelector('#result-modal');
  el.modalTitle = root.querySelector('#result-title');
  el.modalBody = root.querySelector('#result-body');
  el.modalClose = root.querySelector('#result-close');
  el.status = root.querySelector('#run-status');
  if (el.modalClose) el.modalClose.addEventListener('click', () => el.modal.classList.remove('is-open'));
}

export function render() {
  const s = snapshot();
  if (!el.trades) return;

  el.cards.stake.textContent = `$${s.settledStake.toFixed(2)}`;
  el.cards.payout.textContent = `$${s.settledPayout.toFixed(2)}`;
  el.cards.runs.textContent = s.buyCount;
  el.cards.won.textContent = s.wins;
  el.cards.lost.textContent = s.losses;
  el.cards.pl.textContent = (s.netPL >= 0 ? '+' : '') + `$${s.netPL.toFixed(2)}`;
  el.cards.pl.classList.toggle('pos', s.netPL > 0);
  el.cards.pl.classList.toggle('neg', s.netPL < 0);

  if (!s.trades.length) {
    el.trades.innerHTML = '';
    if (el.empty) el.empty.hidden = false;
    return;
  }
  if (el.empty) el.empty.hidden = true;

  el.trades.innerHTML = s.trades.slice().reverse().map(t => {
    const stake = `$${t.stake.toFixed(2)}`;
    const resultLabel = t.status === 'open' ? 'Open'
                      : t.status === 'unknown' ? 'Unknown'
                      : t.status === 'won' ? 'Won' : 'Lost';
    const pl = t.status === 'open' ? ''
              : t.profit == null ? '—'
              : (t.profit >= 0 ? '+' : '') + `$${Number(t.profit).toFixed(2)}`;
    const cls = t.status === 'won' ? 'pos' : t.status === 'lost' ? 'neg' : '';
    const sellBtn = t.status === 'open' && t.currentValue > 0
      ? `<button class="sell-btn" data-sell="${t.contractId}">Sell</button>` : '';
    return `<tr>
      <td>${new Date(t.openedAt).toLocaleTimeString()}</td>
      <td>${t.strategy}</td>
      <td>${stake}</td>
      <td class="${cls}">${resultLabel}</td>
      <td class="${cls}">${pl}</td>
      <td>${sellBtn}</td>
    </tr>`;
  }).join('');

  el.trades.querySelectorAll('[data-sell]').forEach(btn => {
    btn.addEventListener('click', () => sellContract(btn.dataset.sell));
  });
}

export function status(text) {
  if (el.status) el.status.textContent = text;
}

export function showResult(reason, s) {
  if (!el.modal) return;
  const titles = {
    target_hit: 'Profit target reached',
    max_loss: 'Max loss reached',
    martingale_cap: 'Martingale step cap reached',
    kill_switch: 'Kill switch engaged',
    connection_lost: 'Connection lost',
    manual: 'Session stopped',
  };
  el.modalTitle.textContent = titles[reason] || 'Session ended';
  el.modalBody.innerHTML = `
    <p>Trades: <strong>${s.buyCount}</strong> · Wins: <strong>${s.wins}</strong> · Losses: <strong>${s.losses}</strong></p>
    <p>Net result: <strong class="${s.netPL >= 0 ? 'pos' : 'neg'}">${(s.netPL >= 0 ? '+' : '')}$${s.netPL.toFixed(2)}</strong></p>
  `;
  el.modal.classList.add('is-open');
}
