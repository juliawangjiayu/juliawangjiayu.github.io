import type { ChallengeRecord } from "./challenges.ts";
import type { CommentRecord, CommentTargetType } from './comments.ts';
import type { AiPlaceConfigRecord } from "./aiPlaces.ts";
import type { Proximity } from "./scoring.ts";
import type { GameMode, GamePhotoRecord } from "./sessions.ts";

export interface GameSessionRecord {
  id: string;
  mode: GameMode | "challenge";
  questionIds: string[];
  totalScore: number;
  createdAt: string;
  claimedByVisitorId?: string | null;
  claimedAt?: string | null;
}

export interface RandomRunRecord {
  tokenHash: string;
  seasonId: string;
  questionIds: string[];
  createdAt: string;
  claimedByVisitorId?: string | null;
  claimedAt?: string | null;
}

export interface RandomBatchRecord { batchIndex: number; sessionId: string }

export interface GameAnswerRecord {
  sessionId: string;
  roundIndex: number;
  guessLatitude: number;
  guessLongitude: number;
  distanceKm: number;
  score: number;
  proximity: Proximity;
  submittedAt: string;
}

export interface ChallengeStorageRecord extends ChallengeRecord {
  createdAt: string;
  createdByVisitorId?: string | null;
  sourceSessionId?: string | null;
}

export interface GameRepository extends IdentityRepository, LeaderboardRepository, CommentRepository {
  listEnabledGamePhotos(): Promise<GamePhotoRecord[]>;
  getGamePhoto(photoId: string): Promise<GamePhotoRecord | null>;
  createSession(session: GameSessionRecord): Promise<void>;
  getSession(sessionId: string): Promise<GameSessionRecord | null>;
  saveAnswer(answer: GameAnswerRecord): Promise<void>;
  getAnswer(sessionId: string, roundIndex: number): Promise<GameAnswerRecord | null>;
  listAnswers(sessionId: string): Promise<GameAnswerRecord[]>;
  updateSessionScore(sessionId: string, totalScore: number): Promise<void>;
  createRandomRun(run: RandomRunRecord): Promise<void>;
  getRandomRun(tokenHash: string): Promise<RandomRunRecord | null>;
  listRandomBatches(tokenHash: string): Promise<RandomBatchRecord[]>;
  getOrCreateRandomBatch(tokenHash: string, batchIndex: number, session: GameSessionRecord): Promise<GameSessionRecord>;
  claimRandomRun(tokenHash: string, visitorId: string, claimedAt: string): Promise<SessionClaimResult>;
  createChallenge(challenge: ChallengeStorageRecord): Promise<void>;
  getChallenge(challengeId: string): Promise<ChallengeStorageRecord | null>;
  syncGamePhotos(photos: GamePhotoRecord[], updatedAt: string): Promise<void>;
  getActiveAiPlaceConfig(): Promise<AiPlaceConfigRecord | null>;
  getAiPlaceConfigVersion(version: number): Promise<AiPlaceConfigRecord | null>;
  publishAiPlaceConfig(config: AiPlaceConfigRecord): Promise<void>;
}

export interface CommentRepository {
  getComment(id: string): Promise<CommentRecord | null>;
  getCommentBySubmission(visitorId: string, submissionKey: string): Promise<CommentRecord | null>;
  insertCommentIfUnderLimit(comment: CommentRecord, since: string, max: number): Promise<boolean>;
  listComments(targetType: CommentTargetType, targetId: string, offset: number, limit: number): Promise<CommentRecord[]>;
  listRecentComments(offset: number, limit: number): Promise<CommentRecord[]>;
  updateCommentBody(id: string, visitorId: string, body: string, updatedAt: string): Promise<boolean>;
  softDeleteComment(id: string, visitorId: string | null, deletedAt: string): Promise<boolean>;
  setCommentReply(id: string, body: string | null, updatedAt: string): Promise<boolean>;
}

export interface VisitorRecord { id: string; username: string; usernameKey: string; emailVerifier: string; createdAt: string; updatedAt: string }
export interface VisitorSessionRecord { tokenHash: string; visitorId: string; createdAt: string; lastSeenAt: string; expiresAt: string }
export interface IdentityRepository {
  findVisitorByUsernameKey(usernameKey: string): Promise<VisitorRecord | null>;
  findVisitorByEmailVerifier(verifier: string): Promise<VisitorRecord | null>;
  getVisitor(visitorId: string): Promise<VisitorRecord | null>;
  createVisitor(visitor: VisitorRecord): Promise<void>;
  createVisitorSession(session: VisitorSessionRecord): Promise<void>;
  getVisitorSession(tokenHash: string): Promise<VisitorSessionRecord | null>;
  touchVisitorSession(tokenHash: string, lastSeenAt: string): Promise<void>;
  revokeVisitorSession(tokenHash: string): Promise<void>;
  deleteExpiredVisitorSessions(visitorId: string, now: string): Promise<void>;
  listVisitorSessions(visitorId: string): Promise<VisitorSessionRecord[]>;
  deleteVisitorSessions(tokenHashes: string[]): Promise<void>;
  recordRateLimitEvent(scope: string, subjectHash: string, createdAt: string): Promise<void>;
  countRateLimitEvents(scope: string, subjectHash: string, since: string): Promise<number>;
  deleteRateLimitEventsBefore(cutoff: string): Promise<void>;
  consumeRateLimitEvent(scope: string, subjectHash: string, createdAt: string, since: string, max: number): Promise<boolean>;
}

export type SessionClaimResult = 'claimed' | 'already_owned' | 'already_claimed' | 'not_found';
export interface LeaderboardBestRecord { visitorId: string; mode: GameMode; score: number; sessionId: string; achievedAt: string; updatedAt: string; seasonId?: string }
export interface LeaderboardEntry { visitorId: string; username: string; score: number; rank: number; achievedAt: string }
export interface LeaderboardPage { entries: LeaderboardEntry[]; nextCursor: string | null }
export interface LeaderboardRepository {
  claimGameSession(sessionId: string, visitorId: string, claimedAt: string): Promise<SessionClaimResult>;
  getChallengeBySourceSessionId(sessionId: string): Promise<ChallengeStorageRecord | null>;
  saveBestScore(candidate: LeaderboardBestRecord): Promise<{ updated: boolean; best: LeaderboardBestRecord }>;
  getVisitorBest(visitorId: string, mode: GameMode, seasonId?: string): Promise<LeaderboardBestRecord | null>;
  listLeaderboard(mode: GameMode, cursor: string | null, limit: number, seasonId?: string): Promise<LeaderboardPage>;
  getLeaderboardRank(mode: GameMode, visitorId: string, seasonId?: string): Promise<number | null>;
}
