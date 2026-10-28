import assert from 'node:assert/strict';
import test from 'node:test';

import * as collectionPresentation from '../src/lib/collectionPresentation.ts';

const { collectionDescription } = collectionPresentation;

test('collectionDescription keeps authored copy while hiding blank metadata', () => {
  assert.equal(collectionDescription('  Concrete, glass, and the spaces between them.  '), 'Concrete, glass, and the spaces between them.');
  assert.equal(collectionDescription('   '), null);
});

test('collection index links target the matching path node, including non-ASCII ids', () => {
  const helpers = collectionPresentation as unknown as {
    collectionNodeId?: (collectionId: string) => string;
    collectionNodeHref?: (collectionId: string) => string;
  };

  assert.equal(typeof helpers.collectionNodeId, 'function');
  assert.equal(typeof helpers.collectionNodeHref, 'function');
  assert.equal(helpers.collectionNodeId!('c_city'), 'collection-c_city');
  assert.equal(
    helpers.collectionNodeHref!('福州 / hills'),
    '#collection-%E7%A6%8F%E5%B7%9E%20%2F%20hills',
  );
});
