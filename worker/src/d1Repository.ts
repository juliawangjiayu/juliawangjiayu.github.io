import type {
  ChallengeStorageRecord,
  GameAnswerRecord,
  GameRepository,
  GameSessionRecord,
} from "./repository.ts";
import type { AiPlaceConfigRecord } from "./aiPlaces.ts";
import type { Difficulty, GamePhotoRecord } from "./sessions.ts";

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown>;
}

interface PhotoRow {
  photo_id: string;
  image_url: string;
  difficulty: Difficulty;
  answer_latitude: number;
  answer_longitude: number;
  radius_km: 1 | 10 | 50 | 100;
  enabled: number;
}

interface SessionRow {
  id: string;
  mode: GameSessionRecord["mode"];
  question_ids: string;
  total_score: number;
  created_at: string;
}

interface AnswerRow {
  session_id: string;
  round_index: number;
  guess_latitude: number;
  guess_longitude: number;
  distance_km: number;
  score: number;
  proximity: GameAnswerRecord["proximity"];
  submitted_at: string;
}

interface ChallengeRow {
  id: string;
  question_ids: string;
  score: number;
  total_rounds: 5;
  created_at: string;
}

interface AiPlaceConfigRow {
  version: number;
  provider: string;
  base_url: string;
  model: string;
  timeout_seconds: number;
  retry_count: number;
  prompt_text: string;
  prompt_hash: string;
  encrypted_api_key: string;
  api_key_iv: string;
  receipt: string;
  created_at: string;
}

function mapPhoto(row: PhotoRow): GamePhotoRecord {
  return {
    photoId: row.photo_id,
    imageUrl: row.image_url,
    difficulty: row.difficulty,
    answerLatitude: row.answer_latitude,
    answerLongitude: row.answer_longitude,
    radiusKm: row.radius_km,
    enabled: Boolean(row.enabled),
  };
}

function mapSession(row: SessionRow): GameSessionRecord {
  return {
    id: row.id,
    mode: row.mode,
    questionIds: JSON.parse(row.question_ids) as string[],
    totalScore: row.total_score,
    createdAt: row.created_at,
  };
}

function mapAnswer(row: AnswerRow): GameAnswerRecord {
  return {
    sessionId: row.session_id,
    roundIndex: row.round_index,
    guessLatitude: row.guess_latitude,
    guessLongitude: row.guess_longitude,
    distanceKm: row.distance_km,
    score: row.score,
    proximity: row.proximity,
    submittedAt: row.submitted_at,
  };
}

function mapChallenge(row: ChallengeRow): ChallengeStorageRecord {
  return {
    id: row.id,
    questionIds: JSON.parse(row.question_ids) as string[],
    score: row.score,
    totalRounds: row.total_rounds,
    createdAt: row.created_at,
  };
}

function mapAiPlaceConfig(row: AiPlaceConfigRow): AiPlaceConfigRecord {
  return {
    version: row.version,
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    timeoutSeconds: row.timeout_seconds,
    retryCount: row.retry_count,
    prompt: row.prompt_text,
    promptHash: row.prompt_hash,
    encryptedApiKey: row.encrypted_api_key,
    apiKeyIv: row.api_key_iv,
    receipt: row.receipt,
    createdAt: row.created_at,
  };
}

const PHOTO_COLUMNS = `
  photo_id,
  image_url,
  difficulty,
  answer_latitude,
  answer_longitude,
  radius_km,
  enabled
`;

export class D1GameRepository implements GameRepository {
  constructor(private readonly database: D1DatabaseLike) {}

  async listEnabledGamePhotos(): Promise<GamePhotoRecord[]> {
    const result = await this.database
      .prepare(`SELECT ${PHOTO_COLUMNS} FROM game_photos WHERE enabled = 1`)
      .all<PhotoRow>();
    return (result.results ?? []).map(mapPhoto);
  }

  async getGamePhoto(photoId: string): Promise<GamePhotoRecord | null> {
    const row = await this.database
      .prepare(`SELECT ${PHOTO_COLUMNS} FROM game_photos WHERE photo_id = ?`)
      .bind(photoId)
      .first<PhotoRow>();
    return row ? mapPhoto(row) : null;
  }

