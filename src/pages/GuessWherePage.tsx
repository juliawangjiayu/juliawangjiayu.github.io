import { useEffect, useRef, useState } from 'react';
import { Copy, Minus, Plus, Share2 } from 'lucide-react';

import { GoogleMapPicker } from '../components/GoogleMapPicker.tsx';
import { FiveRoundReview } from '../components/FiveRoundReview.tsx';
import { LeaderboardTable } from '../components/LeaderboardTable.tsx';
import { AppLink } from '../components/AppLink.tsx';
import { useVisitorIdentity } from '../components/VisitorIdentityProvider.tsx';
import { FlightTrail, WitchMotif } from '../components/SectionMotifs.tsx';
import {
  createChallenge,
  getRandomJourneyProgress,
  getChallenge,
  startRandomJourney,
  startChallenge,
  startGame,
  submitAnswer,
  saveLeaderboardBest,
  saveRandomLeaderboard,
  GameApiError,
  type AnswerResult,
  type ChallengeSummary,
  type GameMode,
  type GuessPoint,
  type LeaderboardSaveResult,
  type PublicRound,
} from '../lib/gameApi.ts';
import {
  calculateViewerPanBounds,
  createViewerState,
  setViewerPan,
  setViewerZoomWithinBounds,
} from '../lib/viewerState.ts';
import { buildReviewCardData, downloadReviewCard } from '../lib/reviewCard.ts';
import { buildInvitationCardData, downloadInvitationCard } from '../lib/invitationCard.ts';
import { appendRoundReview, makeRoundReview, resolveRoundReview, type RoundReview } from '../lib/roundReview.ts';
import { reverseGeocodePlace } from '../lib/googleMaps.ts';
import { leaderboardResultCopy } from '../lib/gameResultState.ts';
import { clearRandomJourneyToken, loadRandomBatchReviews, loadRandomJourneyToken, randomJourneyCanRank, randomJourneyCopy, randomJourneyFinished, saveRandomBatchReviews, saveRandomJourneyToken, type RandomJourneyProgress } from '../lib/randomJourney.ts';

const modes: Array<{ id: GameMode; name: string; note: string }> = [
  { id: 'easy', name: 'Easy', note: 'Closer landmarks and wider contexts' },
  { id: 'medium', name: 'Medium', note: 'A balanced set of five places' },
  { id: 'hard', name: 'Hard', note: 'Small clues and unfamiliar viewpoints' },
  { id: 'random', name: 'Random', note: 'Explore the full archive in batches, without repeats on this device' },
];

type GuessWherePageProps = {
  challengeId?: string;
};

function friendlyProximity(proximity: AnswerResult['proximity']): string {
  if (proximity === 'exact') return 'Inside the answer area';
  if (proximity === 'close') return 'Very close';
  if (proximity === 'near') return 'Nearby';
  if (proximity === 'far') return 'Far away';
  return 'No points this round';
}

