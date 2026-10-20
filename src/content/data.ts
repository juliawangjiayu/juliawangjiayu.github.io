import collectionsJson from '../generated/collections.json';
import photosJson from '../generated/photography.json';
import { buildCatalog } from './catalog.ts';
import type { PublicCollection, PublicPhoto } from './types.ts';

export const photos = photosJson as PublicPhoto[];
export const collections = buildCatalog(
  photos,
  collectionsJson as PublicCollection[],
);

export function findCollection(id: string) {
  return collections.find((collection) => collection.id === id);
}
