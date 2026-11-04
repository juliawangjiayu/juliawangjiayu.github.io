import assert from 'node:assert/strict';
import test from 'node:test';

import { clearRandomJourneyToken, loadRandomBatchReviews, randomJourneyCanRank, randomJourneyCopy, randomJourneyFinished, saveRandomBatchReviews } from '../src/lib/randomJourney.ts';

test('random journey shows cumulative progress and never ranks a five-photo batch', () => {
  const progress = { token: 'opaque', answered: 5, total: 39, cumulativeScore: 17300, completedBatches: 1, totalBatches: 8, complete: false, rankable: true };
  assert.match(randomJourneyCopy(progress), /5 of 39/);
  assert.match(randomJourneyCopy(progress), /17,300/);
  assert.equal(randomJourneyFinished(progress), false);
});

test('random journey unlocks ranking only after all 39 questions', () => {
  const progress = { token: 'opaque', answered: 39, total: 39, cumulativeScore: 150000, completedBatches: 8, totalBatches: 8, complete: true, rankable: true };
  assert.equal(randomJourneyFinished(progress), true);
  assert.equal(randomJourneyCanRank(progress), true);
  assert.equal(randomJourneyCanRank({ ...progress, rankable: false }), false);
});

test('random journey restores only the current batch review rows after navigation', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const review = { round: 1, photoUrl: '/p.webp', guessLabel: 'Near Wuhan', guessPosition: '30° N', locationPending: false, answerLabel: 'Wuhan', score: 5000, distanceKm: 0 };
  saveRandomBatchReviews('session-a', [review], storage);
  assert.deepEqual(loadRandomBatchReviews('session-a', storage), [review]);
  assert.deepEqual(loadRandomBatchReviews('session-b', storage), []);
});

test('random journey can clear a stale browser token after the local server resets', () => {
  const values = new Map([['julia-photo-random-journey', 'stale-token']]);
  clearRandomJourneyToken({ removeItem: (key: string) => { values.delete(key); } });
  assert.equal(values.size, 0);
});
