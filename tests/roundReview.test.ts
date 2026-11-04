import assert from 'node:assert/strict';
import test from 'node:test';

import { appendRoundReview, makeRoundReview, resolveRoundReview } from '../src/lib/roundReview.ts';

const round = {
  sessionId: 'session-1',
  round: 2,
  totalRounds: 5,
  photo: { id: 'photo-2', imageUrl: '/photos/photo-2.webp' },
};

const answer = {
  sessionId: 'session-1',
  round: 2,
  distanceKm: 123.4,
  score: 2100,
  proximity: 'near' as const,
  totalScore: 4000,
  completed: false,
  answerName: '香港太平山顶',
  correctAnswer: { latitude: 22.275, longitude: 114.145, radiusKm: 10 as const },
  nextRound: null,
};

test('five-round review uses an administrative place and small coordinates after lookup', () => {
  const review = makeRoundReview(round, { latitude: 22.3, longitude: 114.2 }, answer, '香港岛');

  const resolved = resolveRoundReview(review, '香港岛，香港，中国');

  assert.deepEqual(resolved, {
    round: 2,
    photoUrl: '/photos/photo-2.webp',
    guessLabel: 'Near 香港岛，香港，中国',
    guessPosition: '22.30° N, 114.20° E',
    locationPending: false,
    answerLabel: '香港太平山顶',
    score: 2100,
    distanceKm: 123.4,
  });
  assert.doesNotMatch(JSON.stringify(resolved), /session-1|radiusKm|correctAnswer/);
});

test('five-round review falls back to coordinates without saying Map Pin when lookup fails', () => {
  const review = makeRoundReview(round, { latitude: -22.3456, longitude: 114.2345 }, { ...answer, answerName: '' }, '');

  assert.equal(review.locationPending, true);
  assert.equal(resolveRoundReview(review, null).guessLabel, 'Near the selected location');
  assert.equal(resolveRoundReview(review, null).locationPending, false);
  assert.equal(review.guessPosition, '22.35° S, 114.23° E');
  assert.equal(review.answerLabel, 'Answer location');
});

test('five-round review keeps one result per round in order', () => {
  const second = makeRoundReview(round, { latitude: 22.3, longitude: 114.2 }, answer, '香港岛');
  const first = { ...second, round: 1 };

  assert.deepEqual(appendRoundReview(appendRoundReview([second], first), second), [first, second]);
});
