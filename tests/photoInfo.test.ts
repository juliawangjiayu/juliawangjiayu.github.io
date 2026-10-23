import assert from 'node:assert/strict';
import test from 'node:test';

import { photoInfoRows } from '../src/lib/photoInfo.ts';

const basePhoto = {
  id: 'p_one',
  takenAt: '2024-03',
  description: null,
  device: null,
  image: { src: '/photos/p_one.webp', thumbnail: '/photos/p_one-thumb.webp', width: 1200, height: 800 },
  collections: ['c_city'],
  tags: [],
  featured: false,
};

test('photoInfoRows formats stored precision and hides every empty public field', () => {
  assert.deepEqual(photoInfoRows(basePhoto), [{ label: 'Captured', value: 'March 2024' }]);
});

test('photoInfoRows includes only the four approved public metadata groups', () => {
  assert.deepEqual(photoInfoRows({
    ...basePhoto,
    takenAt: '2024-03-08',
    device: 'Sony a6400',
    tags: ['night', 'city'],
    description: 'A late ferry crossing.',
  }), [
    { label: 'Captured', value: 'March 8, 2024' },
    { label: 'Device', value: 'Sony a6400' },
    { label: 'Tags', value: 'night · city' },
    { label: 'Description', value: 'A late ferry crossing.' },
  ]);
});

