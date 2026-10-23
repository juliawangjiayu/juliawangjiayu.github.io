import { selectHomepagePhotos } from '../content/catalog.ts';
import type { PublicPhoto } from '../content/types.ts';

export type HomePhoto = {
  photo: PublicPhoto;
  orientation: 'landscape' | 'portrait' | 'square';
  slot: number;
};

function orientation(photo: PublicPhoto): HomePhoto['orientation'] {
  const ratio = photo.image.width / photo.image.height;
  if (ratio > 1.05) return 'landscape';
  if (ratio < 0.95) return 'portrait';
  return 'square';
}

export function buildHomeComposition(
  photos: readonly PublicPhoto[],
  seed: number,
  count = 5,
): HomePhoto[] {
  return selectHomepagePhotos(photos, count, seed).map((photo, slot) => ({
    photo,
    orientation: orientation(photo),
    slot,
  }));
}

