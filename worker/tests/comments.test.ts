import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameApp } from '../src/app.ts';
import { MemoryGameRepository } from './fakes.ts';

function setup() {
  const repository = new MemoryGameRepository([]);
  let clock = new Date('2026-11-10T10:00:00.000Z');
  let sequence = 0;
  const app = createGameApp(repository, {
    visitorIdentityPepper: 'test-pepper',
    adminToken: 'admin-secret',
    now: () => clock.toISOString(),
    createId: (kind) => `${kind}-${++sequence}`,
  });
  const request = (path: string, init?: RequestInit) => app.request(path, init);
  const signIn = async (username: string, email: string) => {
    const response = await request('/api/identity/session', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, email }),
    });
    assert.equal(response.status, 201);
    return (await response.json() as { token: string }).token;
  };
  const post = (token: string, key: string, targetType = 'photo', targetId = 'photo-1', body = 'Lovely light.') =>
    request('/api/comments', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify({ targetType, targetId, body }) });
  return { repository, request, signIn, post, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}

test('comments publish immediately on their own photo or Collection and never reveal private identity', async () => {
  const { request, signIn, post } = setup();
  const token = await signIn('Visitor One', 'one@example.com');
  const photo = await post(token, 'submission-0001');
  assert.equal(photo.status, 201);
  const created = await photo.json() as { comment: { id: string; body: string; mine: boolean } };
  assert.equal(created.comment.body, 'Lovely light.');
  const collection = await post(token, 'submission-0002', 'collection', 'collection-1', 'A lovely collection.');
  assert.equal(collection.status, 201);
  const anon = await request('/api/comments?targetType=photo&targetId=photo-1');
  assert.equal(anon.status, 200);
  const anonBody = await anon.json() as { comments: Array<{ id: string; mine: boolean }>; hasMore: boolean };
  assert.deepEqual(anonBody.comments.map(item => item.id), [created.comment.id]);
  assert.equal(anonBody.comments[0].mine, false);
  assert.doesNotMatch(JSON.stringify(anonBody), /one@example|emailVerifier|test-pepper|answerLatitude|admin-secret/i);
  const own = await request('/api/comments?targetType=photo&targetId=photo-1', { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await own.json() as typeof anonBody).comments[0].mine, true);
  const other = await request('/api/comments?targetType=collection&targetId=collection-1');
  assert.equal((await other.json() as typeof anonBody).comments.length, 1);
});

test('comments allow three new messages in rolling 60 seconds and idempotent retry', async () => {
  const { request, signIn, post, advance } = setup();
  const token = await signIn('Visitor One', 'one@example.com');
  const first = await post(token, 'submission-0001');
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal((await post(token, 'submission-0001')).status, 200);
  assert.deepEqual((await (await post(token, 'submission-0001')).json()), firstBody);
  assert.equal((await post(token, 'submission-0002')).status, 201);
  assert.equal((await post(token, 'submission-0003')).status, 201);
  const firstId = (firstBody as { comment: { id: string } }).comment.id;
  assert.equal((await request(`/api/comments/${firstId}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })).status, 204);
  const fourth = await post(token, 'submission-0004');
  assert.equal(fourth.status, 429);
  assert.equal((await fourth.json() as { code: string }).code, 'rate_limited');
  advance(60_001);
  assert.equal((await post(token, 'submission-0004')).status, 201);
});

test('comments enforce ownership, keep edits public, clear Julia replies, and hide deletions', async () => {
  const { request, signIn, post } = setup();
  const alice = await signIn('Visitor One', 'one@example.com');
  const bob = await signIn('Visitor Two', 'two@example.com');
  const created = await (await post(alice, 'submission-0001')).json() as { comment: { id: string } };
  const id = created.comment.id;
  const adminHeaders = { authorization: 'Bearer admin-secret', 'content-type': 'application/json' };
  assert.equal((await request(`/api/admin/comments/${id}/reply`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ body: 'Thank you!' }) })).status, 200);
  assert.equal((await request(`/api/comments/${id}`, { method: 'PATCH', headers: { authorization: `Bearer ${bob}`, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Hijack' }) })).status, 404);
  assert.equal((await request(`/api/comments/${id}`, { method: 'PATCH', headers: { authorization: `Bearer ${alice}`, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'New thought' }) })).status, 200);
  const list = await request('/api/comments?targetType=photo&targetId=photo-1');
  const comment = (await list.json() as { comments: Array<{ body: string; reply: unknown }> }).comments[0];
  assert.equal(comment.body, 'New thought');
  assert.equal(comment.reply, null);
  assert.equal((await request(`/api/comments/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${bob}` } })).status, 404);
  assert.equal((await request(`/api/comments/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${alice}` } })).status, 204);
  const after = await request('/api/comments?targetType=photo&targetId=photo-1');
  assert.equal((await after.json() as { comments: unknown[] }).comments.length, 0);
});

test('comments reject malformed text and allow Julia to list, reply and remove without approval', async () => {
  const { request, signIn, post } = setup();
  const token = await signIn('Visitor One', 'one@example.com');
  assert.equal((await post(token, 'submission-0001', 'photo', 'photo-1', '  \u0000  ')).status, 400);
  assert.equal((await post(token, 'submission-0002', 'photo', 'photo-1', 'x'.repeat(501))).status, 400);
  const created = await (await post(token, 'submission-0003', 'photo', 'photo-1', '<b>not HTML</b>')).json() as { comment: { id: string } };
  const id = created.comment.id;
  assert.equal((await request('/api/admin/comments')).status, 401);
  const adminHeaders = { authorization: 'Bearer admin-secret', 'content-type': 'application/json' };
  const admin = await request('/api/admin/comments', { headers: adminHeaders });
  assert.equal(admin.status, 200);
  assert.equal((await admin.json() as { comments: unknown[] }).comments.length, 1);
  const reply = await request(`/api/admin/comments/${id}/reply`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ body: 'Hello!' }) });
  assert.equal(reply.status, 200);
  const listed = await request('/api/comments?targetType=photo&targetId=photo-1');
  assert.deepEqual((await listed.json() as { comments: Array<{ reply: { author: string; body: string } }> }).comments[0].reply, { author: 'Julia Wang', body: 'Hello!' });
  assert.equal((await request(`/api/admin/comments/${id}`, { method: 'DELETE', headers: adminHeaders })).status, 204);
  assert.equal((await (await request('/api/comments?targetType=photo&targetId=photo-1')).json() as { comments: unknown[] }).comments.length, 0);
});
