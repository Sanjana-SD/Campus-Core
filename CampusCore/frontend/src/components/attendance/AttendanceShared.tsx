/**
 * Presentational pieces shared by the student and lecturer attendance / timetable pages.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Ban, CalendarDays, ChevronLeft, ChevronRight, Clock, Coffee, Info, MapPin, User, Users } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { cn, hhmm, todayISO } from '../../lib/utils';
import { useApi } from './useApi';
import { ATTENDANCE_STATUS_META, Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardDescription, CardTitle } from '../ui/Card';
import { ErrorState, Skeleton } from '../ui/Kit';
import {
  STATUS_ORDER,
  WEEK_DAYS,
  addDays,
  mondayOf,
  prettyDate,
  todayWeekday,
  type AttendancePolicy,
  type AttendanceRecord,
  type TimetableBreak,
  type TimetableEntry,
  type WeekResponse,
} from './types';

/* ------------------------------------------------------------------------------------------------
 * Attendance definitions
 * ---------------------------------------------------------------------------------------------- */

export const StatusLegend: React.FC<{ className?: string }> = ({ className }) => (
  <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-600', className)} aria-label="Status legend">
    {STATUS_ORDER.map((s) => (
      <li key={s} className="flex items-center gap-1.5">
        <span className={cn('w-2.5 h-2.5 rounded-full', ATTENDANCE_STATUS_META[s].dot)} aria-hidden="true" />
        {ATTENDANCE_STATUS_META[s].label}
      </li>
    ))}
  </ul>
);

/** Status definitions exactly as implemented by the backend attendance engine. */
export const StatusDefinitions: React.FC<{ policy: AttendancePolicy | null | undefined; defaultOpen?: boolean }> = ({
  policy,
  defaultOpen = false,
}) => {
  const present = policy?.present_min_percent ?? 75;
  const partial = policy?.partial_min_percent ?? 25;
  const grace = policy?.late_arrival_grace_minutes ?? 0;
  const minMinutes = policy?.min_required_minutes;
  const missingExitPending = (policy?.missing_exit_policy ?? 'PENDING_VERIFICATION') === 'PENDING_VERIFICATION';
  const defs: { status: string; text: React.ReactNode }[] = [
    {
      status: 'PRESENT',
      text: (
        <>
          In class for at least {present}% of the scheduled time
          {minMinutes ? ` (and at least ${minMinutes} minutes)` : ''}, first seen within {grace} minutes of the start.
        </>
      ),
    },
    {
      status: 'LATE',
      text: (
        <>
          Met the {present}% duration requirement, but first seen more than {grace} minutes after the class started.
        </>
      ),
    },
    {
      status: 'PARTIAL',
      text: (
        <>
          Some presence, at least {partial}% but below {present}% of the scheduled time.
        </>
      ),
    },
    { status: 'ABSENT', text: <>No recorded presence, or presence below {partial}% of the scheduled time.</> },
    {
      status: 'PENDING_VERIFICATION',
      text: (
        <>
          A scan with an entry but no exit (or exit but no entry) could overlap the class, so presence cannot be confirmed.
          {missingExitPending ? '' : ' (Your college policy may instead treat missing exits as absent.)'} Times are never guessed.
        </>
      ),
    },
    { status: 'EXCUSED', text: <>Excused by a lecturer or administrator. Not counted in classes held.</> },
    { status: 'CANCELLED', text: <>The class was cancelled. Not counted in classes held.</> },
  ];
  return (
    <details className="group rounded-xl border border-slate-200/80 bg-white shadow-xs" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl">
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" aria-hidden="true" />
          How attendance is calculated
        </span>
        <ChevronRight className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="px-4 pb-4 space-y-3 text-xs text-slate-600">
        <p>
          Each class is evaluated from your RFID entry/exit scans. Attended minutes are the union of your scan intervals
          clipped to the scheduled class time — overlapping scans are never double counted and time outside the class never
          counts. Duration % = attended minutes ÷ scheduled minutes × 100.
        </p>
        <dl className="grid gap-2 sm:grid-cols-2">
          {defs.map((d) => (
            <div key={d.status} className="flex gap-2 rounded-lg bg-slate-50 border border-slate-100 p-2.5">
              <span className={cn('mt-1 w-2.5 h-2.5 rounded-full shrink-0', ATTENDANCE_STATUS_META[d.status].dot)} aria-hidden="true" />
              <div>
                <dt className="font-semibold text-slate-800">{ATTENDANCE_STATUS_META[d.status].label}</dt>
                <dd className="mt-0.5 leading-relaxed">{d.text}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
};

/** All presence intervals of a record (entry → exit); missing values are shown as missing, never invented. */
export const IntervalsCell: React.FC<{ record: AttendanceRecord }> = ({ record }) => {
  const ivs = record.intervals || [];
  if (!ivs.length) {
    if (record.first_entry || record.last_exit)
      return (
        <span className="font-mono text-xs">
          {hhmm(record.first_entry)} → {hhmm(record.last_exit)}
        </span>
      );
    return <span className="text-xs text-slate-400">No scans</span>;
  }
  return (
    <ul className="space-y-0.5">
      {ivs.map((iv, i) => (
        <li key={`${iv.row_id ?? i}-${i}`} className="font-mono text-xs whitespace-nowrap">
          {iv.entry ? hhmm(iv.entry) : <span className="text-amber-600">no entry</span>}
          <span className="text-slate-400"> → </span>
          {iv.exit ? hhmm(iv.exit) : <span className="text-amber-600">no exit</span>}
        </li>
      ))}
    </ul>
  );
};

export const DurationCell: React.FC<{ record: AttendanceRecord }> = ({ record }) => {
  const p = record.duration_percent;
  return (
    <div className="min-w-[6.5rem]">
      <div className="text-xs tabular-nums text-slate-700">
        {record.attended_minutes ?? 0}/{record.scheduled_minutes ?? 0} min
        <span className="text-slate-400"> · </span>
        {p === null || p === undefined ? '—' : `${p.toFixed(1)}%`}
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, p || 0))}%` }} />
      </div>
    </div>
  );
};

/** Coloured percentage, highlighted when below the threshold. */
export const PercentValue: React.FC<{ value: number | null | undefined; threshold?: number; className?: string }> = ({
  value,
  threshold,
  className,
}) => {
  if (value === null || value === undefined) return <span className={cn('text-slate-400', className)}>—</span>;
  const below = threshold !== undefined && value < threshold;
  return (
    <span className={cn('font-semibold tabular-nums', below ? 'text-rose-600' : 'text-slate-900', className)}>
      {value.toFixed(1)}%
    </span>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Timetable
 * ---------------------------------------------------------------------------------------------- */

type Slot =
  | { kind: 'class'; start: string; end: string; entry: TimetableEntry }
  | { kind: 'break'; start: string; end: string; brk: TimetableBreak };

function slotsFor(day: string, entries: TimetableEntry[], breaks: TimetableBreak[]): Slot[] {
  const seen = new Set<string>();
  const out: Slot[] = [];
  entries
    .filter((e) => e.day_of_week === day)
    .forEach((e) => out.push({ kind: 'class', start: e.start_time, end: e.end_time, entry: e }));
  breaks
    .filter((b) => b.day_of_week === day)
    .forEach((b) => {
      const key = `${b.start_time}-${b.end_time}-${b.label}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ kind: 'break', start: b.start_time, end: b.end_time, brk: b });
    });
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

