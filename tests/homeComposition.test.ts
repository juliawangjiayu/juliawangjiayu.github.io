import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHomeComposition } from '../src/pages/homeComposition.ts';

const photo = (id: string, featured: boolean, width: number, height: number) => ({
  id,
  takenAt: '2024-03',
  description: null,
  device: 'Sony a6400',
  image: { src: `/photos/${id}.webp`, thumbnail: `/photos/${id}-thumb.webp`, width, height },
  collections: ['c_city'],
  tags: [],
  featured,
});

test('buildHomeComposition selects featured photos once and preserves orientation metadata', () => {
  const photos = [
    photo('p_landscape', true, 1200, 800),
    photo('p_portrait', true, 800, 1200),
    photo('p_hidden', false, 1200, 800),
  ];

  const first = buildHomeComposition(photos, 8);
  const second = buildHomeComposition(photos, 8);

  assert.deepEqual(second, first);
  assert.deepEqual(new Set(first.map((item) => item.photo.id)), new Set(['p_landscape', 'p_portrait']));
  assert.deepEqual(
    Object.fromEntries(first.map((item) => [item.photo.id, item.orientation])),
    { p_landscape: 'landscape', p_portrait: 'portrait' },
  );
});

