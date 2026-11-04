import type { LeaderboardBestRecord } from './repository.ts';

export function compareBest(left: LeaderboardBestRecord, right: LeaderboardBestRecord): number {
  return right.score - left.score || left.achievedAt.localeCompare(right.achievedAt) || left.visitorId.localeCompare(right.visitorId);
}

export function encodeLeaderboardCursor(best: LeaderboardBestRecord): string {
  return btoa(JSON.stringify([best.score, best.achievedAt, best.visitorId])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLeaderboardCursor(cursor: string): { score: number; achievedAt: string; visitorId: string } {
  try {
    const parsed: unknown = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(parsed) || parsed.length !== 3 || !Number.isInteger(parsed[0]) || parsed[0] < 0 || parsed[0] > 1000000 || typeof parsed[1] !== 'string' || typeof parsed[2] !== 'string') throw new Error();
    return { score: parsed[0], achievedAt: parsed[1], visitorId: parsed[2] };
  } catch { throw new Error('invalid_cursor'); }
}
