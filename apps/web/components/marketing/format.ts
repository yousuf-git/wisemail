/** Small formatting helpers for marketing copy. All numbers themselves come from `lib/billing/plans.ts`. */

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const compactCount = (n: number) =>
  n >= 1_000_000 ? `${trim(n / 1_000_000)}M` : n >= 1_000 ? `${trim(n / 1_000)}k` : String(n);

export const formatRetention = (days: number) => {
  if (days > 0 && days % 365 === 0) return days === 365 ? "1 year" : `${days / 365} years`;
  return `${days} days`;
};

export const usd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

export const limitLabel = (n: number | null) => (n === null ? "Unlimited" : String(n));
