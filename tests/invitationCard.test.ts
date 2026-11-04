import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInvitationCardData } from '../src/lib/invitationCard.ts';

test('invitation image contains the same-five link and score without answers', () => {
  const card = buildInvitationCardData(
    { id: 'five/a b', score: 12345, totalRounds: 5 },
    'https://juliawangjiayu.github.io',
  );

  assert.deepEqual(card, {
    url: 'https://juliawangjiayu.github.io/guess-where/challenge/five%2Fa%20b',
    score: 12345,
  });
  assert.doesNotMatch(JSON.stringify(card), /answer|latitude|longitude|radius|photoId/i);
});

test('invitation image refuses a missing challenge', () => {
  assert.throws(
    () => buildInvitationCardData({ id: '', score: 0, totalRounds: 5 }, 'https://juliawangjiayu.github.io'),
    /challenge/i,
  );
});
