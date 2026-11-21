import { describe, it, expect } from "vitest";
import { formatCost } from "./format-cost";

describe("formatCost", () => {
  it("renders an em dash for unknown cost", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });

  it("renders zero as $0.00 (a real, free run — not unknown)", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("uses 4 decimals below one cent", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.00999)).toBe("$0.0100");
  });

  it("uses 3 decimals from one cent up to one dollar", () => {
    expect(formatCost(0.01)).toBe("$0.010");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.06)).toBe("$0.060");
  });

  it("uses 2 decimals from one dollar", () => {
    expect(formatCost(1)).toBe("$1.00");
    expect(formatCost(1.234)).toBe("$1.23");
  });
});
