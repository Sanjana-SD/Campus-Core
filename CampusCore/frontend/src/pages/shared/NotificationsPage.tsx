import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, Briefcase, CalendarCheck, CheckCheck, Circle, Mail, MailOpen } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { cn, errorMessage, formatDateTime } from '../../lib/utils';
import { ErrorState, PageHeader, Pagination, Skeleton } from '../../components/ui/Kit';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { useApiQuery } from '../student/placements/useApiQuery';

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link: string | null;
  created_at: string | null;
}
interface NotificationList {
  total: number;
  unread: number;
  items: NotificationItem[];
}

const PAGE_SIZE = 20;
const TYPES = [
  { id: '', label: 'All types' },
  { id: 'PLACEMENT', label: 'Placement' },
  { id: 'ATTENDANCE', label: 'Attendance' },
];

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.345, 'week'],
    [12, 'month'],
    [Infinity, 'year'],
  ];
  let v = s;
  for (const [size, unit] of steps) {
    if (Math.abs(v) < size) return rtf.format(-Math.round(v), unit);
    v /= size;
  }
  return '';
}

function typeIcon(type: string) {
  if (type.startsWith('PLACEMENT')) return <Briefcase className="w-4 h-4" />;
  if (type.startsWith('ATTENDANCE')) return <CalendarCheck className="w-4 h-4" />;
  return <Bell className="w-4 h-4" />;
}

function typeLabel(type: string): string {
  return type
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Only follow in-app routes; never navigate to external or script URLs. */
function internalLink(link: string | null): string | null {
  return link && link.startsWith('/') && !link.startsWith('//') ? link : null;
}

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload: load, setData } = useApiQuery<NotificationList>(
    `/notifications${qs({ unread_only: unreadOnly || undefined, type_prefix: type, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE })}`
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const patchLocal = (id: number, read: boolean) =>
    setData((d) =>
      d
        ? {
            ...d,
            unread: Math.max(0, d.unread + (read ? -1 : 1)),
            items: d.items.map((n) => (n.id === id ? { ...n, is_read: read } : n)),
          }
        : d
    );

  const setRead = async (n: NotificationItem, read: boolean) => {
    setBusyId(n.id);
    try {
      await ApiClient.post(`/notifications/${n.id}/read${qs({ read })}`);
      patchLocal(n.id, read);
      if (unreadOnly && read) load();
    } catch (e) {
      toast.error('Could not update notification', errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const open = async (n: NotificationItem) => {
    const to = internalLink(n.link);
    if (!n.is_read) {
      try {
        await ApiClient.post(`/notifications/${n.id}/read${qs({ read: true })}`);
        patchLocal(n.id, true);
      } catch {
        /* navigation still proceeds */
      }
    }
    if (to) navigate(to);
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      const r = await ApiClient.post<{ updated: number }>('/notifications/read-all');
      toast.success('All caught up', `${r.updated} notification${r.updated === 1 ? '' : 's'} marked as read.`);
      if (page !== 1) setPage(1);
      else load();
    } catch (e) {
      toast.error('Could not mark all as read', errorMessage(e));
    } finally {
      setMarkingAll(false);
    }
  };

  const changeFilter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Notifications"
        description={data ? `${data.unread} unread` : 'Updates about placements, attendance and your account.'}
        actions={
          <Button
            variant="outline"
            leftIcon={<CheckCheck className="w-4 h-4" />}
            onClick={markAll}
            isLoading={markingAll}
            disabled={!data || data.unread === 0}
          >
            Mark all read
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs" role="group" aria-label="Read state">
          {[
            { v: false, label: 'All' },
            { v: true, label: 'Unread' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={unreadOnly === o.v}
              onClick={() => changeFilter(() => setUnreadOnly(o.v))}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                unreadOnly === o.v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {o.label}
              {o.v && data ? ` (${data.unread})` : ''}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Notification type">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={type === t.id}
              onClick={() => changeFilter(() => setType(t.id))}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                type === t.id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          {loading && !data ? (
            <ul className="divide-y divide-slate-100" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex gap-3 p-4">
                  <Skeleton className="w-9 h-9 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </li>
              ))}
            </ul>
          ) : data && data.items.length ? (
            <>
              <ul className={cn('divide-y divide-slate-100', loading && 'opacity-60')} aria-busy={loading}>
                {data.items.map((n) => {
                  const to = internalLink(n.link);
                  return (
                    <li key={n.id} className={cn('group flex items-start gap-3 p-4 transition-colors', !n.is_read && 'bg-blue-50/40')}>
                      <span
                        className={cn(
                          'mt-0.5 p-2 rounded-lg shrink-0',
                          n.type.startsWith('PLACEMENT')
                            ? 'bg-violet-50 text-violet-600'
                            : n.type.startsWith('ATTENDANCE')
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-slate-100 text-slate-500'
                        )}
                        aria-hidden="true"
                      >
                        {typeIcon(n.type)}
                      </span>
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className={cn(
                          'flex-1 min-w-0 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                          to ? 'cursor-pointer' : 'cursor-default'
                        )}
                        aria-label={`${n.is_read ? '' : 'Unread: '}${n.title}${to ? '. Open' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          {!n.is_read && <Circle className="w-2 h-2 fill-blue-600 text-blue-600 shrink-0" aria-hidden="true" />}
                          <p className={cn('text-sm truncate', n.is_read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>
                            {n.title}
                          </p>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600 break-words">{n.message}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          <time dateTime={n.created_at || undefined} title={formatDateTime(n.created_at)}>
                            {relativeTime(n.created_at)}
                          </time>
                          <span> · {formatDateTime(n.created_at)}</span>
                          <span> · {typeLabel(n.type)}</span>
                        </p>
                      </button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => setRead(n, !n.is_read)}
                        isLoading={busyId === n.id}
                        aria-label={n.is_read ? `Mark "${n.title}" as unread` : `Mark "${n.title}" as read`}
                        title={n.is_read ? 'Mark as unread' : 'Mark as read'}
                      >
                        {n.is_read ? <Mail className="w-4 h-4" /> : <MailOpen className="w-4 h-4" />}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {data.total > PAGE_SIZE && <Pagination total={data.total} page={page} pageSize={PAGE_SIZE} onPage={setPage} />}
            </>
          ) : (
            <EmptyState
              className="m-4"
              icon={<BellOff className="w-6 h-6" />}
              title={unreadOnly ? 'No unread notifications' : 'No notifications'}
              description={
                unreadOnly || type
                  ? 'Nothing matches the current filter. Try showing all notifications.'
                  : 'You are all caught up. New updates will appear here.'
              }
            />
          )}
        </div>
      )}
    </div>
  );
};
