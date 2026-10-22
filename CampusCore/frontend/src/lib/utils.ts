import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

export function formatTime(timeStr: string | undefined): string {
  if (!timeStr) return '--:--';
  return timeStr;
}

export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

/** "2026-10-22T09:00:00Z" -> "22 Oct 2026, 2:30 pm" in the viewer's locale. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "09:05:00" -> "09:05". Returns an em dash for missing values (never invents a time). */
export function hhmm(t: string | null | undefined): string {
  if (!t) return '—';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function pct(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined ? '—' : `${n.toFixed(digits)}%`;
}

export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function formatCtc(min?: number | null, max?: number | null, text?: string | null): string | null {
  if (text) return text;
  if (min != null && max != null && min !== max) return `₹${min}–${max} LPA`;
  if (min != null || max != null) return `₹${min ?? max} LPA`;
  return null;
}
