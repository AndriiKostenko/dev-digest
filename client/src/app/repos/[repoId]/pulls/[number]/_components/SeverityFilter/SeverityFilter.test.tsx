import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Severity, SeverityCounts } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityFilter } from "./SeverityFilter";

afterEach(cleanup);

function renderFilter(counts: SeverityCounts, active: Severity | null = null) {
  const onChange = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityFilter counts={counts} active={active} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return { ...utils, onChange };
}

describe("SeverityFilter", () => {
  it("shows non-zero levels in contract order, count first", () => {
    renderFilter({ CRITICAL: 1, WARNING: 3, SUGGESTION: 1 });
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["1 Critical", "3 Warning", "1 Suggestion"]);
    expect(screen.getByRole("group", { name: "Filter by severity" })).toBeInTheDocument();
  });

  it("hides levels with no findings", () => {
    renderFilter({ CRITICAL: 0, WARNING: 2, SUGGESTION: 2 });
    expect(screen.queryByRole("button", { name: /critical/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("renders nothing when every level is zero", () => {
    const { container } = renderFilter({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(container).toBeEmptyDOMElement();
  });

  it("selects a level on click and reflects it in aria-pressed", () => {
    const { onChange } = renderFilter({ CRITICAL: 1, WARNING: 3, SUGGESTION: 1 });
    const warning = screen.getByRole("button", { name: "3 Warning" });
    expect(warning).toHaveAttribute("aria-pressed", "false");
    expect(warning).toHaveAttribute("title", "Show only Warning findings");
    fireEvent.click(warning);
    expect(onChange).toHaveBeenCalledWith("WARNING");
  });

  it("clears the filter when the active level is clicked again", () => {
    const { onChange } = renderFilter({ CRITICAL: 1, WARNING: 3, SUGGESTION: 1 }, "WARNING");
    const warning = screen.getByRole("button", { name: "3 Warning" });
    expect(warning).toHaveAttribute("aria-pressed", "true");
    expect(warning).toHaveAttribute("title", "Show all findings");
    fireEvent.click(warning);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("keeps the active level visible at zero so it can be cleared", () => {
    renderFilter({ CRITICAL: 0, WARNING: 0, SUGGESTION: 1 }, "WARNING");
    expect(screen.getByRole("button", { name: "0 Warning" })).toHaveAttribute("aria-pressed", "true");
  });
});
