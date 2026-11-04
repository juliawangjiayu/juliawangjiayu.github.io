import assert from "node:assert/strict";
import test from "node:test";

import { distanceKm, scoreGuess } from "../src/scoring.ts";

test("a guess inside the authored radius receives the full score", () => {
  assert.deepEqual(scoreGuess(0.8, 1), {
    score: 5000,
    proximity: "exact",
  });
});

test("score falls smoothly with distance and eventually reaches zero", () => {
  const distances = [20, 50, 500, 1500];
  const scores = distances.map((distance) => scoreGuess(distance, 10).score);

  assert.ok(scores[0] > scores[1]);
  assert.ok(scores[1] > scores[2]);
  assert.ok(scores[2] > scores[3]);
  assert.ok(scores[3] > 0);
  assert.deepEqual(scoreGuess(9000, 10), {
    score: 0,
    proximity: "miss",
  });
});

test("medium and long misses lose more points while a nearby guess still scores", () => {
  const nearby = scoreGuess(50, 10).score;
  const regional = scoreGuess(500, 10).score;
  const distant = scoreGuess(1500, 10).score;

  assert.ok(nearby > 4700);
  assert.ok(regional >= 3000 && regional <= 3300);
  assert.ok(distant >= 1200 && distant <= 1400);
  assert.deepEqual(scoreGuess(6000, 10), { score: 0, proximity: "miss" });
});

test("a wider authored radius never lowers the score", () => {
  assert.ok(scoreGuess(80, 100).score >= scoreGuess(80, 10).score);
});

test("distanceKm uses great-circle distance", () => {
  assert.ok(Math.abs(distanceKm(0, 0, 1, 0) - 111.195) < 0.1);
});
