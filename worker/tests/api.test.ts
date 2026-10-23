import assert from "node:assert/strict";
import test from "node:test";

import { createGameApp } from "../src/app.ts";
import { calculatePromptHash } from "../src/aiPlaces.ts";
import type { GameAppOptions } from "../src/app.ts";
import type { GamePhotoRecord } from "../src/sessions.ts";
import { MemoryGameRepository } from "./fakes.ts";

function makePhotos(count = 5): GamePhotoRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    photoId: `photo-${index + 1}`,
    imageUrl: `/photos/photo-${index + 1}.webp`,
    difficulty: "easy",
    answerLatitude: 22.293 + index,
    answerLongitude: 114.17 + index,
    radiusKm: 10,
    enabled: true,
  }));
}

function createTestApp(repository: MemoryGameRepository, options: GameAppOptions = {}) {
  let sequence = 0;
  return createGameApp(repository, {
    createId: (kind) => `${kind}-${++sequence}`,
    now: () => "2026-10-20T10:00:00.000Z",
    ...options,
  });
}

test("private game-photo sync requires the configured admin token", async () => {
  const repository = new MemoryGameRepository([]);
  const app = createTestApp(repository, { adminToken: "publisher-secret" });
  const payload = {
    schemaVersion: 1,
    photos: makePhotos(),
  };

  const unauthorized = await app.request("/api/admin/game-photos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(unauthorized.status, 401);

  const accepted = await app.request("/api/admin/game-photos", {
    method: "POST",
    headers: {
      authorization: "Bearer publisher-secret",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { schemaVersion: 1, photoCount: 5 });
  assert.equal((await repository.listEnabledGamePhotos()).length, 5);
});

test("Photo Booth can publish an idempotent encrypted AI place configuration", async () => {
  const repository = new MemoryGameRepository([]);
  const app = createTestApp(repository, {
    adminToken: "publisher-secret",
    aiEncryptionKey: "wrapping-secret",
  });
  const fields = {
    provider: "deepseek" as const,
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    timeoutSeconds: 12,
    retryCount: 1,
    prompt: "Rewrite place descriptions for Google Places without inventing clues.",
  };
  const promptHash = await calculatePromptHash(fields);
  const payload = {
    schemaVersion: 1,
    version: 1,
    ...fields,
    promptHash,
    deepSeekApiKey: "deepseek-secret",
  };
  const headers = {
    authorization: "Bearer publisher-secret",
    "content-type": "application/json",
    "idempotency-key": `ai-place-config-v1-${promptHash}`,
  };

  const first = await app.request("/api/admin/ai-place-config", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const firstReceipt = await first.json();
  const second = await app.request("/api/admin/ai-place-config", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  assert.equal(first.status, 200);
  assert.deepEqual(await second.json(), firstReceipt);
  assert.equal(repository.aiConfigs.size, 1);
  assert.notEqual((await repository.getActiveAiPlaceConfig())?.encryptedApiKey, "deepseek-secret");
  assert.doesNotMatch(JSON.stringify(firstReceipt), /deepseek-secret/);
});

test("starting a game returns a public round without answer data", async () => {
  const repository = new MemoryGameRepository(makePhotos());
  const app = createTestApp(repository);

  const response = await app.request("/api/game/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "easy" }),
  });
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 201);
  assert.equal(body.round, 1);
  assert.equal(body.totalRounds, 5);
  assert.doesNotMatch(serialized, /latitude|longitude|radius|answer/i);
});

test("a submitted round is scored once and only then reveals its answer", async () => {
  const repository = new MemoryGameRepository(makePhotos());
  const app = createTestApp(repository);
  const startResponse = await app.request("/api/game/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "easy" }),
  });
  const started = await startResponse.json();
  const privatePhoto = await repository.getGamePhoto(started.photo.id);

  assert.ok(privatePhoto);

  const answerResponse = await app.request(`/api/game/${started.sessionId}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      round: 1,
      latitude: privatePhoto.answerLatitude,
      longitude: privatePhoto.answerLongitude,
    }),
  });
  const answer = await answerResponse.json();

  assert.equal(answerResponse.status, 200);
  assert.equal(answer.score, 5000);
  assert.deepEqual(answer.correctAnswer, {
    latitude: privatePhoto.answerLatitude,
    longitude: privatePhoto.answerLongitude,
    radiusKm: privatePhoto.radiusKm,
  });

  const duplicateResponse = await app.request(`/api/game/${started.sessionId}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      round: 1,
      latitude: privatePhoto.answerLatitude,
      longitude: privatePhoto.answerLongitude,
    }),
  });

  assert.equal(duplicateResponse.status, 409);
});

test("an incomplete difficulty returns a useful conflict response", async () => {
  const repository = new MemoryGameRepository(makePhotos(4));
  const app = createTestApp(repository);

  const response = await app.request("/api/game/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "easy" }),
  });

  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /five eligible photos/i);
});

test("a shared challenge starts a new session with the exact same five photos", async () => {
  const repository = new MemoryGameRepository(makePhotos());
  const app = createTestApp(repository);
  const startResponse = await app.request("/api/game/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "easy" }),
  });
  const started = await startResponse.json();
  const originalSession = repository.sessions.get(started.sessionId);

  assert.ok(originalSession);

  for (let roundIndex = 0; roundIndex < originalSession.questionIds.length; roundIndex += 1) {
    const photo = await repository.getGamePhoto(originalSession.questionIds[roundIndex]);
    assert.ok(photo);

    const response = await app.request(`/api/game/${started.sessionId}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        round: roundIndex + 1,
        latitude: photo.answerLatitude,
        longitude: photo.answerLongitude,
      }),
    });
    assert.equal(response.status, 200);
  }

  const createResponse = await app.request("/api/challenges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: started.sessionId }),
  });
  const challenge = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(challenge.score, 25000);

  const challengeResponse = await app.request(`/api/challenges/${challenge.id}/start`, {
    method: "POST",
  });
  const challengeStart = await challengeResponse.json();
  const repeatedSession = repository.sessions.get(challengeStart.round.sessionId);

  assert.equal(challengeResponse.status, 201);
  assert.ok(repeatedSession);
  assert.deepEqual(repeatedSession.questionIds, originalSession.questionIds);
  assert.doesNotMatch(JSON.stringify(challengeStart), /latitude|longitude|radius|answer/i);
});
