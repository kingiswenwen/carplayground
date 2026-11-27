import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { newSessionId } from '../domain/session-id';

function readRoute() {
  const [path, query] = (location.hash.slice(1) || '/explore').split('?');
  return (path.replace(/\/+$/, '') || '/explore') + (query ? '?' + query : '');
}

type ReadingPosition = { top: number; link?: string };
type Arrival = { position?: ReadingPosition };
const entryKey = 'townNavigationEntry';

function currentEntry(): string {
  const existing = history.state?.[entryKey];
  if (typeof existing === 'string') return existing;
  const id = newSessionId();
  history.replaceState({ ...history.state, [entryKey]: id }, '');
  return id;
}

// Track each visit separately, including repeated visits to the same place.
// Restore after the lazy route has committed and its cards have a layout.
export function useTownNavigation(onNavigate: () => void) {
  const [route, setRoute] = useState(readRoute);
  const arrival = useRef<Arrival | null>(null);
  useEffect(() => {
    const previousMode = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    let entry = currentEntry();
    let previousRoute = readRoute();
    const positions = new Map<string, ReadingPosition>();
    let clickedLink: string | undefined;
    const captureLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#/"]') : null;
      clickedLink = link?.getAttribute('href') ?? undefined;
      if (link?.hasAttribute('data-town-back') && history.state?.townFromRoute === link.hash.slice(1) && positions.size > 0) {
        event.preventDefault();
        history.back();
      }
    };
    const navigate = () => {
      positions.set(entry, { top: window.scrollY, link: clickedLink });
      if (!history.state?.[entryKey]) {
        history.replaceState({ ...history.state, townFromRoute: previousRoute }, '');
      }
      entry = currentEntry();
      previousRoute = readRoute();
      clickedLink = undefined;
      arrival.current = { position: positions.get(entry) };
      onNavigate();
      setRoute(previousRoute);
    };
    document.addEventListener('click', captureLink, true);
    window.addEventListener('hashchange', navigate);
    return () => {
      history.scrollRestoration = previousMode;
      document.removeEventListener('click', captureLink, true);
      window.removeEventListener('hashchange', navigate);
    };
  }, [onNavigate]);
  return { route, arrival };
}

export function RouteArrival({ arrival }: { arrival: RefObject<Arrival | null> }) {
  useLayoutEffect(() => {
    const next = arrival.current;
    if (!next) return;
    arrival.current = null;
    const link = next.position?.link;
    const focus = link && document.querySelector<HTMLElement>(`main a[href="${CSS.escape(link)}"]`);
    (focus || document.getElementById('main-content'))?.focus({ preventScroll: true });
    window.scrollTo({ top: next.position?.top ?? 0, behavior: 'instant' });
  }, [arrival]);
  return null;
}
