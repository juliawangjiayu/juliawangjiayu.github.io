import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('Pages fallback copies the built app entry point byte-for-byte', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'pages-fallback-'));
  try {
    const indexHtml = '<!doctype html><main>Julia Wang</main>\n';
    await writeFile(join(outputDirectory, 'index.html'), indexHtml);
    const { createPagesFallback } = await import('../scripts/create-pages-fallback.mjs');

    await createPagesFallback(outputDirectory);

    assert.equal(await readFile(join(outputDirectory, '404.html'), 'utf8'), indexHtml);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test('Pages workflow builds main with production browser values and deploys dist', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/deploy-pages.yml', import.meta.url),
    'utf8',
  );
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.match(workflow, /branches:\s*\['main'\]/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /run:\s*npm ci/);
  assert.match(workflow, /run:\s*npm run build/);
  assert.match(workflow, /VITE_WORKER_BASE_URL:\s*\$\{\{ secrets\.VITE_WORKER_BASE_URL \}\}/);
  assert.match(workflow, /VITE_GOOGLE_MAPS_API_KEY:\s*\$\{\{ secrets\.VITE_GOOGLE_MAPS_API_KEY \}\}/);
  assert.match(workflow, /VITE_GOOGLE_MAP_ID:\s*\$\{\{ secrets\.VITE_GOOGLE_MAP_ID \}\}/);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/);
  assert.match(workflow, /actions\/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d/);
  assert.match(workflow, /actions\/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9/);
  assert.match(workflow, /path:\s*['"]\.\/dist['"]/);
  assert.match(workflow, /actions\/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346/);
  assert.equal(packageJson.scripts.postbuild, 'node scripts/create-pages-fallback.mjs');
});
