import { useEffect, useState } from 'react';

// Minimal history-based routing for the REVOLTZ AI site + AgencyOS workspace.
// No dependency is added: this is a thin wrapper over the History API so the
// Express/Vite servers keep serving a single index.html for every route.
export const NAVIGATION_EVENT = 'revoltz:navigation';

export const ROUTES = { site: '/', app: '/agencyos' };

// GitHub Pages hosts the static build at /Revoltz/, while the Express/Vite
// servers host it from the domain root. Vite's BASE_URL records the build-time
// public path, so the route logic below keeps using plain ('/', '/agencyos')
// paths in both environments.
const BASE_PATH = (import.meta.env?.BASE_URL || '/').replace(/\/+$/, '');

/** Prefixes an app route with the deployment's public base path. */
export function withBase(path) {
  return `${BASE_PATH}${path}`;
}

export function currentPath() {
  if (typeof window === 'undefined') return ROUTES.site;
  let path = window.location.pathname.replace(/\/+$/, '');
  if (BASE_PATH && path.startsWith(BASE_PATH)) path = path.slice(BASE_PATH.length);
  return path || ROUTES.site;
}

export function isAppPath(path = currentPath()) {
  return path === ROUTES.app || path.startsWith(`${ROUTES.app}/`);
}

export function navigate(path, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  if (path !== currentPath()) {
    window.history[replace ? 'replaceState' : 'pushState']({}, '', withBase(path));
  }
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Scrolls to a site section, routing back to the site first when needed. */
export function goToSection(id) {
  if (typeof window === 'undefined' || !id) return;
  const scrollToTarget = () => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  if (!isAppPath()) {
    window.history.replaceState({}, '', `#${id}`);
    scrollToTarget();
    return;
  }
  window.history.pushState({}, '', `${withBase('/')}#${id}`);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  // Let the site mount before measuring the target position.
  window.setTimeout(scrollToTarget, 80);
}

/** Tracks the current pathname so the shell can swap site/app views. */
export function useRouterPath() {
  const [path, setPath] = useState(() => currentPath());
  useEffect(() => {
    const sync = () => setPath(currentPath());
    window.addEventListener('popstate', sync);
    window.addEventListener(NAVIGATION_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(NAVIGATION_EVENT, sync);
    };
  }, []);
  return path;
}
