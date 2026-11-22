import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { filterByConfidence, visibleFindings } from "./helpers";

function f(id: string, severity: FindingRecord["severity"], confidence = 0.9): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: id,
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS = [f("s1", "SUGGESTION"), f("w1", "WARNING"), f("c1", "CRITICAL"), f("w2", "WARNING", 0.5)];
const ids = (list: FindingRecord[]) => list.map((x) => x.id);

describe("filterByConfidence", () => {
  it("keeps everything when hide-low is off", () => {
    expect(ids(filterByConfidence(FINDINGS, false))).toEqual(["s1", "w1", "c1", "w2"]);
  });

  it("drops findings below the threshold when hide-low is on", () => {
    expect(ids(filterByConfidence(FINDINGS, true))).toEqual(["s1", "w1", "c1"]);
  });
});

describe("visibleFindings", () => {
  it("sorts by severity when no filter is set", () => {
    expect(ids(visibleFindings(FINDINGS, { hideLow: false, severity: null }))).toEqual([
      "c1",
      "w1",
      "w2",
      "s1",
    ]);
  });

  it("keeps only the selected severity", () => {
    expect(ids(visibleFindings(FINDINGS, { hideLow: false, severity: "WARNING" }))).toEqual(["w1", "w2"]);
  });

  it("applies severity and confidence together", () => {
    expect(ids(visibleFindings(FINDINGS, { hideLow: true, severity: "WARNING" }))).toEqual(["w1"]);
  });

  it("returns an empty list when the selected severity has no findings", () => {
    expect(visibleFindings([f("c1", "CRITICAL")], { hideLow: false, severity: "SUGGESTION" })).toEqual([]);
  });
});
