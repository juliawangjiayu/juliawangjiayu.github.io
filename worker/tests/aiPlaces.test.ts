import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePromptHash,
  decryptApiKey,
  encryptApiKey,
  interpretPlace,
  type AiPlaceConfigRecord,
} from "../src/aiPlaces.ts";

const config: AiPlaceConfigRecord = {
  version: 1,
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-flash",
  timeoutSeconds: 12,
  retryCount: 0,
  prompt: "Rewrite the supplied place description without inventing specificity.",
  promptHash: "a".repeat(64),
  encryptedApiKey: "",
  apiKeyIv: "",
  receipt: "receipt-1",
  createdAt: "2026-10-21T00:00:00.000Z",
};

test("prompt hash matches Photo Booth canonical JSON", async () => {
  const hash = await calculatePromptHash({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    timeoutSeconds: 12,
    retryCount: 1,
    prompt: "Hello 世界",
  });

  assert.equal(hash, "73269c4c0cfd7cee0caf518190b5e4e9512e0a2a3fc8290eea69ba4179f766f0");
});

test("published API keys are encrypted before D1 storage", async () => {
  const encrypted = await encryptApiKey("deepseek-secret", "wrapping-secret");

  assert.notEqual(encrypted.encryptedApiKey, "deepseek-secret");
  assert.equal(
    await decryptApiKey(encrypted.encryptedApiKey, encrypted.apiKeyIv, "wrapping-secret"),
    "deepseek-secret",
  );
});

test("place interpretation accepts bounded JSON and rejects coordinates", async () => {
  const validFetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                status: "searchable",
                normalized_query: "Victoria Peak Tram Hong Kong",
                landmark: "Victoria Peak Tram",
                locality: "Hong Kong",
                region: "",
                country: "China",
                category: "tram station",
                uncertainty: [],
                confidence: 0.92,
                clarification: "",
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const interpretation = await interpretPlace("太平山顶 缆车站", config, "key", {
    fetcher: validFetcher,
  });

  assert.equal(interpretation.normalized_query, "Victoria Peak Tram Hong Kong");

  const coordinateFetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...interpretation,
                normalized_query: "22.29, 114.17",
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  await assert.rejects(
    interpretPlace("somewhere", config, "key", { fetcher: coordinateFetcher }),
    /coordinates/i,
  );
});
