import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Minus, Plus } from 'lucide-react';
import type { PublicPhoto } from '../content/types.ts';
import {
  createViewerState,
  moveViewer,
  setViewerZoom,
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
  const pointerStart = useRef<number | null>(null);
  const count = photos.length;
  const current = photos[state.index];
  const previous = photos[(state.index - 1 + count) % count];
  const next = photos[(state.index + 1) % count];

  const move = (direction: -1 | 1) => {
    setState((value) => moveViewer(value, direction, count));
  };

  useEffect(() => {
    setState(createViewerState());
  }, [collectionTitle]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') move(-1);
      else if (event.key === 'ArrowRight') move(1);
      else if (event.key === 'Escape' && state.infoVisible) {
        setState((value) => toggleViewerInfo(value));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [count, state.infoVisible]);

  if (!current) {
    return <p className="viewer-empty">This Collection has no published photographs yet.</p>;
  }

  const onPointerUp = (event: React.PointerEvent) => {
    if (pointerStart.current === null || state.zoom > 1) return;
    const direction = resolveSwipe(pointerStart.current, event.clientX);
    pointerStart.current = null;
    if (direction === 'previous') move(-1);
    if (direction === 'next') move(1);
  };

  return (
    <section className="photo-viewer" aria-label={`${collectionTitle} photo viewer`}>
      {count > 1 && (
        <button className="viewer-side viewer-side--previous" type="button" onClick={() => move(-1)} aria-label="Previous photograph">
          <img src={previous.image.thumbnail} alt="" aria-hidden="true" />
          <ChevronLeft aria-hidden="true" />
        </button>
      )}

      <div className={state.infoVisible ? 'viewer-center has-info' : 'viewer-center'}>
        <div
          className={state.zoom > 1 ? 'viewer-current is-zoomed' : 'viewer-current'}
          onPointerDown={(event) => { pointerStart.current = event.clientX; }}
          onPointerUp={onPointerUp}
        >
          <button
            className="viewer-current__image-button"
            type="button"
            onClick={() => setState((value) => toggleViewerTools(value))}
            aria-label={state.toolsVisible ? 'Hide photo tools' : 'Show photo tools'}
          >
            <img
              src={current.image.src}
              alt={current.description || `Photograph ${state.index + 1} from ${collectionTitle}`}
              width={current.image.width}
              height={current.image.height}
              style={{ transform: `scale(${state.zoom})` }}
            />
          </button>
        </div>

        {state.toolsVisible && (
          <div className="viewer-tools" aria-label="Photo tools">
            <button
              type="button"
              onClick={() => setState((value) => setViewerZoom(value, value.zoom + 0.25))}
              disabled={state.zoom >= 2}
              aria-label="Zoom in"
            >
              <Plus size={22} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              onClick={() => setState((value) => setViewerZoom(value, value.zoom - 0.25))}
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
        <button className="viewer-side viewer-side--next" type="button" onClick={() => move(1)} aria-label="Next photograph">
          <img src={next.image.thumbnail} alt="" aria-hidden="true" />
          <ChevronRight aria-hidden="true" />
        </button>
      )}

      <div className="viewer-footer" aria-live="polite">
        <span>{String(state.index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
        {state.zoom > 1 && <span>{Math.round(state.zoom * 100)}%</span>}
      </div>
    </section>
  );
}

