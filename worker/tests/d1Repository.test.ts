import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { D1GameRepository, type D1DatabaseLike, type D1PreparedStatementLike } from '../src/d1Repository.ts';
import { IdentityService } from '../src/identityService.ts';
import { createGameApp } from '../src/app.ts';

class Statement implements D1PreparedStatementLike {
  private values: unknown[] = [];
  private readonly db: DatabaseSync;
  private readonly sql: string;
  constructor(db: DatabaseSync, sql: string) { this.db = db; this.sql = sql; }
  bind(...values: unknown[]): Statement { this.values = values; return this; }
  async first<T>(): Promise<T | null> { return (this.db.prepare(this.sql).get(...this.values as []) as T | undefined) ?? null; }
  async all<T>(): Promise<{ results: T[] }> { return { results: this.db.prepare(this.sql).all(...this.values as []) as T[] }; }
  async run(): Promise<{ meta: { changes: number } }> { return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.values as []).changes) } }; }
}
class Database implements D1DatabaseLike {
  readonly db = new DatabaseSync(':memory:');
  private batchTail: Promise<void> = Promise.resolve();
  constructor() {
    this.db.exec('PRAGMA foreign_keys = ON');
    for (const name of ['0001_init', '0002_ai_place_config', '0003_game_answer_name', '0004_visitor_identity', '0005_leaderboards', '0006_random_journeys']) this.db.exec(readFileSync(`worker/migrations/${name}.sql`, 'utf8'));
  }
  prepare(sql: string): D1PreparedStatementLike { return new Statement(this.db, sql); }
  async batch(statements: D1PreparedStatementLike[]): Promise<unknown> {
    const previous = this.batchTail;
    let release!: () => void;
    this.batchTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      this.db.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); this.db.exec('COMMIT'); return result; }
      catch (error) { this.db.exec('ROLLBACK'); throw error; }
    } finally { release(); }
  }
}

test('D1 migrations preserve private photos and persist visitor sessions', async () => {
  const database = new Database();
  const repo = new D1GameRepository(database);
  const visitor = { id: 'v1', username: 'Alice', usernameKey: 'alice', emailVerifier: 'verifier', createdAt: '2026-10-20', updatedAt: '2026-10-20' };
  await repo.createVisitor(visitor);
  assert.deepEqual(await repo.findVisitorByEmailVerifier('verifier'), visitor);
  await repo.createVisitorSession({ tokenHash: 'hash', visitorId: 'v1', createdAt: '2026-10-20', lastSeenAt: '2026-10-20', expiresAt: '2027-01-18' });
  assert.equal((await repo.getVisitorSession('hash'))?.visitorId, 'v1');
  await repo.revokeVisitorSession('hash');
  assert.equal(await repo.getVisitorSession('hash'), null);
  database.db.close();
});

test('D1 random runs persist canonical batches and cumulative leaderboard totals', async () => {
  const database = new Database();
  const repo = new D1GameRepository(database);
  await repo.createVisitor({ id: 'alice', username: 'Alice', usernameKey: 'alice', emailVerifier: 'alice', createdAt: 't', updatedAt: 't' });
  await repo.createRandomRun({ tokenHash: 'hash-1', seasonId: 'season-1', questionIds: ['1', '2', '3', '4', '5', '6'], createdAt: 't' });
  const session = { id: 'session-1', mode: 'random' as const, questionIds: ['1', '2', '3', '4', '5'], totalScore: 0, createdAt: 't' };
  const first = await Promise.all([repo.getOrCreateRandomBatch('hash-1', 0, session), repo.getOrCreateRandomBatch('hash-1', 0, { ...session, id: 'session-2' })]);
  assert.equal(first[0].id, first[1].id);
  assert.equal((await repo.listRandomBatches('hash-1')).length, 1);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM game_sessions').get()?.count, 1);
  assert.equal((await repo.getRandomRun('hash-1'))?.questionIds.length, 6);
  const claims = await Promise.all([repo.claimRandomRun('hash-1', 'alice', 't'), repo.claimRandomRun('hash-1', 'alice', 't')]);
  assert.deepEqual(claims.sort(), ['already_owned', 'claimed']);
  const candidate = { visitorId: 'alice', mode: 'random' as const, seasonId: 'season-1', score: 30000, sessionId: 'hash-1', achievedAt: 't', updatedAt: 't' };
  assert.equal((await repo.saveBestScore(candidate)).updated, true);
  assert.equal((await repo.saveBestScore(candidate)).updated, false);
  assert.equal((await repo.getVisitorBest('alice', 'random', 'season-1'))?.score, 30000);
  assert.equal((await repo.listLeaderboard('random', null, 10, 'season-1')).entries[0].score, 30000);
  assert.equal(await repo.getLeaderboardRank('random', 'alice', 'season-1'), 1);
  await repo.createRandomRun({ tokenHash: 'hash-2', seasonId: 'season-2', questionIds: ['1', '2', '3', '4'], createdAt: 't' });
  await repo.saveBestScore({ ...candidate, sessionId: 'hash-2', seasonId: 'season-2', score: 20000 });
  assert.equal((await repo.listLeaderboard('random', null, 10, 'season-2')).entries[0].score, 20000);
  assert.equal((await repo.getVisitorBest('alice', 'random', 'season-1'))?.score, 30000);
  assert.equal((await repo.getVisitorBest('alice', 'random', 'season-2'))?.score, 20000);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM leaderboard_bests WHERE mode = ?').get('random')?.count, 0);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM random_leaderboard_bests').get()?.count, 2);
  database.db.close();
});

