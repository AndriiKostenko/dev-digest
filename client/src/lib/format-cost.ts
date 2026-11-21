/**
 * Run cost formatter shared by the PR list, the agent-run timeline and the run
 * drawer, so one amount always reads the same.
 *
 *   null / undefined → "—"   (unknown: old run, unknown-price model, failed run)
 *   0                → "$0.00"
 *   < $0.01          → 4 decimals ("$0.0013")
 *   < $1             → 3 decimals ("$0.014")
 *   ≥ $1             → 2 decimals ("$1.25")
 *
 * Not related to `model-label.ts`, which formats $/1M-token model prices.
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  const digits = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return `$${usd.toFixed(digits)}`;
}
