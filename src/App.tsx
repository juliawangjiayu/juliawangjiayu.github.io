import { SiteHeader } from './components/SiteHeader.tsx';
import { AppLink } from './components/AppLink.tsx';
import { useRoute } from './router.ts';
import { HomePage } from './pages/HomePage.tsx';
import { AboutPage } from './pages/AboutPage.tsx';
import { GuessWherePage } from './pages/GuessWherePage.tsx';
import { CollectionsPage } from './pages/CollectionsPage.tsx';
import { CollectionPage } from './pages/CollectionPage.tsx';

function NotFoundPage() {
  return (
    <main className="not-found page-frame page-frame--column">
      <p className="page-kicker">404</p>
      <h1>This path ends here.</h1>
      <AppLink className="text-link" href="/">Return home</AppLink>
    </main>
  );
}

export default function App() {
  const route = useRoute();
  let page;

  if (route.name === 'home') page = <HomePage />;
  else if (route.name === 'about') page = <AboutPage />;
  else if (route.name === 'guess-where') page = <GuessWherePage />;
  else if (route.name === 'guess-where-challenge') page = <GuessWherePage challengeId={route.id} />;
  else if (route.name === 'collections') page = <CollectionsPage />;
  else if (route.name === 'collection') page = <CollectionPage collectionId={route.id} />;
  else page = <NotFoundPage />;

  return (
    <div className="site-shell">
      <SiteHeader route={route} />
      {page}
    </div>
  );
}

