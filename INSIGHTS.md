# Insights (cross-module)

Lessons that cost time. One entry per lesson, newest first: what happened → what to do.
Module-specific lessons go in `<module>/INSIGHTS.md`. Promote the ones that bite
repeatedly to "Gotchas" in the relevant CLAUDE.md.

- **[Context] Home-task features were stripped, not never built.** Commit `e07efea` "chore: cleanup before home tasks (#11)" removed working code (e.g. the PR-list FINDINGS column) but left helpers (`rollupSeverities` in `server/src/modules/pulls/status.ts`) and "intentionally not surfaced" comments → before planning a task, run `git log -S <symbol>` / `git show e07efea` to find the earlier implementation and its leftovers, and don't read those comments as product decisions. (2026-11-22, e07efea)
- **Duplicated Zod contracts drift.** `server/src/vendor/shared` and `client/src/vendor/shared`
  differ in `adapters.ts`, `contracts/eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`.
  → Update both copies on any contract change; consider a sync check in CI.
  - 2026-11-21 confirmed: the run-cost change needed identical edits in `contracts/trace.ts` and
    `contracts/platform.ts`; `platform.ts` is byte-identical today and `trace.ts` differs only in comments.
  - 2026-11-22 confirmed: the severity-counters change needed identical edits in `contracts/findings.ts`
    (`SeverityCounts`) and `contracts/platform.ts` (`PrMeta.finding_counts`); both byte-identical afterwards.
- **`docker compose down -v` wipes the dev DB.** The `devdigest_pgdata` volume holds every
  imported repo and review. → Use `docker compose down` (no `-v`).
