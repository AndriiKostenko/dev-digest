/**
 * Run cost surfaces (M1-run-cost): per-PR total on GET /repos/:id/pulls and
 * per-run cost on GET /pulls/:id/runs. Runs are inserted directly into
 * agent_runs so every cost/partial combination is deterministic. Gated on
 * Docker, like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta, RunSummary } from '@devdigest/shared';

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

type RunSeed = {
  status: 'done' | 'failed' | 'running';
  tokensIn: number | null;
  costUsd: number | null;
};

async function addRuns(db: Db, workspaceId: string, prId: string, runs: RunSeed[]) {
  for (const r of runs) {
    await db.insert(t.agentRuns).values({
      workspaceId,
      prId,
      provider: 'openai',
      model: 'gpt-4.1',
      status: r.status,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensIn === null ? null : 10,
      costUsd: r.costUsd,
      findingsCount: 0,
    });
  }
}

d('run cost on PR list + run timeline (Testcontainers pg)', () => {
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

  it('GET /repos/:id/pulls → cost_usd is the sum of known run costs; cost_partial flags unknown ones', async () => {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'cost-list', fullName: 'acme/cost-list' })
      .returning();

    const summed = await addPr(db, workspaceId, repo!.id, 1);
    await addRuns(db, workspaceId, summed.id, [
      { status: 'done', tokensIn: 100, costUsd: 0.001 },
      { status: 'done', tokensIn: 200, costUsd: 0.002 },
    ]);

    const partial = await addPr(db, workspaceId, repo!.id, 2);
    await addRuns(db, workspaceId, partial.id, [
      { status: 'done', tokensIn: 100, costUsd: 0.002 },
      { status: 'done', tokensIn: 100, costUsd: null }, // called the LLM, price unknown
    ]);

    const unknownOnly = await addPr(db, workspaceId, repo!.id, 3);
    await addRuns(db, workspaceId, unknownOnly.id, [{ status: 'done', tokensIn: 100, costUsd: null }]);

    // failed (0 tokens) and running (NULL tokens) runs never flag partial
    const failedOnly = await addPr(db, workspaceId, repo!.id, 4);
    await addRuns(db, workspaceId, failedOnly.id, [
      { status: 'failed', tokensIn: 0, costUsd: null },
      { status: 'running', tokensIn: null, costUsd: null },
    ]);

    const noRuns = await addPr(db, workspaceId, repo!.id, 5);

    const app = await appWithNoRemotePrs();
    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const byId = new Map((res.json() as PrMeta[]).map((p) => [p.id, p]));

    expect(byId.get(summed.id)!.cost_usd).toBeCloseTo(0.003, 10);
    expect(byId.get(summed.id)!.cost_partial).toBe(false);

    expect(byId.get(partial.id)!.cost_usd).toBeCloseTo(0.002, 10);
    expect(byId.get(partial.id)!.cost_partial).toBe(true);

    expect(byId.get(unknownOnly.id)!.cost_usd).toBeNull();
    expect(byId.get(unknownOnly.id)!.cost_partial).toBe(true);

    expect(byId.get(failedOnly.id)!.cost_usd).toBeNull();
    expect(byId.get(failedOnly.id)!.cost_partial).toBe(false);

    expect(byId.get(noRuns.id)!.cost_usd).toBeNull();
    expect(byId.get(noRuns.id)!.cost_partial).toBe(false);

    await app.close();
  });

  it('GET /pulls/:id/runs → each run carries its own cost_usd (null when unknown)', async () => {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'cost-runs', fullName: 'acme/cost-runs' })
      .returning();
    const pr = await addPr(db, workspaceId, repo!.id, 1);
    await addRuns(db, workspaceId, pr.id, [
      { status: 'done', tokensIn: 100, costUsd: 0.0013 },
      { status: 'failed', tokensIn: 0, costUsd: null },
    ]);

    const app = await appWithNoRemotePrs();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` });
    expect(res.statusCode).toBe(200);
    const runs = res.json() as RunSummary[];
    expect(runs).toHaveLength(2);
    expect(runs.find((r) => r.status === 'done')!.cost_usd).toBeCloseTo(0.0013, 10);
    expect(runs.find((r) => r.status === 'failed')!.cost_usd).toBeNull();

    await app.close();
  });
});
