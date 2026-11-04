import type { RoundReview } from './roundReview.ts';

export const RANDOM_JOURNEY_TOKEN_KEY = 'julia-photo-random-journey';
const BATCH_REVIEW_KEY = 'julia-photo-random-batch-';

type ReviewStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type RandomJourneyProgress = {
  token: string;
  answered: number;
  total: number;
  cumulativeScore: number;
  completedBatches: number;
  totalBatches: number;
  complete: boolean;
  rankable: boolean;
  activeSessionScore?: number;
};

export function randomJourneyFinished(progress: RandomJourneyProgress): boolean {
  return progress.complete && progress.answered === progress.total;
}

export function randomJourneyCanRank(progress: RandomJourneyProgress): boolean {
  return randomJourneyFinished(progress) && progress.rankable;
}

export function randomJourneyCopy(progress: RandomJourneyProgress): string {
  return `${progress.answered} of ${progress.total} places explored · ${progress.cumulativeScore.toLocaleString()} total points`;
}

export function loadRandomJourneyToken(): string | null {
  return window.localStorage.getItem(RANDOM_JOURNEY_TOKEN_KEY);
}

export function saveRandomJourneyToken(token: string): void {
  window.localStorage.setItem(RANDOM_JOURNEY_TOKEN_KEY, token);
}

export function clearRandomJourneyToken(storage: Pick<Storage, 'removeItem'> = window.localStorage): void {
  storage.removeItem(RANDOM_JOURNEY_TOKEN_KEY);
}

export function saveRandomBatchReviews(sessionId: string, reviews: RoundReview[], storage: ReviewStorage = window.localStorage): void {
  storage.setItem(`${BATCH_REVIEW_KEY}${sessionId}`, JSON.stringify(reviews));
}

export function loadRandomBatchReviews(sessionId: string, storage: ReviewStorage = window.localStorage): RoundReview[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(`${BATCH_REVIEW_KEY}${sessionId}`) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is RoundReview =>
      item && Number.isInteger(item.round) && typeof item.photoUrl === 'string'
      && typeof item.guessLabel === 'string' && typeof item.guessPosition === 'string'
      && typeof item.answerLabel === 'string' && typeof item.score === 'number'
      && typeof item.distanceKm === 'number' && typeof item.locationPending === 'boolean');
  } catch { return []; }
}
