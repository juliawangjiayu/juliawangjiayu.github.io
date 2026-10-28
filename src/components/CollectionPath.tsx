import { AppLink } from './AppLink.tsx';
import { pathForCollection } from '../router.ts';
import { collectionDescription, collectionNodeId } from '../lib/collectionPresentation.ts';
import { buildPathData, calculateCollectionPathHeight, type PathNode } from '../lib/pathLayout.ts';
import type { CollectionCover } from '../pages/collectionCovers.ts';

type CollectionPathProps = {
  covers: CollectionCover[];
  nodes: PathNode[];
};

export function CollectionPath({ covers, nodes }: CollectionPathProps) {
  const finalCover = covers.at(-1);
  const height = calculateCollectionPathHeight(nodes, finalCover ? {
    width: finalCover.photo.image.width,
    height: finalCover.photo.image.height,
    hasDescription: Boolean(collectionDescription(finalCover.collection.description)),
  } : undefined);

  return (
    <div className="collection-path" style={{ height }}>
      <svg
        className="collection-path__line"
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={buildPathData(nodes)} vectorEffect="non-scaling-stroke" />
      </svg>
      {covers.map(({ collection, photo, orientation }, index) => {
        const node = nodes[index];
        const description = collectionDescription(collection.description);
        return (
          <article
            className={`collection-node is-${orientation}`}
            id={collectionNodeId(collection.id)}
            style={{ '--node-x': `${node.x}%`, '--node-y': `${node.y}px` } as React.CSSProperties}
            key={collection.id}
          >
            <span className="collection-node__point" aria-hidden="true" />
            <AppLink className="collection-node__link" href={pathForCollection(collection.id)}>
              <figure
                className="collection-node__photo"
                style={{ aspectRatio: `${photo.image.width} / ${photo.image.height}` }}
              >
                <img
                  src={photo.image.thumbnail}
                  alt={`${collection.title} Collection cover`}
                  width={photo.image.width}
                  height={photo.image.height}
                  loading={index > 1 ? 'lazy' : 'eager'}
                />
              </figure>
              <span className="collection-node__meta">
                <span className="collection-node__summary">
                  <span className="collection-node__title">{collection.title}</span>
                  <span className="collection-node__count">{collection.photos.length} photographs</span>
                </span>
                {description && <span className="collection-node__description">{description}</span>}
              </span>
            </AppLink>
          </article>
        );
      })}
    </div>
  );
}

