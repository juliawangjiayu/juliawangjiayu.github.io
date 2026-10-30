import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MapPin, Search } from 'lucide-react';

import type { GuessPoint } from '../lib/gameApi.ts';
import { interpretPlaceText } from '../lib/gameApi.ts';
import {
  createAnswerCircle,
  createAnswerConnection,
  createMap,
  createMarker,
  loadGoogleMaps,
  projectRevealPoints,
  showBothPins,
  searchGooglePlaces,
  type CircleLike,
  type MapLike,
  type MarkerLike,
  type OverlayLike,
  type PolylineLike,
  type PlaceCandidate,
} from '../lib/googleMaps.ts';
import { WitchMotif } from './SectionMotifs.tsx';

type CorrectAnswer = GuessPoint & { radiusKm: 1 | 10 | 50 | 100 };
type RevealFlight =
  | { kind: 'map'; start: { x: number; y: number }; end: { x: number; y: number } }
  | { kind: 'route' };

type GoogleMapPickerProps = {
  value: GuessPoint | null;
  onChange: (point: GuessPoint) => void;
  correctAnswer?: CorrectAnswer | null;
  disabled?: boolean;
  onRevealComplete?: () => void;
};

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';
const mapId = import.meta.env.VITE_GOOGLE_MAP_ID?.trim() ?? 'DEMO_MAP_ID';