export function GuessWherePage({ challengeId }: GuessWherePageProps) {
  const { visitor, runAuthenticated, signOut } = useVisitorIdentity();
  const [playedMode, setPlayedMode] = useState<GameMode | null>(null);
  const [randomRun, setRandomRun] = useState<RandomJourneyProgress | null>(null);
  const [randomProgressBusy, setRandomProgressBusy] = useState(false);
  const reconciledRandomSession = useRef('');
  const [leaderboardResult, setLeaderboardResult] = useState<LeaderboardSaveResult | null>(null);
  const [savingLeaderboard, setSavingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [round, setRound] = useState<PublicRound | null>(null);
  const [point, setPoint] = useState<GuessPoint | null>(null);
  const [selectedPlaceName, setSelectedPlaceName] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [reviews, setReviews] = useState<RoundReview[]>([]);
  const [revealComplete, setRevealComplete] = useState(false);
  const [targetChallenge, setTargetChallenge] = useState<ChallengeSummary | null>(null);
  const [sharedChallenge, setSharedChallenge] = useState<ChallengeSummary | null>(null);
  const [photoView, setPhotoView] = useState(() => createViewerState());
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const photoViewportRef = useRef<HTMLDivElement>(null);
  const photoImageRef = useRef<HTMLImageElement>(null);
  const photoPanGesture = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [savingInvitation, setSavingInvitation] = useState(false);
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [invitationError, setInvitationError] = useState('');
  const invitationRequestRef = useRef('');
  const activeSessionRef = useRef('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrCode, setQrCode] = useState('');

  useEffect(() => {
    if (challengeId) return;
    const token = loadRandomJourneyToken();
    if (token) void getRandomJourneyProgress(token).then(setRandomRun).catch((caught) => {
      if (caught instanceof GameApiError && caught.status === 404) clearRandomJourneyToken();
    });
  }, [challengeId]);

  useEffect(() => {
    if (playedMode === 'random' && round) saveRandomBatchReviews(round.sessionId, reviews);
  }, [playedMode, round?.sessionId, reviews]);

  useEffect(() => {
    if (!challengeId) {
      setTargetChallenge(null);
      return;
    }

    setBusy(true);
    setError('');
    getChallenge(challengeId)
      .then(setTargetChallenge)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setBusy(false));
  }, [challengeId]);

  const beginMode = async (mode: GameMode) => {
    setBusy(true);
    setError('');
    try {
      const randomStarted = mode === 'random' ? await startRandomJourney(loadRandomJourneyToken()).catch(async (caught) => {
        if (caught instanceof GameApiError && caught.status === 404) {
          clearRandomJourneyToken();
          return startRandomJourney(null);
        }
        throw caught;
      }) : null;
      if (randomStarted) {
        saveRandomJourneyToken(randomStarted.run.token);
        setRandomRun(randomStarted.run);
        if (!randomStarted.round) {
          setRound(null);
          setPlayedMode(null);
          return;
        }
      }
      const started = randomStarted?.round ?? await startGame(mode);
      const restoredReviews = randomStarted ? loadRandomBatchReviews(started.sessionId).map((review) => ({ ...review, locationPending: false })) : [];
      activeSessionRef.current = started.sessionId;
      reconciledRandomSession.current = '';
      setPlayedMode(mode);
      setLeaderboardResult(null);
      setLeaderboardError('');
      setRound(started);
      setPoint(null);
      setSelectedPlaceName('');
      setResult(null);
      setReviews(restoredReviews);
      setRevealComplete(false);
      setTotalScore(randomStarted?.run.activeSessionScore ?? restoredReviews.reduce((sum, review) => sum + review.score, 0));
      setSharedChallenge(null);
      setInvitationError('');
      invitationRequestRef.current = '';
      setCopied(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The game could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const beginFreshRandom = async () => {
    clearRandomJourneyToken();
    setRandomRun(null);
    await beginMode('random');
  };

  const beginChallenge = async () => {
    if (!challengeId) return;
    setBusy(true);
    setError('');
    try {
      const started = await startChallenge(challengeId);
      activeSessionRef.current = started.round.sessionId;
      setPlayedMode(null);
      setRandomRun(null);
      setLeaderboardResult(null);
      setLeaderboardError('');
      setTargetChallenge(started.challenge);
      setRound(started.round);
      setPoint(null);
      setSelectedPlaceName('');
      setResult(null);
      setReviews([]);
      setRevealComplete(false);
      setTotalScore(0);
      setSharedChallenge(null);
      setInvitationError('');
      invitationRequestRef.current = '';
      setCopied(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The challenge could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const confirmAnswer = async () => {
    if (!round || !point || result) return;
    setBusy(true);
    setError('');
    try {
      const answer = await submitAnswer(round.sessionId, round.round, point);
      setReviews((current) => appendRoundReview(current, makeRoundReview(round, point, answer, selectedPlaceName)));
      setResult(answer);
      setRevealComplete(false);
      setTotalScore(answer.totalScore);
      const sessionId = round.sessionId;
      const roundNumber = round.round;
      const browserKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';
      void Promise.race([
        reverseGeocodePlace(browserKey, point).catch(() => null),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5000)),
      ]).then((place) => {
        if (activeSessionRef.current !== sessionId) return;
        setReviews((current) => current.map((review) =>
          review.round === roundNumber ? resolveRoundReview(review, place) : review));
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The answer could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  const continueGame = () => {
    if (!result?.nextRound) return;
    setRound(result.nextRound);
    setPoint(null);
    setSelectedPlaceName('');
    setResult(null);
    setRevealComplete(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    setPhotoView(createViewerState());
    setIsPhotoDragging(false);
    photoPanGesture.current = null;
  }, [round?.sessionId, round?.round]);

  useEffect(() => {
    if (!result) return;
    const fallback = window.setTimeout(() => setRevealComplete(true), 1800);
    return () => window.clearTimeout(fallback);
  }, [result]);

  useEffect(() => {
    if (!result?.completed || !revealComplete || playedMode !== 'random' || !round || !randomRun) return;
    if (reconciledRandomSession.current === round.sessionId) return;
    reconciledRandomSession.current = round.sessionId;
    setRandomProgressBusy(true);
    void getRandomJourneyProgress(randomRun.token).then(setRandomRun).catch((caught: Error) => {
      reconciledRandomSession.current = '';
      setLeaderboardError(caught.message || 'Random progress could not be updated.');
    }).finally(() => setRandomProgressBusy(false));
  }, [result?.completed, revealComplete, playedMode, round?.sessionId, randomRun?.token]);

  const photoPanBounds = (zoom: number) => {
    const viewport = photoViewportRef.current;
    const image = photoImageRef.current;
    if (!viewport || !image) return { maxX: 0, maxY: 0 };
    return calculateViewerPanBounds(
      viewport.clientWidth,
      viewport.clientHeight,
      image.clientWidth,
      image.clientHeight,
      zoom,
    );
  };

  const zoomPhotoBy = (amount: number) => {
    setPhotoView((value) => {
      const zoom = Math.min(2, Math.max(1, value.zoom + amount));
      return setViewerZoomWithinBounds(value, zoom, photoPanBounds(zoom));
    });
  };

  const finishPhotoPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    photoPanGesture.current = null;
    setIsPhotoDragging(false);
  };

  const createInvitation = async (sessionId: string) => {
    await runAuthenticated('create a same-five invitation', async () => {
      if (invitationRequestRef.current === sessionId) return;
      invitationRequestRef.current = sessionId;
      setCreatingInvitation(true);
      setInvitationError('');
      try {
        setSharedChallenge(await createChallenge(sessionId));
      } catch (caught) {
        invitationRequestRef.current = '';
        setInvitationError(caught instanceof Error ? caught.message : 'The invitation could not be created.');
      } finally {
        setCreatingInvitation(false);
      }
    });
  };

  const saveRandomRun = async () => {
    if (!randomRun || !randomJourneyCanRank(randomRun)) return;
    await runAuthenticated('save to leaderboard', async () => {
      setSavingLeaderboard(true);
      setLeaderboardError('');
      try {
        setLeaderboardResult(await saveRandomLeaderboard(randomRun.token));
      } catch (caught) {
        setLeaderboardError(caught instanceof Error ? caught.message : 'Your cumulative score could not be saved.');
      } finally { setSavingLeaderboard(false); }
    });
  };

  const saveLeaderboard = async () => {
    if (!round || !playedMode) return;
    if (playedMode === 'random') return saveRandomRun();
    await runAuthenticated('save to leaderboard', async () => {
      setSavingLeaderboard(true);
      setLeaderboardError('');
      try {
        setLeaderboardResult(await saveLeaderboardBest(playedMode, round.sessionId));
      } catch (caught) {
        setLeaderboardError(caught instanceof Error ? caught.message : 'Your score could not be saved.');
      } finally {
        setSavingLeaderboard(false);
      }
    });
  };

  const saveReview = async () => {
    setSavingReview(true);
    setError('');
    try {
      await downloadReviewCard(buildReviewCardData(reviews, totalScore, round?.totalRounds ?? 5));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The review image could not be saved.');
    } finally {
      setSavingReview(false);
    }
  };

  const invitationCard = sharedChallenge
    ? buildInvitationCardData(sharedChallenge, window.location.origin)
    : null;
  const challengeUrl = invitationCard?.url ?? '';

  const saveInvitation = async () => {
    if (!invitationCard) return;
    setSavingInvitation(true);
    setInvitationError('');
    try {
      await downloadInvitationCard(invitationCard);
    } catch (caught) {
      setInvitationError(caught instanceof Error ? caught.message : 'The invitation image could not be saved.');
    } finally {
      setSavingInvitation(false);
    }
  };

  useEffect(() => {
    if (!challengeUrl) {
      setQrCode('');
      return;
    }

    let cancelled = false;
    void import('qrcode').then(({ toDataURL }) =>
      toDataURL(challengeUrl, {
        width: 176,
        margin: 1,
        color: { dark: '#20211f', light: '#f8f5ee' },
      }).then((dataUrl) => {
        if (!cancelled) setQrCode(dataUrl);
      }),
    ).catch(() => {
      if (!cancelled) setInvitationError('The QR code could not be shown. You can still copy the link.');
    });

    return () => {
      cancelled = true;
    };
  }, [challengeUrl]);

  if (!round) {
    return (
      <main className="guess-intro page-frame page-frame--column">
        <FlightTrail className="guess-intro__trail" />
        <div className="guess-intro__heading">
          <p className="page-kicker">Photographs · One world</p>
          <h1>Guess Where</h1>
          <p>Study the photograph, search if you need to, then place one final Pin.</p>
          <WitchMotif className="guess-intro__witch" />
        </div>

        {challengeId && targetChallenge ? (
          <section className="challenge-invite">
            <p className="page-kicker">Same {targetChallenge.totalRounds} photographs</p>
            <strong>{targetChallenge.score.toLocaleString()} / {(targetChallenge.totalRounds * 5000).toLocaleString()}</strong>
            <p>Play the exact same {targetChallenge.totalRounds} rounds and compare your result.</p>
            <button disabled={busy} onClick={() => void beginChallenge()} type="button">
              {busy ? 'Starting…' : 'Start challenge'}
            </button>
          </section>
        ) : (
          <div className="guess-modes" aria-label="Game modes">
            {modes.map((mode) => (
              <button
                className="guess-mode"
                disabled={busy || Boolean(challengeId) || (mode.id === 'random' && Boolean(randomRun?.complete))}
                key={mode.id}
                onClick={() => void beginMode(mode.id)}
                type="button"
              >
                <span>{mode.name}</span>
                <small>{mode.id === 'random' && randomRun ? randomJourneyCopy(randomRun) : mode.note}</small>
              </button>
            ))}
          </div>
        )}
        {busy && !targetChallenge && <p className="guess-intro__status">Connecting to the game…</p>}
        {randomRun?.complete && <p className="guess-intro__status">You explored all {randomRun.total} Random places. Your cumulative score is {randomRun.cumulativeScore.toLocaleString()} points.</p>}
        {randomRun && !randomRun.rankable && <div className="guess-intro__random-finish"><p>The photo archive changed since this journey began. You can finish it, but only a fresh journey can join the current Random leaderboard.</p><button disabled={busy} onClick={() => void beginFreshRandom()} type="button">Start a new Random journey</button></div>}
        {randomRun && randomJourneyCanRank(randomRun) && <div className="guess-intro__random-finish"><button disabled={savingLeaderboard} onClick={() => void saveRandomRun()} type="button">{savingLeaderboard ? 'Saving…' : 'Save Random total to leaderboard'}</button>{leaderboardResult && <p>{leaderboardResultCopy(leaderboardResult)} Your rank: #{leaderboardResult.rank}</p>}{leaderboardError && <p role="alert">{leaderboardError}</p>}</div>}
        <AppLink className="guess-intro__leaderboard" href="/guess-where/leaderboards/easy">See all leaderboards ↗</AppLink>
        {visitor && <p className="guess-intro__visitor">Playing as {visitor.username}<button onClick={() => void signOut()} type="button">Sign out</button></p>}
        {error && <p className="guess-error" role="alert">{error}</p>}
      </main>
    );
  }

  return (
    <main className="guess-game">
      <FlightTrail className="guess-game__trail" />
      <header className="guess-game__progress">
        <span className="guess-game__round-label">
          Round {round.round} / {round.totalRounds}
          <WitchMotif className="guess-game__witch" />
        </span>
        <strong>{totalScore.toLocaleString()} pts</strong>
      </header>

      <section className="guess-photo-stage">
        <div
          className={`guess-photo-stage__viewport${photoView.zoom > 1 ? ' is-zoomed' : ''}${isPhotoDragging ? ' is-dragging' : ''}`}
          ref={photoViewportRef}
          onPointerDown={(event) => {
            if (photoView.zoom <= 1) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            photoPanGesture.current = {
              pointerId: event.pointerId,
              lastX: event.clientX,
              lastY: event.clientY,
            };
            setIsPhotoDragging(true);
          }}
          onPointerMove={(event) => {
            const gesture = photoPanGesture.current;
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            event.preventDefault();
            const deltaX = event.clientX - gesture.lastX;
            const deltaY = event.clientY - gesture.lastY;
            gesture.lastX = event.clientX;
            gesture.lastY = event.clientY;
            setPhotoView((value) => setViewerPan(
              value,
              value.panX + deltaX,
              value.panY + deltaY,
              photoPanBounds(value.zoom),
            ));
          }}
          onPointerUp={finishPhotoPan}
          onPointerCancel={finishPhotoPan}
        >
          <img
            ref={photoImageRef}
            alt={`Guess Where round ${round.round}`}
            draggable={false}
            src={round.photo.imageUrl}
            style={{ transform: `translate(${photoView.panX}px, ${photoView.panY}px) scale(${photoView.zoom})` }}
          />
        </div>
        <div className="guess-photo-stage__tools" aria-label="Photo zoom controls">
          <button
            aria-label="Zoom out"
            disabled={photoView.zoom <= 1}
            onClick={() => zoomPhotoBy(-0.25)}
            type="button"
          >
            <Minus size={20} />
          </button>
          <button
            aria-label="Zoom in"
            disabled={photoView.zoom >= 2}
            onClick={() => zoomPhotoBy(0.25)}
            type="button"
          >
            <Plus size={20} />
          </button>
        </div>
      </section>

      <section className="guess-map-stage">
        <div className="guess-map-stage__heading">
          <div>
            <p className="page-kicker">Your answer</p>
            <h1>{result ? 'The answer, revealed' : 'Where was this photograph taken?'}</h1>
          </div>
        </div>

        <GoogleMapPicker
          correctAnswer={result?.correctAnswer}
          disabled={Boolean(result)}
          key={`${round.sessionId}:${round.round}`}
          onChange={(nextPoint, placeName) => {
            setPoint(nextPoint);
            setSelectedPlaceName(placeName ?? '');
          }}
          onRevealComplete={() => setRevealComplete(true)}
          value={point}
        />

        {result && (
          <div aria-live="polite" className={`round-reveal${revealComplete ? ' is-complete' : ''}`}>
            <div className="round-reveal__places">
              <span><i className="round-reveal__pin round-reveal__pin--answer" /> Correct answer</span>
              <span><i className="round-reveal__pin round-reveal__pin--guess" /> Your Pin</span>
            </div>
            {revealComplete ? (
              <div className="round-reveal__result">
                <div>
                  <strong>{friendlyProximity(result.proximity)}</strong>
                  <span>{result.distanceKm.toLocaleString()} km away</span>
                </div>
                <b>+{result.score.toLocaleString()} <small>pts</small></b>
              </div>
            ) : (
              <p>Following the trail between the two Pins…</p>
            )}
          </div>
        )}

        <div className="guess-submit-row">
          {!result && (
            <>
              <p>{point ? 'Move the Pin or search again before your final answer.' : 'Search or click the map to place a Pin.'}</p>
              <button disabled={!point || busy} onClick={() => void confirmAnswer()} type="button">
                {busy ? 'Checking…' : 'Confirm this Pin'}
              </button>
            </>
          )}

          {result && revealComplete && !result.completed && (
            <button className="guess-primary-action" onClick={continueGame} type="button">
              Next photograph
            </button>
          )}
        </div>

        {result?.completed && revealComplete && (
          <section className="game-finish">
            <p className="page-kicker">{round.totalRounds} rounds complete</p>
            <h2>{result.totalScore.toLocaleString()} <span>/ {(round.totalRounds * 5000).toLocaleString()}</span></h2>
            {targetChallenge && (
              <p className="game-finish__comparison">
                Shared score: {targetChallenge.score.toLocaleString()}
              </p>
            )}
            <FiveRoundReview onSave={() => void saveReview()} reviews={reviews} saving={savingReview} totalRounds={round.totalRounds} />
            {playedMode === 'random' && randomRun && (
              <div className="random-journey-progress">
                <p className="page-kicker">Random journey</p>
                <strong>{randomProgressBusy ? 'Updating your journey…' : randomJourneyCopy(randomRun)}</strong>
                {!randomProgressBusy && !randomJourneyFinished(randomRun) && <button onClick={() => void beginMode('random')} type="button">Continue Random journey →</button>}
                {randomJourneyCanRank(randomRun) && <p>All places explored. You can now save your cumulative score to the Random leaderboard.</p>}
                {!randomRun.rankable && <p>The photo archive changed since this journey began. This score cannot join the current leaderboard. <button onClick={() => void beginFreshRandom()} type="button">Start a new Random journey</button></p>}
              </div>
            )}
            <div className="game-invitation">
              <p className="page-kicker">Share the same {round.totalRounds}</p>
              <h3>Invite someone to play</h3>
              <p>The invitation keeps the answers hidden until each photograph is played.</p>
              {!sharedChallenge ? (
                <div className="game-invitation__status" role="status">
                  {creatingInvitation ? <p>Preparing your invitation card…</p> : (
                    <button onClick={() => round && void createInvitation(round.sessionId)} type="button">
                      <Share2 size={19} /> Create invitation card
                    </button>
                  )}
                </div>
              ) : (
              <div className="share-card">
                <p>Invitation card · Same {sharedChallenge.totalRounds} photographs</p>
                <strong>{sharedChallenge.score.toLocaleString()} / {(sharedChallenge.totalRounds * 5000).toLocaleString()}</strong>
                {qrCode && <img alt="QR code for the same-five challenge" src={qrCode} />}
                <a href={challengeUrl}>{challengeUrl}</a>
                <div className="share-card__actions">
                  <button disabled={savingInvitation} onClick={() => void saveInvitation()} type="button">
                    <Share2 size={18} /> {savingInvitation ? 'Saving…' : 'Save invitation image'}
                  </button>
                  <button
                    className="share-card__copy"
                    onClick={() => {
                      void navigator.clipboard.writeText(challengeUrl)
                        .then(() => setCopied(true))
                        .catch(() => setInvitationError('The link could not be copied. Select and copy it above.'));
                    }}
                    type="button"
                  >
                    <Copy size={18} /> {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </div>
              )}
              {invitationError && <p className="guess-error" role="alert">{invitationError}</p>}
            </div>
            {playedMode && (
              <section className="leaderboard-preview">
                <p className="page-kicker">Your best journey</p>
                <h3>{playedMode[0].toUpperCase() + playedMode.slice(1)} leaderboard</h3>
                <p>{playedMode === 'random'
                  ? 'Random 只按完成全部照片后的累计总分排行；每组照片不会单独上榜。'
                  : '每个模式只展示你的历史最高分；较低成绩不会覆盖最高分，但本次成绩仍可分享。'}</p>
                {(playedMode !== 'random' || (randomRun && randomJourneyFinished(randomRun))) && (
                  <button disabled={savingLeaderboard} onClick={() => void saveLeaderboard()} type="button">
                    {savingLeaderboard ? 'Saving score…' : 'Save to leaderboard'}
                  </button>
                )}
                {leaderboardError && <p className="guess-error" role="alert">{leaderboardError}</p>}
                {leaderboardResult && (
                  <div className="leaderboard-preview__result" role="status">
                    <p>{leaderboardResultCopy(leaderboardResult)}</p>
                    <p>Your rank: #{leaderboardResult.rank}</p>
                    {leaderboardResult.topThree.length > 0 && <LeaderboardTable entries={leaderboardResult.topThree} />}
                  </div>
                )}
                <p className="leaderboard-preview__links"><AppLink href={`/guess-where/leaderboards/${playedMode}`}>View full leaderboard →</AppLink></p>
              </section>
            )}
          </section>
        )}

        {error && <p className="guess-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
