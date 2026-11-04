import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUsername, normalizeEmail, emailVerifier, hashSessionToken, createSessionToken } from '../src/identity.ts';

test('normalizes multilingual usernames by grapheme', () => {
  assert.deepEqual(normalizeUsername('  王佳玉  '), { username: '王佳玉', usernameKey: '王佳玉' });
  assert.deepEqual(normalizeUsername('  E\u0301milie  '), { username: 'Émilie', usernameKey: 'émilie' });
  assert.equal(normalizeUsername('王' + '王\u0301'.repeat(23)).username.length > 24, true);
  assert.throws(() => normalizeUsername('王' + '王\u0301'.repeat(24)), { code: 'invalid_username' });
});

test('rejects reserved and malformed usernames', () => {
  for (const value of ['Julia Wang', 'julia_wang', 'ADMIN', 'photo-booth'.replace('-', ''), 'Moderator']) {
    assert.throws(() => normalizeUsername(value), { code: 'reserved_username' });
  }
  for (const value of ['a', 'a  b', 'a_', '-ab', 'ab-', 'ab🙂', 'a\nb', 'https://example.com']) {
    assert.throws(() => normalizeUsername(value), { code: 'invalid_username' });
  }
});

test('normalizes only the safe email surface', () => {
  assert.equal(normalizeEmail('  A.B+tag@Example.COM  '), 'a.b+tag@example.com');
  for (const value of ['a@b', '@example.com', 'a@@example.com', 'a b@example.com', 'a@example..com', 'a@.com', 'a'.repeat(250) + '@x.com']) {
    assert.throws(() => normalizeEmail(value), { code: 'invalid_email' });
  }
});

test('hashes email and session secrets without echoing input', async () => {
  const a = await emailVerifier('A@example.com', 'secret');
  assert.equal(a, await emailVerifier('a@example.com', 'secret'));
  assert.notEqual(a, await emailVerifier('a@example.com', 'other'));
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(await hashSessionToken('token'), await hashSessionToken('token'));
  assert.match(await hashSessionToken('token'), /^[a-f0-9]{64}$/);
  const token = createSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, createSessionToken());
  assert.doesNotMatch(a, /example|secret/i);
});
