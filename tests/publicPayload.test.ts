import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const forbiddenKeys = new Set([
  'latitude',
  'longitude',
  'lat',
  'lng',
  'answerradiuskm',
  'answername',
  'answerdescription',
  'originalpath',
  'sha256',
  'status',
  'reviewstate',
  'canonicalname',
  'guess',
]);

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
    return keys;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      keys.add(key.toLowerCase());
      collectKeys(item, keys);
    });
  }
  return keys;
}

test('Photo Booth public exports contain no private Guess Where or archive fields', async () => {
  const photos = JSON.parse(await readFile(new URL('../src/generated/photography.json', import.meta.url), 'utf8'));
  const collections = JSON.parse(await readFile(new URL('../src/generated/collections.json', import.meta.url), 'utf8'));
  const keys = collectKeys([photos, collections]);

  const found = [...forbiddenKeys].filter((key) => keys.has(key));
  assert.deepEqual(found, []);
  assert.ok(photos.length > 0, 'the public catalog must include at least one reviewed photo');
});