  async createSession(session: GameSessionRecord): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO game_sessions (id, mode, question_ids, total_score, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        session.id,
        session.mode,
        JSON.stringify(session.questionIds),
        session.totalScore,
        session.createdAt,
      )
      .run();
  }

  async getSession(sessionId: string): Promise<GameSessionRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT id, mode, question_ids, total_score, created_at
         FROM game_sessions WHERE id = ?`,
      )
      .bind(sessionId)
      .first<SessionRow>();
    return row ? mapSession(row) : null;
  }

  async saveAnswer(answer: GameAnswerRecord): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO game_answers (
           session_id, round_index, guess_latitude, guess_longitude,
           distance_km, score, proximity, submitted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        answer.sessionId,
        answer.roundIndex,
        answer.guessLatitude,
        answer.guessLongitude,
        answer.distanceKm,
        answer.score,
        answer.proximity,
        answer.submittedAt,
      )
      .run();
  }

  async getAnswer(sessionId: string, roundIndex: number): Promise<GameAnswerRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT session_id, round_index, guess_latitude, guess_longitude,
                distance_km, score, proximity, submitted_at
         FROM game_answers WHERE session_id = ? AND round_index = ?`,
      )
      .bind(sessionId, roundIndex)
      .first<AnswerRow>();
    return row ? mapAnswer(row) : null;
  }

  async listAnswers(sessionId: string): Promise<GameAnswerRecord[]> {
    const result = await this.database
      .prepare(
        `SELECT session_id, round_index, guess_latitude, guess_longitude,
                distance_km, score, proximity, submitted_at
         FROM game_answers WHERE session_id = ? ORDER BY round_index ASC`,
      )
      .bind(sessionId)
      .all<AnswerRow>();
    return (result.results ?? []).map(mapAnswer);
  }

  async updateSessionScore(sessionId: string, totalScore: number): Promise<void> {
    await this.database
      .prepare("UPDATE game_sessions SET total_score = ? WHERE id = ?")
      .bind(totalScore, sessionId)
      .run();
  }

  async createChallenge(challenge: ChallengeStorageRecord): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO challenges (id, question_ids, score, total_rounds, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        challenge.id,
        JSON.stringify(challenge.questionIds),
        challenge.score,
        challenge.totalRounds,
        challenge.createdAt,
      )
      .run();
  }

  async getChallenge(challengeId: string): Promise<ChallengeStorageRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT id, question_ids, score, total_rounds, created_at
         FROM challenges WHERE id = ?`,
      )
      .bind(challengeId)
      .first<ChallengeRow>();
    return row ? mapChallenge(row) : null;
  }

  async syncGamePhotos(photos: GamePhotoRecord[], updatedAt: string): Promise<void> {
    const statements = [
      this.database.prepare("UPDATE game_photos SET enabled = 0, updated_at = ?").bind(updatedAt),
      ...photos.map((photo) =>
        this.database
          .prepare(
            `INSERT INTO game_photos (
               photo_id, image_url, difficulty, answer_latitude, answer_longitude,
               radius_km, enabled, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(photo_id) DO UPDATE SET
               image_url = excluded.image_url,
               difficulty = excluded.difficulty,
               answer_latitude = excluded.answer_latitude,
               answer_longitude = excluded.answer_longitude,
               radius_km = excluded.radius_km,
               enabled = excluded.enabled,
               updated_at = excluded.updated_at`,
          )
          .bind(
            photo.photoId,
            photo.imageUrl,
            photo.difficulty,
            photo.answerLatitude,
            photo.answerLongitude,
            photo.radiusKm,
            photo.enabled ? 1 : 0,
            updatedAt,
          ),
      ),
    ];

    await this.database.batch(statements);
  }

  async getActiveAiPlaceConfig(): Promise<AiPlaceConfigRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT v.* FROM ai_place_versions v
         JOIN ai_place_active a ON a.version = v.version
         WHERE a.singleton_id = 1`,
      )
      .first<AiPlaceConfigRow>();
    return row ? mapAiPlaceConfig(row) : null;
  }

  async getAiPlaceConfigVersion(version: number): Promise<AiPlaceConfigRecord | null> {
    const row = await this.database
      .prepare("SELECT * FROM ai_place_versions WHERE version = ?")
      .bind(version)
      .first<AiPlaceConfigRow>();
    return row ? mapAiPlaceConfig(row) : null;
  }

  async publishAiPlaceConfig(config: AiPlaceConfigRecord): Promise<void> {
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO ai_place_versions (
             version, provider, base_url, model, timeout_seconds, retry_count,
             prompt_text, prompt_hash, encrypted_api_key, api_key_iv, receipt, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          config.version,
          config.provider,
          config.baseUrl,
          config.model,
          config.timeoutSeconds,
          config.retryCount,
          config.prompt,
          config.promptHash,
          config.encryptedApiKey,
          config.apiKeyIv,
          config.receipt,
          config.createdAt,
        ),
      this.database
        .prepare(
          `INSERT INTO ai_place_active (singleton_id, version) VALUES (1, ?)
           ON CONFLICT(singleton_id) DO UPDATE SET version = excluded.version`,
        )
        .bind(config.version),
    ]);
  }
}
