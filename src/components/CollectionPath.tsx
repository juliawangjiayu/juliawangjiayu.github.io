import { AppLink } from './AppLink.tsx';
import { pathForCollection } from '../router.ts';
import { buildPathData, type PathNode } from '../lib/pathLayout.ts';
import type { CollectionCover } from '../pages/collectionCovers.ts';

type CollectionPathProps = {
  covers: CollectionCover[];
  nodes: PathNode[];
};

export function CollectionPath({ covers, nodes }: CollectionPathProps) {
  const height = (nodes.at(-1)?.y ?? 0) + 430;

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
        return (
          <article
            className={`collection-node is-${orientation}`}
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
                <span className="collection-node__title">{collection.title}</span>
                <span className="collection-node__count">{collection.photos.length} photographs</span>
              </span>
            </AppLink>
          </article>
        );
      })}
    </div>
  );
}

