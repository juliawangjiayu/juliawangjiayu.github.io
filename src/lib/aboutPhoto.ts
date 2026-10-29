import type { PublicPhoto } from '../content/types.ts';

export type AboutPhotoAsset = { src: string; width: number; height: number };

export function resolveAboutPhoto(
  configured: AboutPhotoAsset | null,
  photos: readonly PublicPhoto[],
  fallbackPhotoId: string,
): AboutPhotoAsset | null {
  if (configured) return configured;
  const fallback = photos.find((photo) => photo.id === fallbackPhotoId) ?? photos[0];
  return fallback
    ? { src: fallback.image.src, width: fallback.image.width, height: fallback.image.height }
    : null;
}
