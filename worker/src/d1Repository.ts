import type {
  ChallengeStorageRecord,
  GameAnswerRecord,
  GameRepository,
  GameSessionRecord,
  RandomRunRecord, RandomBatchRecord,
  VisitorRecord, VisitorSessionRecord, LeaderboardBestRecord, LeaderboardPage, SessionClaimResult,
} from "./repository.ts";
import { decodeLeaderboardCursor, encodeLeaderboardCursor } from './leaderboards.ts';
import type { GameMode } from './sessions.ts';
import type { AiPlaceConfigRecord } from "./aiPlaces.ts";
import type { CommentRecord, CommentTargetType } from './comments.ts';
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
  answer_name: string;
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
  claimed_by_visitor_id: string | null;
  claimed_at: string | null;
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
  total_rounds: 4 | 5;
  created_at: string;
  created_by_visitor_id: string | null;
  source_session_id: string | null;
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
    answerName: row.answer_name,
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
    claimedByVisitorId: row.claimed_by_visitor_id,
    claimedAt: row.claimed_at,
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
    createdByVisitorId: row.created_by_visitor_id,
    sourceSessionId: row.source_session_id,
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


interface VisitorRow { id: string; username: string; username_key: string; email_verifier: string; created_at: string; updated_at: string }
interface CommentRow { id: string; visitor_id: string; username: string; target_type: CommentTargetType; target_id: string; body: string; submission_key: string; created_at: string; updated_at: string; deleted_at: string | null; reply_body: string | null; reply_updated_at: string | null }
interface VisitorSessionRow { token_hash: string; visitor_id: string; created_at: string; last_seen_at: string; expires_at: string }
interface BestRow { visitor_id: string; mode: GameMode; score: number; session_id: string; achieved_at: string; updated_at: string }
interface RandomRunRow { token_hash: string; season_id: string; question_ids: string; created_at: string; claimed_by_visitor_id: string | null; claimed_at: string | null }
interface RandomBatchRow { batch_index: number; session_id: string }
interface RandomBestRow { visitor_id: string; season_id: string; score: number; run_token_hash: string; achieved_at: string; updated_at: string }
function mapVisitor(row: VisitorRow): VisitorRecord { return { id: row.id, username: row.username, usernameKey: row.username_key, emailVerifier: row.email_verifier, createdAt: row.created_at, updatedAt: row.updated_at }; }
function mapComment(row: CommentRow): CommentRecord { return { id: row.id, visitorId: row.visitor_id, username: row.username, targetType: row.target_type, targetId: row.target_id, body: row.body, submissionKey: row.submission_key, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at, replyBody: row.reply_body, replyUpdatedAt: row.reply_updated_at }; }
function mapVisitorSession(row: VisitorSessionRow): VisitorSessionRecord { return { tokenHash: row.token_hash, visitorId: row.visitor_id, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at }; }
function mapBest(row: BestRow): LeaderboardBestRecord { return { visitorId: row.visitor_id, mode: row.mode, score: row.score, sessionId: row.session_id, achievedAt: row.achieved_at, updatedAt: row.updated_at }; }
function mapRandomBest(row: RandomBestRow): LeaderboardBestRecord { return { visitorId: row.visitor_id, mode: 'random', score: row.score, sessionId: row.run_token_hash, achievedAt: row.achieved_at, updatedAt: row.updated_at, seasonId: row.season_id }; }

const PHOTO_COLUMNS = `
  photo_id,
  image_url,
  difficulty,
  answer_name,
  answer_latitude,
  answer_longitude,
  radius_km,
  enabled
`;

