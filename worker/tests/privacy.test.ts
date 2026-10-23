import assert from "node:assert/strict";
import test from "node:test";

import { toPublicRound, type GamePhotoRecord } from "../src/sessions.ts";

test("public round data contains no answer coordinates or scoring radius", () => {
  const record: GamePhotoRecord = {
    photoId: "photo-1",
    imageUrl: "/photos/photo-1.webp",
    difficulty: "medium",
    answerLatitude: 22.293,
    answerLongitude: 114.17,
    radiusKm: 1,
    enabled: true,
  };

  const payload = toPublicRound(record, "session-1", 0, 5);
  const serialized = JSON.stringify(payload);

  assert.deepEqual(payload, {
    sessionId: "session-1",
    round: 1,
    totalRounds: 5,
    photo: {
      id: "photo-1",
      imageUrl: "/photos/photo-1.webp",
    },
  });
  assert.doesNotMatch(serialized, /latitude|longitude|radius|answer/i);
});