test('migration 0006 preserves existing invitations and permits a four-photo invitation', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  for (const name of ['0001_init', '0002_ai_place_config', '0003_game_answer_name', '0004_visitor_identity', '0005_leaderboards'])
    database.exec(readFileSync(`worker/migrations/${name}.sql`, 'utf8'));
  database.prepare('INSERT INTO challenges (id, question_ids, score, total_rounds, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('old', JSON.stringify(['1', '2', '3', '4', '5']), 25000, 5, 't');
  database.exec(readFileSync('worker/migrations/0006_random_journeys.sql', 'utf8'));
  assert.equal(database.prepare('SELECT total_rounds FROM challenges WHERE id = ?').get('old')?.total_rounds, 5);
  database.prepare('INSERT INTO challenges (id, question_ids, score, total_rounds, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('new', JSON.stringify(['1', '2', '3', '4']), 20000, 4, 't');
  assert.equal(database.prepare('SELECT total_rounds FROM challenges WHERE id = ?').get('new')?.total_rounds, 4);
  database.close();
});

test('D1 rate limit admits only ten concurrent attempts', async () => {
  const database = new Database();
  const repo = new D1GameRepository(database);
  const decisions = await Promise.all(Array.from({ length: 20 }, () =>
    repo.consumeRateLimitEvent('identity', 'ip-hash', '2026-10-20T10:00:00.000Z', '2026-10-20T09:45:00.000Z', 10)));
  assert.equal(decisions.filter(Boolean).length, 10);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM rate_limit_events').get()?.count, 10);
  database.db.close();
});

test('D1 leaderboard conditional update preserves the previous best and orders ties', async () => {
  const database = new Database();
  const repo = new D1GameRepository(database);
  for (const id of ['a', 'b']) {
    await repo.createVisitor({ id, username: id, usernameKey: id, emailVerifier: id, createdAt: 't', updatedAt: 't' });
    for (const session of [`${id}1`, `${id}2`]) await repo.createSession({ id: session, mode: 'easy', questionIds: ['1','2','3','4','5'], totalScore: 100, createdAt: 't' });
  }
  const claims = await Promise.all([repo.claimGameSession('a1', 'a', 't'), repo.claimGameSession('a1', 'b', 't2')]);
  assert.deepEqual(claims.sort(), ['already_claimed', 'claimed']);
  assert.equal((await repo.getSession('a1'))?.claimedByVisitorId, 'a');
  assert.equal(await repo.claimGameSession('a1', 'a', 't'), 'already_owned');
  const a = { visitorId: 'a', mode: 'easy' as const, score: 100, sessionId: 'a1', achievedAt: '2026-10-20', updatedAt: '2026-10-20' };
  assert.equal((await repo.saveBestScore(a)).updated, true);
  assert.equal((await repo.saveBestScore(a)).updated, false);
  assert.equal((await repo.saveBestScore({ ...a, score: 99, sessionId: 'a2' })).updated, false);
  assert.equal((await repo.getVisitorBest('a', 'easy'))?.sessionId, 'a1');
  await repo.saveBestScore({ ...a, visitorId: 'b', sessionId: 'b1' });
  assert.deepEqual((await repo.listLeaderboard('easy', null, 1)).entries.map((entry) => entry.visitorId), ['a']);
  const first = await repo.listLeaderboard('easy', null, 1);
  assert.deepEqual((await repo.listLeaderboard('easy', first.nextCursor, 1)).entries.map((entry) => entry.visitorId), ['b']);
  assert.equal(await repo.getLeaderboardRank('easy', 'b'), 2);
  database.db.close();
});


test('concurrent challenge POSTs recover the one canonical D1 row', async () => {
  const database = new Database();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  class RacingRepository extends D1GameRepository {
    reads = 0;
    override async getChallengeBySourceSessionId(sessionId: string) {
      const result = await super.getChallengeBySourceSessionId(sessionId);
      if (this.reads < 2) {
        this.reads++;
        if (this.reads === 2) release();
        await gate;
      }
      return result;
    }
  }
  const repo = new RacingRepository(database);
  const identity = new IdentityService(repo, { pepper: 'pepper', now: () => new Date('2026-10-20T10:00:00.000Z'), createId: () => 'visitor-1' });
  const { token } = await identity.authenticate('Alice', 'alice@example.com');
  await repo.createSession({ id: 'source-1', mode: 'easy', questionIds: ['p1', 'p2', 'p3', 'p4', 'p5'], totalScore: 25000, createdAt: '2026-10-20T10:00:00.000Z' });
  for (let roundIndex = 0; roundIndex < 5; roundIndex++) await repo.saveAnswer({ sessionId: 'source-1', roundIndex, guessLatitude: 0, guessLongitude: 0, distanceKm: 0, score: 5000, proximity: 'exact', submittedAt: '2026-10-20T10:00:00.000Z' });
  let sequence = 0;
  const app = createGameApp(repo, { visitorIdentityPepper: 'pepper', now: () => '2026-10-20T10:00:00.000Z', createId: () => `challenge-${++sequence}` });
  const create = () => app.request('/api/challenges', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'source-1' }) });
  const responses = await Promise.all([create(), create()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 201]);
  const first = await responses[0].json();
  const second = await responses[1].json();
  assert.equal(first.id, second.id);
  assert.equal(database.db.prepare('SELECT COUNT(*) AS count FROM challenges').get()?.count, 1);
  database.db.close();
});
