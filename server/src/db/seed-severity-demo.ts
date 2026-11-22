import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { DEFAULT_WORKSPACE_NAME } from './seed.js';

/**
 * Dev-only demo data for the severity counters (M2-severity-counters): every
 * severity level and every edge case the UI has to handle, on two extra PRs in
 * the seeded acme/payments-api repo. NOT part of `pnpm db:seed` on purpose —
 * e2e flows and integration tests rely on the main seed staying as it is.
 *
 *   pnpm exec tsx src/db/seed-severity-demo.ts            # (re)create the demo PRs
 *   pnpm exec tsx src/db/seed-severity-demo.ts --remove   # delete them again
 *
 * Idempotent: re-running deletes and recreates PRs #483/#484 (and their runs).
 * Requires `pnpm db:seed` first (workspace, repo and the three built-in agents).
 *
 * What to expect:
 *  PR list  #483 FINDINGS = ⓘ2 ⚠2 💡3 (latest review per agent, dismissed excluded;
 *           the superseded Performance run is NOT counted) · #484 = — (never reviewed)
 *  #483 Agent runs, Timeline (newest first):
 *    Security    ⓘ2 ⚠2 💡1 · 2 blockers
 *    Performance ⚠1 💡2            (no CRITICAL → no CRITICAL icon)
 *    General     error (429)       (failed run, no review)
 *    Performance ⓘ2 ⚠2 💡1 · 2 blockers   (older, superseded)
 *    General     0 finding(s)      (clean run → text fallback)
 *  Review runs, Security run: 2 CRITICAL · 2 WARNING · 1 SUGGESTION; one WARNING is
 *    dismissed (still listed, still counted); the SUGGESTION has 62% confidence, so
 *    "Hide low confidence" drops it and its counter.
 */

const DEMO_NUMBERS = [483, 484];
const AGENTS = ['General Reviewer', 'Security Reviewer', 'Performance Reviewer'] as const;
type AgentName = (typeof AGENTS)[number];

type Sev = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
type DemoFinding = {
  severity: Sev;
  category: 'bug' | 'security' | 'perf' | 'style' | 'test';
  title: string;
  file: string;
  start: number;
  end?: number;
  confidence: number;
  rationale: string;
  suggestion?: string;
  dismissed?: boolean;
};
type DemoRun = {
  agent: AgentName;
  minutesAgo: number;
  status: 'done' | 'failed';
  error?: string;
  verdict?: 'request_changes' | 'comment' | 'approve';
  score?: number;
  summary?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  findings?: DemoFinding[];
};

