import type { ChallengeRecord } from "./challenges.ts";
import type { AiPlaceConfigRecord } from "./aiPlaces.ts";
import type { Proximity } from "./scoring.ts";
import type { GameMode, GamePhotoRecord } from "./sessions.ts";

export interface GameSessionRecord {
  id: string;
  mode: GameMode | "challenge";
  questionIds: string[];
  totalScore: number;
  createdAt: string;
}

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
}

export interface GameRepository {
  listEnabledGamePhotos(): Promise<GamePhotoRecord[]>;
  getGamePhoto(photoId: string): Promise<GamePhotoRecord | null>;
  createSession(session: GameSessionRecord): Promise<void>;
  getSession(sessionId: string): Promise<GameSessionRecord | null>;
  saveAnswer(answer: GameAnswerRecord): Promise<void>;
  getAnswer(sessionId: string, roundIndex: number): Promise<GameAnswerRecord | null>;
  listAnswers(sessionId: string): Promise<GameAnswerRecord[]>;
  updateSessionScore(sessionId: string, totalScore: number): Promise<void>;
  createChallenge(challenge: ChallengeStorageRecord): Promise<void>;
  getChallenge(challengeId: string): Promise<ChallengeStorageRecord | null>;
  syncGamePhotos(photos: GamePhotoRecord[], updatedAt: string): Promise<void>;
  getActiveAiPlaceConfig(): Promise<AiPlaceConfigRecord | null>;
  getAiPlaceConfigVersion(version: number): Promise<AiPlaceConfigRecord | null>;
  publishAiPlaceConfig(config: AiPlaceConfigRecord): Promise<void>;
}
