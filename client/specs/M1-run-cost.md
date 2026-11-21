# M1 — Run cost (client)

Status: implemented (client + server), manually verified in the browser on all 3 screens (2026-11-21) · API/contract counterpart: [server/specs/M1-run-cost.md](../../server/specs/M1-run-cost.md)

## Goal
Show run cost on three screens. No new React components: inserts into existing ones plus one pure helper.

## Scope
In: COST column in the PR list · cost under the time in each timeline row · COST tile in the run drawer Stats.
Out (separate tasks): tokens text in the timeline row, FINDINGS column and row actions / "Run Review" in the PR list,
copy icon in the timeline row, drawer title format "PR #N · completed".

## Formatter
`src/lib/format-cost.ts` → `formatCost(usd: number | null | undefined): string`, same on all screens:
`null/undefined/NaN` → `—` · `0` → `$0.00` (a real free run, not unknown) · `< 0.01` → 4 decimals (`$0.0013`) ·
`< 1` → 3 decimals (`$0.014`) · `≥ 1` → 2 decimals.
Do not reuse the private `fmt` in `lib/model-label.ts` ($/1M pricing). Unit test next to it.

## Screens
1. **PR list** (`src/app/repos/[repoId]/pulls/`)
   - `constants.ts`: `GRID` → `"1fr 132px 92px 60px 118px 84px 78px"`; `COLUMN_KEYS` → add `"cost"` between `"status"` and `"updated"`. `page.tsx` needs no edit (header is generated from `COLUMN_KEYS`).
   - `_components/PRRow/PRRow.tsx`: new cell between STATUS and UPDATED, `className="tnum"`, `style={s.costCell}`.
     `cost_usd == null` → muted `—`; otherwise `formatCost(cost_usd)`, prefixed with `≥ ` and `title={t("list.costPartialHint")}` when `cost_partial`.
   - `styles.ts`: `costCell: { fontSize: 13, color: "var(--text-secondary)" }`.
2. **Timeline** (`[number]/_components/RunHistory/RunHistory.tsx`, right column at ~:198-200)
   - Under the timestamp: `{settled && <span className="mono tnum" title={t("timeline.cost")}>{formatCost(r.cost_usd)}</span>}`.
   - `settled` = `run.status === "done"`; `failed` / `cancelled` / `running` show nothing.
3. **Run drawer** (`[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, ~:63-67)
   - `<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />` between TOKENS and FINDINGS. `statsRow` is flex with `flex:1` tiles, no style change.

## i18n (`messages/en/`, only locale)
- `prReview.json`: `list.columns.cost` = "Cost"; `list.costPartialHint` = "Some runs have no cost data — total may be higher"; `timeline.cost` = "Run cost".
- `runs.json`: `trace.stat.cost` = "COST".

## Contracts
Mirror the server change in `src/vendor/shared` (`contracts/trace.ts`, `contracts/platform.ts`). See the server spec.

## Tests
- `format-cost.test.ts`: null, 0, `0.0013`, `0.014`, `1.234`.
- `RunHistory.test.tsx`: add `cost_usd` to the `run()` factory (required field); cost shown for `done`, hidden for `failed`; `null` → `—`.
- `RunTraceDrawer.test.tsx`: COST tile for a value and for missing/`null` → `—`.
- New PR list test: cost cell, `—`, partial `≥` prefix (no PR list tests exist today).
- Optional e2e: cost string on PR #482 in `e2e/specs/04-pr-findings.flow.json` (needs seeded runs).

## Notes
- The design's drawer `$0.06` is mock data; the formatter renders `$0.060`. Ask design to align timeline and drawer values for the same run.
