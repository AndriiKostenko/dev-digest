# client insights

Lessons that cost time. One entry per lesson, newest first: what happened → what to do.
Promote repeat offenders to "Gotchas" in [CLAUDE.md](CLAUDE.md).

- **[Context] The PR-detail designs run ahead of the code.** A brief called the Timeline severity icons an "existing feature", but `RunHistory` only rendered "N finding(s)"; the design also shows tokens, run-header cost/trace and tinted verdict banners that are not built → before treating something in a design as existing, grep the component (e.g. `RunHistory`, `ReviewRunAccordion`, `VerdictBanner`) and list mismatches in the spec. (2026-11-22, client/specs/M2-severity-counters.md)
- **[Mistake] Runtime imports from `@devdigest/shared` break `next dev` while tsc and vitest pass.** Importing a value (`Severity.options`) made webpack fail with "Module not found: ./contracts/findings.js", because the vendored contracts use ESM `.js` specifiers only tsc/vite resolve → in client code use `import type` from `@devdigest/shared` and declare runtime values locally (typed against the contract, e.g. `Record<Severity, true>`), and load the page in a browser after touching shared imports. (2026-11-22, src/lib/severity.ts `SEVERITY_LEVELS`)
