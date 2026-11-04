import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameApp } from '../src/app.ts';
import { MemoryGameRepository } from './fakes.ts';
import type { GamePhotoRecord } from '../src/sessions.ts';

function setup(count = 39) {
  const photos: GamePhotoRecord[] = Array.from({ length: count }, (_, index) => ({
    photoId: `photo-${index}`, imageUrl: `/photo-${index}.webp`, difficulty: 'easy',
    answerName: `Place ${index}`, answerLatitude: index, answerLongitude: 0,
    radiusKm: 10, enabled: true,
  }));
  const repository = new MemoryGameRepository(photos);
  let sequence = 0;
  const app = createGameApp(repository, {
    visitorIdentityPepper: 'test-pepper', now: () => '2026-10-20T10:00:00.000Z',
    createId: (kind) => `${kind}-${++sequence}`,
  });
  const post = (path: string, body: object, bearer?: string) => app.request(path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
  const put = (path: string, body: object, bearer?: string) => app.request(path, {
    method: 'PUT', headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
  const answer = async (sessionId: string, round: number) => {
    const photoId = repository.sessions.get(sessionId)!.questionIds[round - 1];
    const photo = await repository.getGamePhoto(photoId);
    assert.ok(photo);
    const response = await post(`/api/game/${sessionId}/answer`, { round, latitude: photo.answerLatitude, longitude: photo.answerLongitude });
    assert.equal(response.status, 200);
  };
  const visitor = async (username: string, email: string) => {
    const response = await post('/api/identity/session', { username, email });
    assert.equal(response.status, 201);
    return (await response.json()).token as string;
  };
  return { app, repository, post, put, answer, visitor };
}

test('random journey freezes 39 unique photos, resumes, and completes in eight batches', async () => {
  const { post, repository, answer } = setup();
  let response = await post('/api/random/start', {});
  assert.equal(response.status, 201);
  let { round, run } = await response.json();
  assert.match(run.token, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(repository.randomRuns.size, 1);
  assert.equal(repository.randomRuns.has(run.token), false);
  assert.deepEqual([run.answered, run.total, run.cumulativeScore, run.completedBatches, run.totalBatches, run.complete], [0, 39, 0, 0, 8, false]);
  const token = run.token as string;
  const seen = new Set<string>();
  for (let batch = 0; batch < 8; batch++) {
    const session = repository.sessions.get(round.sessionId)!;
    assert.equal(session.questionIds.length, batch === 7 ? 4 : 5);
    for (const id of session.questionIds) { assert.equal(seen.has(id), false); seen.add(id); }
    if (batch === 0) {
      await answer(session.id, 1);
      response = await post('/api/random/start', { token });
      const resumed = await response.json();
      assert.equal(resumed.round.round, 2);
      assert.equal(resumed.run.activeSessionScore, 5000);
    }
    for (let index = batch === 0 ? 2 : 1; index <= session.questionIds.length; index++) await answer(session.id, index);
    const progress = await (await post('/api/random/progress', { token })).json();
    assert.deepEqual([progress.answered, progress.completedBatches, progress.cumulativeScore, progress.complete],
      [(batch + 1) * 5 > 39 ? 39 : (batch + 1) * 5, batch + 1, ((batch + 1) * 5 > 39 ? 39 : (batch + 1) * 5) * 5000, batch === 7]);
    if (batch < 7) {
      response = await post('/api/random/start', { token });
      assert.equal(response.status, 200);
      ({ round, run } = await response.json());
      assert.equal(run.completedBatches, batch + 1);
    }
  }
  assert.equal(seen.size, 39);
  assert.equal((await (await post('/api/random/start', { token })).json()).round, null);
  assert.equal(repository.randomRuns.size, 1);
  assert.equal([...repository.randomBatches.values()].flat().length, 8);
});

test('random progress and start are idempotent under concurrent requests', async () => {
  const { post, repository, answer } = setup(6);
  const initial = await (await post('/api/random/start', {})).json();
  const token = initial.run.token;
  const starts = await Promise.all(Array.from({ length: 8 }, () => post('/api/random/start', { token })));
  const ids = await Promise.all(starts.map(async (response) => (await response.json()).round.sessionId));
  assert.equal(new Set(ids).size, 1);
  for (let round = 1; round <= 5; round++) await answer(initial.round.sessionId, round);
  const next = await Promise.all(Array.from({ length: 8 }, () => post('/api/random/start', { token })));
  const nextIds = await Promise.all(next.map(async (response) => (await response.json()).round.sessionId));
  assert.equal(new Set(nextIds).size, 1);
  assert.equal([...repository.randomBatches.values()].flat().length, 2);
  const progress = await Promise.all(Array.from({ length: 8 }, () => post('/api/random/progress', { token })));
  assert.deepEqual((await progress[0].json()).completedBatches, 1);
});

test('random claim requires all frozen answers, uses server score, and keeps one best per visitor', async () => {
  const { app, post, put, answer, visitor } = setup(6);
  const alice = await visitor('Alice', 'alice@example.com');
  const bob = await visitor('Bobby', 'bob@example.com');
  const first = await (await post('/api/random/start', {})).json();
  const token = first.run.token;
  assert.equal((await put('/api/leaderboards/random/me', { sessionId: first.round.sessionId }, alice)).status, 400);
  assert.equal((await put('/api/leaderboards/random/me', { randomToken: token, score: 999999 }, alice)).status, 400);
  assert.equal((await put('/api/leaderboards/random/me', { randomToken: token })).status, 401);
  assert.equal((await put('/api/leaderboards/random/me', { randomToken: token }, alice)).status, 409);
  for (let round = 1; round <= 5; round++) await answer(first.round.sessionId, round);
  assert.equal((await put('/api/leaderboards/random/me', { randomToken: token }, alice)).status, 409);
  const final = await (await post('/api/random/start', { token })).json();
  await answer(final.round.sessionId, 1);
  const claims = await Promise.all([
    put('/api/leaderboards/random/me', { randomToken: token }, alice),
    put('/api/leaderboards/random/me', { randomToken: token }, bob),
  ]);
  assert.deepEqual(claims.map((response) => response.status).sort(), [200, 409]);
  const winner = claims[0].status === 200 ? alice : bob;
  const result = await claims[claims[0].status === 200 ? 0 : 1].json();
  assert.deepEqual([result.runScore, result.bestScore, result.rank], [30000, 30000, 1]);
  assert.equal((await (await put('/api/leaderboards/random/me', { randomToken: token }, winner)).json()).updated, false);
  assert.equal((await (await app.request('/api/leaderboards/random')).json()).entries[0].score, 30000);
  assert.deepEqual(await (await app.request('/api/leaderboards/random/me', { headers: { authorization: `Bearer ${winner}` } })).json(), { bestScore: 30000, rank: 1 });
});

test('random journey caps frozen pool at 200 and rejects unknown tokens', async () => {
  const { post, repository } = setup(205);
  assert.equal((await post('/api/random/start', { token: 'unknown-token' })).status, 404);
  const started = await (await post('/api/random/start', {})).json();
  assert.equal(started.run.total, 200);
  assert.equal(started.run.totalBatches, 40);
  assert.equal(repository.randomRuns.size, 1);
});

test('four-photo completed session creates a four-photo invitation and playback', async () => {
  const { app, repository, post, answer, visitor } = setup(4);
  const bearer = await visitor('Alice', 'alice@example.com');
  const started = await (await post('/api/random/start', {})).json();
  for (let round = 1; round <= 4; round++) await answer(started.round.sessionId, round);
  const created = await post('/api/challenges', { sessionId: started.round.sessionId }, bearer);
  assert.equal(created.status, 201);
  const invitation = await created.json();
  assert.equal(invitation.totalRounds, 4);
  assert.equal(invitation.score, 20000);
  const playback = await (await post(`/api/challenges/${invitation.id}/start`, {})).json();
  assert.equal(playback.round.totalRounds, 4);
  assert.deepEqual(repository.sessions.get(playback.round.sessionId)?.questionIds, repository.sessions.get(started.round.sessionId)?.questionIds);
  assert.equal((await app.request(`/api/challenges/${invitation.id}`)).status, 200);
});

test('Random leaderboard shows only the current stable pool season', async () => {
  const { app, repository, post, put, answer, visitor } = setup(6);
  const bearer = await visitor('Alice', 'alice@example.com');
  const first = await (await post('/api/random/start', {})).json();
  for (let round = 1; round <= 5; round++) await answer(first.round.sessionId, round);
  const last = await (await post('/api/random/start', { token: first.run.token })).json();
  await answer(last.round.sessionId, 1);
  assert.equal((await put('/api/leaderboards/random/me', { randomToken: first.run.token }, bearer)).status, 200);
  assert.equal((await (await app.request('/api/leaderboards/random')).json()).entries[0].score, 30000);
  repository.photos[5].enabled = false;
  assert.deepEqual((await (await app.request('/api/leaderboards/random')).json()).entries, []);
  assert.deepEqual(await (await app.request('/api/leaderboards/random/me', { headers: { authorization: `Bearer ${bearer}` } })).json(), { bestScore: null, rank: null });
  const second = await (await post('/api/random/start', {})).json();
  assert.equal(second.run.total, 5);
  for (let round = 1; round <= 5; round++) await answer(second.round.sessionId, round);
  const saved = await put('/api/leaderboards/random/me', { randomToken: second.run.token }, bearer);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).bestScore, 25000);
  repository.photos[5].enabled = true;
  assert.equal((await (await app.request('/api/leaderboards/random')).json()).entries[0].score, 30000);
});

test('an older Random journey reports that it cannot enter the current leaderboard', async () => {
  const { repository, post, put, answer, visitor } = setup(6);
  const bearer = await visitor('Alice', 'alice@example.com');
  const first = await (await post('/api/random/start', {})).json();
  assert.equal(first.run.rankable, true);
  for (let round = 1; round <= 5; round++) await answer(first.round.sessionId, round);
  const last = await (await post('/api/random/start', { token: first.run.token })).json();
  await answer(last.round.sessionId, 1);
  repository.photos[5].enabled = false;
  const progress = await (await post('/api/random/progress', { token: first.run.token })).json();
  assert.equal(progress.rankable, false);
  const response = await put('/api/leaderboards/random/me', { randomToken: first.run.token }, bearer);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'season_expired');
  assert.equal((await (await post('/api/random/start', {})).json()).run.rankable, true);
});
