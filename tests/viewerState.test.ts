import assert from 'node:assert/strict';
import test from 'node:test';

import { createViewerState, moveViewer, setViewerZoom, toggleViewerInfo } from '../src/lib/viewerState.ts';

test('moveViewer wraps around the album and resets zoom and Info', () => {
  const opened = toggleViewerInfo(setViewerZoom(createViewerState(0), 1.75));

  assert.deepEqual(moveViewer(opened, 1, 3), {
    index: 1,
    zoom: 1,
    toolsVisible: true,
    infoVisible: false,
  });
  assert.equal(moveViewer(createViewerState(0), -1, 3).index, 2);
});

test('setViewerZoom clamps the image scale to the supported range', () => {
  assert.equal(setViewerZoom(createViewerState(0), 9).zoom, 2);
  assert.equal(setViewerZoom(createViewerState(0), 0.1).zoom, 1);
});

