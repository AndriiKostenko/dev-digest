# M2 — Severity counters (client)

Status: implemented (client + server), verified in headless Chrome against the dev stack (2026-11-22) ·
API/contract counterpart: [server/specs/M2-severity-counters.md](../../server/specs/M2-severity-counters.md)

## Goal
Show how findings split by severity without scrolling and counting by eye:
1. **Agent runs → Review runs:** counters "1 CRITICAL · 3 WARNING · 1 SUGGESTION" in the body of an expanded run,
   above the cards. Clicking a level keeps only its findings; clicking it again restores the full list.
2. **PR list:** a FINDINGS column (icon + count per level) between SCORE and STATUS.
3. **Agent runs → Timeline:** each settled run row shows icon + count per level and "· N blockers" instead of the
   "N finding(s)" text (added 2026-11-22 after comparing with the design: the icons were assumed to exist but did not).

## Scope
In: the three surfaces above, one shared counter component.
Out (separate tasks): Run Review / Auto-review / Triage queue / Review all on the PR list, multi-select, filter in the
URL, jumping from the list to a filtered run.
- **Hover popovers with the findings list** — on the list's FINDINGS cell and on the Timeline icons ("N FINDINGS" +
  title, category, file:line, confidence, rationale excerpt per finding — see the designs). Deferred by the product
  owner on 2026-11-22; today both only have the native `title` tooltip ("2 Critical"). Build one shared component; the DS
  has no popover primitive (only the click `Dropdown`). Data: the Timeline already has the findings on the page
  (`usePrReviews`); the list returns counts only — either a new `GET /pulls/:id/findings` returning exactly the counted
  set (aggregation rule stays on the server), or lazy `usePrReviews` on hover plus a client copy of the rule (risk:
  popup total ≠ counters).
- **Other differences from the Agent-runs design** (found 2026-11-22, not severity-related):
  timeline row shows cost only (design: `9 119 tok · $0.0013`) and a trace icon (design: copy icon) — both deferred in
  M1 · run header: agent icon in a tinted square, coloured score without a badge, run cost, `trace` link ·
  `VerdictBanner` tinted border/background by verdict (today only the icon box is tinted) · PR header renders the raw
  status key (`needs_review`, `merged`) instead of a label (`list.status.*` already has them), no "opened 3h ago", no
  "Compose review", Agent runs tab icon is `AlertOctagon` (design: Activity) · sidebar modules not built yet.

## Shared pieces
- `src/lib/severity.ts`: `SEVERITY_LEVELS` (contract order CRITICAL → WARNING → SUGGESTION, no INFO),
  `countBySeverity(findings)`, `countsByRun(reviews)` (counts keyed by `review.run_id`), `isEmptyCounts(counts)`.
  Imports **types only** from `@devdigest/shared` — see "Notes".
- `src/components/severity-count/SeverityCount.tsx`: `{ severity, count, showLabel?, active?, hover? }`.
  Icon + count (+ label) from `SEV` / `Icon` (`@devdigest/ui`); no custom palette.
  - Inactive: text and dotted underline in `SEV.c` (same look as the timeline counters in the design).
  - Active: solid `SEV.c` background, text `var(--bg-primary)`.
  - The label is always in the DOM (visually hidden when `showLabel` is off) so the level never relies on colour/icon
    alone; without a visible label the root also gets `title="2 Critical"`.
  - `SeverityBadge` is not used: it renders label → count ("CRITICAL 3") and is not a control.

## 1. Agent runs (`[number]/_components/`)
- `SeverityFilter/` (new, stateless): props `counts`, `active`, `onChange`.
  - `role="group"` + `aria-label="Filter by severity"`; each level is a `<button aria-pressed>` wrapping `SeverityCount showLabel`.
  - Tooltip: "Show only Critical findings" / "Show all findings" (when active).
  - Zero levels are hidden, **except the active one** (so the filter can always be cleared); nothing to show → renders nothing.
  - Click on the inactive level → `onChange(level)`; click on the active one → `onChange(null)`. Single-select.
- `FindingsPanel/`:
  - New state `severity: Severity | null` (local per run; resets when the accordion collapses).
  - `counts = countBySeverity(filterByConfidence(findings, hideLow))` — counters follow "Hide low confidence" but not
    the severity filter, so a counter always equals the cards its click leaves. Accepted/dismissed findings count
    (they are in the list); this differs from `blockers` in the run header (non-dismissed CRITICAL), which is unchanged.
  - `visibleFindings(findings, { hideLow, severity })`: confidence filter → severity filter → existing sort.
  - Changing either filter resets `focusIdx` to 0 (j/k/a/d act on a visible card).
  - `<SeverityFilter>` is the first child of the toolbar; the toggle keeps `marginLeft: auto` (right side).