const RUNS: DemoRun[] = [
  {
    agent: 'Security Reviewer',
    minutesAgo: 12,
    status: 'done',
    verdict: 'request_changes',
    score: 38,
    summary:
      'Two critical exposures: a committed live Stripe key and an SSRF-shaped webhook forwarder. Block before merge.',
    tokensIn: 9119,
    tokensOut: 1300,
    costUsd: 0.0013,
    findings: [
      {
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        file: 'src/config.ts',
        start: 12,
        confidence: 0.98,
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move it to an env var and rotate the key immediately.',
      },
      {
        severity: 'CRITICAL',
        category: 'security',
        title: 'Webhook forwarder follows a user-controlled callback_url',
        file: 'src/api/public/webhooks.ts',
        start: 61,
        end: 74,
        confidence: 0.79,
        rationale: '`req.body.callback_url` is fetched server-side with the account API key attached (SSRF).',
        suggestion: 'Allow-list callback hosts and never forward credentials.',
      },
      {
        severity: 'WARNING',
        category: 'bug',
        title: 'Retry-After header omitted on 429',
        file: 'src/middleware/ratelimit.ts',
        start: 52,
        confidence: 0.81,
        rationale: 'The 429 branch sets only the status code; clients cannot back off correctly.',
        suggestion: 'Set `Retry-After` to the seconds until the bucket refills.',
      },
      {
        severity: 'WARNING',
        category: 'security',
        title: 'Rate-limit key trusts X-Forwarded-For',
        file: 'src/middleware/ratelimit.ts',
        start: 18,
        end: 20,
        confidence: 0.72,
        rationale: 'A client can rotate the header to get a fresh bucket on every request.',
        dismissed: true,
      },
      {
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Extract magic number 3600',
        file: 'src/middleware/ratelimit.ts',
        start: 28,
        confidence: 0.62,
        rationale: 'The number 3600 appears twice without explanation.',
        suggestion: 'Name it `SECONDS_PER_HOUR`.',
      },
    ],
  },
  {
    agent: 'Performance Reviewer',
    minutesAgo: 13,
    status: 'done',
    verdict: 'comment',
    score: 64,
    summary: 'One N+1 query on the user list; the rest are small wins.',
    tokensIn: 12011,
    tokensOut: 900,
    costUsd: 0.0014,
    findings: [
      {
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        file: 'src/api/users.ts',
        start: 45,
        end: 52,
        confidence: 0.86,
        rationale: 'The loop calls `db.posts.findMany` once per user.',
        suggestion: 'Use a single IN query and group in memory.',
      },
      {
        severity: 'SUGGESTION',
        category: 'perf',
        title: 'Cache the bucket config instead of reading env per request',
        file: 'src/middleware/ratelimit.ts',
        start: 9,
        confidence: 0.9,
        rationale: '`process.env` is parsed on every request.',
      },
      {
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Name the refill interval',
        file: 'src/middleware/ratelimit.ts',
        start: 33,
        confidence: 0.7,
        rationale: 'An inline `60_000` hides the intent.',
      },
    ],
  },
  {
    agent: 'General Reviewer',
    minutesAgo: 13,
    status: 'failed',
    error:
      '429 You exceeded your current quota, please check your plan and billing details. (demo data)',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: null,
  },
  {
    agent: 'Performance Reviewer',
    minutesAgo: 540,
    status: 'done',
    verdict: 'request_changes',
    score: 0,
    summary: 'Older run, superseded by the newer Performance review — must not count on the PR list.',
    tokensIn: 8457,
    tokensOut: 700,
    costUsd: 0.0012,
    findings: [
      { severity: 'CRITICAL', category: 'perf', title: 'Unbounded Redis key growth', file: 'src/middleware/ratelimit.ts', start: 40, confidence: 0.9, rationale: 'Keys never expire.' },
      { severity: 'CRITICAL', category: 'bug', title: 'Bucket refill races under load', file: 'src/middleware/ratelimit.ts', start: 44, confidence: 0.84, rationale: 'GET then SET is not atomic.' },
      { severity: 'WARNING', category: 'perf', title: 'Sync JSON.parse on hot path', file: 'src/api/users.ts', start: 20, confidence: 0.8, rationale: 'Large payloads block the loop.' },
      { severity: 'WARNING', category: 'perf', title: 'No pagination on /users', file: 'src/api/users.ts', start: 30, confidence: 0.77, rationale: 'Returns every row.' },
      { severity: 'SUGGESTION', category: 'style', title: 'Rename `b` to `bucket`', file: 'src/middleware/ratelimit.ts', start: 15, confidence: 0.66, rationale: 'Single-letter name.' },
    ],
  },
  {
    agent: 'General Reviewer',
    minutesAgo: 600,
    status: 'done',
    verdict: 'approve',
    score: 95,
    summary: 'Clean first pass — nothing to report.',
    tokensIn: 5100,
    tokensOut: 300,
    costUsd: 0.0006,
    findings: [],
  },
];

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function removeDemo(db: Db, repoId: string): Promise<number> {
  const prs = await db
    .select({ id: t.pullRequests.id })
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), inArray(t.pullRequests.number, DEMO_NUMBERS)));
  const ids = prs.map((p) => p.id);
  if (ids.length === 0) return 0;
  // agent_runs.pr_id is ON DELETE SET NULL → delete runs explicitly (traces cascade).
  await db.delete(t.agentRuns).where(inArray(t.agentRuns.prId, ids));
  // pr_files / pr_commits / reviews (→ findings) cascade from the PR.
  await db.delete(t.pullRequests).where(inArray(t.pullRequests.id, ids));
  return ids.length;
}

