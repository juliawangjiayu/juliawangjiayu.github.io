import type { GuessPoint } from './gameApi.ts';

type Listener = { remove(): void };
type LatLngLike = { lat(): number; lng(): number };

export type MapLike = {
  addListener(eventName: string, handler: (event: { latLng?: LatLngLike | null }) => void): Listener;
  fitBounds(bounds: unknown, padding?: number): void;
  panTo(point: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
};

export type MarkerLike = {
  map: MapLike | null;
  position: { lat: number; lng: number } | LatLngLike | null;
};

export type CircleLike = {
  getBounds(): BoundsLike | null;
  map: MapLike | null;
};

export type BoundsLike = {
  extend(point: { lat: number; lng: number }): BoundsLike;
  union(bounds: BoundsLike): BoundsLike;
};

export type PolylineLike = { setMap(map: MapLike | null): void };
export type OverlayLike = {
  onAdd: () => void;
  draw: () => void;
  onRemove: () => void;
  getProjection(): {
    fromLatLngToContainerPixel(point: { lat: number; lng: number }): { x: number; y: number } | null;
  };
  setMap(map: MapLike | null): void;
};

type MapsLibrary = {
  Map: new (
    element: HTMLElement,
    options: {
      center: { lat: number; lng: number };
      zoom: number;
      mapId: string;
      clickableIcons: boolean;
      streetViewControl: boolean;
      mapTypeControl: boolean;
      fullscreenControl: boolean;
    },
  ) => MapLike;
  Circle: new (options: {
    map: MapLike;
    center: { lat: number; lng: number };
    radius: number;
    fillColor: string;
    fillOpacity: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeWeight: number;
  }) => CircleLike;
  Polyline: new (options: {
    map: MapLike;
    path: { lat: number; lng: number }[];
    strokeColor: string;
    strokeOpacity: number;
    strokeWeight: number;
    geodesic: boolean;
  }) => PolylineLike;
  OverlayView: new () => OverlayLike;
};

type MarkerLibrary = {
  AdvancedMarkerElement: new (options: {
    map: MapLike;
    position: { lat: number; lng: number };
    title: string;
    content?: HTMLElement;
  }) => MarkerLike;
};

type Place = {
  displayName?: string;
  formattedAddress?: string;
  location?: LatLngLike | null;
};

type PlacesLibrary = {
  Place: {
    searchByText(request: {
      textQuery: string;
      fields: string[];
      language: string;
      maxResultCount: number;
    }): Promise<{ places: Place[] }>;
  };
};

type GoogleMapsApi = {
  maps: {
    LatLngBounds: new () => BoundsLike;
    importLibrary(name: 'maps'): Promise<MapsLibrary>;
    importLibrary(name: 'marker'): Promise<MarkerLibrary>;
    importLibrary(name: 'places'): Promise<PlacesLibrary>;
  };
};

type GoogleWindow = Window & { google?: GoogleMapsApi };

export type PlaceCandidate = {
  name: string;
  address: string;
  point: GuessPoint;
};

export class MissingGoogleMapsKeyError extends Error {
  constructor() {
    super('Google Maps is not configured yet.');
    this.name = 'MissingGoogleMapsKeyError';
  }
}

let loaderPromise: Promise<GoogleMapsApi> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  const googleWindow = window as GoogleWindow;

  if (googleWindow.google?.maps) return Promise.resolve(googleWindow.google);
  if (!apiKey) return Promise.reject(new MissingGoogleMapsKeyError());
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const callbackName = `__juliaMapsReady_${Date.now()}`;
    const callbackTarget = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');

    callbackTarget[callbackName] = () => {
      delete callbackTarget[callbackName];
      const loadedGoogle = (window as GoogleWindow).google;

      if (loadedGoogle?.maps) resolve(loadedGoogle);
      else reject(new Error('Google Maps loaded without its map library.'));
    };

    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&v=weekly&loading=async&libraries=places,marker&callback=${callbackName}`;
    script.onerror = () => {
      delete callbackTarget[callbackName];
      loaderPromise = null;
      reject(new Error('Google Maps could not be loaded.'));
    };
    document.head.append(script);
  });

  return loaderPromise;
}

export async function searchGooglePlaces(
  apiKey: string,
  textQuery: string,
): Promise<PlaceCandidate[]> {
  const google = await loadGoogleMaps(apiKey);
  const { Place } = await google.maps.importLibrary('places');
  const { places } = await Place.searchByText({
    textQuery,
    fields: ['displayName', 'formattedAddress', 'location'],
    language: 'zh-CN',
    maxResultCount: 6,
  });

  return places.flatMap((place) => {
    if (!place.location) return [];

    return [
      {
        name: place.displayName ?? place.formattedAddress ?? textQuery,
        address: place.formattedAddress ?? '',
        point: {
          latitude: place.location.lat(),
          longitude: place.location.lng(),
        },
      },
    ];
  });
}

export async function createMap(
  element: HTMLElement,
  apiKey: string,
  mapId: string,
): Promise<{ google: GoogleMapsApi; map: MapLike }> {
  const google = await loadGoogleMaps(apiKey);
  const { Map } = await google.maps.importLibrary('maps');
  const map = new Map(element, {
    center: { lat: 22, lng: 15 },
    zoom: 2,
    mapId: mapId || 'DEMO_MAP_ID',
    clickableIcons: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  });

  return { google, map };
}

export async function createMarker(
  google: GoogleMapsApi,
  map: MapLike,
  point: GuessPoint,
  title: string,
  kind: 'guess' | 'answer' = 'guess',
): Promise<MarkerLike> {
  const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');
  const content = document.createElement('div');
  content.className = `guess-map-pin guess-map-pin--${kind}`;
  content.setAttribute('aria-hidden', 'true');
  return new AdvancedMarkerElement({
    map,
    position: { lat: point.latitude, lng: point.longitude },
    title,
    content,
  });
}

export async function createAnswerConnection(
  google: GoogleMapsApi,
  map: MapLike,
  answer: GuessPoint & { radiusKm: number },
  guess: GuessPoint,
): Promise<PolylineLike> {
  const { Polyline } = await google.maps.importLibrary('maps');
  const path = [
    { lat: answer.latitude, lng: answer.longitude },
    { lat: guess.latitude, lng: guess.longitude },
  ];
  const line = new Polyline({
    map,
    path,
    strokeColor: '#655477',
    strokeOpacity: 0.85,
    strokeWeight: 3,
    geodesic: true,
  });
  return line;
}

export function showBothPins(
  google: GoogleMapsApi,
  map: MapLike,
  answer: GuessPoint,
  guess: GuessPoint,
  answerBounds: BoundsLike | null,
): void {
  const bounds = new google.maps.LatLngBounds()
    .extend({ lat: answer.latitude, lng: answer.longitude })
    .extend({ lat: guess.latitude, lng: guess.longitude });
  if (answerBounds) bounds.union(answerBounds);
  map.fitBounds(bounds, 100);
}

export async function projectRevealPoints(
  google: GoogleMapsApi,
  map: MapLike,
  startPoint: GuessPoint,
  endPoint: GuessPoint,
  onReady: (start: { x: number; y: number }, end: { x: number; y: number }) => void,
): Promise<OverlayLike> {
  const { OverlayView } = await google.maps.importLibrary('maps');
  const overlay = new OverlayView();
  overlay.onAdd = () => {};
  overlay.draw = () => {
    const projection = overlay.getProjection();
    const start = projection.fromLatLngToContainerPixel({ lat: startPoint.latitude, lng: startPoint.longitude });
    const end = projection.fromLatLngToContainerPixel({ lat: endPoint.latitude, lng: endPoint.longitude });
    if (start && end) onReady(start, end);
  };
  overlay.onRemove = () => {};
  overlay.setMap(map);
  return overlay;
}

export async function createAnswerCircle(
  google: GoogleMapsApi,
  map: MapLike,
  point: GuessPoint & { radiusKm: number },
): Promise<CircleLike> {
  const { Circle } = await google.maps.importLibrary('maps');
  return new Circle({
    map,
    center: { lat: point.latitude, lng: point.longitude },
    radius: point.radiusKm * 1000,
    fillColor: '#92542f',
    fillOpacity: 0.16,
    strokeColor: '#92542f',
    strokeOpacity: 0.8,
    strokeWeight: 2,
  });
}
