/**
 * Shared building blocks for operational pages: page headers, stat cards, skeletons,
 * error states, pagination, tables, confirm dialogs and a dependency-free bar chart.
 */
import React from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';
import { Modal } from './Modal';

export const PageHeader: React.FC<{
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
}> = ({ title, description, actions, eyebrow }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
    <div className="min-w-0">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">{eyebrow}</p>}
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {description && <div className="mt-1 text-sm text-slate-500 max-w-3xl">{description}</div>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  onClick?: () => void;
}> = ({ label, value, hint, icon, tone = 'default', onClick }) => {
  const tones = {
    default: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-rose-50 text-rose-600',
    info: 'bg-blue-50 text-blue-600',
  };
  // A clickable card uses a full-size overlay button instead of wrapping the content in a
  // <button>, so interactive hints (e.g. tooltips) inside the card remain valid and usable.
  return (
    <div
      className={cn(
        'relative text-left bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-start gap-3 w-full',
        onClick && 'hover:border-slate-300 hover:shadow-sm transition-all'
      )}
    >
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="absolute inset-0 rounded-xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      )}
      {icon && <span className={cn('relative p-2 rounded-lg shrink-0 pointer-events-none', tones[tone])}>{icon}</span>}
      <div className="relative min-w-0 pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
        {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
      </div>
    </div>
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 6, cols = 5 }) => (
  <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((__, c) => (
          <Skeleton key={c} className="h-5" />
        ))}
      </div>
    ))}
  </div>
);

export const ErrorState: React.FC<{ title?: string; message: string; onRetry?: () => void; className?: string }> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}) => (
  <div className={cn('rounded-xl border border-rose-200 bg-rose-50/60 p-4 flex items-start gap-3', className)} role="alert">
    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-rose-900">{title}</p>
      <p className="text-xs text-rose-800 mt-0.5 break-words">{message}</p>
    </div>
    {onRetry && (
      <Button size="sm" variant="outline" onClick={onRetry} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
        Retry
      </Button>
    )}
  </div>
);

export const Pagination: React.FC<{
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
}> = ({ total, page, pageSize, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

/** Scrollable table shell with consistent header styling. */
export const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  // `relative` keeps absolutely positioned descendants (e.g. sr-only labels) inside the scroll box
  <div className={cn('relative overflow-x-auto', className)}>
    <table className="min-w-full text-sm">{children}</table>
  </div>
);
export const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, ...p }) => (
  <th
    className={cn(
      'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50/80 border-b border-slate-200 whitespace-nowrap',
      className
    )}
    {...p}
  />
);
export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, ...p }) => (
  <td className={cn('px-4 py-2.5 border-b border-slate-100 text-slate-700 align-top', className)} {...p} />
);

export const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ isOpen, title, message, confirmLabel = 'Confirm', danger, isLoading, onConfirm, onClose }) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
    <div className="text-sm text-slate-600">{message}</div>
    <div className="mt-6 flex justify-end gap-2">
      <Button variant="outline" onClick={onClose} disabled={isLoading}>
        Cancel
      </Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} isLoading={isLoading}>
        {confirmLabel}
      </Button>
    </div>
  </Modal>
);

export interface BarDatum {
  label: string;
  value: number;
  secondary?: number;
}

/** Horizontal bar chart (accessible, no dependencies). */
export const BarList: React.FC<{
  data: BarDatum[];
  valueLabel?: string;
  secondaryLabel?: string;
  emptyText?: string;
  format?: (n: number) => string;
}> = ({ data, valueLabel, secondaryLabel, emptyText = 'No data yet', format = (n) => String(n) }) => {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)));
  if (!data.length) return <p className="text-xs text-slate-500 py-6 text-center">{emptyText}</p>;
  return (
    <div className="space-y-3">
      {(valueLabel || secondaryLabel) && (
        <div className="flex gap-4 text-[11px] text-slate-500">
          {valueLabel && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" />
              {valueLabel}
            </span>
          )}
          {secondaryLabel && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-violet-400" />
              {secondaryLabel}
            </span>
          )}
        </div>
      )}
      {data.map((d) => (
        <div key={d.label}>
          <div className="flex justify-between text-xs mb-1 gap-2">
            <span className="text-slate-700 truncate">{d.label}</span>
            <span className="text-slate-500 tabular-nums shrink-0">
              {format(d.value)}
              {d.secondary !== undefined && ` / ${format(d.secondary)}`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${d.label}: ${d.value}`}>
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          {d.secondary !== undefined && (
            <div className="h-1.5 mt-1 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-violet-400" style={{ width: `${(d.secondary / max) * 100}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/** Vertical column chart for time series (e.g. monthly activity). */
export const ColumnChart: React.FC<{
  data: { label: string; values: number[] }[];
  series: string[];
  emptyText?: string;
}> = ({ data, series, emptyText = 'No activity yet' }) => {
  const colors = ['bg-blue-600', 'bg-violet-400', 'bg-emerald-500'];
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  if (!data.length) return <p className="text-xs text-slate-500 py-6 text-center">{emptyText}</p>;
  return (
    <div>
      <div className="flex gap-4 text-[11px] text-slate-500 mb-3">
        {series.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('w-2.5 h-2.5 rounded-sm', colors[i % colors.length])} />
            {s}
          </span>
        ))}
      </div>
      <div className="flex items-end gap-3 h-40 overflow-x-auto pb-1">
        {data.map((d) => (
          <div key={d.label} className="flex flex-col items-center gap-1 min-w-[2.5rem] flex-1">
            <div className="flex items-end gap-0.5 h-32 w-full justify-center">
              {d.values.map((v, i) => (
                <div
                  key={i}
                  title={`${series[i]}: ${v}`}
                  className={cn('w-2.5 rounded-t', colors[i % colors.length])}
                  style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
                />
              ))}
            </div>
            <span className="text-[10px] text-slate-500 whitespace-nowrap">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Tabs: React.FC<{
  tabs: { id: string; label: React.ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}> = ({ tabs, active, onChange }) => (
  <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto" role="tablist">
    {tabs.map((t) => (
      <button
        key={t.id}
        role="tab"
        aria-selected={active === t.id}
        onClick={() => onChange(t.id)}
        className={cn(
          'px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
          active === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
        )}
      >
        {t.label}
      </button>
    ))}
  </div>
);
