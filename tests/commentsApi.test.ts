import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommentsClient } from '../src/lib/commentsApi.ts';

test('comment client sends separate photo and Collection targets and preserves retry key', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = createCommentsClient({ request: async <T>(path: string, init?: RequestInit): Promise<T> => {
    calls.push({ path, init });
    return { comments: [], hasMore: false, comment: { id: 'comment-1' } } as T;
  } });
  await client.list('photo', 'photo_1', 0);
  await client.list('collection', 'collection_2', 20);
  await client.create('photo', 'photo_1', 'A message', 'submission-0001');
  assert.equal(calls[0].path, '/api/comments?targetType=photo&targetId=photo_1&offset=0');
  assert.equal(calls[1].path, '/api/comments?targetType=collection&targetId=collection_2&offset=20');
  assert.equal(calls[2].init?.headers && (calls[2].init.headers as Record<string, string>)['idempotency-key'], 'submission-0001');
  assert.deepEqual(JSON.parse(calls[2].init?.body as string), { targetType: 'photo', targetId: 'photo_1', body: 'A message' });
});
