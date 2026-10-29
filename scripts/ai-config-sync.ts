import { DatabaseSync } from "node:sqlite";

export interface AiPlaceRelease {
  schemaVersion: 1;
  version: number;
  provider: string;
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
  retryCount: number;
  prompt: string;
  promptHash: string;
}

interface ActiveAiConfigRow {
  version: number;
  provider: string;
  base_url: string;
  model: string;
  timeout_seconds: number;
  retry_count: number;
  prompt_text: string;
  config_hash: string;
}

export interface AiConfigReceipt {
  version: number;
  promptHash: string;
  receipt: string;
}

export interface PublishActiveAiConfigOptions {
  databasePath: string;
  endpoint: string;
  token: string;
  fetcher?: typeof fetch;
}

export function readActiveAiConfig(databasePath: string): AiPlaceRelease {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database
      .prepare(
        `SELECT version, provider, base_url, model, timeout_seconds,
                retry_count, prompt_text, config_hash
           FROM ai_place_versions
          WHERE lifecycle_state = 'active'
          ORDER BY version DESC
          LIMIT 1`,
      )
      .get() as unknown as ActiveAiConfigRow | undefined;

    if (!row) {
      throw new Error("Test and activate a configuration in Photo Booth first.");
    }

    return {
      schemaVersion: 1,
      version: row.version,
      provider: row.provider,
      baseUrl: row.base_url,
      model: row.model,
      timeoutSeconds: row.timeout_seconds,
      retryCount: row.retry_count,
      prompt: row.prompt_text,
      promptHash: row.config_hash,
    };
  } finally {
    database.close();
  }
}

export function normalizeLocalWorkerEndpoint(endpoint: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpoint.trim());
  } catch {
    throw new Error("Enter a valid Worker endpoint.");
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const isLoopback = loopbackHosts.has(parsed.hostname);
  const isProductionWorker = parsed.protocol === "https:"
    && /^julia-photo-guess\.[a-z0-9-]+\.workers\.dev$/i.test(parsed.hostname);
  if (
    (!isLoopback && !isProductionWorker)
    || (isLoopback && !["http:", "https:"].includes(parsed.protocol))
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(
      "The Worker endpoint must be loopback or the named HTTPS workers.dev URL.",
    );
  }

  return parsed.origin;
}

export async function publishActiveAiConfig(
  options: PublishActiveAiConfigOptions,
): Promise<AiConfigReceipt> {
  const token = options.token.trim();
  if (!token) throw new Error("Set ADMIN_PUBLISH_TOKEN in .dev.vars before syncing.");
  if (!/^[\x21-\x7e]{16,512}$/.test(token)) {
    throw new Error("Set a valid local publisher token without spaces or control characters.");
  }

  const endpoint = normalizeLocalWorkerEndpoint(options.endpoint);
  const release = readActiveAiConfig(options.databasePath);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(`${endpoint}/api/admin/ai-place-config`, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": `ai-place-config-v${release.version}-${release.promptHash}`,
      },
      body: JSON.stringify(release),
    });
  } catch {
    throw new Error("Local Worker request failed or attempted a redirect.");
  }

  if (!response.ok) {
    throw new Error(`Local Worker rejected the AI configuration with HTTP ${response.status}.`);
  }

  let receipt: Partial<AiConfigReceipt>;
  try {
    receipt = (await response.json()) as Partial<AiConfigReceipt>;
  } catch {
    throw new Error("Local Worker returned an invalid receipt.");
  }
  if (
    receipt.version !== release.version
    || receipt.promptHash !== release.promptHash
    || typeof receipt.receipt !== "string"
    || !receipt.receipt.trim()
  ) {
    throw new Error("Local Worker returned a receipt that does not match the active version.");
  }

  return {
    version: receipt.version,
    promptHash: receipt.promptHash,
    receipt: receipt.receipt.trim(),
  };
}
