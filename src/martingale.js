import { MAX_MARTINGALE_STEPS, MIN_STAKE } from './config.js';

export const RISK = {
  LOW:    { label: 'Low',    multiplier: 1.0, hint: 'Flat stake · no martingale' },
  MEDIUM: { label: 'Medium', multiplier: 1.6, hint: 'Martingale ×1.6 on loss · capped at 3 steps' },
  HIGH:   { label: 'High',   multiplier: 2.0, hint: 'Martingale ×2.0 on loss · capped at 3 steps' },
};

export function stakeForStep({ riskLevel, baseStake, consecutiveLosses }) {
  const r = RISK[riskLevel];
  if (!r) return baseStake;
  const step = Math.min(consecutiveLosses, MAX_MARTINGALE_STEPS);
  return round2(baseStake * Math.pow(r.multiplier, step));
}

export function sequencePreview({ riskLevel, baseStake }) {
  return Array.from(
    { length: MAX_MARTINGALE_STEPS + 1 },
    (_, k) => stakeForStep({ riskLevel, baseStake, consecutiveLosses: k })
  );
}

export function worstCaseExposure({ riskLevel, baseStake }) {
  return round2(sequencePreview({ riskLevel, baseStake }).reduce((a, b) => a + b, 0));
}

export function validate({ riskLevel, baseStake, profitTarget, maxLoss }) {
  if (!RISK[riskLevel]) return 'Pick a risk level.';
  if (!(baseStake >= MIN_STAKE)) return `Stake must be at least $${MIN_STAKE.toFixed(2)}.`;
  if (!(profitTarget > 0)) return 'Profit target must be above zero.';
  if (!(maxLoss >= baseStake)) return 'Max loss must cover at least one stake.';
  const worst = worstCaseExposure({ riskLevel, baseStake });
  if (riskLevel !== 'LOW' && maxLoss < worst) {
    return `Max loss $${maxLoss.toFixed(2)} cannot survive a full ${RISK[riskLevel].label.toLowerCase()}-risk sequence (worst case $${worst.toFixed(2)}). Increase max loss or lower risk.`;
  }
  return null;
}

function round2(n) { return Math.round(n * 100) / 100; }
