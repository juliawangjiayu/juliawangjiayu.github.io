import type { CollectionCover } from '../pages/collectionCovers.ts';
import {
  collectionDescription,
  collectionNodeHref,
} from '../lib/collectionPresentation.ts';

type CollectionLeafIndexProps = {
  covers: CollectionCover[];
};

export function CollectionLeafIndex({ covers }: CollectionLeafIndexProps) {
  return (
    <nav className="collection-index" aria-label="Collection index">
      <p className="collection-index__label">Index</p>
      <div className="collection-index__pond">
        {covers.map(({ collection }, index) => {
          const description = collectionDescription(collection.description);
          return (
            <a
              className={`collection-index__leaf collection-index__leaf--${index % 6}`}
              href={collectionNodeHref(collection.id)}
              key={collection.id}
            >
              <span className="collection-index__leaf-copy">
                <strong>{collection.title}</strong>
                {description && <small>{description}</small>}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
