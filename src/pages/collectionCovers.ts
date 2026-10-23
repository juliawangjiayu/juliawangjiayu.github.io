import type { CollectionView, PublicPhoto } from '../content/types.ts';
import { stableSample } from '../lib/stableSelection.ts';

export type CollectionCover = {
  collection: CollectionView;
  photo: PublicPhoto;
  orientation: 'landscape' | 'portrait';
};

function collectionSeed(id: string, visitSeed: number): number {
  let hash = visitSeed >>> 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16_777_619);
  }
  return hash >>> 0;
}

export function selectCollectionCovers(
  collections: readonly CollectionView[],
  visitSeed: number,
): CollectionCover[] {
  return collections.flatMap((collection) => {
    const [photo] = stableSample(collection.photos, 1, collectionSeed(collection.id, visitSeed));
    if (!photo) return [];
    return [{
      collection,
      photo,
      orientation: photo.image.height > photo.image.width ? 'portrait' : 'landscape',
    }];
  });
}
