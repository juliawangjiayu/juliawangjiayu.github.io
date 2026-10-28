import assert from 'node:assert/strict';
import test from 'node:test';

import * as viewerState from '../src/lib/viewerState.ts';

const { createViewerState, moveViewer, setViewerZoom, toggleViewerInfo } = viewerState;

test('moveViewer wraps around the album and resets zoom and Info', () => {
  const opened = toggleViewerInfo(setViewerZoom(createViewerState(0), 1.75));

  assert.deepEqual(moveViewer(opened, 1, 3), {
    index: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    toolsVisible: true,
    infoVisible: false,
  });
  assert.equal(moveViewer(createViewerState(0), -1, 3).index, 2);
});

test('setViewerZoom clamps the image scale to the supported range', () => {
  assert.equal(setViewerZoom(createViewerState(0), 9).zoom, 2);
  assert.equal(setViewerZoom(createViewerState(0), 0.1).zoom, 1);
});

test('setViewerZoom resets the selected area when returning to the original size', () => {
  const panned = { ...createViewerState(0), zoom: 1.5, panX: 86, panY: -42 };

  assert.deepEqual(setViewerZoom(panned, 1), {
    ...panned,
    zoom: 1,
    panX: 0,
    panY: 0,
    toolsVisible: true,
  });
});

test('setViewerPan moves within the zoomed image and clamps blank space out of view', () => {
  const setViewerPan = (viewerState as unknown as {
    setViewerPan?: (
      state: ReturnType<typeof createViewerState>,
      x: number,
      y: number,
      bounds: { maxX: number; maxY: number },
    ) => ReturnType<typeof createViewerState>;
  }).setViewerPan;

  assert.equal(typeof setViewerPan, 'function');
  const moved = setViewerPan!(setViewerZoom(createViewerState(), 1.5), 180, -90, {
    maxX: 120,
    maxY: 60,
  });

  assert.equal(moved.panX, 120);
  assert.equal(moved.panY, -60);
});

test('calculateViewerPanBounds measures the draggable overflow around the image center', () => {
  const calculateViewerPanBounds = (viewerState as unknown as {
    calculateViewerPanBounds?: (
      viewportWidth: number,
      viewportHeight: number,
      imageWidth: number,
      imageHeight: number,
      zoom: number,
    ) => { maxX: number; maxY: number };
  }).calculateViewerPanBounds;

  assert.equal(typeof calculateViewerPanBounds, 'function');
  assert.deepEqual(calculateViewerPanBounds!(600, 400, 600, 400, 1.5), {
    maxX: 150,
    maxY: 100,
  });
});

test('setViewerZoomWithinBounds keeps a panned image inside the newly zoomed bounds', () => {
  const setViewerZoomWithinBounds = (viewerState as unknown as {
    setViewerZoomWithinBounds?: (
      state: ReturnType<typeof createViewerState>,
      zoom: number,
      bounds: { maxX: number; maxY: number },
    ) => ReturnType<typeof createViewerState>;
  }).setViewerZoomWithinBounds;

  assert.equal(typeof setViewerZoomWithinBounds, 'function');
  const panned = { ...createViewerState(), zoom: 2, panX: 140, panY: -90 };

  assert.deepEqual(setViewerZoomWithinBounds!(panned, 1.25, { maxX: 45, maxY: 20 }), {
    ...panned,
    zoom: 1.25,
    panX: 45,
    panY: -20,
    toolsVisible: true,
  });
});

