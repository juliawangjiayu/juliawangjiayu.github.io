import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from '../router.ts';

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

export function AppLink({ href, onClick, ...props }: AppLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(href);
  };

  return <a href={href} onClick={handleClick} {...props} />;
}

