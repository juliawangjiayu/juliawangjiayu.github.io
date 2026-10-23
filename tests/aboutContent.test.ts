import assert from 'node:assert/strict';
import test from 'node:test';

import { visibleAboutSections } from '../src/content/about.ts';

test('visibleAboutSections omits empty provisional sections instead of showing placeholders', () => {
  assert.deepEqual(
    visibleAboutSections({
      recentlyInterestedIn: ['Walking without a route'],
      wechatOfficialAccount: '',
      links: [],
    }),
    [{ id: 'interests', title: 'Recently interested in', items: ['Walking without a route'] }],
  );
});
