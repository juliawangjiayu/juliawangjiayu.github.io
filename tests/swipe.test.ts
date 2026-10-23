import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSwipe } from '../src/lib/swipe.ts';

test('resolveSwipe maps deliberate horizontal gestures and ignores short movement', () => {
  assert.equal(resolveSwipe(220, 120), 'next');
  assert.equal(resolveSwipe(120, 220), 'previous');
  assert.equal(resolveSwipe(120, 150), null);
});
