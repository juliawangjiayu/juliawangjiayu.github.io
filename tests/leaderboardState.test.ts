import assert from 'node:assert/strict';
import test from 'node:test';

import { appendLeaderboardPage, appendLeaderboardPageForMode, newLeaderboardState, switchLeaderboardMode } from '../src/lib/leaderboardState.ts';

test('leaderboard state appends pages without duplicate visitors', () => {
  const initial = newLeaderboardState('easy');
  const first = appendLeaderboardPage(initial, {
    entries: [{ visitorId: 'a', username: 'A', score: 100, achievedAt: '2026-01-01', rank: 1 }],
    nextCursor: 'cursor-2',
  });
  const second = appendLeaderboardPage(first, {
    entries: [
      { visitorId: 'a', username: 'A', score: 100, achievedAt: '2026-01-01', rank: 1 },
      { visitorId: 'b', username: 'B', score: 90, achievedAt: '2026-01-02', rank: 2 },
    ],
    nextCursor: null,
  });
  assert.deepEqual(second.entries.map((entry) => entry.visitorId), ['a', 'b']);
  assert.equal(second.nextCursor, null);
});

test('leaderboard state resets on mode change', () => {
  const easy = appendLeaderboardPage(newLeaderboardState('easy'), { entries: [
    { visitorId: 'a', username: 'A', score: 100, achievedAt: '2026-01-01', rank: 1 },
  ], nextCursor: 'next' });
  assert.deepEqual(switchLeaderboardMode(easy, 'hard'), newLeaderboardState('hard'));
});

test('leaderboard state ignores a late page from another mode', () => {
  const hard = newLeaderboardState('hard');
  const stale = appendLeaderboardPageForMode(hard, 'easy', { entries: [
    { visitorId: 'a', username: 'A', score: 100, achievedAt: '2026-01-01', rank: 1 },
  ], nextCursor: 'stale' });
  assert.deepEqual(stale, hard);
});
