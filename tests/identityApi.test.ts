import assert from 'node:assert/strict';
import test from 'node:test';

import { createIdentityClient } from '../src/lib/identityApi.ts';

function storage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
    entries,
  };
}

test('identity client stores only the issued opaque token and sends bearer', async () => {
  const local = storage();
  const requests: Request[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return Response.json(requests.length === 1
      ? { token: 'opaque-token', visitor: { id: 'v1', username: 'Julia Fan' } }
      : { visitor: { id: 'v1', username: 'Julia Fan' } });
  };
  const client = createIdentityClient('https://api.example', local, fetcher);
  await client.signIn('Julia Fan', 'private@example.com');
  assert.deepEqual([...local.entries.values()], ['opaque-token']);
  await client.me();
  assert.equal(requests[1].headers.get('authorization'), 'Bearer opaque-token');
});

test('identity client clears revoked tokens but keeps them on network errors', async () => {
  const local = storage();
  local.setItem('julia-photo-visitor-session', 'opaque-token');
  const revoked = createIdentityClient('', local, async () => Response.json({ code: 'unauthorized' }, { status: 401 }));
  await assert.rejects(revoked.me());
  assert.equal(revoked.token(), null);

  local.setItem('julia-photo-visitor-session', 'opaque-token');
  const offline = createIdentityClient('', local, async () => { throw new Error('offline'); });
  await assert.rejects(offline.me(), /offline/);
  assert.equal(offline.token(), 'opaque-token');
});

test('identity client keeps a session available for sign-out retry when revocation fails', async () => {
  const local = storage();
  local.setItem('julia-photo-visitor-session', 'opaque-token');
  const client = createIdentityClient('', local, async () => { throw new Error('offline'); });
  await assert.rejects(client.signOut(), /offline/);
  assert.equal(client.token(), 'opaque-token');
});
