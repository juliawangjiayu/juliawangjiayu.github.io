import { zValidator } from "@hono/zod-validator";
import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

import { bearerToken, requireVisitor, AuthenticationError } from './auth.ts';
import { IdentityError, fingerprintIp } from './identity.ts';
import { IdentityService } from './identityService.ts';
import { enforceRateLimit } from './rateLimit.ts';
import { RandomJourneyError, RandomJourneyService, hashRandomToken } from './randomJourneys.ts';
import type { VisitorRecord } from './repository.ts';
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
const challengeSchema = z.object({ sessionId: z.string().min(1) }).strict();
const identitySchema = z.object({ username: z.string(), email: z.string() }).strict();
const leaderboardSaveSchema = z.object({ sessionId: z.string().min(1) }).strict();
const randomStartSchema = z.object({ token: z.string().min(1).max(256).optional() }).strict();
const randomTokenSchema = z.object({ token: z.string().min(1).max(256) }).strict();
const randomLeaderboardSaveSchema = z.object({ randomToken: z.string().min(1).max(256) }).strict();
const privateGamePhotoSchema = z.object({
  photoId: z.string().min(1).max(128),
  imageUrl: z.string().min(1).max(500),
  difficulty: z.enum(["easy", "medium", "hard"]),
  answerName: z.string().trim().min(1).max(200),
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
  createId?: (kind: "session" | "challenge" | "visitor") => string;
  now?: () => string;
  allowedOrigins?: string[];
  adminToken?: string;
  aiEncryptionKey?: string;
  deepSeekApiKey?: string;
  fetcher?: typeof fetch;
  visitorIdentityPepper?: string;
}

function defaultCreateId(kind: "session" | "challenge" | "visitor"): string {
  return `${kind}_${crypto.randomUUID()}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected server error.";
}

export function createGameApp(repository: GameRepository, options: GameAppOptions = {}) {
  const app = new Hono();
  const createId = options.createId ?? defaultCreateId;
  const now = options.now ?? (() => new Date().toISOString());
  const identity = options.visitorIdentityPepper ? new IdentityService(repository, { pepper: options.visitorIdentityPepper, now: () => new Date(now()), createId }) : null;
  const randomJourneys = new RandomJourneyService(repository, now, () => createId('session'));
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
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["content-type", "authorization", "idempotency-key"],
    }),
  );

  const smallBody = async (context: Context, next: Next) => {
    if (context.req.method === 'GET' || context.req.method === 'HEAD' || context.req.method === 'OPTIONS') return next();
    const maximum = 4096;
    if (Number(context.req.header('content-length') ?? 0) > maximum) return context.json({ code: 'request_too_large', message: 'Request body is too large.' }, 413);
    const reader = context.req.raw.clone().body?.getReader();
    if (reader) {
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maximum) {
          void reader.cancel();
          return context.json({ code: 'request_too_large', message: 'Request body is too large.' }, 413);
        }
      }
    }
    return next();
  };
  app.use('/api/identity/*', smallBody);
  app.use('/api/challenges', smallBody);
  app.use('/api/leaderboards/*', smallBody);
  app.use('/api/game/:sessionId/claim', smallBody);
  app.use('/api/random/*', smallBody);

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  const error = (code: string, message: string) => ({ code, message });
  const visitorFor = async (request: Request): Promise<VisitorRecord> => {
    if (!identity) throw new Error('identity_not_configured');
    return requireVisitor(request, identity);
  };
  const limited = async (scope: string, subject: string, max: number, windowSeconds: number) =>
    enforceRateLimit(repository, { scope, subjectHash: subject, max, windowSeconds, now: now() });
  const claimCompletedSession = async (sessionId: string, visitor: VisitorRecord, ranked: boolean) => {
    const session = await repository.getSession(sessionId);
    if (!session) return { failure: { status: 404 as const, code: 'session_not_found', message: 'Game session not found.' } };
    if (ranked && session.mode === 'challenge') return { failure: { status: 409 as const, code: 'challenge_not_ranked', message: 'Challenge games cannot be ranked.' } };
    const answers = await repository.listAnswers(sessionId);
    if ((session.questionIds.length !== 4 && session.questionIds.length !== 5) || answers.length !== session.questionIds.length || answers.some((answer, index) => answer.roundIndex !== index) || answers.reduce((sum, answer) => sum + answer.score, 0) !== session.totalScore) {
      return { failure: { status: 409 as const, code: 'session_incomplete', message: 'Finish every round first.' } };
    }
    const claim = await repository.claimGameSession(sessionId, visitor.id, now());
    if (claim === 'already_claimed') return { failure: { status: 409 as const, code: 'session_already_claimed', message: 'This game is already claimed by another visitor.' } };
    return { session };
  };

  app.post('/api/identity/session', async (context) => {
    if (!identity) return context.json(error('identity_not_configured', 'Visitor identity is not configured.'), 503);
    const body = await context.req.json().catch(() => null);
    const parsed = identitySchema.safeParse(body);
    if (!parsed.success) return context.json(error('invalid_request', 'Provide username and email.'), 400);
    const ip = context.req.header('cf-connecting-ip') ?? context.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const subject = await fingerprintIp(ip, now().slice(0, 10), options.visitorIdentityPepper!);
    if (!await limited('identity', subject, 10, 900)) return context.json(error('rate_limited', 'Try again later.'), 429);
    try {
      const issued = await identity.authenticate(parsed.data.username, parsed.data.email);
      return context.json({ token: issued.token, visitor: { id: issued.visitor.id, username: issued.visitor.username } }, 201);
    } catch (cause) {
      if (cause instanceof IdentityError) return context.json(error(cause.code, cause.message), cause.code === 'identity_mismatch' ? 409 : 400);
      throw cause;
    }
  });
  app.get('/api/identity/me', async (context) => {
    if (!identity) return context.json(error('identity_not_configured', 'Visitor identity is not configured.'), 503);
    try { const visitor = await visitorFor(context.req.raw); return context.json({ visitor: { id: visitor.id, username: visitor.username } }); }
    catch (cause) { if (cause instanceof AuthenticationError) return context.json(error(cause.code, cause.message), 401); throw cause; }
  });
  app.delete('/api/identity/session', async (context) => {
    if (!identity) return context.json(error('identity_not_configured', 'Visitor identity is not configured.'), 503);
    const token = bearerToken(context.req.raw);
    if (!token || !await identity.resolve(token)) return context.json(error('unauthorized', 'A valid visitor session is required.'), 401);
    await identity.revoke(token);
    return context.body(null, 204);
  });


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

  const randomFailure = (cause: unknown, context: Context) => {
    if (!(cause instanceof RandomJourneyError)) throw cause;
    const status = cause.code === 'run_not_found' ? 404 : 409;
    return context.json(error(cause.code, cause.message), status);
  };
  app.post('/api/random/start', async (context) => {
    const parsed = randomStartSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json(error('invalid_request', 'Provide an optional Random token.'), 400);
    try {
      const result = await randomJourneys.start(parsed.data.token);
      return context.json({ round: result.round, run: result.run }, result.created ? 201 : 200);
    } catch (cause) { return randomFailure(cause, context); }
  });
  app.post('/api/random/progress', async (context) => {
    const parsed = randomTokenSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json(error('invalid_request', 'Provide a Random token.'), 400);
    try { return context.json(await randomJourneys.progress(parsed.data.token)); }
    catch (cause) { return randomFailure(cause, context); }
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

    if (!photo || (!photo.enabled && session.mode !== 'random')) {
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

      if (!photo || (!photo.enabled && session.mode !== 'random')) {
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
        answerName: photo.answerName || "Answer location",
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

  app.post('/api/game/:sessionId/claim', async (context) => {
    if (!identity) return context.json(error('identity_not_configured', 'Visitor identity is not configured.'), 503);
    let visitor: VisitorRecord;
    try { visitor = await visitorFor(context.req.raw); } catch (cause) { if (cause instanceof AuthenticationError) return context.json(error(cause.code, cause.message), 401); throw cause; }
    const result = await claimCompletedSession(context.req.param('sessionId'), visitor, false);
    if (result.failure) return context.json(error(result.failure.code, result.failure.message), result.failure.status);
    return context.json({ claimed: true });
  });

  app.post('/api/challenges', zValidator('json', challengeSchema), async (context) => {
    if (!identity) return context.json(error('identity_not_configured', 'Visitor identity is not configured.'), 503);
    let visitor: VisitorRecord;
    try { visitor = await visitorFor(context.req.raw); } catch (cause) { if (cause instanceof AuthenticationError) return context.json(error(cause.code, cause.message), 401); throw cause; }
    const { sessionId } = context.req.valid('json');
    const result = await claimCompletedSession(sessionId, visitor, false);
    if (result.failure) return context.json(error(result.failure.code, result.failure.message), result.failure.status);
    const session = result.session!;
    let challenge = await repository.getChallengeBySourceSessionId(sessionId);
    if (!challenge) {
      if (!await limited('challenge', visitor.id, 10, 3600)) return context.json(error('rate_limited', 'Try again later.'), 429);
      const created = createChallengeRecord(createId('challenge'), session.questionIds, session.totalScore);
      try {
        await repository.createChallenge({ ...created, createdAt: now(), createdByVisitorId: visitor.id, sourceSessionId: sessionId });
        challenge = await repository.getChallenge(created.id);
      } catch (cause) {
        challenge = await repository.getChallengeBySourceSessionId(sessionId);
        if (!challenge) throw cause;
      }
      if (!challenge) throw new Error('Challenge creation failed.');
      return context.json({ id: challenge.id, score: challenge.score, totalRounds: challenge.totalRounds, creatorUsername: visitor.username }, 201);
    }
    return context.json({ id: challenge.id, score: challenge.score, totalRounds: challenge.totalRounds, creatorUsername: visitor.username });
  });

  app.get('/api/leaderboards/:mode/me', async (context) => {
    const mode = modeSchema.safeParse(context.req.param('mode'));
    if (!mode.success) return context.json(error('invalid_mode', 'Unknown leaderboard mode.'), 404);
    if (!identity) return context.json(error('identity_not_configured', 'Visitor identity is not configured.'), 503);
    let visitor: VisitorRecord;
    try { visitor = await visitorFor(context.req.raw); } catch (cause) { if (cause instanceof AuthenticationError) return context.json(error(cause.code, cause.message), 401); throw cause; }
    const seasonId = mode.data === 'random' ? await randomJourneys.currentSeasonId() : undefined;
    if (mode.data === 'random' && !seasonId) return context.json({ bestScore: null, rank: null });
    const best = await repository.getVisitorBest(visitor.id, mode.data, seasonId ?? undefined);
    const rank = await repository.getLeaderboardRank(mode.data, visitor.id, seasonId ?? undefined);
    return context.json({ bestScore: best?.score ?? null, rank });
  });

  app.get('/api/leaderboards/:mode', async (context) => {
    const mode = modeSchema.safeParse(context.req.param('mode'));
    if (!mode.success) return context.json(error('invalid_mode', 'Unknown leaderboard mode.'), 404);
    const rawLimit = context.req.query('limit');
    const limit = rawLimit === undefined ? 25 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1) return context.json(error('invalid_limit', 'Limit must be a positive integer.'), 400);
    const seasonId = mode.data === 'random' ? await randomJourneys.currentSeasonId() : undefined;
    if (mode.data === 'random' && !seasonId) return context.json({ entries: [], nextCursor: null });
    try { return context.json(await repository.listLeaderboard(mode.data, context.req.query('cursor') ?? null, Math.min(limit, 100), seasonId ?? undefined)); }
    catch (cause) { if (cause instanceof Error && cause.message === 'invalid_cursor') return context.json(error('invalid_cursor', 'Invalid leaderboard cursor.'), 400); throw cause; }
  });

  app.put('/api/leaderboards/:mode/me', async (context) => {
    const mode = modeSchema.safeParse(context.req.param('mode'));
    if (!mode.success) return context.json(error('invalid_mode', 'Unknown leaderboard mode.'), 404);
    if (!identity) return context.json(error('identity_not_configured', 'Visitor identity is not configured.'), 503);
    let visitor: VisitorRecord;
    try { visitor = await visitorFor(context.req.raw); } catch (cause) { if (cause instanceof AuthenticationError) return context.json(error(cause.code, cause.message), 401); throw cause; }
    if (!await limited('leaderboard', visitor.id, 20, 3600)) return context.json(error('rate_limited', 'Try again later.'), 429);
    const body = await context.req.json().catch(() => null);
    if (mode.data === 'random') {
      const parsed = randomLeaderboardSaveSchema.safeParse(body);
      if (!parsed.success) return context.json(error('invalid_request', 'Provide only randomToken.'), 400);
      try {
        const { progress, seasonId } = await randomJourneys.claim(parsed.data.randomToken, visitor.id);
        const saved = await repository.saveBestScore({ visitorId: visitor.id, mode: 'random', seasonId, score: progress.cumulativeScore, sessionId: await hashRandomToken(parsed.data.randomToken), achievedAt: now(), updatedAt: now() });
        const rank = await repository.getLeaderboardRank('random', visitor.id, seasonId);
        const topThree = (await repository.listLeaderboard('random', null, 3, seasonId)).entries;
        return context.json({ updated: saved.updated, runScore: progress.cumulativeScore, bestScore: saved.best.score, rank, topThree });
      } catch (cause) { return randomFailure(cause, context); }
    }
    const parsed = leaderboardSaveSchema.safeParse(body);
    if (!parsed.success) return context.json(error('invalid_request', 'Provide only sessionId.'), 400);
    const source = await repository.getSession(parsed.data.sessionId);
    if (source && source.mode !== mode.data) return context.json(error(source.mode === 'challenge' ? 'challenge_not_ranked' : 'mode_mismatch', source.mode === 'challenge' ? 'Challenge games cannot be ranked.' : 'The game mode does not match this leaderboard.'), 409);
    const result = await claimCompletedSession(parsed.data.sessionId, visitor, true);
    if (result.failure) return context.json(error(result.failure.code, result.failure.message), result.failure.status);
    const session = result.session!;
    if (session.mode !== mode.data) return context.json(error('mode_mismatch', 'The game mode does not match this leaderboard.'), 409);
    const saved = await repository.saveBestScore({ visitorId: visitor.id, mode: mode.data, score: session.totalScore, sessionId: session.id, achievedAt: now(), updatedAt: now() });
    const rank = await repository.getLeaderboardRank(mode.data, visitor.id);
    const topThree = (await repository.listLeaderboard(mode.data, null, 3)).entries;
    return context.json({ updated: saved.updated, runScore: session.totalScore, bestScore: saved.best.score, rank, topThree });
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
