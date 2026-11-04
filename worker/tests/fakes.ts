import type {
  ChallengeStorageRecord,
  GameAnswerRecord,
  GameRepository,
  GameSessionRecord,
  RandomRunRecord, RandomBatchRecord,
  VisitorRecord, VisitorSessionRecord, LeaderboardBestRecord, LeaderboardPage, SessionClaimResult,
} from "../src/repository.ts";
import type { AiPlaceConfigRecord } from "../src/aiPlaces.ts";
import { compareBest, decodeLeaderboardCursor, encodeLeaderboardCursor } from '../src/leaderboards.ts';
import type { GameMode } from '../src/sessions.ts';
import type { GamePhotoRecord } from "../src/sessions.ts";

export class MemoryGameRepository implements GameRepository {
  readonly photos: GamePhotoRecord[];
  readonly sessions = new Map<string, GameSessionRecord>();
  readonly answers = new Map<string, GameAnswerRecord>();
  readonly challenges = new Map<string, ChallengeStorageRecord>();
  readonly visitors = new Map<string, VisitorRecord>();
  readonly visitorSessions = new Map<string, VisitorSessionRecord>();
  readonly rateEvents: { scope: string; subjectHash: string; createdAt: string }[] = [];
  readonly bests = new Map<string, LeaderboardBestRecord>();
  readonly randomRuns = new Map<string, RandomRunRecord>();
  readonly randomBatches = new Map<string, RandomBatchRecord[]>();
  readonly aiConfigs = new Map<number, AiPlaceConfigRecord>();
  activeAiConfigVersion: number | null = null;

  constructor(photos: GamePhotoRecord[]) {
    this.photos = photos;
  }

  async listEnabledGamePhotos(): Promise<GamePhotoRecord[]> {
    return this.photos.filter((photo) => photo.enabled);
  }

  async getGamePhoto(photoId: string): Promise<GamePhotoRecord | null> {
    return this.photos.find((photo) => photo.photoId === photoId) ?? null;
  }

  async createSession(session: GameSessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getSession(sessionId: string): Promise<GameSessionRecord | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async saveAnswer(answer: GameAnswerRecord): Promise<void> {
    this.answers.set(`${answer.sessionId}:${answer.roundIndex}`, answer);
  }

  async getAnswer(sessionId: string, roundIndex: number): Promise<GameAnswerRecord | null> {
    return this.answers.get(`${sessionId}:${roundIndex}`) ?? null;
  }

  async listAnswers(sessionId: string): Promise<GameAnswerRecord[]> {
    return [...this.answers.values()]
      .filter((answer) => answer.sessionId === sessionId)
      .sort((left, right) => left.roundIndex - right.roundIndex);
  }

  async updateSessionScore(sessionId: string, totalScore: number): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (session) {
      this.sessions.set(sessionId, { ...session, totalScore });
    }
  }

  async createRandomRun(run: RandomRunRecord): Promise<void> {
    if (this.randomRuns.has(run.tokenHash)) throw new Error('unique_random_token');
    this.randomRuns.set(run.tokenHash, run);
  }
  async getRandomRun(tokenHash: string): Promise<RandomRunRecord | null> { return this.randomRuns.get(tokenHash) ?? null; }
  async listRandomBatches(tokenHash: string): Promise<RandomBatchRecord[]> { return [...(this.randomBatches.get(tokenHash) ?? [])].sort((a, b) => a.batchIndex - b.batchIndex); }
  async getOrCreateRandomBatch(tokenHash: string, batchIndex: number, session: GameSessionRecord): Promise<GameSessionRecord> {
    const batches = this.randomBatches.get(tokenHash) ?? [];
    const existing = batches.find((batch) => batch.batchIndex === batchIndex);
    if (existing) return this.sessions.get(existing.sessionId)!;
    this.sessions.set(session.id, session);
    batches.push({ batchIndex, sessionId: session.id });
    this.randomBatches.set(tokenHash, batches);
    return session;
  }
  async claimRandomRun(tokenHash: string, visitorId: string, claimedAt: string): Promise<SessionClaimResult> {
    const run = this.randomRuns.get(tokenHash);
    if (!run) return 'not_found';
    if (run.claimedByVisitorId === visitorId) return 'already_owned';
    if (run.claimedByVisitorId) return 'already_claimed';
    this.randomRuns.set(tokenHash, { ...run, claimedByVisitorId: visitorId, claimedAt });
    return 'claimed';
  }

