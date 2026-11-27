import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { newSessionId } from '../domain/session-id';

const entryKey = 'townNavigationEntry';
const orderKey = 'townNavigationOrder';

function readRoute() {
  const [path, query] = (location.hash.slice(1) || '/explore').split('?');
  return (path.replace(/\/+$/, '') || '/explore') + (query ? '?' + query : '');
}

type ReadingPosition = { top: number; link?: string };
type Arrival = { position?: ReadingPosition };
export type BeforeTownLeave = (proceed: () => void, stay: () => void) => boolean;

export type TownLeaveGuard = { request: BeforeTownLeave; dismiss?: () => void };

function currentEntry(order: number, from?: string) {
  const saved = history.state ?? {};
  if (typeof saved[entryKey] === 'string' && typeof saved[orderKey] === 'number') return saved;
  const entry = { ...saved, [entryKey]: saved[entryKey] ?? newSessionId(), [orderKey]: order };
  if (from) entry.townFromRoute = from;
  history.replaceState(entry, '');
  return entry;
}

export function useTownNavigation(onNavigate: () => void, beforeLeave: RefObject<TownLeaveGuard | null>) {
  const [route, setRoute] = useState(readRoute);
  const [from, setFrom] = useState<string | undefined>(() => history.state?.townFromRoute);
  const arrival = useRef<Arrival | null>(null);
  useEffect(() => {
    const previousMode = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    let entry = currentEntry(0);
    let previousRoute = readRoute();
    let currentUrl = location.href;
    const positions = new Map<string, ReadingPosition>();
    let clickedLink: string | undefined;
    let pendingLeave = false;
    const captureLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#/"]') : null;
      clickedLink = link?.getAttribute('href') ?? undefined;
      if (link?.hasAttribute('data-town-back') && entry.townFromRoute === link.hash.slice(1) && positions.size > 0) {
        event.preventDefault();
        history.back();
      }
    };
    const navigate = () => {
      const nextRoute = readRoute();
      if (nextRoute === previousRoute) {
        if (pendingLeave) beforeLeave.current?.dismiss?.();
        pendingLeave = false;
        clickedLink = undefined;
        return;
      }
      const targetUrl = location.href;
      const targetState = history.state;
      const proceed = () => {
        if (location.href !== targetUrl) return;
        pendingLeave = false;
        positions.set(entry[entryKey], { top: window.scrollY, link: clickedLink });
        entry = currentEntry(entry[orderKey] + 1, previousRoute);
        previousRoute = nextRoute;
        currentUrl = targetUrl;
        clickedLink = undefined;
        arrival.current = { position: positions.get(entry[entryKey]) };
        onNavigate();
        setFrom(entry.townFromRoute);
        setRoute(nextRoute);
      };
      const stay = () => {
        if (location.href !== targetUrl) return;
        const order = targetState?.[orderKey];
        if (typeof order === 'number' && order !== entry[orderKey]) history.go(entry[orderKey] - order);
        else if (targetState === null) history.back(); // A new hash entry.
        else history.pushState(entry, '', currentUrl); // An older entry from before this page was loaded.
      };
      pendingLeave = beforeLeave.current?.request(proceed, stay) ?? false;
      if (!pendingLeave) proceed();
    };
    document.addEventListener('click', captureLink, true);
    window.addEventListener('hashchange', navigate);
    return () => {
      history.scrollRestoration = previousMode;
      document.removeEventListener('click', captureLink, true);
      window.removeEventListener('hashchange', navigate);
    };
  }, [onNavigate, beforeLeave]);
  return { route, arrival, from };
}

export function RouteArrival({ arrival }: { arrival: RefObject<Arrival | null> }) {
  useLayoutEffect(() => {
    const next = arrival.current;
    const main = document.getElementById('main-content');
    if (!next || !main) return;

    const settle = () => {
      if (main.querySelector('[data-route-pending]')) return false;
      arrival.current = null;
      const link = next.position?.link;
      const focus = link && main.querySelector<HTMLElement>(`a[href="${CSS.escape(link)}"]`);
      (focus || main).focus({ preventScroll: true });
      if (next.position) window.scrollTo({ top: next.position.top, behavior: 'instant' });
      return true;
    };
    if (!next.position) window.scrollTo({ top: 0, behavior: 'instant' });
    if (settle()) return;
    const observer = new MutationObserver(() => { if (settle()) observer.disconnect(); });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [arrival]);
  return null;
}
