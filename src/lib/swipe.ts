export type SwipeDirection = 'previous' | 'next' | null;

export function resolveSwipe(startX: number, endX: number, threshold = 48): SwipeDirection {
  const distance = endX - startX;
  if (Math.abs(distance) < threshold) return null;
  return distance < 0 ? 'next' : 'previous';
}
