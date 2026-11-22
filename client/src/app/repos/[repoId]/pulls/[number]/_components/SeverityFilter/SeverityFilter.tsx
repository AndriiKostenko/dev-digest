/* SeverityFilter — per-run severity counters above the finding cards
   ("1 CRITICAL · 3 WARNING · 1 SUGGESTION"). Each counter is a toggle: click
   shows only that level, clicking the active one again clears the filter.
   Stateless: FindingsPanel owns the selected level and the counts. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { Severity, SeverityCounts } from "@devdigest/shared";
import { SeverityCount } from "@/components/severity-count";
import { SEVERITY_LEVELS } from "@/lib/severity";
import { s } from "./styles";

export function SeverityFilter({
  counts,
  active,
  onChange,
}: {
  counts: SeverityCounts;
  active: Severity | null;
  onChange: (next: Severity | null) => void;
}) {
  const t = useTranslations("prReview");
  // Zero levels are hidden — except the active one, so the filter can always be
  // cleared (e.g. "hide low confidence" turned on after selecting a level).
  const levels = SEVERITY_LEVELS.filter((sev) => counts[sev] > 0 || sev === active);
  if (levels.length === 0) return null;

  return (
    <div role="group" aria-label={t("panel.severityFilterLabel")} style={s.group}>
      {levels.map((sev) => {
        const isActive = sev === active;
        return (
          <FilterButton
            key={sev}
            severity={sev}
            count={counts[sev]}
            active={isActive}
            title={
              isActive
                ? t("panel.severityShowAll")
                : t("panel.severityShowOnly", { severity: SEV[sev].label })
            }
            onClick={() => onChange(isActive ? null : sev)}
          />
        );
      })}
    </div>
  );
}

function FilterButton({
  severity,
  count,
  active,
  title,
  onClick,
}: {
  severity: Severity;
  count: number;
  active: boolean;
  title: string;
  onClick: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={s.button}
    >
      <SeverityCount severity={severity} count={count} showLabel active={active} hover={hover} />
    </button>
  );
}

export default SeverityFilter;