  async createChallenge(challenge: ChallengeStorageRecord): Promise<void> {
    if (challenge.sourceSessionId && await this.getChallengeBySourceSessionId(challenge.sourceSessionId)) throw new Error('unique_source_session');
    this.challenges.set(challenge.id, challenge);
  }

  async getChallenge(challengeId: string): Promise<ChallengeStorageRecord | null> {
    return this.challenges.get(challengeId) ?? null;
  }

  async syncGamePhotos(photos: GamePhotoRecord[]): Promise<void> {
    this.photos.splice(0, this.photos.length, ...photos);
  }

  async getActiveAiPlaceConfig(): Promise<AiPlaceConfigRecord | null> {
    return this.activeAiConfigVersion
      ? this.aiConfigs.get(this.activeAiConfigVersion) ?? null
      : null;
  }

  async getAiPlaceConfigVersion(version: number): Promise<AiPlaceConfigRecord | null> {
    return this.aiConfigs.get(version) ?? null;
  }

  async publishAiPlaceConfig(config: AiPlaceConfigRecord): Promise<void> {
    this.aiConfigs.set(config.version, config);
    this.activeAiConfigVersion = config.version;
  }
  async findVisitorByUsernameKey(key: string): Promise<VisitorRecord | null> { return [...this.visitors.values()].find((v) => v.usernameKey === key) ?? null; }
  async findVisitorByEmailVerifier(verifier: string): Promise<VisitorRecord | null> { return [...this.visitors.values()].find((v) => v.emailVerifier === verifier) ?? null; }
  async getVisitor(id: string): Promise<VisitorRecord | null> { return this.visitors.get(id) ?? null; }
  async createVisitor(visitor: VisitorRecord): Promise<void> {
    if (await this.findVisitorByUsernameKey(visitor.usernameKey) || await this.findVisitorByEmailVerifier(visitor.emailVerifier)) throw new Error('unique_constraint');
    this.visitors.set(visitor.id, visitor);
  }
  async createVisitorSession(session: VisitorSessionRecord): Promise<void> { this.visitorSessions.set(session.tokenHash, session); }
  async getVisitorSession(hash: string): Promise<VisitorSessionRecord | null> { return this.visitorSessions.get(hash) ?? null; }
  async touchVisitorSession(hash: string, lastSeenAt: string): Promise<void> { const session = this.visitorSessions.get(hash); if (session) this.visitorSessions.set(hash, { ...session, lastSeenAt }); }
  async revokeVisitorSession(hash: string): Promise<void> { this.visitorSessions.delete(hash); }
  async deleteExpiredVisitorSessions(visitorId: string, now: string): Promise<void> {
    for (const session of this.visitorSessions.values()) if (session.visitorId === visitorId && (session.expiresAt <= now || Date.parse(session.lastSeenAt) + 30 * 86400000 <= Date.parse(now))) this.visitorSessions.delete(session.tokenHash);
  }
  async listVisitorSessions(visitorId: string): Promise<VisitorSessionRecord[]> { return [...this.visitorSessions.values()].filter((s) => s.visitorId === visitorId).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.tokenHash.localeCompare(b.tokenHash)); }
  async deleteVisitorSessions(hashes: string[]): Promise<void> { for (const hash of hashes) this.visitorSessions.delete(hash); }
  async recordRateLimitEvent(scope: string, subjectHash: string, createdAt: string): Promise<void> { this.rateEvents.push({ scope, subjectHash, createdAt }); }
  async countRateLimitEvents(scope: string, subjectHash: string, since: string): Promise<number> { return this.rateEvents.filter((e) => e.scope === scope && e.subjectHash === subjectHash && e.createdAt >= since).length; }
  async deleteRateLimitEventsBefore(cutoff: string): Promise<void> { for (let i = this.rateEvents.length - 1; i >= 0; i--) if (this.rateEvents[i].createdAt < cutoff) this.rateEvents.splice(i,1); }
  async consumeRateLimitEvent(scope: string, subjectHash: string, createdAt: string, since: string, max: number): Promise<boolean> {
    const count = this.rateEvents.filter((event) => event.scope === scope && event.subjectHash === subjectHash && event.createdAt >= since).length;
    if (count >= max) return false;
    this.rateEvents.push({ scope, subjectHash, createdAt });
    return true;
  }
  async claimGameSession(sessionId: string, visitorId: string, claimedAt: string): Promise<SessionClaimResult> {
    const session = this.sessions.get(sessionId);
    if (!session) return 'not_found';
    if (session.claimedByVisitorId === visitorId) return 'already_owned';
    if (session.claimedByVisitorId) return 'already_claimed';
    this.sessions.set(sessionId, { ...session, claimedByVisitorId: visitorId, claimedAt });
    return 'claimed';
  }
  async getChallengeBySourceSessionId(sessionId: string): Promise<ChallengeStorageRecord | null> { return [...this.challenges.values()].find((c) => c.sourceSessionId === sessionId) ?? null; }
  async saveBestScore(candidate: LeaderboardBestRecord): Promise<{ updated: boolean; best: LeaderboardBestRecord }> {
    const key = `${candidate.visitorId}:${candidate.mode}:${candidate.mode === 'random' ? candidate.seasonId : ''}`;
    const existing = this.bests.get(key);
    if (existing && existing.score >= candidate.score) return { updated: false, best: existing };
    if ([...this.bests.values()].some((item) => item.sessionId === candidate.sessionId && (item.visitorId !== candidate.visitorId || item.mode !== candidate.mode || item.seasonId !== candidate.seasonId))) throw new Error('session_already_ranked');
    this.bests.set(key, candidate);
    return { updated: true, best: candidate };
  }
  async getVisitorBest(visitorId: string, mode: GameMode, seasonId?: string): Promise<LeaderboardBestRecord | null> { return this.bests.get(`${visitorId}:${mode}:${mode === 'random' ? seasonId : ''}`) ?? null; }
  async listLeaderboard(mode: GameMode, cursor: string | null, limit: number, seasonId?: string): Promise<LeaderboardPage> {
    const ordered = [...this.bests.values()].filter((best) => best.mode === mode && (mode !== 'random' || best.seasonId === seasonId)).sort(compareBest);
    let start = 0;
    if (cursor) { const tuple = decodeLeaderboardCursor(cursor); start = ordered.findIndex((best) => best.score === tuple.score && best.achievedAt === tuple.achievedAt && best.visitorId === tuple.visitorId) + 1; if (start === 0) throw new Error('invalid_cursor'); }
    const page = ordered.slice(start, start + limit);
    return { entries: page.map((best, index) => ({ visitorId: best.visitorId, username: this.visitors.get(best.visitorId)?.username ?? '', score: best.score, achievedAt: best.achievedAt, rank: start + index + 1 })), nextCursor: start + limit < ordered.length && page.length ? encodeLeaderboardCursor(page[page.length - 1]) : null };
  }
  async getLeaderboardRank(mode: GameMode, visitorId: string, seasonId?: string): Promise<number | null> {
    const index = [...this.bests.values()].filter((best) => best.mode === mode && (mode !== 'random' || best.seasonId === seasonId)).sort(compareBest).findIndex((best) => best.visitorId === visitorId);
    return index < 0 ? null : index + 1;
  }

}
