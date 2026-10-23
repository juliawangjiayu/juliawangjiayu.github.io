import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

import { createChallengeRecord } from "./challenges.ts";
import {
  calculatePromptHash,
  decryptApiKey,
  encryptApiKey,
  interpretPlace,
} from "./aiPlaces.ts";
import type { GameRepository, GameSessionRecord } from "./repository.ts";
import { distanceKm, scoreGuess } from "./scoring.ts";
import {
  InsufficientQuestionsError,
  selectQuestionIds,
  toPublicRound,
} from "./sessions.ts";

const modeSchema = z.enum(["easy", "medium", "hard", "random"]);
const startSchema = z.object({ mode: modeSchema });
const answerSchema = z.object({
  round: z.number().int().min(1).max(5),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const challengeSchema = z.object({ sessionId: z.string().min(1) });
const privateGamePhotoSchema = z.object({
  photoId: z.string().min(1).max(128),
  imageUrl: z.string().min(1).max(500),
  difficulty: z.enum(["easy", "medium", "hard"]),
  answerLatitude: z.number().min(-90).max(90),
  answerLongitude: z.number().min(-180).max(180),
  radiusKm: z.union([z.literal(1), z.literal(10), z.literal(50), z.literal(100)]),
  enabled: z.boolean(),
});
const gamePhotoSyncSchema = z.object({
  schemaVersion: z.literal(1),
  photos: z.array(privateGamePhotoSchema).max(10_000),
});
const aiPlaceReleaseSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.number().int().positive(),
  provider: z.literal("deepseek"),
  baseUrl: z
    .string()
    .url()
    .max(500)
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    }, "Provider URL must be plain HTTPS."),
  model: z.string().min(1).max(160),
  timeoutSeconds: z.number().int().min(1).max(120),
  retryCount: z.number().int().min(0).max(5),
  prompt: z.string().min(1).max(12_000),
  promptHash: z.string().regex(/^[a-f0-9]{64}$/),
  deepSeekApiKey: z.string().min(1).max(500).optional(),
});
const interpretPlaceSchema = z.object({ text: z.string().min(1).max(500) });

export interface GameAppOptions {
  createId?: (kind: "session" | "challenge") => string;
  now?: () => string;
  allowedOrigins?: string[];
  adminToken?: string;
  aiEncryptionKey?: string;
  deepSeekApiKey?: string;
  fetcher?: typeof fetch;
}

