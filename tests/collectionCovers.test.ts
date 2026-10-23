import assert from 'node:assert/strict';
import test from 'node:test';

import { selectCollectionCovers } from '../src/pages/collectionCovers.ts';

const photo = (id: string) => ({
  id,
  takenAt: '2024-03',
  description: null,
  device: null,
  image: { src: `/photos/${id}.webp`, thumbnail: `/photos/${id}-thumb.webp`, width: 1200, height: 800 },
  collections: ['c_one'],
  tags: [],
  featured: false,
});

test('selectCollectionCovers chooses one member per collection and stays stable for the page visit', () => {
  const collections = [
    { id: 'c_one', title: 'One', description: '', photos: [photo('p_1'), photo('p_2')] },
    { id: 'c_two', title: 'Two', description: '', photos: [{ ...photo('p_3'), collections: ['c_two'] }] },
  ];

  const first = selectCollectionCovers(collections, 81);
  const second = selectCollectionCovers(collections, 81);

  assert.deepEqual(second, first);
  assert.equal(first.length, 2);
  assert.ok(collections[0].photos.some((item) => item.id === first[0].photo.id));
  assert.equal(first[1].photo.id, 'p_3');
});
