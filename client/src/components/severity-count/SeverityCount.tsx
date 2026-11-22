/* SeverityCount — "icon + count (+ label)" for one severity level, styled like
   the timeline's severity counters (dotted underline in the level colour).
   Presentational and stateless: the PR list FINDINGS column renders it as-is,
   the Agent-runs SeverityFilter wraps it in a toggle button and drives
   `active` / `hover`. Colours, icon and label come from the design system's
   SEV map; the label is always in the DOM (visually hidden when `showLabel` is
   off) so the level is never conveyed by colour/icon alone. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { s } from "./styles";

export function SeverityCount({
  severity,
  count,
  showLabel = false,
  active = false,
  hover = false,
}: {
  severity: Severity;
  count: number;
  /** Show the level name next to the count ("3 CRITICAL"); otherwise icon + count only. */
  showLabel?: boolean;
  /** Selected state (solid fill) — used by the severity filter. */
  active?: boolean;
  /** Hover tint — used by the severity filter. */
  hover?: boolean;
}) {
  const sev = SEV[severity];
  const I = Icon[sev.icon];
  return (
    <span
      data-severity={severity}
      title={showLabel ? undefined : `${count} ${sev.label}`}
      style={s.root(sev.c, sev.bg, active, hover)}
    >
      <span style={s.content(sev.c, active)}>
        <I size={12.5} />
        <span className="tnum">{count}</span>{" "}
        <span style={showLabel ? undefined : s.srOnly}>{sev.label}</span>
      </span>
    </span>
  );
}

export default SeverityCount;
