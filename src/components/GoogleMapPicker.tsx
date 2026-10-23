import { useEffect, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';

import type { GuessPoint } from '../lib/gameApi.ts';
import { interpretPlaceText } from '../lib/gameApi.ts';
import {
  createAnswerCircle,
  createMap,
  createMarker,
  loadGoogleMaps,
  searchGooglePlaces,
  type CircleLike,
  type MapLike,
  type MarkerLike,
  type PlaceCandidate,
} from '../lib/googleMaps.ts';

type CorrectAnswer = GuessPoint & { radiusKm: 1 | 10 | 50 | 100 };

type GoogleMapPickerProps = {
  value: GuessPoint | null;
  onChange: (point: GuessPoint) => void;
  correctAnswer?: CorrectAnswer | null;
  disabled?: boolean;
};

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';
const mapId = import.meta.env.VITE_GOOGLE_MAP_ID?.trim() ?? 'DEMO_MAP_ID';

export function GoogleMapPicker({
  value,
  onChange,
  correctAnswer = null,
  disabled = false,
}: GoogleMapPickerProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLike | null>(null);
  const markerRef = useRef<MarkerLike | null>(null);
  const answerMarkerRef = useRef<MarkerLike | null>(null);
  const circleRef = useRef<CircleLike | null>(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [interpretationNote, setInterpretationNote] = useState('');

  onChangeRef.current = onChange;
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
    const showAnswer = async () => {
      const map = mapRef.current;
      if (!map || mapState !== 'ready') return;

      if (answerMarkerRef.current) answerMarkerRef.current.map = null;
      if (circleRef.current) circleRef.current.map = null;
      answerMarkerRef.current = null;
      circleRef.current = null;

      if (!correctAnswer) {
        map.panTo({ lat: 22, lng: 15 });
        map.setZoom(2);
        return;
      }
      const google = await loadGoogleMaps(apiKey);

      answerMarkerRef.current = await createMarker(google, map, correctAnswer, 'Correct answer');
      circleRef.current = await createAnswerCircle(google, map, correctAnswer);
      map.fitBounds(circleRef.current.getBounds(), 70);
    };

    void showAnswer();
  }, [correctAnswer, mapState]);

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
      <div className="map-picker__canvas" ref={elementRef} />

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
