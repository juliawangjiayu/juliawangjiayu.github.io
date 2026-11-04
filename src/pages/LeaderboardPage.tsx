import { useEffect, useRef, useState } from 'react';

import { AppLink } from '../components/AppLink.tsx';
import { LeaderboardTable } from '../components/LeaderboardTable.tsx';
import { FlightTrail, WitchMotif } from '../components/SectionMotifs.tsx';
import { useVisitorIdentity } from '../components/VisitorIdentityProvider.tsx';
import { getLeaderboard, getMyLeaderboard, type GameMode } from '../lib/gameApi.ts';
import { appendLeaderboardPage, appendLeaderboardPageForMode, newLeaderboardState } from '../lib/leaderboardState.ts';

const modes: Array<{ id: GameMode; label: string }> = [
  { id: 'easy', label: 'Easy' }, { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' }, { id: 'random', label: 'Random' },
];

export function LeaderboardPage({ mode }: { mode: GameMode }) {
  const { visitor, signOut } = useVisitorIdentity();
  const [board, setBoard] = useState(() => newLeaderboardState(mode));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [myRank, setMyRank] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const currentMode = useRef(mode);
  currentMode.current = mode;

  useEffect(() => {
    let cancelled = false;
    setBoard(newLeaderboardState(mode));
    setLoading(true);
    setError('');
    void getLeaderboard(mode).then((page) => {
      if (!cancelled) setBoard(appendLeaderboardPage(newLeaderboardState(mode), page));
    }).catch((caught: Error) => {
      if (!cancelled) setError(caught.message);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, reload]);

  useEffect(() => {
    let cancelled = false;
    setMyRank(null);
    if (visitor) void getMyLeaderboard(mode).then((result) => {
      if (!cancelled) setMyRank(result.rank);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [mode, visitor]);

  const loadMore = async () => {
    if (!board.nextCursor || loading) return;
    const requestedMode = mode;
    setLoading(true);
    setError('');
    try {
      const page = await getLeaderboard(requestedMode, board.nextCursor);
      if (currentMode.current === requestedMode) setBoard((current) => appendLeaderboardPageForMode(current, requestedMode, page));
    } catch (caught) {
      if (currentMode.current === requestedMode) setError(caught instanceof Error ? caught.message : 'The next page could not be loaded.');
    } finally { if (currentMode.current === requestedMode) setLoading(false); }
  };

  return (
    <main className="leaderboard-page page-frame page-frame--column">
      <FlightTrail className="leaderboard-page__trail" />
      <header className="leaderboard-page__heading">
        <p className="page-kicker">Four ways to play · One world</p>
        <h1>Leaderboard <WitchMotif className="leaderboard-page__witch" /></h1>
        <p>{mode === 'random' ? 'Random remembers answered photos on this browser. Finish the whole archive, then sign in to save your cumulative score; individual batches do not rank.' : 'Each name appears once per mode, with their best score.'}</p>
        <AppLink href="/guess-where">← Back to Guess Where</AppLink>
      </header>
      <nav aria-label="Leaderboard mode" className="leaderboard-page__modes">
        {modes.map((item) => <AppLink aria-current={item.id === mode ? 'page' : undefined} href={`/guess-where/leaderboards/${item.id}`} key={item.id}>{item.label}</AppLink>)}
      </nav>
      {visitor && <p className="leaderboard-page__identity">Playing as {visitor.username}{myRank ? ` · Your rank: #${myRank}` : ''} <button onClick={() => void signOut()} type="button">Sign out</button></p>}
      {error && <p className="guess-error" role="alert">{error} <button onClick={() => setReload((value) => value + 1)} type="button">Retry</button></p>}
      {board.entries.length ? <LeaderboardTable entries={board.entries} /> : !loading && !error ? <p className="leaderboard-page__empty">No scores yet. The first journey is waiting.</p> : null}
      {loading && <p role="status">Loading scores…</p>}
      {board.nextCursor && <button className="leaderboard-page__more" disabled={loading} onClick={() => void loadMore()} type="button">Load more</button>}
    </main>
  );
}
