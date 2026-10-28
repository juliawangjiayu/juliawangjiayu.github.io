export type ViewerState = {
  index: number;
  zoom: number;
  panX: number;
  panY: number;
  toolsVisible: boolean;
  infoVisible: boolean;
};

export type ViewerPanBounds = {
  maxX: number;
  maxY: number;
};

export function createViewerState(index = 0): ViewerState {
  return { index, zoom: 1, panX: 0, panY: 0, toolsVisible: false, infoVisible: false };
}

export function moveViewer(state: ViewerState, direction: -1 | 1, count: number): ViewerState {
  if (count <= 0) return state;
  return {
    ...state,
    index: (state.index + direction + count) % count,
    zoom: 1,
    panX: 0,
    panY: 0,
    infoVisible: false,
  };
}

export function setViewerZoom(state: ViewerState, zoom: number): ViewerState {
  const nextZoom = Math.min(2, Math.max(1, zoom));
  return {
    ...state,
    zoom: nextZoom,
    panX: nextZoom === 1 ? 0 : state.panX,
    panY: nextZoom === 1 ? 0 : state.panY,
    toolsVisible: true,
  };
}

export function calculateViewerPanBounds(
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
  zoom: number,
): ViewerPanBounds {
  return {
    maxX: Math.max(0, (imageWidth * zoom - viewportWidth) / 2),
    maxY: Math.max(0, (imageHeight * zoom - viewportHeight) / 2),
  };
}

export function setViewerPan(
  state: ViewerState,
  panX: number,
  panY: number,
  bounds: ViewerPanBounds,
): ViewerState {
  if (state.zoom <= 1) return { ...state, panX: 0, panY: 0 };
  const maxX = Math.max(0, bounds.maxX);
  const maxY = Math.max(0, bounds.maxY);
  return {
    ...state,
    panX: Math.min(maxX, Math.max(-maxX, panX)),
    panY: Math.min(maxY, Math.max(-maxY, panY)),
  };
}

export function setViewerZoomWithinBounds(
  state: ViewerState,
  zoom: number,
  bounds: ViewerPanBounds,
): ViewerState {
  const zoomed = setViewerZoom(state, zoom);
  return setViewerPan(zoomed, zoomed.panX, zoomed.panY, bounds);
}

export function toggleViewerTools(state: ViewerState): ViewerState {
  const toolsVisible = !state.toolsVisible;
  return { ...state, toolsVisible, infoVisible: toolsVisible ? state.infoVisible : false };
}

export function toggleViewerInfo(state: ViewerState): ViewerState {
  return { ...state, toolsVisible: true, infoVisible: !state.infoVisible };
}

