import { aboutContent, visibleAboutSections } from '../content/about.ts';
import { photos } from '../content/data.ts';

const aboutPhotoId = 'p_e1db8e0c9043e6c8e92b';

export function AboutPage() {
  const photo = photos.find((item) => item.id === aboutPhotoId) ?? photos[0];
  const sections = visibleAboutSections(aboutContent);

  return (
    <main className="about-page page-frame">
      {photo && (
        <figure
          className="about-photo"
          style={{ aspectRatio: `${photo.image.width} / ${photo.image.height}` }}
        >
          <img
            src={photo.image.src}
            alt="A photograph from Julia Wang’s archive"
            width={photo.image.width}
            height={photo.image.height}
          />
        </figure>
      )}
      <article className="about-copy">
        <p className="page-kicker">About</p>
        <h1>Julia Wang</h1>
        <div className="about-intro">
          <p>I take photographs to remember what a place felt like, not only what it looked like.</p>
          <p>This site is a growing archive of places, light, and ordinary moments.</p>
        </div>
        {sections.map((section) => (
          <section className="about-section" key={section.id}>
            <h2>{section.title}</h2>
            <ul>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
      </article>
    </main>
  );
}

