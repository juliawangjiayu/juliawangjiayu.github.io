import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReviewCardData, wrapReviewText } from '../src/lib/reviewCard.ts';
import type { RoundReview } from '../src/lib/roundReview.ts';

const reviews: RoundReview[] = Array.from({ length: 5 }, (_, index) => ({
  round: index + 1,
  photoUrl: `/photos/photo-${index + 1}.webp`,
  guessLabel: index === 0 ? 'Near 武汉市，湖北省，中国' : `Near City ${index + 1}`,
  guessPosition: index === 0 ? '30.60° N, 114.30° E' : '22.30° N, 114.20° E',
  locationPending: false,
  answerLabel: `Answer ${index + 1}`,
  score: (index + 1) * 100,
  distanceKm: 12.3,
}));

test('review image includes guessed place and coordinates without private answer data', () => {
  const data = buildReviewCardData(reviews, 1500);

  assert.equal(data.totalScore, 1500);
  assert.deepEqual(data.rows.map((row) => row.round), [1, 2, 3, 4, 5]);
  assert.equal(data.rows[0]?.guessLabel, 'Near 武汉市，湖北省，中国');
  assert.equal(data.rows[0]?.guessPosition, '30.60° N, 114.30° E');
  assert.equal(data.rows[4]?.answerLabel, 'Answer 5');
  assert.equal(data.rows[4]?.score, 500);
  assert.doesNotMatch(JSON.stringify(data), /distanceKm|radiusKm|sessionId|answerLatitude|answerLongitude/);
});

test('review image waits for all five nearby-place lookups', () => {
  assert.throws(() => buildReviewCardData([{ ...reviews[0], locationPending: true }, ...reviews.slice(1)], 1500), /place lookup/i);
});

test('review image refuses an incomplete five-round result', () => {
  assert.throws(() => buildReviewCardData(reviews.slice(0, 4), 1000), /five rounds/i);
});

test('review image accepts a completed four-photo final Random batch', () => {
  const data = buildReviewCardData(reviews.slice(0, 4), 1000, 4);
  assert.equal(data.rows.length, 4);
  assert.equal(data.totalRounds, 4);
});

test('review image wraps long answer names without dropping characters', () => {
  const answer = 'Vietnam Veterans Memorial, Henry Bacon Drive Northwest, Ward 2, Washington, District of Columbia, United States';
  const lines = wrapReviewText(answer, 24, (value) => value.length);

  assert.ok(lines.length > 2);
  assert.equal(lines.join(''), answer);
  assert.ok(lines.every((line) => line.length <= 24));
});
