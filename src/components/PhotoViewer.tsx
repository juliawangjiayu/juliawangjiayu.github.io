import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Minus, Plus } from 'lucide-react';
import type { PublicPhoto } from '../content/types.ts';
import {
  calculateViewerPanBounds,
  createViewerState,
  moveViewer,
  setViewerPan,
  setViewerZoomWithinBounds,
  toggleViewerInfo,
  toggleViewerTools,
} from '../lib/viewerState.ts';
import { resolveSwipe } from '../lib/swipe.ts';
import { PhotoInfoCard } from './PhotoInfoCard.tsx';

type PhotoViewerProps = {
  photos: PublicPhoto[];
  collectionTitle: string;
};

export function PhotoViewer({ photos, collectionTitle }: PhotoViewerProps) {
  const [state, setState] = useState(() => createViewerState());
  const [viewMode, setViewMode] = useState<'album' | 'overview'>('album');
  const pointerStart = useRef<number | null>(null);
  const panGesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const suppressImageClickUntil = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const count = photos.length;
  const current = photos[state.index];
  const previous = photos[(state.index - 1 + count) % count];
  const next = photos[(state.index + 1) % count];

  const move = (direction: -1 | 1) => {
    setState((value) => moveViewer(value, direction, count));
  };

  const changeViewMode = (mode: 'album' | 'overview') => {
    if (mode === viewMode) return;
    if (mode === 'overview') {
      setState((value) => ({
        ...value,
        zoom: 1,
        panX: 0,
        panY: 0,
        toolsVisible: false,
        infoVisible: false,
      }));
    } else {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
    setViewMode(mode);
  };

  const selectPhoto = (index: number) => {
    setState(createViewerState(index));
    setViewMode('album');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const panBounds = (zoom: number) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image) return { maxX: 0, maxY: 0 };
    return calculateViewerPanBounds(
      viewport.clientWidth,
      viewport.clientHeight,
      image.clientWidth,
      image.clientHeight,
      zoom,
    );
  };

  const zoomBy = (amount: number) => {
    setState((value) => {
      const zoom = Math.min(2, Math.max(1, value.zoom + amount));
      return setViewerZoomWithinBounds(value, zoom, panBounds(zoom));
    });
  };

  useEffect(() => {
    setState(createViewerState());
    setViewMode('album');
    setIsDragging(false);
    panGesture.current = null;
    pointerStart.current = null;
  }, [collectionTitle]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (viewMode !== 'album') return;
      if (event.key === 'ArrowLeft') move(-1);
      else if (event.key === 'ArrowRight') move(1);
      else if (event.key === 'Escape' && state.infoVisible) {
        setState((value) => toggleViewerInfo(value));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [count, state.infoVisible, viewMode]);

  if (!current) {
    return <p className="viewer-empty">This Collection has no published photographs yet.</p>;
  }

  const onPointerUp = (event: React.PointerEvent) => {
    const gesture = panGesture.current;
    if (gesture?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (gesture.moved) suppressImageClickUntil.current = Date.now() + 250;
      panGesture.current = null;
      setIsDragging(false);
      return;
    }
    if (pointerStart.current === null || state.zoom > 1) return;
    const direction = resolveSwipe(pointerStart.current, event.clientX);
    pointerStart.current = null;
    if (direction === 'previous') move(-1);
    if (direction === 'next') move(1);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (state.zoom <= 1) {
      pointerStart.current = event.clientX;
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    setIsDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = panGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - gesture.lastX;
    const deltaY = event.clientY - gesture.lastY;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 3) {
      gesture.moved = true;
    }
    setState((value) => setViewerPan(
      value,
      value.panX + deltaX,
      value.panY + deltaY,
      panBounds(value.zoom),
    ));
  };

  const cancelPointerGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panGesture.current = null;
    pointerStart.current = null;
    setIsDragging(false);
  };

  return (
    <section
      className={`photo-viewer${viewMode === 'overview' ? ' is-overview' : ''}`}
      aria-label={`${collectionTitle} photo viewer`}
    >
      <div className="viewer-mode-switch" role="group" aria-label="Choose photo view">
        <button
          className={viewMode === 'album' ? 'is-active' : ''}
          type="button"
          onClick={() => changeViewMode('album')}
          aria-pressed={viewMode === 'album'}
        >
          Album
        </button>
        <button
          className={viewMode === 'overview' ? 'is-active' : ''}
          type="button"
          onClick={() => changeViewMode('overview')}
          aria-pressed={viewMode === 'overview'}
        >
          Overview
        </button>
      </div>

      {viewMode === 'overview' ? (
        <div className="viewer-overview" aria-label="Photographs in this Collection">
          {photos.map((photo, index) => (
            <button
              className={`viewer-overview__tile${index === state.index ? ' is-current' : ''}`}
              key={photo.id}
              type="button"
              onClick={() => selectPhoto(index)}
              aria-label={`Open photograph ${index + 1} of ${count}`}
              aria-current={index === state.index ? 'true' : undefined}
            >
              <span className="viewer-overview__image">
                <img
                  src={photo.image.thumbnail}
                  alt=""
                  width={photo.image.width}
                  height={photo.image.height}
                  loading="lazy"
                  aria-hidden="true"
                />
              </span>
              <span className="viewer-overview__caption">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <time dateTime={photo.takenAt}>{photo.takenAt}</time>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {count > 1 && (
            <button
              className="viewer-side viewer-side--previous"
              type="button"
              onClick={() => move(-1)}
              aria-label="Previous photograph"
            >
              <img src={previous.image.thumbnail} alt="" aria-hidden="true" />
              <ChevronLeft aria-hidden="true" />
            </button>
          )}

          <div className={state.infoVisible ? 'viewer-center has-info' : 'viewer-center'}>
            <div
              className={`viewer-current${state.zoom > 1 ? ' is-zoomed' : ''}${isDragging ? ' is-dragging' : ''}`}
              ref={viewportRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={cancelPointerGesture}
            >
              <button
                className="viewer-current__image-button"
                type="button"
                onClick={() => {
                  if (Date.now() < suppressImageClickUntil.current) return;
                  setState((value) => toggleViewerTools(value));
                }}
                aria-label={state.toolsVisible ? 'Hide photo tools' : 'Show photo tools'}
              >
                <img
                  ref={imageRef}
                  src={current.image.src}
                  alt={current.description || `Photograph ${state.index + 1} from ${collectionTitle}`}
                  width={current.image.width}
                  height={current.image.height}
                  draggable={false}
                  style={{ transform: `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})` }}
                />
              </button>
            </div>

            {state.toolsVisible && (
              <div className="viewer-tools" aria-label="Photo tools">
                <button
                  type="button"
                  onClick={() => zoomBy(0.25)}
                  disabled={state.zoom >= 2}
                  aria-label="Zoom in"
                >
                  <Plus size={22} strokeWidth={1.7} />
                </button>
                <button
                  type="button"
                  onClick={() => zoomBy(-0.25)}
                  disabled={state.zoom <= 1}
                  aria-label="Zoom out"
                >
                  <Minus size={22} strokeWidth={1.7} />
                </button>
                <button
                  className={state.infoVisible ? 'is-active' : ''}
                  type="button"
                  onClick={() => setState((value) => toggleViewerInfo(value))}
                  aria-label="Toggle photo information"
                  aria-pressed={state.infoVisible}
                >
                  <Info size={21} strokeWidth={1.7} />
                  <span>Info</span>
                </button>
              </div>
            )}

            {state.infoVisible && (
              <PhotoInfoCard photo={current} onClose={() => setState((value) => toggleViewerInfo(value))} />
            )}
          </div>

          {count > 1 && (
            <button
              className="viewer-side viewer-side--next"
              type="button"
              onClick={() => move(1)}
              aria-label="Next photograph"
            >
              <img src={next.image.thumbnail} alt="" aria-hidden="true" />
              <ChevronRight aria-hidden="true" />
            </button>
          )}

          <div className="viewer-footer" aria-live="polite">
            <span>{String(state.index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
            {state.zoom > 1 && <span>{Math.round(state.zoom * 100)}%</span>}
          </div>
        </>
      )}
    </section>
  );
}

