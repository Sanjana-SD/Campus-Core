import type { UserRole } from '../../context/AuthContext';

export interface NavItem {
  id: string;
  label: string;
}

/** Anchor targets on the public landing page, in page order. */
export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'features', label: 'Features' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'academics', label: 'Academics' },
  { id: 'placements', label: 'Placements' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

/** Height of the sticky navbar in px, used as scroll offset. */
export const NAV_OFFSET = 72;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Smoothly scrolls to a landing section and moves focus there for keyboard/screen-reader users. */
export function scrollToSection(id: string, opts: { focus?: boolean; updateHash?: boolean } = {}): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const top = id === 'home' ? 0 : el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET + 1;
  window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  if (opts.updateHash !== false) {
    const url = id === 'home' ? window.location.pathname + window.location.search : `#${id}`;
    window.history.replaceState(window.history.state, '', url);
  }
  if (opts.focus) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }
  return true;
}

/** Where "Explore Placement Opportunities" should lead for the current visitor. */
export function placementPathFor(role: UserRole | null): string {
  if (role === 'STUDENT') return '/student/placements/drives';
  if (role === 'PLACEMENT_OFFICER' || role === 'ADMIN') return '/placement';
  return '/login';
}

/** Shared focus ring utility for links/buttons on the landing page. */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';
