/** Small shared UI components for the placement officer area. */
import React, { useEffect, useRef } from 'react';
import { Info, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

/** Info icon with an accessible tooltip (hover + keyboard focus). */
export const InfoTip: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <span className={cn('relative inline-flex group align-middle', className)}>
    <button
      type="button"
      className="text-slate-400 hover:text-slate-600 focus:outline-none focus:text-blue-600 rounded"
      aria-label={text}
    >
      <Info className="w-3.5 h-3.5" />
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 bottom-full z-30 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
    >
      {text}
    </span>
  </span>
);

/** Right-side slide-over panel. */
export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}> = ({ open, onClose, title, subtitle, children, width = 'max-w-2xl' }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end print:hidden">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cn('relative h-full w-full bg-slate-50 shadow-2xl flex flex-col focus:outline-none', width)}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 bg-white border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>
      </div>
    </div>
  );
};

/** Plain labelled textarea in the same visual language as <Input>. */
export const TextArea: React.FC<
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; helperText?: string }
> = ({ label: lbl, error, helperText, id, className, ...props }) => {
  const tid = id || props.name;
  return (
    <div className="w-full space-y-1 text-left">
      {lbl && (
        <label htmlFor={tid} className="block text-xs font-medium text-slate-700">
          {lbl}
          {props.required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        id={tid}
        className={cn(
          'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600',
          error && 'border-rose-400',
          className
        )}
        rows={3}
        {...props}
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
};

/** Labelled key/value row used in detail panels. */
export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label: l, children }) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{l}</dt>
    <dd className="mt-0.5 text-sm text-slate-800 break-words">{children ?? '—'}</dd>
  </div>
);

export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search…', label: l = 'Search', className }) => (
  <div className={cn('relative', className)}>
    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      type="search"
      aria-label={l}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9.5 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
    />
  </div>
);


export const CompanyLogo: React.FC<{ name?: string | null; url?: string | null; size?: 'sm' | 'md' }> = ({
  name,
  url,
  size = 'sm',
}) => {
  const [broken, setBroken] = React.useState(false);
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-11 h-11 text-sm';
  if (url && !broken)
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        className={cn(dim, 'rounded-lg object-contain bg-white border border-slate-200 shrink-0')}
      />
    );
  const initials = (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cn(
        dim,
        'rounded-lg bg-gradient-to-br from-blue-50 to-violet-50 border border-slate-200 text-blue-700 font-semibold flex items-center justify-center shrink-0'
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
};
