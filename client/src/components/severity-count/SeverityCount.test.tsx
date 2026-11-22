import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SeverityCount } from "./SeverityCount";

afterEach(cleanup);

describe("SeverityCount", () => {
  it("renders count then label (\"3 Critical\") when the label is shown", () => {
    const { container } = render(<SeverityCount severity="CRITICAL" count={3} showLabel />);
    expect(container.textContent).toBe("3 Critical");
    // the visible label carries no tooltip — the wrapping control owns it
    expect(container.querySelector("[title]")).toBeNull();
  });

  it("keeps the label for screen readers and as a tooltip when it is hidden", () => {
    const { container } = render(<SeverityCount severity="WARNING" count={2} />);
    expect(container.textContent).toBe("2 Warning");
    const root = container.querySelector("[data-severity='WARNING']") as HTMLElement;
    expect(root.title).toBe("2 Warning");
    const label = Array.from(root.querySelectorAll("span")).find((el) => el.textContent === "Warning");
    expect(label?.style.position).toBe("absolute"); // visually hidden
  });

  it("fills with the level colour when active", () => {
    const { container } = render(<SeverityCount severity="SUGGESTION" count={1} showLabel active />);
    const root = container.querySelector("[data-severity='SUGGESTION']") as HTMLElement;
    expect(root.style.background).toBe("var(--sugg)");
    expect(root.style.color).toBe("var(--bg-primary)");
  });
});
