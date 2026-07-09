import { useEffect, useState } from 'react';

/** The current location hash, kept in sync with `hashchange` (client-only app). */
export function useHash(): string {
  const [hash, setHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash,
  );
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/** Navigate the shell by setting the route hash (`#/deals`, `#/crew`, …). */
export function navigate(route: string): void {
  if (typeof window !== 'undefined') window.location.hash = `#/${route}`;
}
