import assert from "node:assert/strict";
import test from "node:test";

import {
  InsufficientQuestionsError,
  selectQuestionIds,
  type GamePhotoRecord,
} from "../src/sessions.ts";

function makePhoto(id: string, difficulty: GamePhotoRecord["difficulty"]): GamePhotoRecord {
  return {
    photoId: id,
    imageUrl: `/photos/${id}.webp`,
    difficulty,
    answerLatitude: 0,
    answerLongitude: 0,
    radiusKm: 10,
    enabled: true,
  };
}

test("selectQuestionIds returns five stable, unique questions", () => {
  const records = Array.from({ length: 7 }, (_, index) =>
    makePhoto(`easy-${index}`, "easy"),
  );

  const first = selectQuestionIds(records, "easy", "session-seed");
  const second = selectQuestionIds(records, "easy", "session-seed");

  assert.equal(first.length, 5);
  assert.equal(new Set(first).size, 5);
  assert.deepEqual(first, second);
});

test("selectQuestionIds rejects a mode with fewer than five eligible photos", () => {
  const records = [makePhoto("hard-1", "hard"), makePhoto("hard-2", "hard")];

  assert.throws(
    () => selectQuestionIds(records, "hard", "session-seed"),
    InsufficientQuestionsError,
  );
});
