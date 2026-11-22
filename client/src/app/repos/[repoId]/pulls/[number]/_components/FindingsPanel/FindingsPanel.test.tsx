import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> & Pick<FindingRecord, "id" | "severity" | "title">): FindingRecord {
  return {
    category: "security",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const FINDINGS: FindingRecord[] = [
  finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret" }),
];

// 1 CRITICAL · 2 WARNING (one low-confidence) · 1 SUGGESTION
const MIXED: FindingRecord[] = [
  finding({ id: "s1", severity: "SUGGESTION", title: "Extract magic number" }),
  finding({ id: "w1", severity: "WARNING", title: "N+1 query" }),
  finding({ id: "c1", severity: "CRITICAL", title: "Missing auth" }),
  finding({ id: "w2", severity: "WARNING", title: "Loose regex", confidence: 0.5 }),
];

const ALL_TITLES = ["Missing auth", "N+1 query", "Loose regex", "Extract magic number"];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const shownTitles = () => ALL_TITLES.filter((title) => screen.queryByText(title) !== null);

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by severity" })).not.toBeInTheDocument();
  });
});

describe("FindingsPanel severity counters", () => {
  it("shows one counter per level with the run's counts", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const group = screen.getByRole("group", { name: "Filter by severity" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
      "1 Critical",
      "2 Warning",
      "1 Suggestion",
    ]);
    expect(shownTitles()).toEqual(ALL_TITLES);
  });

  it("keeps only the clicked level's cards and restores the full list on a second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const warning = screen.getByRole("button", { name: "2 Warning" });

    fireEvent.click(warning);
    expect(warning).toHaveAttribute("aria-pressed", "true");
    expect(shownTitles()).toEqual(["N+1 query", "Loose regex"]);

    fireEvent.click(warning);
    expect(warning).toHaveAttribute("aria-pressed", "false");
    expect(shownTitles()).toEqual(ALL_TITLES);
  });

  it("moves the selection when another level is clicked", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "1 Critical" }));
    fireEvent.click(screen.getByRole("button", { name: "2 Warning" }));
    expect(screen.getByRole("button", { name: "1 Critical" })).toHaveAttribute("aria-pressed", "false");
    expect(shownTitles()).toEqual(["N+1 query", "Loose regex"]);
  });

  it("combines with hide low confidence — the counter matches the cards left", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    const warning = screen.getByRole("button", { name: "1 Warning" });
    fireEvent.click(warning);
    expect(shownTitles()).toEqual(["N+1 query"]);
  });

  it("does not render a counter for a level the run has no findings of", () => {
    renderWithIntl(
      <FindingsPanel findings={MIXED.filter((f) => f.severity !== "CRITICAL")} prId="pr1" />,
    );
    expect(screen.queryByRole("button", { name: /critical/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 Warning" })).toBeInTheDocument();
  });
});
