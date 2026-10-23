import { AppLink } from './AppLink.tsx';
import type { Route } from '../router.ts';

const navItems = [
  { label: 'Home', href: '/', matches: ['home'] },
  { label: 'Collections', href: '/collections', matches: ['collections', 'collection'] },
  { label: 'Guess Where', href: '/guess-where', matches: ['guess-where'] },
  { label: 'About', href: '/about', matches: ['about'] },
] as const;

export function SiteHeader({ route }: { route: Route }) {
  return (
    <header className="site-header">
      <AppLink className="site-name" href="/" aria-label="Julia Wang, homepage">
        Julia Wang
      </AppLink>
      <nav className="site-nav" aria-label="Primary navigation">
        {navItems.map((item) => {
          const active = (item.matches as readonly string[]).includes(route.name);
          return (
            <AppLink
              className={active ? 'site-nav__link is-active' : 'site-nav__link'}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              key={item.href}
            >
              {item.label}
            </AppLink>
          );
        })}
      </nav>
    </header>
  );
}

