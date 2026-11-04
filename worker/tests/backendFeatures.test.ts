import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameApp } from '../src/app.ts';
import { MemoryGameRepository } from './fakes.ts';
import type { GamePhotoRecord } from '../src/sessions.ts';

function setup() {
  const photos: GamePhotoRecord[] = Array.from({ length: 5 }, (_, i) => ({ photoId: `p${i}`, imageUrl: `/p${i}.webp`, difficulty: 'easy', answerName: `Place ${i}`, answerLatitude: 1+i, answerLongitude: 2+i, radiusKm: 10, enabled: true }));
  const repository = new MemoryGameRepository(photos);
  let sequence = 0;
  const app = createGameApp(repository, { visitorIdentityPepper: 'test-pepper', now: () => '2026-10-20T10:00:00.000Z', createId: (kind) => `${kind}-${++sequence}` });
  const json = (method: string, path: string, body: object, token?: string) => app.request(path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const identity = async (username: string, email: string) => {
    const response = await json('POST', '/api/identity/session', { username, email });
    assert.equal(response.status, 201);
    return response.json();
  };
  const finish = async () => {
    const started = await (await json('POST', '/api/game/start', { mode: 'easy' })).json();
    for (let round = 1; round <= 5; round++) {
      const photo = await repository.getGamePhoto(repository.sessions.get(started.sessionId)!.questionIds[round-1]);
      assert.ok(photo);
      const response = await json('POST', `/api/game/${started.sessionId}/answer`, { round, latitude: photo.answerLatitude, longitude: photo.answerLongitude });
      assert.equal(response.status, 200);
    }
    return started.sessionId as string;
  };
  return { app, json, identity, finish, repository };
}

test('identity API returns public visitor only and requires valid bearer', async () => {
  const { app, json, identity } = setup();
  const { token, visitor } = await identity('Alice', 'alice@example.com');
  assert.deepEqual(visitor, { id: 'visitor-1', username: 'Alice' });
  assert.deepEqual(await (await app.request('/api/identity/me', { headers: { authorization: `Bearer ${token}` } })).json(), { visitor });
  assert.equal((await app.request('/api/identity/me')).status, 401);
  const mismatch = await json('POST', '/api/identity/session', { username: 'Alice', email: 'other@example.com' });
  assert.equal(mismatch.status, 409);
  assert.equal((await mismatch.json()).code, 'identity_mismatch');
  await app.request('/api/identity/session', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  assert.equal((await app.request('/api/identity/me', { headers: { authorization: `Bearer ${token}` } })).status, 401);
});

test('CORS refuses unknown origins and allows bearer preflight for known origin', async () => {
  const { app } = setup();
  const unknown = await app.request('/api/health', { headers: { origin: 'https://attacker.example' } });
  assert.equal(unknown.headers.get('access-control-allow-origin'), null);
  const known = await app.request('/api/identity/me', { method: 'OPTIONS', headers: { origin: 'https://juliawangjiayu.github.io', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
  assert.equal(known.headers.get('access-control-allow-origin'), 'https://juliawangjiayu.github.io');
  assert.match(known.headers.get('access-control-allow-headers') ?? '', /authorization/i);
  assert.match(known.headers.get('access-control-allow-methods') ?? '', /PUT/);
});

test('session claim and challenge identity are canonical and private', async () => {
  const { app, json, identity, finish } = setup();
  const alice = await identity('Alice', 'alice@example.com');
  const bob = await identity('Bobby', 'bob@example.com');
  const incomplete = await (await json('POST', '/api/game/start', { mode: 'easy' })).json();
  assert.equal((await json('POST', '/api/challenges', { sessionId: incomplete.sessionId }, alice.token)).status, 409);
  const sessionId = await finish();
  assert.equal((await json('POST', '/api/challenges', { sessionId })).status, 401);
  const first = await json('POST', '/api/challenges', { sessionId }, alice.token);
  assert.equal(first.status, 201);
  const body = await first.json();
  assert.deepEqual(body, { id: 'challenge-5', score: 25000, totalRounds: 5, creatorUsername: 'Alice' });
  const retry = await json('POST', '/api/challenges', { sessionId }, alice.token);
  assert.equal((await retry.json()).id, body.id);
  const conflict = await json('POST', '/api/challenges', { sessionId }, bob.token);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'session_already_claimed');
  assert.doesNotMatch(JSON.stringify(body), /questionIds|answer|latitude|longitude|radius|claimed/i);
  const started = await app.request(`/api/challenges/${body.id}/start`, { method: 'POST' });
  assert.equal(started.status, 201);
  assert.doesNotMatch(JSON.stringify(await started.json()), /answer|latitude|longitude|radius/i);
});

test('leaderboard API saves server score and isolates modes', async () => {
  const { app, json, identity, finish } = setup();
  const { token } = await identity('Alice', 'alice@example.com');
  const sessionId = await finish();
  const invalid = await json('PUT', '/api/leaderboards/easy/me', { sessionId, score: 1 }, token);
  assert.equal(invalid.status, 400);
  const saved = await json('PUT', '/api/leaderboards/easy/me', { sessionId }, token);
  assert.equal(saved.status, 200);
  const result = await saved.json();
  assert.deepEqual(result, { updated: true, runScore: 25000, bestScore: 25000, rank: 1, topThree: [{ visitorId: 'visitor-1', username: 'Alice', score: 25000, achievedAt: '2026-10-20T10:00:00.000Z', rank: 1 }] });
  const retry = await json('PUT', '/api/leaderboards/easy/me', { sessionId }, token);
  assert.equal((await retry.json()).updated, false);
  assert.deepEqual(await (await app.request('/api/leaderboards/easy')).json(), { entries: result.topThree, nextCursor: null });
  assert.deepEqual(await (await app.request('/api/leaderboards/easy/me', { headers: { authorization: `Bearer ${token}` } })).json(), { bestScore: 25000, rank: 1 });
  assert.deepEqual(await (await app.request('/api/leaderboards/random')).json(), { entries: [], nextCursor: null });
  assert.equal((await json('PUT', '/api/leaderboards/random/me', { sessionId }, token)).status, 400);
});

test('identity API rate limits the eleventh attempt from one daily IP fingerprint', async () => {
  const { json } = setup();
  for (let i = 0; i < 10; i++) assert.equal((await json('POST', '/api/identity/session', { username: 'Alice', email: 'alice@example.com' })).status, 201);
  const response = await json('POST', '/api/identity/session', { username: 'Alice', email: 'alice@example.com' });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'rate_limited');
});

test('challenge identity allows canonical retry after creation limit', async () => {
  const { json, identity, finish } = setup();
  const { token } = await identity('Alice', 'alice@example.com');
  const firstSession = await finish();
  const first = await (await json('POST', '/api/challenges', { sessionId: firstSession }, token)).json();
  for (let i = 0; i < 9; i++) {
    const sessionId = await finish();
    assert.equal((await json('POST', '/api/challenges', { sessionId }, token)).status, 201);
  }
  const eleventhSession = await finish();
  assert.equal((await json('POST', '/api/challenges', { sessionId: eleventhSession }, token)).status, 429);
  const retry = await json('POST', '/api/challenges', { sessionId: firstSession }, token);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, first.id);
});

test('leaderboard API limits twenty save attempts per visitor', async () => {
  const { json, identity, finish } = setup();
  const { token } = await identity('Alice', 'alice@example.com');
  const sessionId = await finish();
  for (let i = 0; i < 20; i++) assert.equal((await json('PUT', '/api/leaderboards/easy/me', { sessionId }, token)).status, 200);
  assert.equal((await json('PUT', '/api/leaderboards/easy/me', { sessionId }, token)).status, 429);
});

test('post-submit answer uses a safe fallback for an older photo without answer name', async () => {
  const { repository, json } = setup();
  for (const photo of repository.photos) photo.answerName = '';
  const started = await (await json('POST', '/api/game/start', { mode: 'easy' })).json();
  const photo = await repository.getGamePhoto(repository.sessions.get(started.sessionId)!.questionIds[0]);
  assert.ok(photo);
  const response = await json('POST', `/api/game/${started.sessionId}/answer`, { round: 1, latitude: photo.answerLatitude, longitude: photo.answerLongitude });
  assert.equal((await response.json()).answerName, 'Answer location');
});

test('identity API rejects oversized JSON before parsing private fields', async () => {
  const { app } = setup();
  const response = await app.request('/api/identity/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Alice', email: `${'x'.repeat(5000)}@example.com` }) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'request_too_large');
});

test('identity API gives the same mismatch for username and email conflicts', async () => {
  const { json, identity } = setup();
  await identity('Alice', 'alice@example.com');
  const byName = await json('POST', '/api/identity/session', { username: 'Alice', email: 'different@example.com' });
  const byEmail = await json('POST', '/api/identity/session', { username: 'Bobby', email: 'alice@example.com' });
  assert.equal(byName.status, 409);
  assert.equal(byEmail.status, 409);
  assert.deepEqual(await byName.json(), await byEmail.json());
});
