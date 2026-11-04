import type { GameRepository, GameSessionRecord, RandomRunRecord } from './repository.ts';
import { toPublicRound, type GamePhotoRecord, type PublicRound } from './sessions.ts';

export interface RandomProgress {
  token: string;
  answered: number;
  total: number;
  cumulativeScore: number;
  completedBatches: number;
  totalBatches: number;
  complete: boolean;
  rankable: boolean;
}

export class RandomJourneyError extends Error {
  readonly code: 'run_not_found' | 'no_photos' | 'run_incomplete' | 'run_already_claimed' | 'season_expired';
  constructor(code: RandomJourneyError['code'], message: string) { super(message); this.code = code; }
}

export async function hashRandomToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    const target = value[0] % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

async function snapshot(repository: GameRepository, run: RandomRunRecord, token: string, rankable: boolean): Promise<{ progress: RandomProgress; active: GameSessionRecord | null; nextRoundIndex: number; activeSessionScore: number }> {
  const total = run.questionIds.length;
  const batches = await repository.listRandomBatches(run.tokenHash);
  let answered = 0;
  let cumulativeScore = 0;
  let completedBatches = 0;
  let active: GameSessionRecord | null = null;
  let nextRoundIndex = 0;
  let activeSessionScore = 0;
  for (const batch of batches) {
    if (batch.batchIndex !== completedBatches || active) throw new Error('invalid_random_run_state');
    const session = await repository.getSession(batch.sessionId);
    const expected = run.questionIds.slice(batch.batchIndex * 5, batch.batchIndex * 5 + 5);
    if (!session || session.mode !== 'random' || JSON.stringify(session.questionIds) !== JSON.stringify(expected)) throw new Error('invalid_random_batch');
    const answers = await repository.listAnswers(session.id);
    if (answers.length > expected.length || answers.some((answer, index) => answer.roundIndex !== index)) throw new Error('invalid_random_answers');
    answered += answers.length;
    cumulativeScore += answers.reduce((sum, answer) => sum + answer.score, 0);
    if (answers.length === expected.length) completedBatches++;
    else { active = session; nextRoundIndex = answers.length; activeSessionScore = answers.reduce((sum, answer) => sum + answer.score, 0); }
  }
  const totalBatches = Math.ceil(total / 5);
  return { progress: { token, answered, total, cumulativeScore, completedBatches, totalBatches, complete: answered === total && completedBatches === totalBatches, rankable }, active, nextRoundIndex, activeSessionScore };
}

export class RandomJourneyService {
  private readonly repository: GameRepository;
  private readonly now: () => string;
  private readonly createSessionId: () => string;
  constructor(repository: GameRepository, now: () => string, createSessionId: () => string) {
    this.repository = repository; this.now = now; this.createSessionId = createSessionId;
  }

  private async currentPool(): Promise<{ photos: GamePhotoRecord[]; seasonId: string } | null> {
    const photos = (await this.repository.listEnabledGamePhotos())
      .sort((left, right) => left.photoId < right.photoId ? -1 : left.photoId > right.photoId ? 1 : 0)
      .slice(0, 200);
    if (!photos.length) return null;
    const seasonId = await hashRandomToken(JSON.stringify(['random-v1', photos.map((photo) => [
      photo.photoId, photo.answerLatitude, photo.answerLongitude, photo.radiusKm,
    ])]));
    return { photos, seasonId };
  }

  async currentSeasonId(): Promise<string | null> { return (await this.currentPool())?.seasonId ?? null; }

  async start(token?: string): Promise<{ round: PublicRound | null; run: RandomProgress & { activeSessionScore: number }; created: boolean }> {
    let created = false;
    let run: RandomRunRecord | null;
    if (token) run = await this.repository.getRandomRun(await hashRandomToken(token));
    else {
      const pool = await this.currentPool();
      if (!pool) throw new RandomJourneyError('no_photos', 'No eligible photos are available.');
      token = crypto.randomUUID();
      run = { tokenHash: await hashRandomToken(token), seasonId: pool.seasonId, questionIds: shuffle(pool.photos).map((photo) => photo.photoId), createdAt: this.now() };
      await this.repository.createRandomRun(run);
      created = true;
    }
    if (!run || !token) throw new RandomJourneyError('run_not_found', 'Random journey not found.');
    const rankable = await this.currentSeasonId() === run.seasonId;
    let { progress, active, nextRoundIndex, activeSessionScore } = await snapshot(this.repository, run, token, rankable);
    if (progress.complete) return { round: null, run: { ...progress, activeSessionScore: 0 }, created };
    if (!active) {
      const batchIndex = progress.completedBatches;
      active = await this.repository.getOrCreateRandomBatch(run.tokenHash, batchIndex, {
        id: this.createSessionId(), mode: 'random', questionIds: run.questionIds.slice(batchIndex * 5, batchIndex * 5 + 5),
        totalScore: 0, createdAt: this.now(),
      });
      ({ progress, active, nextRoundIndex, activeSessionScore } = await snapshot(this.repository, run, token, rankable));
    }
    if (progress.complete) return { round: null, run: { ...progress, activeSessionScore: 0 }, created };
    if (!active) throw new Error('random_batch_missing');
    const photo = await this.repository.getGamePhoto(active.questionIds[nextRoundIndex]);
    if (!photo) throw new Error('random_photo_missing');
    return { round: toPublicRound(photo, active.id, nextRoundIndex, active.questionIds.length), run: { ...progress, activeSessionScore }, created };
  }

  async progress(token: string): Promise<RandomProgress> {
    const run = await this.repository.getRandomRun(await hashRandomToken(token));
    if (!run) throw new RandomJourneyError('run_not_found', 'Random journey not found.');
    return (await snapshot(this.repository, run, token, await this.currentSeasonId() === run.seasonId)).progress;
  }

  async claim(token: string, visitorId: string): Promise<{ progress: RandomProgress; seasonId: string }> {
    const hash = await hashRandomToken(token);
    const run = await this.repository.getRandomRun(hash);
    if (!run) throw new RandomJourneyError('run_not_found', 'Random journey not found.');
    if (await this.currentSeasonId() !== run.seasonId) throw new RandomJourneyError('season_expired', 'The photo archive changed. Start a new Random journey to join the current leaderboard.');
    const progress = (await snapshot(this.repository, run, token, true)).progress;
    if (!progress.complete) throw new RandomJourneyError('run_incomplete', 'Finish every Random round first.');
    const claim = await this.repository.claimRandomRun(hash, visitorId, this.now());
    if (claim === 'already_claimed') throw new RandomJourneyError('run_already_claimed', 'This Random journey is already claimed by another visitor.');
    return { progress, seasonId: run.seasonId };
  }
}
