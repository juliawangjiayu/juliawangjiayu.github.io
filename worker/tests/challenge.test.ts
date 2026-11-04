import assert from "node:assert/strict";
import test from "node:test";

import { createChallengeRecord } from "../src/challenges.ts";

test("a challenge preserves the exact five-question order and visible score", () => {
  const questionIds = ["one", "two", "three", "four", "five"];

  assert.deepEqual(createChallengeRecord("challenge-1", questionIds, 21340), {
    id: "challenge-1",
    questionIds,
    score: 21340,
    totalRounds: 5,
  });
});

test('a challenge accepts four or five questions only', () => {
  assert.equal(createChallengeRecord('four', ['1', '2', '3', '4'], 20000).totalRounds, 4);
  assert.throws(() => createChallengeRecord('three', ['1', '2', '3'], 15000));
  assert.throws(() => createChallengeRecord('six', ['1', '2', '3', '4', '5', '6'], 30000));
});
