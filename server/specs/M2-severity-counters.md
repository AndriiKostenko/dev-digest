# M2 — Severity counters (server)

Status: implemented (client + server), tests green, verified against the dev DB (2026-11-22) ·
UI counterpart: [client/specs/M2-severity-counters.md](../../client/specs/M2-severity-counters.md)

## Goal
Give the PR list a FINDINGS column: open findings per severity for each PR, without N+1 requests from the client.
(The Agent runs severity filter is client-only: `GET /pulls/:id/reviews` already returns every finding.)

## Background
- The list handler said the per-severity breakdown was "intentionally not surfaced on the list". `git log -S
  rollupSeverities` shows why: an earlier version (latest review only, dismissed included, flat
  `findings_critical/warning/suggestion` fields) was removed in `e07efea` "chore: cleanup before home tasks (#11)" —
  i.e. stripped so it could be rebuilt as an assignment, not a product decision against it. Still worth a one-line
  confirmation with the course owner/PM before merging.
- Leftover from that version: `rollupSeverities` + a lowercase `SeverityCounts` interface in
  `src/modules/pulls/status.ts` (covered by `test/pulls-status.test.ts`, unused by the routes). The new code counts in
  SQL and uses the contract's uppercase `SeverityCounts`; reuse or remove the helper in a follow-up.
- A client-only alternative would call `GET /pulls/:id/reviews` for every row (N+1, full finding payloads just to
  count, repeated on every list refetch) and move the aggregation rule into the UI.

## Requirements
1. `GET /repos/:id/pulls` → each `PrMeta` has `finding_counts: { CRITICAL, WARNING, SUGGESTION } | null`.
2. Counts are summed over the **latest review (`kind = 'review'`) of each agent** on the PR:
   a re-run never double-counts, and a multi-agent run never hides another agent's findings.
   Reviews with `agent_id = NULL` cannot be grouped, so each one counts on its own.
3. **Dismissed findings are excluded** (`dismissed_at IS NULL`); accepted ones count. All finding kinds count.
4. `null` when the PR has no review (summaries do not count), like `score`. A reviewed PR with nothing open → all zeros.
5. Off-contract `severity` values (the column is free text) are ignored.

## Contracts
Edit **both** copies (`server/src/vendor/shared` and `client/src/vendor/shared`); they are byte-identical after this change.
- `contracts/findings.ts`: `SeverityCounts = z.object({ CRITICAL, WARNING, SUGGESTION: z.number().int().min(0) })`.
- `contracts/platform.ts`: `PrMeta.finding_counts = SeverityCounts.nullish()` — `nullish` like `score`/`cost_usd`,
  because `PrMeta` is also produced by the GitHub adapter and extended by `PrDetail`. The list handler always sets it.

## Changes
- `src/modules/pulls/routes.ts` list handler, same "IN-query + JS grouping" pattern as SCORE and COST:
  - the existing newest-first reviews query also selects `id` and `agentId`; the same loop records the latest review
    per `(prId, agentId ?? review.id)`;
  - one grouped query: `findings` → `review_id, severity, count()` where `review_id IN (latest)` and
    `dismissed_at IS NULL`, `GROUP BY review_id, severity`; summed per PR in JS.
- No schema change, no migration.

## Tests
- `test/pulls-findings.it.test.ts` (Testcontainers): agent re-run counts only the newer review; dismissed CRITICAL
  excluded; off-contract severity ignored; reviewed-but-clean → zeros; two agentless reviews both count;
  summary-only → null; never reviewed → null.
- `test/contracts.test.ts`: `PrMeta` with and without `finding_counts`, `null`, and a partial object rejected.

## Notes
- `findings.review_id` has no index (only the FK from `0000_init.sql`), so the count query scans `findings`.
  Fine at local-first sizes; `/pulls/:id/reviews` already does the same. An index is a separate follow-up
  (schema change + `pnpm db:generate`).

## Demo data (manual testing)
`src/db/seed-severity-demo.ts` — dev-only, **not** part of `pnpm db:seed` (e2e flows and integration tests rely on the
main seed). Adds PR #483 (five runs from the three built-in agents covering CRITICAL/WARNING/SUGGESTION, a dismissed
finding, a 62%-confidence finding, a superseded re-run, a failed run and a clean run) and PR #484 (never reviewed) to
`acme/payments-api`. Expected results are listed in the file header.
- `pnpm exec tsx src/db/seed-severity-demo.ts` — (re)create; idempotent (deletes #483/#484 and their runs first).
- `pnpm exec tsx src/db/seed-severity-demo.ts --remove` — delete them again.
- Requires `pnpm db:seed` first. `agent_runs.pr_id` is `ON DELETE SET NULL`, so the script deletes runs explicitly.