export async function seedSeverityDemo(db: Db, opts: { remove?: boolean } = {}) {
  const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  const [repo] = ws
    ? await db
        .select()
        .from(t.repos)
        .where(and(eq(t.repos.workspaceId, ws.id), eq(t.repos.fullName, 'acme/payments-api')))
    : [];
  if (!ws || !repo) throw new Error('Run `pnpm db:seed` first (default workspace + acme/payments-api).');

  const removed = await removeDemo(db, repo.id);
  if (opts.remove) return { removed, created: [] as number[] };

  const agentRows = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, ws.id), inArray(t.agents.name, [...AGENTS])));
  const agentByName = new Map(agentRows.map((a) => [a.name, a]));
  const missing = AGENTS.filter((n) => !agentByName.has(n));
  if (missing.length) throw new Error(`Missing built-in agents: ${missing.join(', ')} — run \`pnpm db:seed\`.`);

  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId: ws.id,
      repoId: repo.id,
      number: 483,
      title: 'Demo: severity counters (all three levels)',
      author: 'marisa.koch',
      branch: 'demo/severity-counters',
      base: 'main',
      headSha: 'demo483head',
      additions: 247,
      deletions: 38,
      filesCount: 4,
      status: 'open', // no lastReviewedSha → "Needs review" (the list's default filter)
      openedAt: ago(720),
      updatedAt: ago(12),
      body: 'Demo PR from src/db/seed-severity-demo.ts — covers every severity level and edge case.',
    })
    .returning();
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
    { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
    { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
    { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
  ]);
  await db.insert(t.prCommits).values([
    { prId: pr!.id, sha: 'demo483aaa', message: 'feat: add token-bucket rate limiter', author: 'marisa.koch', committedAt: ago(660) },
    { prId: pr!.id, sha: 'demo483head', message: 'fix: address review comments', author: 'marisa.koch', committedAt: ago(60) },
  ]);

  for (const spec of RUNS) {
    const agent = agentByName.get(spec.agent)!;
    const findings = spec.findings ?? [];
    const ranAt = ago(spec.minutesAgo);
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId: ws.id,
        agentId: agent.id,
        prId: pr!.id,
        ranAt,
        provider: agent.provider,
        model: agent.model,
        durationMs: spec.status === 'done' ? 18_000 : 1_200,
        tokensIn: spec.tokensIn,
        tokensOut: spec.tokensOut,
        costUsd: spec.costUsd,
        status: spec.status,
        error: spec.error ?? null,
        findingsCount: spec.status === 'done' ? findings.length : null,
        grounding: spec.status === 'done' ? `${findings.length}/${findings.length} passed` : null,
        score: spec.score ?? null,
        blockers: spec.status === 'done' ? findings.filter((f) => f.severity === 'CRITICAL').length : null,
      })
      .returning();
    if (spec.status !== 'done') continue;

    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId: ws.id,
        prId: pr!.id,
        agentId: agent.id,
        runId: run!.id,
        kind: 'review',
        verdict: spec.verdict ?? 'comment',
        summary: spec.summary ?? null,
        score: spec.score ?? null,
        model: agent.model,
        createdAt: ranAt,
      })
      .returning();
    if (findings.length === 0) continue;
    await db.insert(t.findings).values(
      findings.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.start,
        endLine: f.end ?? f.start,
        severity: f.severity,
        category: f.category,
        title: f.title,
        rationale: f.rationale,
        suggestion: f.suggestion ?? null,
        confidence: f.confidence,
        dismissedAt: f.dismissed ? ago(5) : null,
      })),
    );
  }

  // Never reviewed → the list shows "—" in SCORE and FINDINGS.
  await db.insert(t.pullRequests).values({
    workspaceId: ws.id,
    repoId: repo.id,
    number: 484,
    title: 'Demo: never reviewed (FINDINGS shows —)',
    author: 'deepak.r',
    branch: 'demo/never-reviewed',
    base: 'main',
    headSha: 'demo484head',
    additions: 18,
    deletions: 2,
    filesCount: 1,
    status: 'open',
    openedAt: ago(240),
    updatedAt: ago(30),
  });

  return { removed, created: DEMO_NUMBERS };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const remove = process.argv.includes('--remove');
  const handle = createDb(url);
  seedSeverityDemo(handle.db, { remove })
    .then(async (r) => {
      console.log(remove ? `✓ removed ${r.removed} demo PR(s)` : `✓ severity demo PRs #${r.created.join(', #')} ready`, r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ severity demo failed:', err);
      await handle.close();
      process.exit(1);
    });
}
