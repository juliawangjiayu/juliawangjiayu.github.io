import type { AnswerResult, GuessPoint, PublicRound } from './gameApi.ts';

export type RoundReview = {
  round: number;
  photoUrl: string;
  guessLabel: string;
  guessPosition: string;
  locationPending: boolean;
  answerLabel: string;
  score: number;
  distanceKm: number;
};

function positionLabel(point: GuessPoint): string {
  const latitude = `${Math.abs(point.latitude).toFixed(2)}° ${point.latitude < 0 ? 'S' : 'N'}`;
  const longitude = `${Math.abs(point.longitude).toFixed(2)}° ${point.longitude < 0 ? 'W' : 'E'}`;
  return `${latitude}, ${longitude}`;
}

export function makeRoundReview(
  round: PublicRound,
  point: GuessPoint,
  answer: AnswerResult,
  selectedPlaceName: string,
): RoundReview {
  const fallbackPlace = selectedPlaceName.trim() || 'the selected location';
  return {
    round: round.round,
    photoUrl: round.photo.imageUrl,
    guessLabel: `Near ${fallbackPlace}`,
    guessPosition: positionLabel(point),
    locationPending: true,
    answerLabel: answer.answerName?.trim() || 'Answer location',
    score: answer.score,
    distanceKm: answer.distanceKm,
  };
}

export function appendRoundReview(reviews: RoundReview[], review: RoundReview): RoundReview[] {
  if (reviews.some((entry) => entry.round === review.round)) return reviews;
  return [...reviews, review].sort((left, right) => left.round - right.round);
}

export function resolveRoundReview(review: RoundReview, place: string | null): RoundReview {
  return {
    ...review,
    guessLabel: place?.trim() ? `Near ${place.trim()}` : review.guessLabel,
    locationPending: false,
  };
}
