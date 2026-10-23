import { ArrowLeft } from 'lucide-react';
import { AppLink } from '../components/AppLink.tsx';
import { PhotoViewer } from '../components/PhotoViewer.tsx';
import { findCollection } from '../content/data.ts';

export function CollectionPage({ collectionId }: { collectionId: string }) {
  const collection = findCollection(collectionId);

  if (!collection) {
    return (
      <main className="not-found page-frame page-frame--column">
        <p className="page-kicker">Collection not found</p>
        <h1>This part of the archive has moved.</h1>
        <AppLink className="text-link" href="/collections">Return to Collections</AppLink>
      </main>
    );
  }

  return (
    <main className="collection-page">
      <header className="collection-page__header">
        <AppLink className="collection-page__back" href="/collections">
          <ArrowLeft size={17} strokeWidth={1.6} aria-hidden="true" />
          Collections
        </AppLink>
        <h1>{collection.title}</h1>
      </header>
      <PhotoViewer photos={collection.photos} collectionTitle={collection.title} />
    </main>
  );
}

