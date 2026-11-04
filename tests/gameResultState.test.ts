import assert from 'node:assert/strict';
import test from 'node:test';

import { leaderboardResultCopy } from '../src/lib/gameResultState.ts';

test('game result state reports a new best', () => {
  assert.equal(leaderboardResultCopy({ updated: true, runScore: 17000, bestScore: 17000 }), 'New personal best — leaderboard updated.');
});

test('game result state explains a lower run without implying the best changed', () => {
  assert.equal(leaderboardResultCopy({ updated: false, runScore: 12000, bestScore: 17000 }), 'Your best score remains 17,000. This run can still be shared.');
});
