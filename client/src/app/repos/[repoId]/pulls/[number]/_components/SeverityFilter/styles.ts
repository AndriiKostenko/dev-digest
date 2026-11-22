import type { CSSProperties } from "react";

/** Co-located styles for SeverityFilter. The counter look lives in SeverityCount. */
export const s = {
  group: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  /** Bare button: SeverityCount draws the visuals; keep the native focus ring. */
  button: {
    background: "none",
    border: "none",
    padding: 0,
    borderRadius: 5,
    cursor: "pointer",
    font: "inherit",
  } satisfies CSSProperties,
} as const;
