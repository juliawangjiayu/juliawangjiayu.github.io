export type ViewerState = {
  index: number;
  zoom: number;
  toolsVisible: boolean;
  infoVisible: boolean;
};

export function createViewerState(index = 0): ViewerState {
  return { index, zoom: 1, toolsVisible: false, infoVisible: false };
}

export function moveViewer(state: ViewerState, direction: -1 | 1, count: number): ViewerState {
  if (count <= 0) return state;
  return {
    ...state,
    index: (state.index + direction + count) % count,
    zoom: 1,
    infoVisible: false,
  };
}

export function setViewerZoom(state: ViewerState, zoom: number): ViewerState {
  return {
    ...state,
    zoom: Math.min(2, Math.max(1, zoom)),
    toolsVisible: true,
  };
}

export function toggleViewerTools(state: ViewerState): ViewerState {
  const toolsVisible = !state.toolsVisible;
  return { ...state, toolsVisible, infoVisible: toolsVisible ? state.infoVisible : false };
}

export function toggleViewerInfo(state: ViewerState): ViewerState {
  return { ...state, toolsVisible: true, infoVisible: !state.infoVisible };
}

