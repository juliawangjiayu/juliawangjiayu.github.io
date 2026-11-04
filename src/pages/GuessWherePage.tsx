import { useEffect, useRef, useState } from 'react';
import { Copy, Minus, Plus, Share2 } from 'lucide-react';

import { GoogleMapPicker } from '../components/GoogleMapPicker.tsx';
import { FiveRoundReview } from '../components/FiveRoundReview.tsx';
import { FlightTrail, WitchMotif } from '../components/SectionMotifs.tsx';
import {
  createChallenge,
  getChallenge,
  startChallenge,
  startGame,
  submitAnswer,
  type AnswerResult,
  type ChallengeSummary,
  type GameMode,
  type GuessPoint,
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

const modes: Array<{ id: GameMode; name: string; note: string }> = [
  { id: 'easy', name: 'Easy', note: 'Closer landmarks and wider contexts' },
  { id: 'medium', name: 'Medium', note: 'A balanced set of five places' },
  { id: 'hard', name: 'Hard', note: 'Small clues and unfamiliar viewpoints' },
  { id: 'random', name: 'Random', note: 'Five places from the full archive' },
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
      const started = await startGame(mode);
      activeSessionRef.current = started.sessionId;
      setRound(started);
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
      setError(caught instanceof Error ? caught.message : 'The game could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const beginChallenge = async () => {
    if (!challengeId) return;
    setBusy(true);
    setError('');
    try {
      const started = await startChallenge(challengeId);
      activeSessionRef.current = started.round.sessionId;
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
  };

  useEffect(() => {
    if (result?.completed && revealComplete && round && !sharedChallenge && !invitationError) {
      void createInvitation(round.sessionId);
    }
  }, [result?.completed, revealComplete, round?.sessionId, sharedChallenge, invitationError]);

  const saveReview = async () => {
    setSavingReview(true);
    setError('');
    try {
      await downloadReviewCard(buildReviewCardData(reviews, totalScore));
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
          <p className="page-kicker">Five photographs · One world</p>
          <h1>Guess Where</h1>
          <p>Study the photograph, search if you need to, then place one final Pin.</p>
          <WitchMotif className="guess-intro__witch" />
        </div>

        {challengeId && targetChallenge ? (
          <section className="challenge-invite">
            <p className="page-kicker">Same five photographs</p>
            <strong>{targetChallenge.score.toLocaleString()} / 25,000</strong>
            <p>Play the exact same five rounds and compare your result.</p>
            <button disabled={busy} onClick={() => void beginChallenge()} type="button">
              {busy ? 'Starting…' : 'Start challenge'}
            </button>
          </section>
        ) : (
          <div className="guess-modes" aria-label="Game modes">
            {modes.map((mode) => (
              <button
                className="guess-mode"
                disabled={busy || Boolean(challengeId)}
                key={mode.id}
                onClick={() => void beginMode(mode.id)}
                type="button"
              >
                <span>{mode.name}</span>
                <small>{mode.note}</small>
              </button>
            ))}
          </div>
        )}
        {busy && !targetChallenge && <p className="guess-intro__status">Connecting to the game…</p>}
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
            <p className="page-kicker">Five rounds complete</p>
            <h2>{result.totalScore.toLocaleString()} <span>/ 25,000</span></h2>
            {targetChallenge && (
              <p className="game-finish__comparison">
                Shared score: {targetChallenge.score.toLocaleString()}
              </p>
            )}
            <FiveRoundReview onSave={() => void saveReview()} reviews={reviews} saving={savingReview} />
            <div className="game-invitation">
              <p className="page-kicker">Share the same five</p>
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
                <p>Invitation card · Same five photographs</p>
                <strong>{sharedChallenge.score.toLocaleString()} / 25,000</strong>
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
          </section>
        )}

        {error && <p className="guess-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
