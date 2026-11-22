/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, SeverityCounts } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], severityByRun?: Record<string, SeverityCounts>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} severityByRun={severityByRun} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — run cost", () => {
  it("shows the formatted cost under the time on a settled run", () => {
    renderRuns([run({ status: "done", findings_count: 1, blockers: 0, score: 80, cost_usd: 0.0013 })]);
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("shows an em dash on a settled run whose cost is unknown", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 100, cost_usd: null })]);
    expect(screen.getByTitle("Run cost")).toHaveTextContent("—");
  });

  it("shows no cost on failed, cancelled or running runs", () => {
    renderRuns([
      run({ run_id: "r1", status: "failed", error: "429", cost_usd: null }),
      run({ run_id: "r2", status: "cancelled", cost_usd: 0.5 }),
      run({ run_id: "r3", status: "running", cost_usd: 0.5 }),
    ]);
    expect(screen.queryByTitle("Run cost")).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — severity icons", () => {
  it("shows icon + count per level and the blockers instead of 'N finding(s)'", () => {
    const { container } = renderRuns(
      [run({ status: "done", findings_count: 3, blockers: 2, score: 38 })],
      { "run-1": { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 } },
    );
    const levels = Array.from(container.querySelectorAll("[data-severity]")).map((el) => el.textContent);
    expect(levels).toEqual(["2 Critical", "1 Warning"]);
    expect(screen.getByTestId("run-severity")).toHaveTextContent(/2 blockers/);
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
  });

  it("falls back to the text when the run's review is not loaded", () => {
    const { container } = renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })], {});
    expect(container.querySelector("[data-severity]")).toBeNull();
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
  });

  it("keeps the text for a run that found nothing", () => {
    const { container } = renderRuns(
      [run({ status: "done", findings_count: 0, blockers: 0, score: 95 })],
      { "run-1": { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } },
    );
    expect(container.querySelector("[data-severity]")).toBeNull();
    expect(screen.getByText("0 finding(s)")).toBeInTheDocument();
  });
});
