import { aboutContent, visibleAboutSections } from '../content/about.ts';
import { photos } from '../content/data.ts';
import aboutPhotoConfig from '../generated/about-photo.json';
import { resolveAboutPhoto } from '../lib/aboutPhoto.ts';
import { AboutMotifs } from '../components/AboutMotifs.tsx';

const aboutPhotoId = 'p_e1db8e0c9043e6c8e92b';

export function AboutPage() {
  const photo = resolveAboutPhoto(aboutPhotoConfig, photos, aboutPhotoId);
  const sections = visibleAboutSections(aboutContent);

  return (
    <main className="about-page page-frame">
      {photo && (
        <figure
          className="about-photo"
          style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
        >
          <img
            src={photo.src}
            alt={aboutPhotoConfig ? 'Portrait of Julia Wang' : 'A photograph from Julia Wang’s archive'}
            width={photo.width}
            height={photo.height}
          />
        </figure>
      )}
      <AboutMotifs />
      <article className="about-copy">
        <p className="page-kicker">About</p>
        <h1>Julia Wang</h1>
        <div className="about-intro">
          <p>L'essentiel est invisible pour les yeux.</p>
          <p></p>
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

