import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import { useAuth, ROLE_HOME, ROLE_LABEL } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { Logo } from './landing/Primitives';
import { NAV_ITEMS, NAV_OFFSET, scrollToSection } from './landing/nav';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Public site navigation. Used by the landing page and legal pages.
 * Anchor links smooth-scroll on "/" and navigate to "/#section" from other routes.
 */
export const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>('home');
  const { isAuthenticated, role, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const onLanding = location.pathname === '/';
  const dashboardPath = role ? ROLE_HOME[role] : '/login';

  // Close the mobile menu whenever the route or hash changes (state adjusted during render).
  const routeKey = `${location.pathname}${location.hash}`;
  const [prevRouteKey, setPrevRouteKey] = useState(routeKey);
  if (routeKey !== prevRouteKey) {
    setPrevRouteKey(routeKey);
    setIsOpen(false);
  }

  // Elevated style after scrolling a little.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Esc closes the menu; closing on desktop resize avoids a stale open state.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen]);

  // Highlight the section currently in view (landing page only).
  useEffect(() => {
    if (!onLanding || typeof IntersectionObserver === 'undefined') return;
    const sections = NAV_ITEMS.map((n) => document.getElementById(n.id)).filter((el): el is HTMLElement => !!el);
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: `-${NAV_OFFSET + 8}px 0px -55% 0px`, threshold: 0 }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [onLanding]);

  const handleAnchor = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      setIsOpen(false);
      if (!onLanding) return; // let <Link> navigate to "/#id"
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      if (scrollToSection(id, { focus: true })) setActive(id);
    },
    [onLanding]
  );

  const anchorTo = (id: string) => (id === 'home' ? '/' : `/#${id}`);

  const linkClass = (id: string) =>
    cn(
      'relative rounded-md px-3 py-2 text-sm font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
      onLanding && active === id ? 'text-white' : 'text-slate-300 hover:text-white'
    );

  return (
    <header
      className={cn(
        'font-landing sticky top-0 z-50 w-full border-b transition-[background-color,border-color,box-shadow] duration-300',
        scrolled || isOpen || !onLanding
          ? 'border-white/10 bg-[#0B1120]/90 shadow-lg shadow-black/20 backdrop-blur-xl'
          : 'border-transparent bg-[#0B1120]/70 backdrop-blur-md'
      )}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo onClick={(e) => handleAnchor(e, 'home')} />

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <Link
                  to={anchorTo(item.id)}
                  onClick={(e) => handleAnchor(e, item.id)}
                  className={linkClass(item.id)}
                  aria-current={onLanding && active === item.id ? 'location' : undefined}
                >
                  {item.label}
                  {onLanding && active === item.id && (
                    <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-blue-400 to-violet-400" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {isAuthenticated && user ? (
            <>
              <div className="flex items-center gap-2.5 pr-1">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-bold text-white"
                >
                  {initials(user.full_name || user.username)}
                </span>
                <span className="max-w-[10rem] leading-tight">
                  <span className="block truncate text-sm font-semibold text-white">{user.full_name || user.username}</span>
                  {role && <span className="block text-[11px] text-slate-400">{ROLE_LABEL[role]}</span>}
                </span>
              </div>
              <Link
                to={dashboardPath}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1120]"
              >
                Go to dashboard
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                Login
              </Link>
              <Link
                to="/login"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-4 text-sm font-semibold text-white shadow-md shadow-blue-900/40 transition hover:from-blue-400 hover:to-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1120]"
              >
                Get Started
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>

        <button
          ref={toggleRef}
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:hidden"
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
        >
          {isOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      <div
        id="mobile-navigation"
        hidden={!isOpen}
        className="max-h-[calc(100vh-72px)] overflow-y-auto border-t border-white/10 bg-[#0B1120] lg:hidden"
      >
        <nav aria-label="Mobile" className="mx-auto max-w-7xl px-4 pb-6 pt-3 sm:px-6">
          <ul className="grid gap-1 sm:grid-cols-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <Link
                  to={anchorTo(item.id)}
                  onClick={(e) => handleAnchor(e, item.id)}
                  aria-current={onLanding && active === item.id ? 'location' : undefined}
                  className={cn(
                    'block rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                    onLanding && active === item.id ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-white/10 pt-4">
            {isAuthenticated && user ? (
              <div className="space-y-3">
                <p className="px-1 text-sm text-slate-300">
                  Signed in as <span className="font-semibold text-white">{user.full_name || user.username}</span>
                  {role && <span className="text-slate-400"> · {ROLE_LABEL[role]}</span>}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(dashboardPath)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                    Go to dashboard
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 text-sm font-medium text-slate-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/login"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-white/15 text-sm font-medium text-slate-100 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  Login
                </Link>
                <Link
                  to="/login"
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};