export function GoogleMapPicker({
  value,
  onChange,
  correctAnswer = null,
  disabled = false,
  onRevealComplete,
}: GoogleMapPickerProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLike | null>(null);
  const markerRef = useRef<MarkerLike | null>(null);
  const answerMarkerRef = useRef<MarkerLike | null>(null);
  const circleRef = useRef<CircleLike | null>(null);
  const lineRef = useRef<PolylineLike | null>(null);
  const flightOverlayRef = useRef<OverlayLike | null>(null);
  const onChangeRef = useRef(onChange);
  const onRevealCompleteRef = useRef(onRevealComplete);
  const finishRevealRef = useRef<() => void>(() => {});
  const disabledRef = useRef(disabled);
  const [flight, setFlight] = useState<RevealFlight | null>(null);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [interpretationNote, setInterpretationNote] = useState('');

  onChangeRef.current = onChange;
  onRevealCompleteRef.current = onRevealComplete;
  disabledRef.current = disabled;

  useEffect(() => {
    let cancelled = false;
    let listener: { remove(): void } | null = null;

    if (!apiKey) {
      setMapState('missing-key');
      return;
    }

    const initialize = async () => {
      if (!elementRef.current) return;

      try {
        const { map } = await createMap(elementRef.current, apiKey, mapId);

        if (cancelled) return;
        mapRef.current = map;
        listener = map.addListener('click', (event) => {
          if (disabledRef.current || !event.latLng) return;
          onChangeRef.current({
            latitude: event.latLng.lat(),
            longitude: event.latLng.lng(),
          });
        });
        setMapState('ready');
      } catch {
        if (!cancelled) setMapState('error');
      }
    };

    void initialize();
    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, []);

  useEffect(() => {
    const updateMarker = async () => {
      const map = mapRef.current;
      if (!map || mapState !== 'ready') return;

      if (!value) {
        if (markerRef.current) markerRef.current.map = null;
        markerRef.current = null;
        return;
      }
      const google = await loadGoogleMaps(apiKey);

      if (!markerRef.current) {
        markerRef.current = await createMarker(google, map, value, 'Your pin');
      } else {
        markerRef.current.position = { lat: value.latitude, lng: value.longitude };
      }
    };

    void updateMarker();
  }, [mapState, value]);

  useEffect(() => {
    let cancelled = false;
    let idleListener: { remove(): void } | null = null;
    let dragListener: { remove(): void } | null = null;
    let zoomListener: { remove(): void } | null = null;
    let flightStartTimer: number | null = null;
    let zoomListenerTimer: number | null = null;
    let finished = false;
    const finish = () => {
      if (cancelled || finished) return;
      finished = true;
      idleListener?.remove();
      dragListener?.remove();
      zoomListener?.remove();
      flightOverlayRef.current?.setMap(null);
      flightOverlayRef.current = null;
      setFlight(null);
      onRevealCompleteRef.current?.();
    };
    finishRevealRef.current = finish;
    const showAnswer = async () => {
      const map = mapRef.current;
      if (!map || mapState !== 'ready') return;

      if (answerMarkerRef.current) answerMarkerRef.current.map = null;
      if (circleRef.current) circleRef.current.map = null;
      lineRef.current?.setMap(null);
      flightOverlayRef.current?.setMap(null);
      answerMarkerRef.current = null;
      circleRef.current = null;
      lineRef.current = null;
      flightOverlayRef.current = null;
      setFlight(null);

      if (!correctAnswer) return;
      try {
        const google = await loadGoogleMaps(apiKey);
        const marker = await createMarker(google, map, correctAnswer, 'Correct answer', 'answer');
        if (cancelled) { marker.map = null; return; }
        answerMarkerRef.current = marker;
        const circle = await createAnswerCircle(google, map, correctAnswer);
        if (cancelled) { circle.map = null; return; }
        circleRef.current = circle;
        if (!value) { finish(); return; }

        let flightQueued = false;
        const startFlight = () => {
          idleListener?.remove();
          idleListener = null;
          if (cancelled || finished || flightQueued) return;
          void projectRevealPoints(google, map, value, correctAnswer, (start, end) => {
            if (cancelled || finished || flightQueued) return;
            const viewport = elementRef.current;
            const outsideViewport = !viewport || [start, end].some((point) =>
              point.x < 0 || point.y < 0 || point.x > viewport.clientWidth || point.y > viewport.clientHeight
            );
            flightQueued = true;
            setFlight(outsideViewport ? { kind: 'route' } : { kind: 'map', start, end });
            dragListener = map.addListener('dragstart', finish);
            zoomListenerTimer = window.setTimeout(() => {
              if (!cancelled && !finished) zoomListener = map.addListener('zoom_changed', finish);
            }, 100);
          }).then((overlay) => {
            if (cancelled || finished) overlay.setMap(null);
            else flightOverlayRef.current = overlay;
          }).catch((error) => {
            console.warn('Guess Where flight overlay failed:', error);
            finish();
          });
        };
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          idleListener = map.addListener('idle', startFlight);
          flightStartTimer = window.setTimeout(startFlight, 350);
        }
        lineRef.current = await createAnswerConnection(google, map, correctAnswer, value);
        if (cancelled) { lineRef.current?.setMap(null); return; }
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
      } catch (error) {
        console.warn('Guess Where answer reveal failed:', error);
        finish();
      }
    };

    void showAnswer();
    return () => {
      cancelled = true;
      idleListener?.remove();
      dragListener?.remove();
      zoomListener?.remove();
      if (flightStartTimer !== null) window.clearTimeout(flightStartTimer);
      if (zoomListenerTimer !== null) window.clearTimeout(zoomListenerTimer);
      flightOverlayRef.current?.setMap(null);
      flightOverlayRef.current = null;
      lineRef.current?.setMap(null);
      lineRef.current = null;
    };
  }, [correctAnswer, mapState, value]);

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed || !apiKey) return;

    setSearching(true);
    setSearchError('');
    setInterpretationNote('');
    setCandidates([]);
    try {
      const directResults = await searchGooglePlaces(apiKey, trimmed);
      if (directResults.length > 0) {
        setCandidates(directResults);
        return;
      }

      const interpretation = await interpretPlaceText(trimmed);
      if (interpretation.status === 'insufficient' || !interpretation.normalizedQuery.trim()) {
        setCandidates([]);
        setSearchError(interpretation.clarification || 'Try adding a city, region or landmark clue.');
        return;
      }

      const interpretedResults = await searchGooglePlaces(apiKey, interpretation.normalizedQuery);
      setCandidates(interpretedResults);
      setInterpretationNote(`Interpreted as “${interpretation.normalizedQuery}”`);
      if (interpretedResults.length === 0) {
        setSearchError('No close matches yet. Try adding a city or region.');
      }
    } catch {
      setCandidates([]);
      setSearchError('No match yet. Add a city or region, or place a Pin manually.');
    } finally {
      setSearching(false);
    }
  };

  const chooseCandidate = (candidate: PlaceCandidate) => {
    onChange(candidate.point);
    setCandidates([]);
    setQuery(candidate.name);
    mapRef.current?.panTo({ lat: candidate.point.latitude, lng: candidate.point.longitude });
    mapRef.current?.setZoom(13);
  };

  return (
    <section className="map-picker" aria-label="Choose a place on the map">
      <form
        className="place-search"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <Search aria-hidden="true" size={19} strokeWidth={1.8} />
        <input
          aria-label="Search for a place"
          disabled={disabled || mapState === 'missing-key'}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a city, district, landmark or description"
          type="search"
          value={query}
        />
        <button disabled={disabled || searching || !query.trim()} type="submit">
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {candidates.length > 0 && (
        <div className="place-results" role="listbox" aria-label="Place matches">
          {candidates.map((candidate) => (
            <button
              key={`${candidate.point.latitude}:${candidate.point.longitude}`}
              onClick={() => chooseCandidate(candidate)}
              role="option"
              type="button"
            >
              <MapPin aria-hidden="true" size={18} />
              <span>
                <strong>{candidate.name}</strong>
                {candidate.address && <small>{candidate.address}</small>}
              </span>
            </button>
          ))}
        </div>
      )}

      {(searchError || interpretationNote) && (
        <p className="map-picker__message">{searchError || interpretationNote}</p>
      )}
      <div className="map-picker__map-shell">
        <div className="map-picker__canvas" ref={elementRef} />
        {correctAnswer && value && mapState === 'ready' && (
          <button
            className="map-picker__view-both"
            onClick={() => {
              const map = mapRef.current;
              if (!map) return;
              void loadGoogleMaps(apiKey).then((google) => {
                finishRevealRef.current();
                showBothPins(google, map, correctAnswer, value, circleRef.current?.getBounds() ?? null);
              });
            }}
            type="button"
          >
            Check correct pin
          </button>
        )}
        {flight?.kind === 'map' && (
          <div
            aria-hidden="true"
            className="map-picker__witch-flight"
            onAnimationEnd={() => finishRevealRef.current()}
            style={{
              left: flight.start.x,
              top: flight.start.y,
              '--flight-x': `${flight.end.x - flight.start.x}px`,
              '--flight-y': `${flight.end.y - flight.start.y}px`,
            } as CSSProperties}
          >
            <WitchMotif />
          </div>
        )}
        {flight?.kind === 'route' && (
          <div aria-hidden="true" className="map-picker__flight-route">
            <span className="map-picker__flight-route-stop">
              <i className="round-reveal__pin round-reveal__pin--guess" />
              Your Pin
            </span>
            <span className="map-picker__flight-route-trail" />
            <span className="map-picker__flight-route-witch" onAnimationEnd={() => finishRevealRef.current()}>
              <WitchMotif />
            </span>
            <span className="map-picker__flight-route-stop">
              <i className="round-reveal__pin round-reveal__pin--answer" />
              Correct answer
            </span>
          </div>
        )}
      </div>

      {mapState === 'loading' && apiKey && (
        <div className="map-picker__overlay">Loading the map…</div>
      )}
      {mapState === 'missing-key' && (
        <div className="map-picker__overlay map-picker__overlay--notice">
          <strong>Google Maps needs an API key.</strong>
          <span>Add it to the local environment, then reload this page.</span>
        </div>
      )}
      {mapState === 'error' && (
        <div className="map-picker__overlay map-picker__overlay--notice">
          <strong>The map could not be loaded.</strong>
          <span>Check the API key restrictions and that Maps JavaScript API is enabled.</span>
        </div>
      )}
    </section>
  );
}
