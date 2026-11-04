export interface ChallengeRecord {
  id: string;
  questionIds: string[];
  score: number;
  totalRounds: 4 | 5;
}

export function createChallengeRecord(
  id: string,
  questionIds: string[],
  score: number,
): ChallengeRecord {
  if (questionIds.length !== 4 && questionIds.length !== 5) {
    throw new Error("A challenge must contain four or five questions.");
  }

  return {
    id,
    questionIds: [...questionIds],
    score,
    totalRounds: questionIds.length as 4 | 5,
  };
}
