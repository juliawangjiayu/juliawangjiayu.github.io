export function leaderboardResultCopy(result: { updated: boolean; runScore: number; bestScore: number }): string {
  if (result.updated) return 'New personal best — leaderboard updated.';
  return `Your best score remains ${result.bestScore.toLocaleString()}. This run can still be shared.`;
}
