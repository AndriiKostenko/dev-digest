/**
 * FINDINGS column (M2-severity-counters): GET /repos/:id/pulls → each PrMeta
 * carries `finding_counts` = open findings per severity, summed over the latest
 * review of each agent (dismissed excluded; null when the PR was never
 * reviewed). Reviews/findings are inserted directly so every case is
 * deterministic. Gated on Docker, like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta, Severity } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type Db = PgFixture['handle']['db'];

async function addPr(db: Db, workspaceId: string, repoId: string, number: number) {
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number,
      title: `PR ${number}`,
      author: 'marisa.koch',
      branch: `feat/${number}`,
      base: 'main',
      headSha: `sha${number}`,
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  return pr!;
}

type FindingSeed = { severity: Severity | string; dismissed?: boolean };

async function addReview(
  db: Db,
  workspaceId: string,
  prId: string,
  opts: {
    agentId: string | null;
    createdAt: string;
    findings: FindingSeed[];
    kind?: 'review' | 'summary';
  },
) {
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      agentId: opts.agentId,
      kind: opts.kind ?? 'review',
      verdict: 'comment',
      summary: 's',
      score: 70,
      createdAt: new Date(opts.createdAt),
    })
    .returning();
  for (const [i, f] of opts.findings.entries()) {
    await db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/a.ts',
      startLine: i + 1,
      endLine: i + 1,
      severity: f.severity,
      category: 'bug',
      title: `finding ${i}`,
      rationale: 'r',
      confidence: 0.9,
      dismissedAt: f.dismissed ? new Date('2026-11-20T00:00:00Z') : null,
    });
  }
  return review!;
}

d('FINDINGS counts on the PR list (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWithNoRemotePrs() {
    // pulls: [] → the list handler's GitHub sync is a no-op; only seeded rows are served.
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient({ pulls: [] }) },
    });
  }

  it('GET /repos/:id/pulls → finding_counts sums the latest review per agent, without dismissed findings', async () => {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'findings-list', fullName: 'acme/findings-list' })
      .returning();
    const agentA = randomUUID();
    const agentB = randomUUID();

    // Agent A re-ran: only its newer review counts. Agent B's dismissed CRITICAL
    // is excluded. An off-contract severity is ignored.
    const multi = await addPr(db, workspaceId, repo!.id, 1);
    await addReview(db, workspaceId, multi.id, {
      agentId: agentA,
      createdAt: '2026-11-20T10:00:00Z',
      findings: [{ severity: 'CRITICAL' }, { severity: 'CRITICAL' }],
    });
    await addReview(db, workspaceId, multi.id, {
      agentId: agentA,
      createdAt: '2026-11-20T11:00:00Z',
      findings: [{ severity: 'WARNING' }],
    });
    await addReview(db, workspaceId, multi.id, {
      agentId: agentB,
      createdAt: '2026-11-20T10:30:00Z',
      findings: [
        { severity: 'SUGGESTION' },
        { severity: 'CRITICAL', dismissed: true },
        { severity: 'INFO' },
      ],
    });

    // Reviewed, but nothing found → zeros, not null.
    const clean = await addPr(db, workspaceId, repo!.id, 2);
    await addReview(db, workspaceId, clean.id, {
      agentId: agentA,
      createdAt: '2026-11-20T10:00:00Z',
      findings: [],
    });

    // Reviews without an agent cannot be grouped, so each one counts.
    const legacy = await addPr(db, workspaceId, repo!.id, 3);
    await addReview(db, workspaceId, legacy.id, {
      agentId: null,
      createdAt: '2026-11-20T10:00:00Z',
      findings: [{ severity: 'WARNING' }],
    });
    await addReview(db, workspaceId, legacy.id, {
      agentId: null,
      createdAt: '2026-11-20T11:00:00Z',
      findings: [{ severity: 'WARNING' }],
    });

    // Only a summary (not a review) → never reviewed → null.
    const summaryOnly = await addPr(db, workspaceId, repo!.id, 4);
    await addReview(db, workspaceId, summaryOnly.id, {
      agentId: agentA,
      createdAt: '2026-11-20T10:00:00Z',
      kind: 'summary',
      findings: [{ severity: 'CRITICAL' }],
    });

    const neverReviewed = await addPr(db, workspaceId, repo!.id, 5);

    const app = await appWithNoRemotePrs();
    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const byId = new Map((res.json() as PrMeta[]).map((p) => [p.id, p]));

    expect(byId.get(multi.id)!.finding_counts).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 1 });
    expect(byId.get(clean.id)!.finding_counts).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(byId.get(legacy.id)!.finding_counts).toEqual({ CRITICAL: 0, WARNING: 2, SUGGESTION: 0 });
    expect(byId.get(summaryOnly.id)!.finding_counts).toBeNull();
    expect(byId.get(neverReviewed.id)!.finding_counts).toBeNull();

    await app.close();
  });
});
