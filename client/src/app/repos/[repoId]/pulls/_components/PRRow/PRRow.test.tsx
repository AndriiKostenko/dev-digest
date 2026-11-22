/**
 * PRRow — COST cell (M1-run-cost): known total, unknown (—) and partial (≥ + hint).
 * FINDINGS cell (M2-severity-counters): icon + count per non-zero level, — otherwise.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T03:00:00Z",
    score: 61,
    cost_usd: null,
    cost_partial: false,
    // Non-empty by default so this cell never adds a second "—" to the cost tests.
    finding_counts: { CRITICAL: 2, WARNING: 2, SUGGESTION: 2 },
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows the formatted total when cost is known", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows an em dash when no run has a known cost", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getByText("—", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("treats a missing cost (old API / detail payload) like unknown", () => {
    const { cost_usd: _c, cost_partial: _p, ...rest } = pr({});
    renderRow(rest as PrMeta);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("prefixes ≥ and explains why when some runs have unknown cost", () => {
    renderRow(pr({ cost_usd: 0.003, cost_partial: true }));
    const cell = screen.getByText(/≥\s*\$0\.0030/);
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveAttribute("title", messages.list.costPartialHint);
  });

  it("has no ≥ prefix or hint for a complete total", () => {
    renderRow(pr({ cost_usd: 0.003, cost_partial: false }));
    const cell = screen.getByText("$0.0030");
    expect(cell).not.toHaveAttribute("title");
  });
});

describe("PRRow — findings cell", () => {
  const counter = (container: HTMLElement, sev: string) =>
    container.querySelector(`[data-severity='${sev}']`) as HTMLElement | null;

  it("shows icon + count for every level with open findings, in contract order", () => {
    const { container } = renderRow(pr({ finding_counts: { CRITICAL: 1, WARNING: 4, SUGGESTION: 3 } }));
    const shown = Array.from(container.querySelectorAll("[data-severity]")).map((el) =>
      el.getAttribute("data-severity"),
    );
    expect(shown).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
    expect(counter(container, "WARNING")).toHaveTextContent("4 Warning");
    expect(counter(container, "WARNING")).toHaveAttribute("title", "4 Warning");
  });

  it("hides levels with no open findings", () => {
    const { container } = renderRow(pr({ finding_counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 1 } }));
    expect(counter(container, "CRITICAL")).toBeNull();
    expect(counter(container, "WARNING")).toBeNull();
    expect(counter(container, "SUGGESTION")).toHaveTextContent("1 Suggestion");
  });

  it("shows an em dash when the PR was never reviewed", () => {
    const { container } = renderRow(pr({ finding_counts: null, cost_usd: 0.01 }));
    expect(container.querySelector("[data-severity]")).toBeNull();
    expect(screen.getByText("—", { selector: "span" })).toBeInTheDocument();
  });

  it("shows an em dash when the review found nothing open", () => {
    const { container } = renderRow(
      pr({ finding_counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, cost_usd: 0.01 }),
    );
    expect(container.querySelector("[data-severity]")).toBeNull();
    expect(screen.getByText("—", { selector: "span" })).toBeInTheDocument();
  });

  it("treats a missing field (old API / detail payload) like never reviewed", () => {
    const { finding_counts: _f, ...rest } = pr({ cost_usd: 0.01 });
    const { container } = renderRow(rest as PrMeta);
    expect(container.querySelector("[data-severity]")).toBeNull();
  });
});
