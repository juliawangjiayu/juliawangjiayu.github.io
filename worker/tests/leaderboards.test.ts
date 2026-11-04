import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryGameRepository } from './fakes.ts';

test('leaderboard persistence keeps best and original run on lower or equal scores', async () => {
  const repo = new MemoryGameRepository([]);
  repo.visitors.set('v1', { id: 'v1', username: 'Alice', usernameKey: 'alice', emailVerifier: 'hash', createdAt: 't1', updatedAt: 't1' });
  const first = { visitorId: 'v1', mode: 'easy' as const, score: 100, sessionId: 's1', achievedAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z' };
  assert.equal((await repo.saveBestScore(first)).updated, true);
  assert.equal((await repo.saveBestScore({ ...first, score: 99, sessionId: 's2' })).updated, false);
  assert.deepEqual(await repo.getVisitorBest('v1', 'easy'), first);
  assert.equal((await repo.saveBestScore({ ...first, score: 101, sessionId: 's3' })).updated, true);
  assert.equal((await repo.getVisitorBest('v1', 'easy'))?.sessionId, 's3');
});

test('leaderboard ordering uses score then earliest time and stable visitor id', async () => {
  const repo = new MemoryGameRepository([]);
  for (const id of ['a', 'b', 'c']) {
    repo.visitors.set(id, { id, username: id, usernameKey: id, emailVerifier: id, createdAt: 't', updatedAt: 't' });
  }
  for (const [id, time] of [['c', '2026-10-20'], ['b', '2026-10-19'], ['a', '2026-10-19']]) {
    await repo.saveBestScore({ visitorId: id, mode: 'easy', score: 100, sessionId: id, achievedAt: time, updatedAt: time });
  }
  const page = await repo.listLeaderboard('easy', null, 2);
  assert.deepEqual(page.entries.map((item) => item.visitorId), ['a', 'b']);
  assert.equal(page.entries[0].rank, 1);
  assert.deepEqual((await repo.listLeaderboard('easy', page.nextCursor, 2)).entries.map((item) => item.visitorId), ['c']);
  assert.equal(await repo.getLeaderboardRank('easy', 'c'), 3);
});

test('memory challenge repository enforces one canonical source session', async () => {
  const repo = new MemoryGameRepository([]);
  const challenge = { id: 'c1', questionIds: ['1', '2', '3', '4', '5'], score: 500, totalRounds: 5 as const, createdAt: '2026-10-20', sourceSessionId: 'source-1', createdByVisitorId: 'v1' };
  await repo.createChallenge(challenge);
  await assert.rejects(repo.createChallenge({ ...challenge, id: 'c2' }));
  assert.equal((await repo.getChallengeBySourceSessionId('source-1'))?.id, 'c1');
});
