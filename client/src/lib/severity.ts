/* Severity helpers shared by the PR list (FINDINGS column) and the Agent runs
   tab (per-run severity filter). Levels follow the Zod contract, so the UI
   never invents its own (the design system's SEV map also has INFO, which no
   finding can carry).

   Type-only import on purpose: @devdigest/shared is bundled as TS source whose
   ESM `./x.js` specifiers webpack (next dev/build) cannot resolve, so only
   types may cross into client code — tsc and vitest resolve them, Next does not. */
import type { Severity, SeverityCounts } from "@devdigest/shared";

// Record<Severity, …> makes typecheck fail if the contract gains or drops a level.
const CONTRACT_LEVELS: Record<Severity, true> = { CRITICAL: true, WARNING: true, SUGGESTION: true };

/** Contract severity levels in display order: CRITICAL → WARNING → SUGGESTION. */
export const SEVERITY_LEVELS = Object.keys(CONTRACT_LEVELS) as readonly Severity[];

export type { SeverityCounts };

/** Count findings per severity level. Every level is present (0 when none). */
export function countBySeverity(findings: ReadonlyArray<{ severity: Severity }>): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

/**
 * Severity counts per agent run, from the PR's reviews (`review.run_id` links a
 * review to its timeline run). Counts every finding the run produced, dismissed
 * included, so the total matches the run's "N findings".
 */
export function countsByRun(
  reviews: ReadonlyArray<{ run_id: string | null; findings: ReadonlyArray<{ severity: Severity }> }>,
): Record<string, SeverityCounts> {
  const byRun: Record<string, SeverityCounts> = {};
  for (const review of reviews) {
    if (!review.run_id) continue;
    const counts = countBySeverity(review.findings);
    const prev = byRun[review.run_id];
    if (prev) for (const sev of SEVERITY_LEVELS) counts[sev] += prev[sev];
    byRun[review.run_id] = counts;
  }
  return byRun;
}

/** True when no level has a finding (or the counts are unknown). */
export function isEmptyCounts(counts: SeverityCounts | null | undefined): boolean {
  return !counts || SEVERITY_LEVELS.every((sev) => counts[sev] === 0);
}
