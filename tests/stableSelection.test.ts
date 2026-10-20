import assert from 'node:assert/strict';
import test from 'node:test';

import { stableSample } from '../src/lib/stableSelection.ts';

test('stableSample keeps the same visit selection stable without mutating input', () => {
  const source = ['a', 'b', 'c', 'd', 'e'];
  const first = stableSample(source, 3, 42);

  assert.equal(first.length, 3);
  assert.deepEqual(stableSample(source, 3, 42), first);
  assert.notDeepEqual(stableSample(source, 3, 43), first);
  assert.ok(first.every((item) => source.includes(item)));
  assert.deepEqual(source, ['a', 'b', 'c', 'd', 'e']);
});

test('stableSample clips an oversized request and never duplicates an item', () => {
  assert.deepEqual(new Set(stableSample(['a', 'b'], 8, 7)), new Set(['a', 'b']));
});

