import { stableSample } from '../lib/stableSelection.ts';
import type { CollectionView, PublicCollection, PublicPhoto } from './types.ts';

export function buildCatalog(
  photos: readonly PublicPhoto[],
  collections: readonly PublicCollection[],
): CollectionView[] {
  return collections.map((collection) => ({
    ...collection,
    photos: photos.filter((photo) => photo.collections.includes(collection.id)),
  }));
}

export function selectHomepagePhotos(
  photos: readonly PublicPhoto[],
  count: number,
  seed: number,
): PublicPhoto[] {
  return stableSample(photos.filter((photo) => photo.featured), count, seed);
}
