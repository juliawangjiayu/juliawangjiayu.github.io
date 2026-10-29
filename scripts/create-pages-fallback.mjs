import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function createPagesFallback(outputDirectory = 'dist') {
  const outputPath = resolve(outputDirectory);
  await copyFile(resolve(outputPath, 'index.html'), resolve(outputPath, '404.html'));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await createPagesFallback();
}
