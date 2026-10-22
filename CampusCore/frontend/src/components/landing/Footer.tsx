import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Container, Logo } from './Primitives';
import { scrollToSection } from './nav';

type FooterLink = { label: string; section?: string; to?: string };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Platform',
    links: [
      { label: 'Features', section: 'features' },
      { label: 'Attendance', section: 'attendance' },
      { label: 'Academics', section: 'academics' },
      { label: 'Placements', section: 'placements' },
    ],
  },
  {
    title: 'Campus Core',
    links: [
      { label: 'How it works', section: 'how-it-works' },
      { label: 'About', section: 'about' },
      { label: 'FAQ', section: 'faq' },
      { label: 'Contact', section: 'contact' },
    ],
  },
  {
    title: 'Access',
    links: [
      { label: 'Login', to: '/login' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Service', to: '/terms' },
    ],
  },
];

const YEAR = new Date().getFullYear();

const linkCls =
  'rounded text-sm text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400';

export const Footer: React.FC = () => {
  const { pathname } = useLocation();

  const onSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    if (pathname !== '/' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (scrollToSection(id, { focus: true })) e.preventDefault();
  };

  return (
    <footer className="border-t border-white/10 bg-[#070B16] text-slate-300" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <Container className="grid gap-10 py-14 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
        <div className="max-w-xs">
          <Logo onClick={(e) => onSection(e, 'home')} />
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            One Campus. One Core. Everything Connected. Attendance, academics and placements on one platform.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">{col.title}</h3>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.section ? (
                    <Link to={`/#${l.section}`} onClick={(e) => onSection(e, l.section!)} className={linkCls}>
                      {l.label}
                    </Link>
                  ) : (
                    <Link to={l.to!} className={linkCls}>
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-3 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {YEAR} Campus Core. All rights reserved.</p>
          <p className="flex gap-5">
            <Link to="/privacy" className={linkCls.replace('text-sm', 'text-xs')}>
              Privacy
            </Link>
            <Link to="/terms" className={linkCls.replace('text-sm', 'text-xs')}>
              Terms
            </Link>
          </p>
        </Container>
      </div>
    </footer>
  );
};
