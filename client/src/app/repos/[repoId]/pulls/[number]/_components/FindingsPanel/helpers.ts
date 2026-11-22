import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Drop low-confidence findings when "hide low confidence" is on. */
export function filterByConfidence(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  return hideLow ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD) : findings;
}

/** Apply the panel filters (confidence, then severity) and sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  { hideLow, severity }: { hideLow: boolean; severity: Severity | null },
): FindingRecord[] {
  let shown = filterByConfidence(findings, hideLow);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
