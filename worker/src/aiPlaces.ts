import { z } from "zod";

export const LOCKED_AI_ENVELOPE = `Return one JSON object matching the required schema and no other text.
Never produce latitude, longitude, bounding boxes, place IDs, distances, scores, or a correct answer.
Never request or infer private answer data.
The normalized query must be at most 300 characters.
When status is insufficient, normalized_query must be empty and clarification must say what geographic context is missing.`;

export interface AiPlaceConfigRecord {
  version: number;
  provider: string;
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
  retryCount: number;
  prompt: string;
  promptHash: string;
  encryptedApiKey: string;
  apiKeyIv: string;
  receipt: string;
  createdAt: string;
}

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
  deepSeekApiKey?: string;
}

const interpretationSchema = z
  .object({
    status: z.enum(["searchable", "insufficient"]),
    normalized_query: z.string().max(300),
    landmark: z.string().max(160),
    locality: z.string().max(160),
    region: z.string().max(160),
    country: z.string().max(160),
    category: z.string().max(100),
    uncertainty: z.array(z.string()).max(8),
    confidence: z.number().min(0).max(1),
    clarification: z.string().max(300),
  })
  .strict();

export type AiPlaceInterpretation = z.infer<typeof interpretationSchema>;

const coordinatePatterns = [
  /(?<![\d.])[+-]?\d{1,3}\.\d+\s*[,，]\s*[+-]?\d{1,3}\.\d+(?![\d.])/i,
  /(?<!\w)(?:lat(?:itude)?|lon(?:gitude)?|lng)\s*[:=]?\s*[+-]?\d{1,3}(?:\.\d+)?/i,
  /(?<!\w)[+-]?\d{1,3}(?:\.\d+)?\s*°?\s*[NS]\s*[,，; ]+[+-]?\d{1,3}(?:\.\d+)?\s*°?\s*[EW](?!\w)/i,
];

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptApiKey(
  apiKey: string,
  wrappingSecret: string,
): Promise<{ encryptedApiKey: string; apiKeyIv: string }> {
  if (!wrappingSecret) throw new Error("AI configuration encryption is not configured.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(wrappingSecret),
    new TextEncoder().encode(apiKey),
  );
  return {
    encryptedApiKey: bytesToBase64(new Uint8Array(encrypted)),
    apiKeyIv: bytesToBase64(iv),
  };
}

export async function decryptApiKey(
  encryptedApiKey: string,
  apiKeyIv: string,
  wrappingSecret: string,
): Promise<string> {
  if (!encryptedApiKey) return "";
  if (!wrappingSecret) throw new Error("AI configuration encryption is not configured.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(apiKeyIv) },
    await encryptionKey(wrappingSecret),
    base64ToBytes(encryptedApiKey),
  );
  return new TextDecoder().decode(decrypted);
}

export async function calculatePromptHash(release: Omit<AiPlaceRelease, "schemaVersion" | "version" | "promptHash" | "deepSeekApiKey">): Promise<string> {
  const canonical = JSON.stringify({
    base_url: release.baseUrl,
    model: release.model,
    prompt_text: release.prompt,
    provider: release.provider,
    retry_count: release.retryCount,
    timeout_seconds: release.timeoutSeconds,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateInterpretation(value: unknown): AiPlaceInterpretation {
  const interpretation = interpretationSchema.parse(value);
  const textValues = [
    interpretation.normalized_query,
    interpretation.landmark,
    interpretation.locality,
    interpretation.region,
    interpretation.country,
    interpretation.category,
    interpretation.clarification,
    ...interpretation.uncertainty,
  ];

  if (textValues.some((text) => coordinatePatterns.some((pattern) => pattern.test(text)))) {
    throw new Error("The model response contained coordinates.");
  }

  if (interpretation.status === "searchable" && !interpretation.normalized_query.trim()) {
    throw new Error("The model did not return a searchable query.");
  }

  if (
    interpretation.status === "insufficient" &&
    (interpretation.normalized_query || !interpretation.clarification.trim())
  ) {
    throw new Error("The model did not explain which clue was missing.");
  }

  return interpretation;
}

export interface InterpretPlaceOptions {
  fetcher?: typeof fetch;
}

export async function interpretPlace(
  rawText: string,
  config: AiPlaceConfigRecord,
  apiKey: string,
  options: InterpretPlaceOptions = {},
): Promise<AiPlaceInterpretation> {
  const text = rawText.trim();
  if (!text || text.length > 500) throw new Error("Enter a place description of 1–500 characters.");
  if (!apiKey) throw new Error("DeepSeek is not configured.");

  const fetcher = options.fetcher ?? fetch;
  const payload = {
    model: config.model,
    temperature: 0,
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    max_tokens: 400,
    messages: [
      { role: "system", content: `${config.prompt.trim()}\n\n${LOCKED_AI_ENVELOPE}` },
      { role: "user", content: text },
    ],
  };

  for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutSeconds * 1000);

    try {
      const response = await fetcher(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < config.retryCount) {
          continue;
        }
        throw new Error(
          response.status === 401
            ? "DeepSeek rejected the API key."
            : "DeepSeek is temporarily unavailable.",
        );
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("DeepSeek returned an invalid response.");
      return validateInterpretation(JSON.parse(content));
    } catch (error) {
      if (attempt < config.retryCount && error instanceof DOMException && error.name === "AbortError") {
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("DeepSeek is temporarily unavailable.");
}