export class D1GameRepository implements GameRepository {
  private readonly database: D1DatabaseLike;
  constructor(database: D1DatabaseLike) { this.database = database; }

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
        `SELECT id, mode, question_ids, total_score, created_at, claimed_by_visitor_id, claimed_at
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

  async createRandomRun(run: RandomRunRecord): Promise<void> {
    await this.database.prepare('INSERT INTO random_runs (token_hash, season_id, question_ids, created_at) VALUES (?, ?, ?, ?)')
      .bind(run.tokenHash, run.seasonId, JSON.stringify(run.questionIds), run.createdAt).run();
  }
  async getRandomRun(tokenHash: string): Promise<RandomRunRecord | null> {
    const row = await this.database.prepare('SELECT * FROM random_runs WHERE token_hash = ?').bind(tokenHash).first<RandomRunRow>();
    return row ? { tokenHash: row.token_hash, seasonId: row.season_id, questionIds: JSON.parse(row.question_ids) as string[], createdAt: row.created_at, claimedByVisitorId: row.claimed_by_visitor_id, claimedAt: row.claimed_at } : null;
  }
  async listRandomBatches(tokenHash: string): Promise<RandomBatchRecord[]> {
    const rows = await this.database.prepare('SELECT batch_index, session_id FROM random_run_batches WHERE token_hash = ? ORDER BY batch_index')
      .bind(tokenHash).all<RandomBatchRow>();
    return (rows.results ?? []).map((row) => ({ batchIndex: row.batch_index, sessionId: row.session_id }));
  }
  async getOrCreateRandomBatch(tokenHash: string, batchIndex: number, session: GameSessionRecord): Promise<GameSessionRecord> {
    const existing = (await this.listRandomBatches(tokenHash)).find((batch) => batch.batchIndex === batchIndex);
    if (existing) return (await this.getSession(existing.sessionId))!;
    await this.database.batch([
      this.database.prepare(`INSERT INTO game_sessions (id, mode, question_ids, total_score, created_at) VALUES (?, 'random', ?, 0, ?)`)
        .bind(session.id, JSON.stringify(session.questionIds), session.createdAt),
      this.database.prepare('INSERT OR IGNORE INTO random_run_batches (token_hash, batch_index, session_id) VALUES (?, ?, ?)')
        .bind(tokenHash, batchIndex, session.id),
    ]);
    const canonical = (await this.listRandomBatches(tokenHash)).find((batch) => batch.batchIndex === batchIndex);
    if (!canonical) throw new Error('random_batch_write_failed');
    if (canonical.sessionId !== session.id) await this.database.prepare('DELETE FROM game_sessions WHERE id = ?').bind(session.id).run();
    return (await this.getSession(canonical.sessionId))!;
  }
  async claimRandomRun(tokenHash: string, visitorId: string, claimedAt: string): Promise<SessionClaimResult> {
    const write = await this.database.prepare('UPDATE random_runs SET claimed_by_visitor_id = ?, claimed_at = ? WHERE token_hash = ? AND claimed_by_visitor_id IS NULL')
      .bind(visitorId, claimedAt, tokenHash).run();
    const run = await this.getRandomRun(tokenHash);
    const changes = (write as { meta?: { changes?: number } }).meta?.changes ?? 0;
    return !run ? 'not_found' : run.claimedByVisitorId === visitorId ? (changes > 0 ? 'claimed' : 'already_owned') : 'already_claimed';
  }

  async createChallenge(challenge: ChallengeStorageRecord): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO challenges (id, question_ids, score, total_rounds, created_at, created_by_visitor_id, source_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        challenge.id,
        JSON.stringify(challenge.questionIds),
        challenge.score,
        challenge.totalRounds,
        challenge.createdAt,
        challenge.createdByVisitorId ?? null,
        challenge.sourceSessionId ?? null,
      )
      .run();
  }

  async getChallenge(challengeId: string): Promise<ChallengeStorageRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT id, question_ids, score, total_rounds, created_at, created_by_visitor_id, source_session_id
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
               photo_id, image_url, difficulty, answer_name, answer_latitude,
               answer_longitude, radius_km, enabled, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(photo_id) DO UPDATE SET
               image_url = excluded.image_url,
               difficulty = excluded.difficulty,
               answer_name = excluded.answer_name,
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
            photo.answerName,
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

  async findVisitorByUsernameKey(key: string): Promise<VisitorRecord | null> { const row = await this.database.prepare('SELECT * FROM visitors WHERE username_key = ?').bind(key).first<VisitorRow>(); return row ? mapVisitor(row) : null; }
  async findVisitorByEmailVerifier(verifier: string): Promise<VisitorRecord | null> { const row = await this.database.prepare('SELECT * FROM visitors WHERE email_verifier = ?').bind(verifier).first<VisitorRow>(); return row ? mapVisitor(row) : null; }
  async getVisitor(id: string): Promise<VisitorRecord | null> { const row = await this.database.prepare('SELECT * FROM visitors WHERE id = ?').bind(id).first<VisitorRow>(); return row ? mapVisitor(row) : null; }
  async getComment(id: string): Promise<CommentRecord | null> {
    const row = await this.database.prepare('SELECT c.*, v.username FROM comments c JOIN visitors v ON v.id = c.visitor_id WHERE c.id = ?').bind(id).first<CommentRow>();
    return row ? mapComment(row) : null;
  }
  async getCommentBySubmission(visitorId: string, key: string): Promise<CommentRecord | null> {
    const row = await this.database.prepare('SELECT c.*, v.username FROM comments c JOIN visitors v ON v.id = c.visitor_id WHERE c.visitor_id = ? AND c.submission_key = ?').bind(visitorId, key).first<CommentRow>();
    return row ? mapComment(row) : null;
  }
  async insertCommentIfUnderLimit(comment: CommentRecord, since: string, max: number): Promise<boolean> {
    const write = await this.database.prepare(`INSERT INTO comments (id, visitor_id, target_type, target_id, body, submission_key, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM comments WHERE visitor_id = ? AND created_at >= ?) < ?`)
      .bind(comment.id, comment.visitorId, comment.targetType, comment.targetId, comment.body, comment.submissionKey, comment.createdAt, comment.updatedAt, comment.visitorId, since, max).run();
    return ((write as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
  }
  async listComments(targetType: CommentTargetType, targetId: string, offset: number, limit: number): Promise<CommentRecord[]> {
    const rows = await this.database.prepare(`SELECT c.*, v.username FROM comments c JOIN visitors v ON v.id = c.visitor_id
      WHERE c.target_type = ? AND c.target_id = ? AND c.deleted_at IS NULL ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
      .bind(targetType, targetId, limit, offset).all<CommentRow>();
    return (rows.results ?? []).map(mapComment);
  }
  async listRecentComments(offset: number, limit: number): Promise<CommentRecord[]> {
    const rows = await this.database.prepare(`SELECT c.*, v.username FROM comments c JOIN visitors v ON v.id = c.visitor_id
      WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`).bind(limit, offset).all<CommentRow>();
    return (rows.results ?? []).map(mapComment);
  }
  async updateCommentBody(id: string, visitorId: string, body: string, updatedAt: string): Promise<boolean> {
    const write = await this.database.prepare('UPDATE comments SET body = ?, updated_at = ?, reply_body = NULL, reply_updated_at = NULL WHERE id = ? AND visitor_id = ? AND deleted_at IS NULL').bind(body, updatedAt, id, visitorId).run();
    return ((write as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
  }
  async softDeleteComment(id: string, visitorId: string | null, deletedAt: string): Promise<boolean> {
    const sql = visitorId
      ? 'UPDATE comments SET deleted_at = ? WHERE id = ? AND visitor_id = ? AND deleted_at IS NULL'
      : 'UPDATE comments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL';
    const write = await this.database.prepare(sql).bind(...(visitorId ? [deletedAt, id, visitorId] : [deletedAt, id])).run();
    return ((write as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
  }
  async setCommentReply(id: string, body: string | null, updatedAt: string): Promise<boolean> {
    const write = await this.database.prepare('UPDATE comments SET reply_body = ?, reply_updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(body, body ? updatedAt : null, id).run();
    return ((write as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
  }
  async createVisitor(visitor: VisitorRecord): Promise<void> { await this.database.prepare('INSERT INTO visitors (id, username, username_key, email_verifier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(visitor.id, visitor.username, visitor.usernameKey, visitor.emailVerifier, visitor.createdAt, visitor.updatedAt).run(); }
  async createVisitorSession(session: VisitorSessionRecord): Promise<void> { await this.database.prepare('INSERT INTO visitor_sessions (token_hash, visitor_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(session.tokenHash, session.visitorId, session.createdAt, session.lastSeenAt, session.expiresAt).run(); }
  async getVisitorSession(hash: string): Promise<VisitorSessionRecord | null> { const row = await this.database.prepare('SELECT * FROM visitor_sessions WHERE token_hash = ?').bind(hash).first<VisitorSessionRow>(); return row ? mapVisitorSession(row) : null; }
  async touchVisitorSession(hash: string, lastSeenAt: string): Promise<void> { await this.database.prepare('UPDATE visitor_sessions SET last_seen_at = ? WHERE token_hash = ?').bind(lastSeenAt, hash).run(); }
  async revokeVisitorSession(hash: string): Promise<void> { await this.database.prepare('DELETE FROM visitor_sessions WHERE token_hash = ?').bind(hash).run(); }
  async deleteExpiredVisitorSessions(visitorId: string, now: string): Promise<void> { const idle = new Date(Date.parse(now) - 30 * 86400000).toISOString(); await this.database.prepare('DELETE FROM visitor_sessions WHERE visitor_id = ? AND (expires_at <= ? OR last_seen_at <= ?)').bind(visitorId, now, idle).run(); }
  async listVisitorSessions(visitorId: string): Promise<VisitorSessionRecord[]> { const rows = await this.database.prepare('SELECT * FROM visitor_sessions WHERE visitor_id = ? ORDER BY created_at, token_hash').bind(visitorId).all<VisitorSessionRow>(); return (rows.results ?? []).map(mapVisitorSession); }
  async deleteVisitorSessions(hashes: string[]): Promise<void> { if (hashes.length) await this.database.batch(hashes.map((hash) => this.database.prepare('DELETE FROM visitor_sessions WHERE token_hash = ?').bind(hash))); }
  async recordRateLimitEvent(scope: string, subjectHash: string, createdAt: string): Promise<void> { await this.database.prepare('INSERT INTO rate_limit_events (scope, subject_hash, created_at) VALUES (?, ?, ?)').bind(scope, subjectHash, createdAt).run(); }
  async countRateLimitEvents(scope: string, subjectHash: string, since: string): Promise<number> { const row = await this.database.prepare('SELECT COUNT(*) AS count FROM rate_limit_events WHERE scope = ? AND subject_hash = ? AND created_at >= ?').bind(scope, subjectHash, since).first<{ count: number }>(); return row?.count ?? 0; }
  async deleteRateLimitEventsBefore(cutoff: string): Promise<void> { await this.database.prepare('DELETE FROM rate_limit_events WHERE created_at < ?').bind(cutoff).run(); }
  async consumeRateLimitEvent(scope: string, subjectHash: string, createdAt: string, since: string, max: number): Promise<boolean> {
    const write = await this.database.prepare(`INSERT INTO rate_limit_events (scope, subject_hash, created_at)
      SELECT ?, ?, ? WHERE (
        SELECT COUNT(*) FROM rate_limit_events
        WHERE scope = ? AND subject_hash = ? AND created_at >= ?
      ) < ?`).bind(scope, subjectHash, createdAt, scope, subjectHash, since, max).run();
    return ((write as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0;
  }
  async claimGameSession(sessionId: string, visitorId: string, claimedAt: string): Promise<SessionClaimResult> {
    const write = await this.database.prepare('UPDATE game_sessions SET claimed_by_visitor_id = ?, claimed_at = ? WHERE id = ? AND claimed_by_visitor_id IS NULL').bind(visitorId, claimedAt, sessionId).run();
    const session = await this.getSession(sessionId);
    const changes = (write as { meta?: { changes?: number } }).meta?.changes ?? 0;
    return !session ? 'not_found' : session.claimedByVisitorId === visitorId ? (changes > 0 ? 'claimed' : 'already_owned') : 'already_claimed';
  }
  async getChallengeBySourceSessionId(sessionId: string): Promise<ChallengeStorageRecord | null> { const row = await this.database.prepare('SELECT * FROM challenges WHERE source_session_id = ?').bind(sessionId).first<ChallengeRow>(); return row ? mapChallenge(row) : null; }
  async saveBestScore(candidate: LeaderboardBestRecord): Promise<{ updated: boolean; best: LeaderboardBestRecord }> {
    if (candidate.mode === 'random') {
      if (!candidate.seasonId) throw new Error('random_season_required');
      const write = await this.database.prepare(`INSERT INTO random_leaderboard_bests (visitor_id, season_id, score, run_token_hash, achieved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(visitor_id, season_id) DO UPDATE SET score = excluded.score, run_token_hash = excluded.run_token_hash, achieved_at = excluded.achieved_at, updated_at = excluded.updated_at
        WHERE excluded.score > random_leaderboard_bests.score`).bind(candidate.visitorId, candidate.seasonId, candidate.score, candidate.sessionId, candidate.achievedAt, candidate.updatedAt).run();
      const best = await this.getVisitorBest(candidate.visitorId, 'random', candidate.seasonId);
      if (!best) throw new Error('leaderboard_write_failed');
      return { updated: ((write as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0, best };
    }
    const write = await this.database.prepare(`INSERT INTO leaderboard_bests (visitor_id, mode, score, session_id, achieved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(visitor_id, mode) DO UPDATE SET score = excluded.score, session_id = excluded.session_id, achieved_at = excluded.achieved_at, updated_at = excluded.updated_at
      WHERE excluded.score > leaderboard_bests.score`).bind(candidate.visitorId, candidate.mode, candidate.score, candidate.sessionId, candidate.achievedAt, candidate.updatedAt).run();
    const best = await this.getVisitorBest(candidate.visitorId, candidate.mode);
    if (!best) throw new Error('leaderboard_write_failed');
    const changes = (write as { meta?: { changes?: number } }).meta?.changes ?? 0;
    return { updated: changes > 0, best };
  }
  async getVisitorBest(visitorId: string, mode: GameMode, seasonId?: string): Promise<LeaderboardBestRecord | null> {
    if (mode === 'random') { if (!seasonId) throw new Error('random_season_required'); const row = await this.database.prepare('SELECT * FROM random_leaderboard_bests WHERE visitor_id = ? AND season_id = ?').bind(visitorId, seasonId).first<RandomBestRow>(); return row ? mapRandomBest(row) : null; }
    const row = await this.database.prepare('SELECT * FROM leaderboard_bests WHERE visitor_id = ? AND mode = ?').bind(visitorId, mode).first<BestRow>(); return row ? mapBest(row) : null;
  }
  async listLeaderboard(mode: GameMode, cursor: string | null, limit: number, seasonId?: string): Promise<LeaderboardPage> {
    const tuple = cursor ? decodeLeaderboardCursor(cursor) : null;
    if (mode === 'random') {
      if (!seasonId) throw new Error('random_season_required');
      const rows = await this.database.prepare(`WITH ranked AS (
        SELECT b.*, v.username, ROW_NUMBER() OVER (ORDER BY b.score DESC, b.achieved_at ASC, b.visitor_id ASC) AS rank
        FROM random_leaderboard_bests b JOIN visitors v ON v.id = b.visitor_id WHERE b.season_id = ?
      ) SELECT * FROM ranked WHERE (? IS NULL OR score < ? OR (score = ? AND achieved_at > ?) OR (score = ? AND achieved_at = ? AND visitor_id > ?))
      ORDER BY score DESC, achieved_at ASC, visitor_id ASC LIMIT ?`).bind(seasonId, tuple?.score ?? null, tuple?.score ?? null, tuple?.score ?? null, tuple?.achievedAt ?? null, tuple?.score ?? null, tuple?.achievedAt ?? null, tuple?.visitorId ?? null, limit + 1).all<RandomBestRow & { username: string; rank: number }>();
      const all = rows.results ?? []; const page = all.slice(0, limit);
      return { entries: page.map((row) => ({ visitorId: row.visitor_id, username: row.username, score: row.score, achievedAt: row.achieved_at, rank: row.rank })), nextCursor: all.length > limit && page.length ? encodeLeaderboardCursor(mapRandomBest(page[page.length - 1])) : null };
    }
    const rows = await this.database.prepare(`WITH ranked AS (
      SELECT b.*, v.username, ROW_NUMBER() OVER (ORDER BY b.score DESC, b.achieved_at ASC, b.visitor_id ASC) AS rank
      FROM leaderboard_bests b JOIN visitors v ON v.id = b.visitor_id WHERE b.mode = ?
    ) SELECT * FROM ranked WHERE (? IS NULL OR score < ? OR (score = ? AND achieved_at > ?) OR (score = ? AND achieved_at = ? AND visitor_id > ?))
    ORDER BY score DESC, achieved_at ASC, visitor_id ASC LIMIT ?`).bind(mode, tuple?.score ?? null, tuple?.score ?? null, tuple?.score ?? null, tuple?.achievedAt ?? null, tuple?.score ?? null, tuple?.achievedAt ?? null, tuple?.visitorId ?? null, limit + 1).all<BestRow & { username: string; rank: number }>();
    const all = rows.results ?? [];
    const page = all.slice(0, limit);
    return { entries: page.map((row) => ({ visitorId: row.visitor_id, username: row.username, score: row.score, achievedAt: row.achieved_at, rank: row.rank })), nextCursor: all.length > limit && page.length ? encodeLeaderboardCursor(mapBest(page[page.length - 1])) : null };
  }
  async getLeaderboardRank(mode: GameMode, visitorId: string, seasonId?: string): Promise<number | null> {
    if (mode === 'random') { if (!seasonId) throw new Error('random_season_required'); const row = await this.database.prepare(`WITH ranked AS (SELECT visitor_id, ROW_NUMBER() OVER (ORDER BY score DESC, achieved_at, visitor_id) AS rank FROM random_leaderboard_bests WHERE season_id = ?) SELECT rank FROM ranked WHERE visitor_id = ?`).bind(seasonId, visitorId).first<{ rank: number }>(); return row?.rank ?? null; }
    const row = await this.database.prepare(`WITH ranked AS (SELECT visitor_id, ROW_NUMBER() OVER (ORDER BY score DESC, achieved_at, visitor_id) AS rank FROM leaderboard_bests WHERE mode = ?) SELECT rank FROM ranked WHERE visitor_id = ?`).bind(mode, visitorId).first<{ rank: number }>(); return row?.rank ?? null;
  }

}
