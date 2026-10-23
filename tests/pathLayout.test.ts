import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPathData, buildPathLayout } from '../src/lib/pathLayout.ts';

test('buildPathLayout gives ten collections an unhurried vertical route', () => {
  const nodes = buildPathLayout(10);

  assert.equal(nodes.length, 10);
  assert.ok(nodes.every((node) => node.x >= 20 && node.x <= 80));
  assert.ok(nodes.slice(1).every((node, index) => node.y - nodes[index].y >= 430));
});

test('buildPathData connects nodes with smooth curves rather than hard line segments', () => {
  const path = buildPathData(buildPathLayout(4));

  assert.match(path, /^M /);
  assert.equal((path.match(/ C /g) ?? []).length, 3);
  assert.doesNotMatch(path, / L /);
});

