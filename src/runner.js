import * as broker from './broker.js';
import * as portfolio from './portfolio.js';
import * as guard from './guard.js';
import { stakeForStep, validate } from './martingale.js';
import { MIN_STAKE } from './config.js';

const MAX_CONSEC_LOSSES = 4; // base + 3 escalations = the video's "capped at 3 steps"

const state = {
  running: false,
  config: null,
  account: null,
  pending: null,
  trades: [],
  stake: 0,
  consecutiveLosses: 0,
  wins: 0,
  losses: 0,
  settledStake: 0,
  settledPayout: 0,
  netPL: 0,
  buyCount: 0,
};

const hooks = { onUpdate: () => {}, onStop: () => {} };

export function init(h) {
  Object.assign(hooks, h);
  broker.setHandlers({
    onOpen: handleOpen,
    onClose: handleClose,
    onMessage: handleMessage,
    onError: (e) => console.error('Broker error', e),
  });
}

export function start(config, account) {
  if (state.running) return 'Already running.';
  const err = validate(config);
  if (err) return err;
  if (!account || account.type !== 'demo') return 'Real-account execution is disabled. Connect a demo account.';
  if (guard.isKilled()) return 'Kill switch engaged: ' + guard.killReason();

  state.config = config;
  state.account = account;
  state.pending = null;
  state.trades = [];
  state.stake = config.baseStake;
  state.consecutiveLosses = 0;
  state.wins = 0;
  state.losses = 0;
  state.settledStake = 0;
  state.settledPayout = 0;
  state.netPL = 0;
  state.buyCount = 0;
  state.running = true;

  broker.send({ balance: 1, subscribe: 1 });
  broker.send({ portfolio: 1 });
  broker.send({ ticks: config.market, subscribe: 1 });
  hooks.onUpdate();
  return null;
}

export function stop(reason) {
  if (!state.running) return;
  state.running = false;
  state.pending = null;
  if (state.config && state.config.market) {
    broker.send({ ticks: state.config.market, unsubscribe: 1 });
  }
  hooks.onUpdate();
  hooks.onStop(reason || 'manual');
}

export function sellContract(contractId) {
  broker.send({ sell: contractId, price: 0 });
}

export function snapshot() {
  return {
    running: state.running,
    trades: state.trades.slice(),
    wins: state.wins,
    losses: state.losses,
    settledStake: state.settledStake,
    settledPayout: state.settledPayout,
    netPL: state.netPL,
    buyCount: state.buyCount,
    consecutiveLosses: state.consecutiveLosses,
    currentStake: state.stake,
    config: state.config,
    pendingPhase: state.pending ? state.pending.phase : null,
  };
}

function handleOpen() {
  broker.send({ balance: 1, subscribe: 1 });
  broker.send({ portfolio: 1 });
  if (state.running && state.config) {
    broker.send({ ticks: state.config.market, subscribe: 1 });
  }
}

function handleClose() {
  if (state.running) stop('connection_lost');
}

function handleMessage(d) {
  if (d.error) return handleError(d);
  switch (d.msg_type) {
    case 'tick':                    return handleTick(d);
    case 'proposal':                return handleProposal(d);
    case 'buy':                     return handleBuy(d);
    case 'proposal_open_contract':  return handlePOC(d);
    case 'portfolio':               return handlePortfolio(d);
  }
}

function handleError(d) {
  if (state.pending && d.req_id === state.pending.reqId) {
    const wasBuying = state.pending.phase === 'buy';
    state.pending = null;
    hooks.onUpdate();
    console.warn('Trade error:', d.error.code, d.error.message);
    // A buy that errored may still have been placed. Reconcile to be safe.
    if (wasBuying) broker.send({ portfolio: 1 });
  }
}

function handleTick() {
  if (!state.running || !state.config) return;
  if (state.pending && Date.now() - (state.pending.at || 0) > 15_000) state.pending = null;
  if (state.pending) return;
  if (!broker.isOpen()) return;
  if (guard.isKilled()) return stop('kill_switch');
  if (state.netPL >= state.config.profitTarget) return stop('target_hit');
  if (state.netPL <= -state.config.maxLoss) return stop('max_loss');
  if (state.config.riskLevel !== 'LOW' && state.consecutiveLosses >= MAX_CONSEC_LOSSES) return stop('martingale_cap');
  propose();
}

function propose() {
  const c = state.config;
  const room = Math.max(0, c.maxLoss + state.netPL);
  const amount = round2(Math.min(state.stake, room));
  if (amount < MIN_STAKE) return stop('max_loss');
  const reqId = broker.nextReqId();
  state.pending = { phase: 'proposal', reqId, at: Date.now(), stake: amount };
  const ok = broker.send({
    proposal: 1,
    amount,
    basis: 'stake',
    contract_type: contractTypeFor(c.strategy),
    currency: state.account.currency || 'USD',
    duration: 1,
    duration_unit: 't',
    underlying_symbol: c.market,
    req_id: reqId,
  });
  if (!ok) state.pending = null;
  hooks.onUpdate();
}

function contractTypeFor(strategy) {
  return ({ RISE: 'CALL', FALL: 'PUT', EVEN: 'DIGITEVEN', ODD: 'DIGITODD' })[strategy] || 'CALL';
}

