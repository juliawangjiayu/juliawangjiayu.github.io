import assert from 'node:assert/strict';
import test from 'node:test';
import { IdentityService } from '../src/identityService.ts';
import { MemoryGameRepository } from './fakes.ts';

function setup() {
  const repository = new MemoryGameRepository([]);
  let current = new Date('2026-10-20T10:00:00.000Z');
  let sequence = 0;
  const service = new IdentityService(repository, {
    pepper: 'test-pepper', now: () => current, createId: () => `visitor-${++sequence}`,
  });
  return { repository, service, advance: (days: number) => { current = new Date(current.getTime() + days * 86400000); } };
}

test('identity service creates and verifies exact pair without leaking conflict side', async () => {
  const { service } = setup();
  const first = await service.authenticate('  Alice  ', 'Alice@example.com');
  const second = await service.authenticate('alice', 'alice@example.com');
  assert.equal(first.visitor.id, second.visitor.id);
  assert.notEqual(first.token, second.token);
  for (const [username, email] of [['Alice', 'wrong@example.com'], ['Other', 'alice@example.com']]) {
    await assert.rejects(service.authenticate(username, email), { code: 'identity_mismatch' });
  }
  assert.equal(await service.resolve(first.token), first.visitor.id ? first.visitor : null);
});

test('session lifecycle evicts only oldest of six and revokes current token', async () => {
  const { service, advance } = setup();
  const sessions = [];
  for (let index = 0; index < 6; index++) {
    sessions.push(await service.authenticate('Alice', 'alice@example.com'));
    advance(1 / 24);
  }
  assert.equal(await service.resolve(sessions[0].token), null);
  for (const session of sessions.slice(1)) assert.ok(await service.resolve(session.token));
  await service.revoke(sessions[2].token);
  assert.equal(await service.resolve(sessions[2].token), null);
  assert.ok(await service.resolve(sessions[1].token));
});

test('session lifecycle expires after thirty idle days and ninety absolute days', async () => {
  const { service, advance } = setup();
  const idle = await service.authenticate('Alice', 'alice@example.com');
  advance(31);
  assert.equal(await service.resolve(idle.token), null);
  const active = await service.authenticate('Alice', 'alice@example.com');
  for (let index = 0; index < 89; index++) {
    advance(1);
    assert.ok(await service.resolve(active.token));
  }
  advance(1);
  assert.equal(await service.resolve(active.token), null);
});