function defaultCreateId(kind: "session" | "challenge"): string {
  return `${kind}_${crypto.randomUUID()}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected server error.";
}

export function createGameApp(repository: GameRepository, options: GameAppOptions = {}) {
  const app = new Hono();
  const createId = options.createId ?? defaultCreateId;
  const now = options.now ?? (() => new Date().toISOString());
  const allowedOrigins = options.allowedOrigins ?? [
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "https://juliawangjiayu.github.io",
  ];

  app.use(
    "/api/*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type"],
    }),
  );

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  app.use("/api/admin/*", async (context, next) => {
    if (!options.adminToken) {
      return context.json({ error: "Admin publishing is not configured." }, 503);
    }

    if (context.req.header("authorization") !== `Bearer ${options.adminToken}`) {
      return context.json({ error: "Unauthorized." }, 401);
    }

    await next();
  });

  app.post(
    "/api/admin/game-photos",
    zValidator("json", gamePhotoSyncSchema),
    async (context) => {
      const payload = context.req.valid("json");
      await repository.syncGamePhotos(payload.photos, now());
      return context.json({ schemaVersion: 1, photoCount: payload.photos.length });
    },
  );

  app.post(
    "/api/admin/ai-place-config",
    zValidator("json", aiPlaceReleaseSchema),
    async (context) => {
      const release = context.req.valid("json");
      const expectedIdempotencyKey = `ai-place-config-v${release.version}-${release.promptHash}`;

      if (context.req.header("idempotency-key") !== expectedIdempotencyKey) {
        return context.json({ error: "Invalid idempotency key." }, 400);
      }

      const existing = await repository.getAiPlaceConfigVersion(release.version);

      if (existing) {
        if (existing.promptHash !== release.promptHash) {
          return context.json({ error: "This version already has different content." }, 409);
        }

        return context.json({
          version: existing.version,
          promptHash: existing.promptHash,
          receipt: existing.receipt,
        });
      }

      const calculatedHash = await calculatePromptHash(release);
      if (calculatedHash !== release.promptHash) {
        return context.json({ error: "Prompt hash does not match the configuration." }, 400);
      }

      const active = await repository.getActiveAiPlaceConfig();
      if (active && release.version <= active.version) {
        return context.json({ error: "Configuration versions must increase." }, 409);
      }

      let encryptedApiKey = active?.encryptedApiKey ?? "";
      let apiKeyIv = active?.apiKeyIv ?? "";

      if (release.deepSeekApiKey) {
        if (!options.aiEncryptionKey) {
          return context.json({ error: "AI key encryption is not configured." }, 503);
        }
        ({ encryptedApiKey, apiKeyIv } = await encryptApiKey(
          release.deepSeekApiKey,
          options.aiEncryptionKey,
        ));
      }

      const receipt = `ai-config-${release.version}-${crypto.randomUUID()}`;
      await repository.publishAiPlaceConfig({
        version: release.version,
        provider: release.provider,
        baseUrl: release.baseUrl.replace(/\/$/, ""),
        model: release.model.trim(),
        timeoutSeconds: release.timeoutSeconds,
        retryCount: release.retryCount,
        prompt: release.prompt.trim(),
        promptHash: release.promptHash,
        encryptedApiKey,
        apiKeyIv,
        receipt,
        createdAt: now(),
      });

      return context.json({
        version: release.version,
        promptHash: release.promptHash,
        receipt,
      });
    },
  );

  app.post(
    "/api/places/interpret",
    zValidator("json", interpretPlaceSchema),
    async (context) => {
      const config = await repository.getActiveAiPlaceConfig();

      if (!config) {
        return context.json({ error: "Place interpretation is not configured." }, 503);
      }

      try {
        const configuredKey = config.encryptedApiKey
          ? await decryptApiKey(
              config.encryptedApiKey,
              config.apiKeyIv,
              options.aiEncryptionKey ?? "",
            )
          : options.deepSeekApiKey ?? "";
        const interpretation = await interpretPlace(
          context.req.valid("json").text,
          config,
          configuredKey,
          { fetcher: options.fetcher },
        );

        return context.json({
          status: interpretation.status,
          normalizedQuery: interpretation.normalized_query,
          clarification: interpretation.clarification,
          confidence: interpretation.confidence,
        });
      } catch (error) {
        return context.json(
          { error: error instanceof Error ? error.message : "Place interpretation failed." },
          502,
        );
      }
    },
  );

  app.post("/api/game/start", zValidator("json", startSchema), async (context) => {
    const { mode } = context.req.valid("json");
    const sessionId = createId("session");

    try {
      const photos = await repository.listEnabledGamePhotos();
      const questionIds = selectQuestionIds(photos, mode, sessionId);
      const session: GameSessionRecord = {
        id: sessionId,
        mode,
        questionIds,
        totalScore: 0,
        createdAt: now(),
      };
      const firstPhoto = photos.find((photo) => photo.photoId === questionIds[0]);

      if (!firstPhoto) {
        return context.json({ error: "The first game photo could not be loaded." }, 500);
      }

      await repository.createSession(session);
      return context.json(toPublicRound(firstPhoto, sessionId, 0, questionIds.length), 201);
    } catch (error) {
      if (error instanceof InsufficientQuestionsError) {
        return context.json(
          { error: "This mode needs at least five eligible photos before it can be played." },
          409,
        );
      }

      throw error;
    }
  });

  app.get("/api/game/:sessionId/round/:round", async (context) => {
    const session = await repository.getSession(context.req.param("sessionId"));
    const round = Number(context.req.param("round"));
    const roundIndex = round - 1;

    if (!session) {
      return context.json({ error: "Game session not found." }, 404);
    }

    if (!Number.isInteger(round) || roundIndex < 0 || roundIndex >= session.questionIds.length) {
      return context.json({ error: "Round not found." }, 404);
    }

    const answers = await repository.listAnswers(session.id);

    if (roundIndex > answers.length) {
      return context.json({ error: "Finish the current round first." }, 409);
    }

    const photo = await repository.getGamePhoto(session.questionIds[roundIndex]);

    if (!photo || !photo.enabled) {
      return context.json({ error: "Game photo not found." }, 404);
    }

    return context.json(toPublicRound(photo, session.id, roundIndex, session.questionIds.length));
  });

  app.post(
    "/api/game/:sessionId/answer",
    zValidator("json", answerSchema),
    async (context) => {
      const session = await repository.getSession(context.req.param("sessionId"));

      if (!session) {
        return context.json({ error: "Game session not found." }, 404);
      }

      const submitted = context.req.valid("json");
      const roundIndex = submitted.round - 1;
      const existingAnswer = await repository.getAnswer(session.id, roundIndex);

      if (existingAnswer) {
        return context.json({ error: "This round has already been submitted." }, 409);
      }

      const answers = await repository.listAnswers(session.id);

      if (roundIndex !== answers.length) {
        return context.json({ error: "Rounds must be answered in order." }, 409);
      }

      const photoId = session.questionIds[roundIndex];
      const photo = photoId ? await repository.getGamePhoto(photoId) : null;

      if (!photo || !photo.enabled) {
        return context.json({ error: "Game photo not found." }, 404);
      }

      const distance = distanceKm(
        photo.answerLatitude,
        photo.answerLongitude,
        submitted.latitude,
        submitted.longitude,
      );
      const result = scoreGuess(distance, photo.radiusKm);
      const totalScore = session.totalScore + result.score;
      const submittedAt = now();

      await repository.saveAnswer({
        sessionId: session.id,
        roundIndex,
        guessLatitude: submitted.latitude,
        guessLongitude: submitted.longitude,
        distanceKm: distance,
        score: result.score,
        proximity: result.proximity,
        submittedAt,
      });
      await repository.updateSessionScore(session.id, totalScore);

      const completed = submitted.round === session.questionIds.length;
      const nextPhoto = completed
        ? null
        : await repository.getGamePhoto(session.questionIds[roundIndex + 1]);

      return context.json({
        sessionId: session.id,
        round: submitted.round,
        distanceKm: Math.round(distance * 10) / 10,
        score: result.score,
        proximity: result.proximity,
        totalScore,
        completed,
        correctAnswer: {
          latitude: photo.answerLatitude,
          longitude: photo.answerLongitude,
          radiusKm: photo.radiusKm,
        },
        nextRound: nextPhoto
          ? toPublicRound(nextPhoto, session.id, roundIndex + 1, session.questionIds.length)
          : null,
      });
    },
  );

  app.post("/api/challenges", zValidator("json", challengeSchema), async (context) => {
    const { sessionId } = context.req.valid("json");
    const session = await repository.getSession(sessionId);

    if (!session) {
      return context.json({ error: "Game session not found." }, 404);
    }

    const answers = await repository.listAnswers(session.id);

    if (answers.length !== session.questionIds.length) {
      return context.json({ error: "Finish all five rounds before sharing." }, 409);
    }

    const challengeId = createId("challenge");
    const challenge = createChallengeRecord(challengeId, session.questionIds, session.totalScore);
    await repository.createChallenge({ ...challenge, createdAt: now() });

    return context.json(
      {
        id: challenge.id,
        score: challenge.score,
        totalRounds: challenge.totalRounds,
      },
      201,
    );
  });

  app.get("/api/challenges/:challengeId", async (context) => {
    const challenge = await repository.getChallenge(context.req.param("challengeId"));

    if (!challenge) {
      return context.json({ error: "Challenge not found." }, 404);
    }

    return context.json({
      id: challenge.id,
      score: challenge.score,
      totalRounds: challenge.totalRounds,
    });
  });

  app.post("/api/challenges/:challengeId/start", async (context) => {
    const challenge = await repository.getChallenge(context.req.param("challengeId"));

    if (!challenge) {
      return context.json({ error: "Challenge not found." }, 404);
    }

    const firstPhoto = await repository.getGamePhoto(challenge.questionIds[0]);

    if (!firstPhoto || !firstPhoto.enabled) {
      return context.json({ error: "Challenge photo not found." }, 404);
    }

    const sessionId = createId("session");
    await repository.createSession({
      id: sessionId,
      mode: "challenge",
      questionIds: [...challenge.questionIds],
      totalScore: 0,
      createdAt: now(),
    });

    return context.json(
      {
        challenge: {
          id: challenge.id,
          score: challenge.score,
          totalRounds: challenge.totalRounds,
        },
        round: toPublicRound(firstPhoto, sessionId, 0, challenge.questionIds.length),
      },
      201,
    );
  });

  app.onError((error, context) => {
    console.error(error);
    return context.json({ error: errorMessage(error) }, 500);
  });

  app.notFound((context) => context.json({ error: "Not found." }, 404));

  return app;
}
