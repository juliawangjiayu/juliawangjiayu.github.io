import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAboutPhoto } from '../src/lib/aboutPhoto.ts';
import type { PublicPhoto } from '../src/content/types.ts';

const archivePhoto: PublicPhoto = {
  id: 'archive-photo',
  takenAt: '2025-05',
  description: null,
  device: null,
  image: { src: '/photos/archive-photo.webp', thumbnail: '/photos/archive-thumb.webp', width: 640, height: 480 },
  collections: ['city'],
  tags: [],
  featured: false,
};

test('configured About portrait is used without requiring it in the public photo catalog', () => {
  assert.deepEqual(
    resolveAboutPhoto({ src: '/about/about-photo.webp', width: 800, height: 1200 }, [archivePhoto], 'archive-photo'),
    { src: '/about/about-photo.webp', width: 800, height: 1200 },
  );
});

test('the current archive portrait remains the fallback until a separate About photo is configured', () => {
  assert.deepEqual(
    resolveAboutPhoto(null, [archivePhoto], 'archive-photo'),
    { src: '/photos/archive-photo.webp', width: 640, height: 480 },
  );
});
