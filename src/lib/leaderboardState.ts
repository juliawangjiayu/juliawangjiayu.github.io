import type { GameMode } from './gameApi.ts';

export type LeaderboardEntry = {
  visitorId: string;
  username: string;
  score: number;
  achievedAt: string;
  rank: number;
};

export type LeaderboardPage = { entries: LeaderboardEntry[]; nextCursor: string | null };
export type LeaderboardState = LeaderboardPage & { mode: GameMode };

export function newLeaderboardState(mode: GameMode): LeaderboardState {
  return { mode, entries: [], nextCursor: null };
}

export function appendLeaderboardPage(current: LeaderboardState, page: LeaderboardPage): LeaderboardState {
  const seen = new Set(current.entries.map((entry) => entry.visitorId));
  return {
    ...current,
    entries: [...current.entries, ...page.entries.filter((entry) => !seen.has(entry.visitorId))],
    nextCursor: page.nextCursor,
  };
}

export function appendLeaderboardPageForMode(current: LeaderboardState, requestedMode: GameMode, page: LeaderboardPage): LeaderboardState {
  return current.mode === requestedMode ? appendLeaderboardPage(current, page) : current;
}

export function switchLeaderboardMode(_current: LeaderboardState, mode: GameMode): LeaderboardState {
  return newLeaderboardState(mode);
}