function handleProposal(d) {
  if (!state.pending || d.req_id !== state.pending.reqId) return;
  if (!state.running) { state.pending = null; return; } // stopped mid-flight: cancel the buy
  if (!d.proposal) { state.pending = null; hooks.onUpdate(); return; }
  const buyReqId = broker.nextReqId();
  state.pending = { phase: 'buy', reqId: buyReqId, at: Date.now(), stake: state.pending.stake };
  broker.send({ buy: d.proposal.id, price: Number(d.proposal.ask_price), req_id: buyReqId });
  hooks.onUpdate();
}

function handleBuy(d) {
  if (!state.pending || d.req_id !== state.pending.reqId) return;
  if (!d.buy || !d.buy.contract_id) { state.pending = null; hooks.onUpdate(); return; }
  const cid = String(d.buy.contract_id);
  const trade = {
    contractId: cid,
    stake: state.pending.stake,
    status: 'open',
    openedAt: Date.now(),
    profit: 0,
    payout: 0,
    strategy: state.config ? state.config.strategy : 'unknown',
  };
  state.trades.push(trade);
  state.buyCount++;
  portfolio.remember(cid, { stake: trade.stake, strategy: trade.strategy, openedAt: trade.openedAt });
  state.pending = { phase: 'open', reqId: broker.nextReqId(), at: Date.now(), contractId: cid };
  broker.send({ proposal_open_contract: 1, contract_id: cid, subscribe: 1 });
  hooks.onUpdate();
}

function handlePOC(d) {
  const poc = d.proposal_open_contract;
  if (!poc) return;
  const cid = String(poc.contract_id);
  const trade = state.trades.find(t => t.contractId === cid);
  if (!trade) return;

  if (!poc.is_sold) {
    trade.currentValue = Number(poc.bid_price) || 0;
    trade.currentProfit = Number(poc.profit) || 0;
    hooks.onUpdate();
    return;
  }

  const profit = Number(poc.profit) || 0;
  const sellPrice = Number(poc.sell_price) || 0;
  trade.status = profit > 0 ? 'won' : 'lost';
  trade.profit = profit;
  trade.payout = sellPrice;
  trade.closedAt = Date.now();
  trade.entry = poc.entry_tick ?? poc.entry_spot ?? null;
  trade.exit = poc.exit_tick ?? poc.exit_spot ?? null;

  if (state.pending && state.pending.contractId === cid) state.pending = null;
  portfolio.forget(cid);
  if (d.subscription && d.subscription.id) broker.send({ forget: d.subscription.id });

  state.settledStake = round2(state.settledStake + trade.stake);
  state.settledPayout = round2(state.settledPayout + sellPrice);
  state.netPL = round2(state.netPL + profit);
  if (profit > 0) {
    state.wins++;
    state.consecutiveLosses = 0;
    if (state.config) state.stake = state.config.baseStake;
  } else {
    state.losses++;
    state.consecutiveLosses++;
    if (state.config) {
      state.stake = stakeForStep({ ...state.config, consecutiveLosses: state.consecutiveLosses });
    }
  }

  // Post-settlement stop conditions
  if (state.config) {
    if (state.netPL >= state.config.profitTarget) return stop('target_hit');
    if (state.netPL <= -state.config.maxLoss) return stop('max_loss');
    if (state.config.riskLevel !== 'LOW' && state.consecutiveLosses >= MAX_CONSEC_LOSSES) return stop('martingale_cap');
  }
  hooks.onUpdate();
}

function handlePortfolio(d) {
  const contracts = Array.isArray(d.portfolio?.contracts) ? d.portfolio.contracts : [];
  const liveIds = new Set(contracts.map(c => String(c.contract_id)));

  // Anything Deriv no longer lists has settled or been cancelled while we were away.
  Array.from(portfolio.active.keys()).forEach(cid => {
    if (!liveIds.has(cid)) {
      portfolio.forget(cid);
      const trade = state.trades.find(t => t.contractId === cid);
      if (trade && trade.status === 'open') {
        trade.status = 'unknown';
        trade.profit = null;
      }
    }
  });

  // Re-subscribe to anything still open; recover ghost contracts we never logged.
  contracts.forEach(c => {
    const cid = String(c.contract_id);
    let trade = state.trades.find(t => t.contractId === cid);
    if (!trade) {
      trade = {
        contractId: cid,
        stake: Number(c.buy_price) || 0,
        status: 'open',
        openedAt: Number(c.purchase_time) * 1000 || Date.now(),
        profit: 0,
        payout: 0,
        strategy: c.contract_type === 'CALL' ? 'RISE' : c.contract_type === 'PUT' ? 'FALL'
                : c.contract_type === 'DIGITEVEN' ? 'EVEN' : c.contract_type === 'DIGITODD' ? 'ODD' : 'unknown',
        ghost: true,
      };
      state.trades.push(trade);
      state.buyCount++;
      portfolio.remember(cid, { stake: trade.stake, strategy: trade.strategy, openedAt: trade.openedAt });
    }
    broker.send({ proposal_open_contract: 1, contract_id: cid, subscribe: 1 });
  });

  hooks.onUpdate();
}

function round2(n) { return Math.round(n * 100) / 100; }