## 2. PR list (`src/app/repos/[repoId]/pulls/`)
- `constants.ts`: `GRID` → `"1fr 132px 92px 60px 120px 118px 84px 78px"`; `COLUMN_KEYS` → `"findings"` after `"score"`.
  `page.tsx` needs no edit (header comes from `COLUMN_KEYS`).
- `_components/PRRow/PRRow.tsx`: cell after SCORE, `style={s.findingsCell}`.
  `finding_counts` null/absent or all zeros → muted `—`; otherwise `SeverityCount` (no label) for each level > 0.
  Counters are display-only; the row click still opens the PR.
- Semantics come from the API (`PrMeta.finding_counts`): latest review of each agent, dismissed excluded.
- The counters sit in `s.findingsCounts` (`marginLeft: -6` cancels `SeverityCount`'s side padding) so the icons line up
  with the column header; the `—` stays in `s.findingsCell` unshifted.

## 3. Timeline (`[number]/_components/RunHistory/`, `FindingsTab/`)
- `FindingsTab`: `severityByRun = useMemo(() => countsByRun(runs), [runs])` from the reviews already loaded for the
  Review runs section (no extra request); passed to `RunHistory`.
- `RunHistory`: new optional prop `severityByRun?: Record<string, SeverityCounts>`. For a settled (`done`) run with
  non-empty counts: `SeverityCount` (no label) per level > 0, then `runStatus.blockers` (" · N blockers", from
  `RunSummary.blockers`), in a row with `marginLeft: -6` to align with the agent name. Otherwise (review not loaded
  yet, run without a review, nothing found) the previous text "N finding(s) · N blockers" stays.
- Counts include dismissed findings: they describe what the run produced, so the total matches the run's "N findings".
- No new strings.

## i18n (`messages/en/prReview.json`)
`panel.severityFilterLabel` = "Filter by severity" · `panel.severityShowOnly` = "Show only {severity} findings" ·
`panel.severityShowAll` = "Show all findings" · `list.columns.findings` = "Findings". Level names come from `SEV.label`.

## Contracts
`SeverityCounts` (new, `contracts/findings.ts`) and `PrMeta.finding_counts` (`contracts/platform.ts`), mirrored in
`src/vendor/shared` — byte-identical to the server copy. See the server spec.

## Tests
- `src/lib/severity.test.ts`, `src/components/severity-count/SeverityCount.test.tsx`.
- `SeverityFilter.test.tsx`: order, zero levels hidden, nothing rendered when empty, `aria-pressed`, select, clear, active-at-zero.
- `FindingsPanel/helpers.test.ts` and `FindingsPanel.test.tsx`: counts 1/2/1, filter + restore, switching level,
  combined with hide-low (counter = cards left), no CRITICAL → no counter.
- `PRRow.test.tsx`: icon + count per non-zero level in order, `—` for null / all zeros / missing field.
  The `pr()` factory defaults to non-empty counts so the cost tests still see a single `—`.
- `RunHistory.test.tsx`: icons per level + blockers instead of text; text fallback without counts and for zero findings.
  `severity.test.ts`: `countsByRun` keys by run id, skips reviews without a run, sums reviews sharing a run.
- Manual testing data: `server/src/db/seed-severity-demo.ts` (PR #483 covers all three levels and the edge cases,
  #484 is never reviewed) — see the server spec, "Demo data".
- Not added: e2e steps (agent-browser is not installed locally). Candidates: `04-pr-findings` (click "1 Warning"),
  `02-repo-pulls-detail` (FINDINGS for #482 = 1 CRITICAL + 1 WARNING from the seed).

## Notes
- **Type-only imports from `@devdigest/shared` in client code.** The vendored contracts use ESM `./x.js` specifiers
  that webpack (next dev/build) cannot resolve; tsc and vitest can, so a runtime import (`Severity.options`) passes
  typecheck and tests but breaks the page with "Module not found". `SEVERITY_LEVELS` is therefore declared locally from
  a `Record<Severity, true>`, which fails typecheck if the contract's levels change.
- Active WARNING in the light theme has ≈3:1 contrast (white on `#d97706`): accepted by the product owner. Change in
  `SeverityCount/styles.ts` only.
- Pre-existing, out of scope: every open `FindingsPanel` binds `keydown` on `window`, so with several runs expanded
  `a`/`d` act on the focused finding of each; `FindingCard` styles mix `borderColor` and `borderLeftColor`
  (React warns when `focused` flips).
