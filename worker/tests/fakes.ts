import type {
  ChallengeStorageRecord,
  GameAnswerRecord,
  GameRepository,
  GameSessionRecord,
} from "../src/repository.ts";
import type { AiPlaceConfigRecord } from "../src/aiPlaces.ts";
import type { GamePhotoRecord } from "../src/sessions.ts";

export class MemoryGameRepository implements GameRepository {
  readonly photos: GamePhotoRecord[];
  readonly sessions = new Map<string, GameSessionRecord>();
  readonly answers = new Map<string, GameAnswerRecord>();
  readonly challenges = new Map<string, ChallengeStorageRecord>();
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

  async createChallenge(challenge: ChallengeStorageRecord): Promise<void> {
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
}
