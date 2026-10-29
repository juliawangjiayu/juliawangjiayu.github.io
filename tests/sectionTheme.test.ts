import assert from 'node:assert/strict';
import test from 'node:test';

import { sectionThemeForRoute } from '../src/lib/sectionTheme.ts';

test('the About route gets its own theme without changing other page themes', () => {
  assert.equal(sectionThemeForRoute('about'), 'site-shell--about');
  assert.equal(sectionThemeForRoute('collections'), 'site-shell--collections');
  assert.equal(sectionThemeForRoute('guess-where'), 'site-shell--guess');
  assert.equal(sectionThemeForRoute('home'), '');
});
