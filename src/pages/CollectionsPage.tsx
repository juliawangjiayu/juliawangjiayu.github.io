import { useMemo, useState } from 'react';
import { CollectionPath } from '../components/CollectionPath.tsx';
import { collections } from '../content/data.ts';
import { buildPathLayout } from '../lib/pathLayout.ts';
import { selectCollectionCovers } from './collectionCovers.ts';

function visitSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4_294_967_296);
}

export function CollectionsPage() {
  const [seed] = useState(visitSeed);
  const covers = useMemo(() => selectCollectionCovers(collections, seed), [seed]);
  const nodes = useMemo(() => buildPathLayout(covers.length), [covers.length]);

  return (
    <main className="collections-page">
      <header className="collections-heading">
        <p className="page-kicker">A photographic path</p>
        <h1>Collections</h1>
        <p>Follow the line slowly. Each stop opens a different part of the archive.</p>
      </header>
      <CollectionPath covers={covers} nodes={nodes} />
    </main>
  );
}

