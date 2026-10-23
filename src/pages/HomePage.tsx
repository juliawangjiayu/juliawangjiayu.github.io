import { useMemo, useState } from 'react';
import { photos } from '../content/data.ts';
import { buildHomeComposition } from './homeComposition.ts';

function newVisitSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4_294_967_296);
}

export function HomePage() {
  const [visitSeed] = useState(newVisitSeed);
  const composition = useMemo(
    () => buildHomeComposition(photos, visitSeed, 5),
    [visitSeed],
  );

  return (
    <main className="home-page">
      <section className="home-composition" aria-labelledby="home-statement">
        <h1 className="home-statement" id="home-statement">
          <span>La vie,</span>
          <span>c’est la vie.</span>
        </h1>
        {composition.map(({ photo, orientation, slot }) => (
          <figure
            className={`home-photo home-photo--${slot} is-${orientation}`}
            key={photo.id}
            style={{ aspectRatio: `${photo.image.width} / ${photo.image.height}` }}
          >
            <img
              src={photo.image.src}
              alt={photo.description || 'A photograph from Julia Wang’s archive'}
              width={photo.image.width}
              height={photo.image.height}
              loading={slot < 2 ? 'eager' : 'lazy'}
            />
          </figure>
        ))}
        <p className="home-caption">A growing archive of places, light, and ordinary moments.</p>
      </section>
    </main>
  );
}

