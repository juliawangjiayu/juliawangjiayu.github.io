import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPathData,
  buildPathLayout,
  calculateCollectionPathHeight,
} from '../src/lib/pathLayout.ts';

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

test('calculateCollectionPathHeight keeps the final portrait card and its description scrollable', () => {
  const nodes = buildPathLayout(3);
  const lastNodeY = nodes.at(-1)?.y ?? 0;
  const withoutDescription = calculateCollectionPathHeight(nodes, {
    width: 4000,
    height: 6000,
    hasDescription: false,
  });
  const withDescription = calculateCollectionPathHeight(nodes, {
    width: 4000,
    height: 6000,
    hasDescription: true,
  });

  assert.ok(withoutDescription >= lastNodeY + 550);
  assert.ok(withDescription > withoutDescription);
});

