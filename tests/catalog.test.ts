import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCatalog, selectHomepagePhotos } from '../src/content/catalog.ts';

const photo = (id: string, collections: string[], featured = false) => ({
  id,
  takenAt: '2024-03',
  description: null,
  device: 'Sony a6400',
  image: { src: `/photos/${id}.webp`, thumbnail: `/photos/${id}-thumb.webp`, width: 1200, height: 800 },
  collections,
  tags: [],
  featured,
});

test('buildCatalog preserves many-to-many collection membership and source order', () => {
  const result = buildCatalog(
    [photo('p_one', ['c_city', 'c_walk']), photo('p_two', ['c_city'])],
    [
      { id: 'c_city', title: '城市', description: '' },
      { id: 'c_walk', title: '漫游', description: '' },
    ],
  );

  assert.deepEqual(result.map((collection) => [collection.id, collection.photos.map((item) => item.id)]), [
    ['c_city', ['p_one', 'p_two']],
    ['c_walk', ['p_one']],
  ]);
});

test('selectHomepagePhotos uses only featured photographs and stays stable for one seed', () => {
  const photos = [photo('p_one', ['c_city'], true), photo('p_two', ['c_city']), photo('p_three', ['c_city'], true)];
  const first = selectHomepagePhotos(photos, 5, 9);

  assert.deepEqual(new Set(first.map((item) => item.id)), new Set(['p_one', 'p_three']));
  assert.deepEqual(selectHomepagePhotos(photos, 5, 9), first);
});

