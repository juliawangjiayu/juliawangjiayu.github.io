import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production Worker config binds the real D1 database and GitHub Pages origin', async () => {
  const config = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');

  assert.match(config, /binding\s*=\s*"DB"/);
  assert.match(config, /database_name\s*=\s*"julia-photo-guess"/);
  assert.match(config, /migrations_dir\s*=\s*"worker\/migrations"/);
  assert.match(
    config,
    /ALLOWED_ORIGINS\s*=\s*"[^"]*https:\/\/juliawangjiayu\.github\.io[^"]*"/,
  );

  const databaseId = config.match(/database_id\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(databaseId, 'database_id must be configured');
  assert.notEqual(databaseId, '00000000-0000-0000-0000-000000000000');
  assert.match(databaseId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
});