const SlotCard: React.FC<{ slot: Slot; perspective: 'student' | 'lecturer'; todayIso: string }> = ({ slot, perspective, todayIso }) => {
  if (slot.kind === 'break')
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-500 flex items-center gap-2">
        <Coffee className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="font-medium">{slot.brk.label}</span>
        <span className="ml-auto font-mono">
          {hhmm(slot.start)}–{hhmm(slot.end)}
        </span>
      </div>
    );
  const e = slot.entry;
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold text-blue-700">{e.subject?.code ?? '—'}</span>
        <span className="font-mono text-[11px] text-slate-600 whitespace-nowrap">
          {hhmm(e.start_time)}–{hhmm(e.end_time)}
        </span>
      </div>
      <p className="mt-0.5 text-xs font-semibold text-slate-900 leading-snug">{e.subject?.name ?? 'Unnamed subject'}</p>
      <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
        {e.room_number && (
          <p className="flex items-center gap-1">
            <MapPin className="w-3 h-3" aria-hidden="true" /> Room {e.room_number}
          </p>
        )}
        {perspective === 'student' && e.lecturer_name && (
          <p className="flex items-center gap-1">
            <User className="w-3 h-3" aria-hidden="true" /> {e.lecturer_name}
          </p>
        )}
        {perspective === 'lecturer' && e.section_label && (
          <p className="flex items-center gap-1">
            <Users className="w-3 h-3" aria-hidden="true" /> {e.section_label}
          </p>
        )}
        {e.effective_from && e.effective_from > todayIso && (
          <p className="text-amber-700">Starts {prettyDate(e.effective_from, false)}</p>
        )}
      </div>
    </div>
  );
};

