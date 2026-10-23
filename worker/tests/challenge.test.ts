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
