import { browserIdentityClient } from './identityApi.ts';
import type { RandomJourneyProgress } from './randomJourney.ts';

export type GameMode = 'easy' | 'medium' | 'hard' | 'random';

export type PublicRound = {
  sessionId: string;
  round: number;
  totalRounds: 4 | 5;
  photo: {
    id: string;
    imageUrl: string;
  };
};

export type GuessPoint = {
  latitude: number;
  longitude: number;
};

export type AnswerResult = {
  sessionId: string;
  round: number;
  distanceKm: number;
  score: number;
  proximity: 'exact' | 'close' | 'near' | 'far' | 'miss';
  totalScore: number;
  completed: boolean;
  answerName: string;
  correctAnswer: GuessPoint & { radiusKm: 1 | 10 | 50 | 100 };
  nextRound: PublicRound | null;
};

export type ChallengeSummary = {
  id: string;
  score: number;
  totalRounds: 4 | 5;
  creatorUsername?: string;
};

export type LeaderboardEntry = {
  visitorId: string;
  username: string;
  score: number;
  achievedAt: string;
  rank: number;
};

export type LeaderboardPage = { entries: LeaderboardEntry[]; nextCursor: string | null };
export type LeaderboardSaveResult = {
  updated: boolean;
  runScore: number;
  bestScore: number;
  rank: number;
  topThree: LeaderboardEntry[];
};

export type RandomJourneyStart = { round: PublicRound | null; run: RandomJourneyProgress };

export type ChallengeStart = {
  challenge: ChallengeSummary;
  round: PublicRound;
};

export type PlaceInterpretation = {
  status: 'searchable' | 'insufficient';
  normalizedQuery: string;
  clarification: string;
  confidence: number;
};

export class GameApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GameApiError';
  }
}

const configuredBaseUrl = import.meta.env.VITE_WORKER_BASE_URL?.trim();
const API_BASE_URL = configuredBaseUrl ? configuredBaseUrl.replace(/\/$/, '') : '';


async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new GameApiError(
      'Guess Where is temporarily unavailable. Please try again in a moment.',
      0,
    );
  }

  const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;

  if (!response.ok) {
    throw new GameApiError(body.message ?? body.error ?? 'The game request could not be completed.', response.status);
  }

  return body;
}

export function startGame(mode: GameMode): Promise<PublicRound> {
  return request('/api/game/start', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export function startRandomJourney(token: string | null): Promise<RandomJourneyStart> {
  return request('/api/random/start', { method: 'POST', body: JSON.stringify(token ? { token } : {}) });
}

export function getRandomJourneyProgress(token: string): Promise<RandomJourneyProgress> {
  return request('/api/random/progress', { method: 'POST', body: JSON.stringify({ token }) });
}

export function submitAnswer(
  sessionId: string,
  round: number,
  point: GuessPoint,
): Promise<AnswerResult> {
  return request(`/api/game/${encodeURIComponent(sessionId)}/answer`, {
    method: 'POST',
    body: JSON.stringify({ round, ...point }),
  });
}

export function createChallenge(sessionId: string): Promise<ChallengeSummary> {
  return browserIdentityClient().request<ChallengeSummary>('/api/challenges', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export function saveLeaderboardBest(mode: GameMode, sessionId: string): Promise<LeaderboardSaveResult> {
  return browserIdentityClient().request<LeaderboardSaveResult>(`/api/leaderboards/${mode}/me`, {
    method: 'PUT',
    body: JSON.stringify({ sessionId }),
  });
}

export function saveRandomLeaderboard(randomToken: string): Promise<LeaderboardSaveResult> {
  return browserIdentityClient().request<LeaderboardSaveResult>('/api/leaderboards/random/me', {
    method: 'PUT', body: JSON.stringify({ randomToken }),
  });
}

export function getLeaderboard(mode: GameMode, cursor: string | null = null): Promise<LeaderboardPage> {
  const query = new URLSearchParams({ limit: '30' });
  if (cursor) query.set('cursor', cursor);
  return request(`/api/leaderboards/${mode}?${query}`);
}

export function getMyLeaderboard(mode: GameMode): Promise<{ bestScore: number | null; rank: number | null }> {
  return browserIdentityClient().request<{ bestScore: number | null; rank: number | null }>(`/api/leaderboards/${mode}/me`);
}

export function getChallenge(challengeId: string): Promise<ChallengeSummary> {
  return request(`/api/challenges/${encodeURIComponent(challengeId)}`);
}

export function startChallenge(challengeId: string): Promise<ChallengeStart> {
  return request(`/api/challenges/${encodeURIComponent(challengeId)}/start`, {
    method: 'POST',
  });
}

export function interpretPlaceText(text: string): Promise<PlaceInterpretation> {
  return request('/api/places/interpret', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}
