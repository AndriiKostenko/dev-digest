import type { CSSProperties } from "react";

/** Styles for SeverityCount. Colours come only from the design system's SEV tokens. */
export const s = {
  /** Outer box: fixed padding/radius in both states so toggling never shifts layout. */
  root: (c: string, bg: string, active: boolean, hover: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 6px",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    color: active ? "var(--bg-primary)" : c,
    background: active ? c : hover ? bg : "transparent",
    transition: "background .12s, color .12s",
  }),
  /** Icon + count (+ label), dotted-underlined like the timeline counters when inactive. */
  content: (c: string, active: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    borderBottom: `1px dotted ${active ? "transparent" : c}`,
  }),
  /** Visually hidden, still read by screen readers (no sr-only utility in this app). */
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
} as const;
