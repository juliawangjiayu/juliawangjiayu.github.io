export type Difficulty = "easy" | "medium" | "hard";
export type GameMode = Difficulty | "random";
export type AnswerRadiusKm = 1 | 10 | 50 | 100;

export interface GamePhotoRecord {
  photoId: string;
  imageUrl: string;
  difficulty: Difficulty;
  answerLatitude: number;
  answerLongitude: number;
  radiusKm: AnswerRadiusKm;
  enabled: boolean;
}

export interface PublicRound {
  sessionId: string;
  round: number;
  totalRounds: number;
  photo: {
    id: string;
    imageUrl: string;
  };
}

export class InsufficientQuestionsError extends Error {
  constructor(mode: GameMode, available: number, required: number) {
    super(`Mode ${mode} has ${available} eligible photos; ${required} are required.`);
    this.name = "InsufficientQuestionsError";
  }
}

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function selectQuestionIds(
  records: GamePhotoRecord[],
  mode: GameMode,
  seed: string,
  count = 5,
): string[] {
  const eligible = records.filter(
    (record) => record.enabled && (mode === "random" || record.difficulty === mode),
  );

  if (eligible.length < count) {
    throw new InsufficientQuestionsError(mode, eligible.length, count);
  }

  const shuffled = [...eligible];
  const random = seededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  return shuffled.slice(0, count).map((record) => record.photoId);
}

export function toPublicRound(
  record: GamePhotoRecord,
  sessionId: string,
  roundIndex: number,
  totalRounds: number,
): PublicRound {
  return {
    sessionId,
    round: roundIndex + 1,
    totalRounds,
    photo: {
      id: record.photoId,
      imageUrl: record.imageUrl,
    },
  };
}
