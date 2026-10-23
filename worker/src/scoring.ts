export type Proximity = "exact" | "close" | "near" | "far" | "miss";

export interface ScoreResult {
  score: number;
  proximity: Proximity;
}

const EARTH_RADIUS_KM = 6371.0088;
const SCORE_DECAY_KM = 1492.7;
const ZERO_SCORE_DISTANCE_KM = 8000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceKm(
  answerLatitude: number,
  answerLongitude: number,
  guessLatitude: number,
  guessLongitude: number,
): number {
  const latitudeDelta = toRadians(guessLatitude - answerLatitude);
  const longitudeDelta = toRadians(guessLongitude - answerLongitude);
  const answerLatitudeRadians = toRadians(answerLatitude);
  const guessLatitudeRadians = toRadians(guessLatitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(answerLatitudeRadians) *
      Math.cos(guessLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function scoreGuess(distance: number, radiusKm: number): ScoreResult {
  if (distance <= radiusKm) {
    return { score: 5000, proximity: "exact" };
  }

  if (distance >= ZERO_SCORE_DISTANCE_KM) {
    return { score: 0, proximity: "miss" };
  }

  const adjustedDistance = Math.max(0, distance - radiusKm);
  const score = Math.max(
    0,
    Math.min(5000, Math.round(5000 * Math.exp(-adjustedDistance / SCORE_DECAY_KM))),
  );

  if (score === 0) {
    return { score: 0, proximity: "miss" };
  }

  if (distance <= Math.max(radiusKm * 3, 25)) {
    return { score, proximity: "close" };
  }

  if (distance <= Math.max(radiusKm * 10, 250)) {
    return { score, proximity: "near" };
  }

  return { score, proximity: "far" };
}
