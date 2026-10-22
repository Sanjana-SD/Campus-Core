import React from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Container: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>
);

export const LogoMark: React.FC<{ className?: string }> = ({ className }) => (
  <span
    aria-hidden="true"
    className={cn(
      'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 shadow-lg shadow-indigo-900/30 ring-1 ring-white/15',
      className
    )}
  >
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <circle cx="12" cy="12" r="3.2" fill="white" />
      <circle cx="12" cy="12" r="7.5" stroke="white" strokeOpacity="0.55" strokeWidth="1.6" />
      <circle cx="12" cy="4.5" r="1.6" fill="white" />
      <circle cx="18.5" cy="15.75" r="1.6" fill="white" />
      <circle cx="5.5" cy="15.75" r="1.6" fill="white" />
    </svg>
  </span>
);

export const Logo: React.FC<{ tone?: 'light' | 'dark'; to?: string; onClick?: React.MouseEventHandler<HTMLAnchorElement> }> = ({
  tone = 'light',
  to = '/',
  onClick,
}) => (
  <Link
    to={to}
    onClick={onClick}
    className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    aria-label="Campus Core home"
  >
    <LogoMark className="transition-transform duration-300 group-hover:scale-105" />
    <span className={cn('font-display text-lg font-bold', tone === 'light' ? 'text-white' : 'text-slate-900')}>
      Campus Core
    </span>
  </Link>
);

interface SectionHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: 'left' | 'center';
  tone?: 'light' | 'dark';
  id?: string;
}

/** Consistent section heading: eyebrow, h2, lead paragraph. `tone="dark"` is for dark backgrounds. */
export const SectionHeader: React.FC<SectionHeaderProps> = ({ eyebrow, title, description, align = 'left', tone = 'light', id }) => (
  <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')} data-reveal>
    <p
      className={cn(
        'inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]',
        tone === 'dark' ? 'text-blue-300' : 'text-blue-700'
      )}
    >
      <span aria-hidden="true" className={cn('h-px w-6', tone === 'dark' ? 'bg-blue-300/60' : 'bg-blue-600/50')} />
      {eyebrow}
    </p>
    <h2
      id={id}
      className={cn(
        'font-display mt-3 text-3xl font-bold leading-tight sm:text-4xl',
        tone === 'dark' ? 'text-white' : 'text-slate-900'
      )}
    >
      {title}
    </h2>
    {description && (
      <p className={cn('mt-4 text-base leading-relaxed sm:text-lg', tone === 'dark' ? 'text-slate-300' : 'text-slate-600')}>
        {description}
      </p>
    )}
  </div>
);

/** Small tag marking content as sample/illustrative, never real institutional data. */
export const IllustrativeTag: React.FC<{ label?: string; tone?: 'light' | 'dark'; className?: string }> = ({
  label = 'Illustrative example',
  tone = 'light',
  className,
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
      tone === 'dark' ? 'border-amber-300/30 bg-amber-300/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800',
      className
    )}
  >
    <Info className="h-3 w-3" aria-hidden="true" />
    {label}
  </span>
);

