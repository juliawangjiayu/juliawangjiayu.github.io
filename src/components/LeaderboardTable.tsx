import type { LeaderboardEntry } from '../lib/gameApi.ts';

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <ol className="leaderboard-table" aria-label="Guess Where leaderboard">
      {entries.map((entry) => (
        <li className="leaderboard-table__row" key={entry.visitorId}>
          <span className="leaderboard-table__rank">{entry.rank}</span>
          <strong>{entry.username}</strong>
          <span className="leaderboard-table__score">{entry.score.toLocaleString()} pts</span>
          <time dateTime={entry.achievedAt}>{new Date(entry.achievedAt).toLocaleDateString()}</time>
        </li>
      ))}
    </ol>
  );
}
