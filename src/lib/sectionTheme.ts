import type { Route } from '../router.ts';

export function sectionThemeForRoute(name: Route['name']): string {
  if (name === 'collections' || name === 'collection') return 'site-shell--collections';
  if (name === 'guess-where' || name === 'guess-where-challenge') return 'site-shell--guess';
  if (name === 'about') return 'site-shell--about';
  return '';
}
