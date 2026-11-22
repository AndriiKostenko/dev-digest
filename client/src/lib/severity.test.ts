import { describe, it, expect } from "vitest";
import { SEVERITY_LEVELS, countBySeverity, countsByRun, isEmptyCounts } from "./severity";

describe("SEVERITY_LEVELS", () => {
  it("follows the contract order and has no INFO", () => {
    expect(SEVERITY_LEVELS).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
  });
});

describe("countBySeverity", () => {
  it("returns zeros for every level when there are no findings", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("counts each level, keeping absent levels at 0", () => {
    const counts = countBySeverity([
      { severity: "WARNING" },
      { severity: "CRITICAL" },
      { severity: "WARNING" },
    ]);
    expect(counts).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 });
  });
});

describe("isEmptyCounts", () => {
  it("is true for null/undefined and all-zero counts", () => {
    expect(isEmptyCounts(null)).toBe(true);
    expect(isEmptyCounts(undefined)).toBe(true);
    expect(isEmptyCounts({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 })).toBe(true);
  });

  it("is false when any level has a finding", () => {
    expect(isEmptyCounts({ CRITICAL: 0, WARNING: 0, SUGGESTION: 1 })).toBe(false);
  });
});

describe("countsByRun", () => {
  it("keys counts by the review's run id and skips reviews without a run", () => {
    const byRun = countsByRun([
      { run_id: "run-a", findings: [{ severity: "CRITICAL" }, { severity: "CRITICAL" }, { severity: "WARNING" }] },
      { run_id: "run-b", findings: [] },
      { run_id: null, findings: [{ severity: "SUGGESTION" }] },
    ]);
    expect(byRun).toEqual({
      "run-a": { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 },
      "run-b": { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
    });
  });

  it("sums reviews that share a run id", () => {
    const byRun = countsByRun([
      { run_id: "run-a", findings: [{ severity: "WARNING" }] },
      { run_id: "run-a", findings: [{ severity: "WARNING" }, { severity: "SUGGESTION" }] },
    ]);
    expect(byRun["run-a"]).toEqual({ CRITICAL: 0, WARNING: 2, SUGGESTION: 1 });
  });
});
