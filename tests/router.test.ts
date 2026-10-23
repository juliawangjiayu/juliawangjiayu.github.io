import assert from 'node:assert/strict';
import test from 'node:test';

import { matchRoute, pathForCollection } from '../src/router.ts';

test('matchRoute recognizes every public destination and decodes collection ids', () => {
  assert.deepEqual(matchRoute('/'), { name: 'home' });
  assert.deepEqual(matchRoute('/collections'), { name: 'collections' });
  assert.deepEqual(matchRoute('/collections/c_%E5%9F%8E%E5%B8%82'), { name: 'collection', id: 'c_城市' });
  assert.deepEqual(matchRoute('/guess-where'), { name: 'guess-where' });
  assert.deepEqual(matchRoute('/guess-where/challenge/abc%20123'), {
    name: 'guess-where-challenge',
    id: 'abc 123',
  });
  assert.deepEqual(matchRoute('/about/'), { name: 'about' });
  assert.deepEqual(matchRoute('/missing'), { name: 'not-found' });
});

test('pathForCollection safely encodes the public collection id', () => {
  assert.equal(pathForCollection('c_城市/walk'), '/collections/c_%E5%9F%8E%E5%B8%82%2Fwalk');
});

