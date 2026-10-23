import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'collections' }
  | { name: 'collection'; id: string }
  | { name: 'guess-where' }
  | { name: 'guess-where-challenge'; id: string }
  | { name: 'about' }
  | { name: 'not-found' };

function normalizePath(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

export function matchRoute(pathname: string): Route {
  const path = normalizePath(pathname);
  if (path === '/') return { name: 'home' };
  if (path === '/collections') return { name: 'collections' };
  if (path === '/guess-where') return { name: 'guess-where' };
  if (path === '/about') return { name: 'about' };

  const collectionMatch = path.match(/^\/collections\/([^/]+)$/);
  if (collectionMatch) {
    try {
      return { name: 'collection', id: decodeURIComponent(collectionMatch[1]) };
    } catch {
      return { name: 'not-found' };
    }
  }

  const challengeMatch = path.match(/^\/guess-where\/challenge\/([^/]+)$/);
  if (challengeMatch) {
    try {
      return { name: 'guess-where-challenge', id: decodeURIComponent(challengeMatch[1]) };
    } catch {
      return { name: 'not-found' };
    }
  }

  return { name: 'not-found' };
}

export function pathForCollection(id: string): string {
  return `/collections/${encodeURIComponent(id)}`;
}

export function navigate(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => matchRoute(window.location.pathname));

  useEffect(() => {
    const update = () => setRoute(matchRoute(window.location.pathname));
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  return route;
}

