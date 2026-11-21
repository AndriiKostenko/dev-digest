# M1 — Run cost (server)

Status: implemented (client + server), manually verified in the browser on all 3 screens (2026-11-21) · UI counterpart: [client/specs/M1-run-cost.md](../../client/specs/M1-run-cost.md)

## Goal
Expose the dollar cost of AI review runs: per run (timeline, run trace) and per PR (PR list).

## Background
- Cost was removed on purpose in commit `d45ab0d` (migration `0009` dropped `agent_runs.cost_usd`); no reason is recorded.
  Confirm with the PM/owner before merging that reintroducing it is intended.
- reviewer-core already returns `ReviewOutcome.costUsd` (sum over chunks, `null` if any chunk is `null`).
  The server discards it at `src/modules/reviews/run-executor.ts:213`.

## Requirements
1. Persist run cost: `agent_runs.cost_usd` (`doublePrecision`, nullable). New migration `0010` generated with
   `pnpm db:generate`; never hand-edit SQL. Migrations are not applied on boot (`pnpm db:migrate`).
2. `GET /pulls/:id/runs` → each `RunSummary` has `cost_usd: number | null`.
3. `GET /runs/:id/trace` → `stats.cost_usd` is present for new runs. Stored traces without the key stay valid.
4. `GET /repos/:id/pulls` → each `PrMeta` has:
   - `cost_usd`: sum of non-null `agent_runs.cost_usd` for the PR, `null` when no run has a known cost;
   - `cost_partial`: `true` when some run with `tokens_in > 0` has a null cost (failed runs write 0 tokens, so they never flag it).
5. Failed / cancelled runs store `cost_usd = null`. Existing rows stay `null` (no backfill).
6. Deleting a run removes its cost from the PR total (no separate ledger).

## Contracts
Edit **both** copies (they have already drifted): `server/src/vendor/shared` and `client/src/vendor/shared`.
- `contracts/trace.ts`: `RunSummary.cost_usd = z.number().nullable()`, `RunStats.cost_usd = z.number().nullish()`.
- `contracts/platform.ts` `PrMeta`: `cost_usd = z.number().nullish()`, `cost_partial = z.boolean().optional()`.
  `nullish`/`optional` (like the existing `score`) because `PrMeta` is also produced by the GitHub adapter and extended by
  `PrDetail`, which are not list-only. The list handler always sets both fields.

## Changes
- `src/db/schema/runs.ts`, new migration `0010`.
- `src/modules/reviews/run-executor.ts`: pass `costUsd` on success, trace stats and failure paths (`null`). Mostly the reverse of `git show d45ab0d -- server/src`.
- `src/modules/reviews/repository.ts`, `repository/run.repo.ts`: `completeAgentRun` signature/`set`, `listRunsForPull` mapping.
- `src/modules/pulls/routes.ts` list handler: one grouped query on `agentRuns` (`SUM(cost_usd)`, `bool_or(tokens_in > 0 AND cost_usd IS NULL)`, `GROUP BY pr_id`, `inArray(prIds)`), same pattern as the latest-score query.
- Optional: seed 2–3 runs with costs for PR #482 in `src/db/seed.ts` (incl. one null).

## Tests
- `test/contracts.test.ts`: `RunTrace` fixture with and without `stats.cost_usd`.
- `test/reviews.it.test.ts`: after a run with the mock LLM (`costUsd: 0.001`), assert `agent_runs.cost_usd` and `stats.cost_usd`.
- New `*.it.test.ts`: `GET /pulls/:id/runs` returns `cost_usd`; `GET /repos/:id/pulls` returns sum, `null` and `cost_partial` cases.
- reviewer-core: unit test that `costUsd` sums across chunks and is `null` if any chunk is `null`.

## Risks
- Reversal of a deliberate removal (see Background).
- Unknown-price models and multi-chunk runs give `null` cost → many "—" in the UI.
- Historical PRs show no cost until re-reviewed.
