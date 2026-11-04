import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('security configuration keeps browser tokens behind a script policy', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const meta = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(meta, 'CSP meta tag is required for the Pages deployment');
  for (const directive of ['default-src', 'script-src', 'connect-src', 'img-src', 'style-src']) {
    assert.match(meta[1], new RegExp(`(?:^|;)\\s*${directive} `));
  }
  assert.doesNotMatch(meta[1].split('script-src ')[1].split(';')[0], /unsafe-inline/);
  assert.match(meta[1], /julia-photo-guess\.juliawangjiayu-github-io\.workers\.dev/);
});
