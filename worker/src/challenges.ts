export interface ChallengeRecord {
  id: string;
  questionIds: string[];
  score: number;
  totalRounds: 5;
}

export function createChallengeRecord(
  id: string,
  questionIds: string[],
  score: number,
): ChallengeRecord {
  if (questionIds.length !== 5) {
    throw new Error("A challenge must contain exactly five questions.");
  }

  return {
    id,
    questionIds: [...questionIds],
    score,
    totalRounds: 5,
  };
}