/** Weekly grid (columns per day) on desktop, day-by-day list on mobile. */
export const WeeklyTimetableGrid: React.FC<{
  entries: TimetableEntry[];
  breaks: TimetableBreak[];
  perspective: 'student' | 'lecturer';
}> = ({ entries, breaks, perspective }) => {
  const [today] = useState(todayWeekday);
  const [todayIso] = useState(todayISO);
  const days = WEEK_DAYS.filter((d) => d !== 'Sunday' || entries.some((e) => e.day_of_week === 'Sunday'));
  const perDay = days.map((d) => ({ day: d, slots: slotsFor(d, entries, breaks), classes: entries.filter((e) => e.day_of_week === d).length }));
  return (
    <>
      {/* Desktop grid */}
      <div className="hidden md:grid gap-3" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {perDay.map(({ day, slots, classes }) => (
          <section key={day} aria-label={day} className={cn('rounded-xl border bg-white p-2.5 min-h-[10rem]', day === today ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200/80')}>
            <header className="flex items-center justify-between px-1 pb-2 mb-2 border-b border-slate-100">
              <h3 className={cn('text-xs font-semibold', day === today ? 'text-blue-700' : 'text-slate-700')}>{day}</h3>
              <span className="text-[10px] text-slate-400">{classes ? `${classes} class${classes > 1 ? 'es' : ''}` : ''}</span>
            </header>
            <div className="space-y-2">
              {classes === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-6">No classes</p>
              ) : (
                slots.map((s, i) => <SlotCard key={i} slot={s} perspective={perspective} todayIso={todayIso} />)
              )}
            </div>
          </section>
        ))}
      </div>
      {/* Mobile day-by-day */}
      <div className="md:hidden space-y-4">
        {perDay.map(({ day, slots, classes }) => (
          <section key={day} aria-label={day}>
            <h3 className={cn('text-xs font-semibold mb-2 flex items-center gap-2', day === today ? 'text-blue-700' : 'text-slate-700')}>
              {day}
              {day === today && <Badge variant="info">Today</Badge>}
            </h3>
            {classes === 0 ? (
              <p className="text-[11px] text-slate-400 rounded-lg border border-dashed border-slate-200 py-3 text-center">No classes</p>
            ) : (
              <div className="space-y-2">
                {slots.map((s, i) => (
                  <SlotCard key={i} slot={s} perspective={perspective} todayIso={todayIso} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
};

/** Concrete sessions for one week (GET /timetable/week), including cancellations. */
export const WeekSessionsCard: React.FC<{ perspective: 'student' | 'lecturer' }> = ({ perspective }) => {
  const [todayIso] = useState(todayISO);
  const thisWeek = mondayOf(todayIso);
  const [start, setStart] = useState(thisWeek);
  const fetchWeek = useCallback(() => ApiClient.get<WeekResponse>('/timetable/week' + qs({ start })), [start]);
  const { data: raw, loading, error, fresh, reload: load } = useApi(fetchWeek);
  const data = fresh ? raw : null;

  const byDate = useMemo(() => {
    const m = new Map<string, WeekResponse['sessions']>();
    (data?.sessions || []).forEach((s) => {
      const list = m.get(s.date) || [];
      list.push(s);
      m.set(s.date, list);
    });
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);
  const cancelled = (data?.sessions || []).filter((s) => s.status === 'CANCELLED').length;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <CardTitle>{start === thisWeek ? 'This week' : 'Week of ' + prettyDate(start, false)}</CardTitle>
          <CardDescription>
            {prettyDate(start, false)} – {prettyDate(addDays(start, 6), false)}
            {data && ` · ${data.sessions.length} class${data.sessions.length === 1 ? '' : 'es'}`}
            {cancelled > 0 && ` · ${cancelled} cancelled`}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Week navigation">
          <Button size="sm" variant="outline" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStart(thisWeek)} disabled={start === thisWeek}>
            This week
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="p-5">
        {loading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : error ? (
          <ErrorState title="Could not load this week's classes" message={error} onRetry={load} />
        ) : byDate.length === 0 ? (
          <div className="py-8 text-center">
            <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-700">No classes scheduled this week</p>
            <p className="text-xs text-slate-500 mt-0.5">Nothing in the timetable falls within these dates.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {byDate.map(([d, list]) => (
              <section key={d} aria-label={prettyDate(d)}>
                <h4 className={cn('text-xs font-semibold mb-2 flex items-center gap-2', d === todayIso ? 'text-blue-700' : 'text-slate-700')}>
                  {prettyDate(d)}
                  {d === todayIso && <Badge variant="info">Today</Badge>}
                </h4>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200/80">
                  {list.map((s) => {
                    const isCancelled = s.status === 'CANCELLED';
                    return (
                      <li key={s.id} className={cn('flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4', isCancelled && 'bg-rose-50/40')}>
                        <span className="font-mono text-xs text-slate-600 whitespace-nowrap flex items-center gap-1.5 sm:w-28">
                          <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                          {s.start_time}–{s.end_time}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-xs font-semibold text-slate-900', isCancelled && 'line-through text-slate-500')}>
                            <span className="font-mono text-blue-700 mr-1.5">{s.subject_code}</span>
                            {s.subject_name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {s.room_number ? `Room ${s.room_number}` : 'Room not set'}
                            {perspective === 'student' && s.lecturer_name && ` · ${s.lecturer_name}`}
                            {perspective === 'lecturer' && s.section && ` · ${s.section}`}
                          </p>
                          {isCancelled && s.cancel_reason && (
                            <p className="text-[11px] text-rose-700 mt-0.5">Reason: {s.cancel_reason}</p>
                          )}
                        </div>
                        {isCancelled ? (
                          <Badge variant="danger" className="self-start sm:self-center">
                            <Ban className="w-3 h-3 mr-1" aria-hidden="true" />
                            Cancelled
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="self-start sm:self-center">
                            Scheduled
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};
