import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  normalizeLocalWorkerEndpoint,
  publishActiveAiConfig,
  readActiveAiConfig,
} from "../scripts/ai-config-sync.ts";

function configurationDatabase(): { databasePath: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), "photo-ai-config-"));
  const databasePath = join(directory, "studio.sqlite3");
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE ai_place_versions (
      version INTEGER PRIMARY KEY,
      provider TEXT NOT NULL,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL,
      timeout_seconds INTEGER NOT NULL,
      retry_count INTEGER NOT NULL,
      prompt_text TEXT NOT NULL,
      config_hash TEXT NOT NULL,
      lifecycle_state TEXT NOT NULL
    );
    CREATE TABLE ai_place_draft (
      singleton_id INTEGER PRIMARY KEY,
      model TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      config_hash TEXT NOT NULL,
      active_version INTEGER
    );
  `);
  database
    .prepare(`INSERT INTO ai_place_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
    .run(
      6,
      "deepseek",
      "https://api.deepseek.com",
      "deepseek-old",
      10,
      0,
      "Old prompt",
      "6".repeat(64),
      "superseded",
    );
  database
    .prepare(`INSERT INTO ai_place_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      7,
      "deepseek",
      "https://api.deepseek.com",
      "deepseek-flash",
      12,
      1,
      "Rewrite uncertain place text for Google Places.",
      "a".repeat(64),
      "active",
    );
  database
    .prepare(`INSERT INTO ai_place_draft VALUES (?, ?, ?, ?, ?)`)
    .run(1, "deepseek-next", "Unfinished draft prompt", "b".repeat(64), 7);
  database.close();
  return { databasePath, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test("local AI sync reads only the immutable active version, never the newer draft", () => {
  const fixture = configurationDatabase();
  try {
    assert.deepEqual(readActiveAiConfig(fixture.databasePath), {
      schemaVersion: 1,
      version: 7,
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-flash",
      timeoutSeconds: 12,
      retryCount: 1,
      prompt: "Rewrite uncertain place text for Google Places.",
      promptHash: "a".repeat(64),
    });
  } finally {
    fixture.cleanup();
  }
});

test("local AI sync fails before publication when Photo Booth has no active version", () => {
  const fixture = configurationDatabase();
  const database = new DatabaseSync(fixture.databasePath);
  database.exec("UPDATE ai_place_versions SET lifecycle_state = 'superseded'");
  database.close();
  try {
    assert.throws(
      () => readActiveAiConfig(fixture.databasePath),
      /Test and activate a configuration in Photo Booth first/,
    );
  } finally {
    fixture.cleanup();
  }
});

test("AI sync accepts loopback and the named HTTPS workers.dev production endpoint", async () => {
  assert.equal(normalizeLocalWorkerEndpoint("http://localhost:8787/"), "http://localhost:8787");
  assert.equal(
    normalizeLocalWorkerEndpoint(
      "https://julia-photo-guess.juliawangjiayu-github-io.workers.dev/",
    ),
    "https://julia-photo-guess.juliawangjiayu-github-io.workers.dev",
  );
  assert.throws(
    () => normalizeLocalWorkerEndpoint(
      "https://julia-photo-guess.attacker.workers.dev",
    ),
    /Worker endpoint/,
  );
  assert.throws(() => normalizeLocalWorkerEndpoint("https://photos.example.com"), /Worker endpoint/);
  assert.throws(
    () => normalizeLocalWorkerEndpoint(
      "http://julia-photo-guess.juliawangjiayu-github-io.workers.dev",
    ),
    /Worker endpoint/,
  );

  const fixture = configurationDatabase();
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  try {
    const receipt = await publishActiveAiConfig({
      databasePath: fixture.databasePath,
      endpoint: "http://127.0.0.1:8787",
      token: "local-publisher-token",
      fetcher: async (input, init) => {
        requestedUrl = String(input);
        requestedInit = init;
        return Response.json({
          version: 7,
          promptHash: "a".repeat(64),
          receipt: "local-receipt-7",
        });
      },
    });

    assert.deepEqual(receipt, {
      version: 7,
      promptHash: "a".repeat(64),
      receipt: "local-receipt-7",
    });
    assert.equal(requestedUrl, "http://127.0.0.1:8787/api/admin/ai-place-config");
    assert.deepEqual(requestedInit?.headers, {
      authorization: "Bearer local-publisher-token",
      "content-type": "application/json",
      "idempotency-key": `ai-place-config-v7-${"a".repeat(64)}`,
    });
    assert.equal(requestedInit?.redirect, "error");
    const sent = JSON.parse(String(requestedInit?.body));
    assert.equal(sent.version, 7);
    assert.equal(sent.model, "deepseek-flash");
    assert.equal("deepSeekApiKey" in sent, false);
    assert.equal(JSON.stringify(sent).includes("Unfinished draft prompt"), false);
  } finally {
    fixture.cleanup();
  }
});

test("local AI sync rejects unsafe tokens before fetch and masks transport failures", async () => {
  const fixture = configurationDatabase();
  let fetchCalls = 0;
  try {
    await assert.rejects(
      publishActiveAiConfig({
        databasePath: fixture.databasePath,
        endpoint: "http://127.0.0.1:8787",
        token: "publisher-token\nsecret-leak",
        fetcher: async () => {
          fetchCalls += 1;
          return Response.json({});
        },
      }),
      /valid local publisher token/,
    );
    assert.equal(fetchCalls, 0);

    const privateToken = "publisher-token-never-log";
    await assert.rejects(
      publishActiveAiConfig({
        databasePath: fixture.databasePath,
        endpoint: "http://127.0.0.1:8787",
        token: privateToken,
        fetcher: async () => {
          throw new Error(`socket failed with ${privateToken}`);
        },
      }),
      (error: unknown) => error instanceof Error
        && error.message === "Local Worker request failed or attempted a redirect."
        && !error.message.includes(privateToken),
    );

    await assert.rejects(
      publishActiveAiConfig({
        databasePath: fixture.databasePath,
        endpoint: "http://127.0.0.1:8787",
        token: privateToken,
        fetcher: async () => new Response("not json"),
      }),
      (error: unknown) => error instanceof Error
        && error.message === "Local Worker returned an invalid receipt."
        && !error.message.includes(privateToken),
    );
  } finally {
    fixture.cleanup();
  }
});
