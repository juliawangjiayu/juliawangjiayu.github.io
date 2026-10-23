import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? '' : fallback;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const databasePath = resolve(argument('--database', process.env.PHOTO_BOOTH_DB ?? ''));
const endpoint = argument('--endpoint', process.env.PHOTO_SITE_WORKER_URL ?? 'http://127.0.0.1:8787')
  .replace(/\/$/, '');
const token = process.env.PHOTO_SITE_ADMIN_TOKEN ?? '';
const dryRun = process.argv.includes('--dry-run');
const catalogPath = resolve('src/generated/photography.json');

if (!argument('--database', process.env.PHOTO_BOOTH_DB ?? '')) {
  fail('Set PHOTO_BOOTH_DB or pass --database with the Photo Booth SQLite file.');
} else if (!existsSync(databasePath)) {
  fail('The Photo Booth SQLite file does not exist.');
} else if (!existsSync(catalogPath)) {
  fail('The public photography catalog is missing. Export Photo Booth first.');
} else {
  const publicPhotos = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const publicIds = new Set(publicPhotos.map((photo) => photo.id));
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const rows = database
    .prepare(
      `SELECT photo_id, latitude, longitude, difficulty, answer_radius_km, enabled
       FROM guess_where_entries
       WHERE confirmed = 1
       ORDER BY photo_id`,
    )
    .all();
  database.close();

  const photos = rows
    .filter((row) => publicIds.has(row.photo_id))
    .map((row) => ({
      photoId: row.photo_id,
      imageUrl: `/photos/${row.photo_id}.webp`,
      difficulty: row.difficulty,
      answerLatitude: row.latitude,
      answerLongitude: row.longitude,
      radiusKm: row.answer_radius_km,
      enabled: Boolean(row.enabled),
    }));
  const enabled = photos.filter((photo) => photo.enabled);
  const modeCounts = Object.fromEntries(
    ['easy', 'medium', 'hard'].map((mode) => [
      mode,
      enabled.filter((photo) => photo.difficulty === mode).length,
    ]),
  );

  console.log(
    `Prepared ${photos.length} private game records ` +
      `(easy ${modeCounts.easy}, medium ${modeCounts.medium}, hard ${modeCounts.hard}).`,
  );

  for (const [mode, count] of Object.entries(modeCounts)) {
    if (count < 5) console.warn(`${mode} needs ${5 - count} more enabled photo(s) for a five-round game.`);
  }

  if (!dryRun) {
    if (!token) {
      fail('Set PHOTO_SITE_ADMIN_TOKEN before publishing private game records.');
    } else {
      const response = await fetch(`${endpoint}/api/admin/game-photos`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ schemaVersion: 1, photos }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) fail(body.error ?? `Sync failed with HTTP ${response.status}.`);
      else console.log(`Published ${body.photoCount} private game records to ${endpoint}.`);
    }
  }
}
