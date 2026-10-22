import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hourglass,
  Info,
  MessageSquareWarning,
  PieChart,
  RefreshCw,
  ShieldCheck,
  TimerOff,
  XCircle,
} from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { cn, errorMessage, formatDateTime, hhmm, todayISO } from '../../lib/utils';
import { useApi } from '../../components/attendance/useApi';
import { useToast } from '../../components/ui/Toast';
import { Card, CardDescription, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ATTENDANCE_STATUS_META, AttendanceStatusBadge, Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { ErrorState, PageHeader, Pagination, Skeleton, StatCard, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import {
  DurationCell,
  IntervalsCell,
  PercentValue,
  StatusDefinitions,
  StatusLegend,
} from '../../components/attendance/AttendanceShared';
import {
  addDays,
  countingRuleText,
  parseISODate,
  prettyDate,
  toISODate,
  type AttendanceDispute,
  type AttendanceRecord,
  type StudentAttendanceSummary,
} from '../../components/attendance/types';

const EMPTY_MESSAGE =
  'No class attendance has been calculated yet — attendance appears once RFID records are synchronised.';
const PAGE_SIZE = 20;

/* ------------------------------------------------------------------------------------------------ */

export const StudentAttendance: React.FC = () => {
  const toast = useToast();
  const fetchMine = useCallback(() => ApiClient.get<StudentAttendanceSummary>('/attendance/my'), []);
  const { data, loading, error, reload: load } = useApi(fetchMine);

  // Daily details date-range filter (refetches /attendance/my with date_from/date_to).
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const fetchRange = useMemo(
    () =>
      range
        ? () =>
            ApiClient.get<StudentAttendanceSummary>(
              '/attendance/my' + qs({ date_from: range.from || undefined, date_to: range.to || undefined })
            )
        : null,
    [range]
  );
  const rangeState = useApi(fetchRange);
  const rangeRecords = range && rangeState.fresh ? rangeState.data?.records ?? [] : null;
  const rangeLoading = !!range && rangeState.loading;
  const rangeError = range ? rangeState.error : null;
  const [page, setPage] = useState(1);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [disputeTarget, setDisputeTarget] = useState<AttendanceRecord | null>(null);

  const refreshAll = () => {
    load();
    if (range) rangeState.reload();
  };

  const applyRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromInput && toInput && toInput < fromInput) {
      toast.error('Invalid date range', 'The end date must be on or after the start date.');
      return;
    }
    setRange(fromInput || toInput ? { from: fromInput, to: toInput } : null);
    setPage(1);
  };
  const clearRange = () => {
    setFromInput('');
    setToInput('');
    setRange(null);
    setPage(1);
  };

  const records = useMemo(() => data?.records || [], [data]);
  const disputes = useMemo(() => data?.disputes || [], [data]);
  const openDisputeRecordIds = useMemo(
    () => new Set(disputes.filter((d) => d.status === 'OPEN').map((d) => d.record_id)),
    [disputes]
  );

  if (loading && !data) return <AttendanceSkeleton />;
  if (error && !data)
    return (
      <div className="space-y-6">
        <PageHeader title="My Attendance" />
        <ErrorState title="Could not load your attendance" message={error} onRetry={load} />
      </div>
    );
  if (!data) return null;

  const { overall, policy, subjects, alerts } = data;
  const threshold = policy.minimum_percentage;
  const nothingCalculated = overall.total_sessions === 0;
  const tableRecords = rangeRecords ?? records;
  const pageRecords = tableRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const overallBelow = overall.percentage !== null && overall.percentage < threshold;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance"
        title="My Attendance"
        description={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {data.student?.section && <span>{data.student.section}</span>}
            {data.student?.usn && (
              <span>
                USN <span className="font-mono text-slate-700">{data.student.usn}</span>
              </span>
            )}
            <span>
              RFID card{' '}
              <span className="font-mono text-slate-700">{data.student?.rfid_uid || 'not registered'}</span>
            </span>
          </span>
        }
        actions={
          <Button variant="outline" size="sm" onClick={refreshAll} isLoading={loading} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        }
      />

      {/* Policy / sync status line */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-600 shadow-xs">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-blue-600" aria-hidden="true" />
          Required attendance: <strong className="text-slate-900">{threshold}%</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4 text-slate-400" aria-hidden="true" />
          Last RFID sync:{' '}
          <strong className="text-slate-900">{data.last_sync_at ? formatDateTime(data.last_sync_at) : 'Not synchronised yet'}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4 text-slate-400" aria-hidden="true" />
          Tracking since: <strong className="text-slate-900">{data.tracking_start ? prettyDate(data.tracking_start, false) : '—'}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
          Late after <strong className="text-slate-900">{policy.late_arrival_grace_minutes ?? 0} min</strong> grace
        </span>
      </div>

      {error && <ErrorState title="Could not refresh attendance" message={error} onRetry={load} />}

      {nothingCalculated && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4" role="status">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold text-blue-900">No attendance yet</p>
            <p className="text-blue-800 text-xs mt-0.5">{EMPTY_MESSAGE}</p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Overall attendance"
          value={<PercentValue value={overall.percentage} threshold={threshold} />}
          hint={overall.percentage === null ? 'Not yet calculated' : overallBelow ? `Below the required ${threshold}%` : `Required ${threshold}%`}
          icon={<PieChart className="w-4 h-4" />}
          tone={overall.percentage === null ? 'default' : overallBelow ? 'danger' : 'success'}
        />
        <StatCard
          label="Classes held"
          value={overall.classes_held}
          hint={`Excludes ${overall.cancelled} cancelled, ${overall.excused} excused`}
          icon={<CalendarCheck className="w-4 h-4" />}
          tone="info"
        />
        <StatCard label="Attended" value={overall.attended} hint="Counted toward attendance %" icon={<CheckCircle2 className="w-4 h-4" />} tone="success" />
        <StatCard label="Missed" value={overall.missed} hint="Absent and uncounted classes" icon={<XCircle className="w-4 h-4" />} tone="danger" />
        <StatCard
          label="Late arrivals"
          value={overall.late}
          hint={policy.count_late_as_attended ? 'Counted as attended' : 'Not counted as attended'}
          icon={<Clock className="w-4 h-4" />}
          tone="warning"
        />
        <StatCard
          label="Partial attendance"
          value={overall.partial}
          hint={policy.count_partial_as_attended ? 'Counted as attended' : 'Not counted as attended'}
          icon={<TimerOff className="w-4 h-4" />}
        />
        <StatCard label="Pending verification" value={overall.pending} hint="Not counted until verified" icon={<Hourglass className="w-4 h-4" />} tone="info" />
        <StatCard
          label="Subjects below threshold"
          value={data.subjects_below_threshold}
          hint={`of ${subjects.length} subject${subjects.length === 1 ? '' : 's'}`}
          icon={<AlertTriangle className="w-4 h-4" />}
          tone={data.subjects_below_threshold > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Subject-wise */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <CardTitle>Subject-wise attendance</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">{countingRuleText(policy)}</CardDescription>
        </div>
        {subjects.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<BookOpen className="w-6 h-6" />} title="No subject attendance yet" description={EMPTY_MESSAGE} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Subject</Th>
                <Th className="text-right">Classes held</Th>
                <Th className="text-right">Present</Th>
                <Th className="text-right">Late</Th>
                <Th className="text-right">Partial</Th>
                <Th className="text-right">Absent</Th>
                <Th>Other</Th>
                <Th className="text-right">Attendance %</Th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.subject_id} className={cn(s.below_threshold && 'bg-rose-50/50')}>
                  <Td>
                    <div className="font-mono text-xs font-semibold text-blue-700">{s.subject_code}</div>
                    <div className="text-xs text-slate-600">{s.subject_name}</div>
                  </Td>
                  <Td className="text-right tabular-nums">{s.classes_held}</Td>
                  <Td className="text-right tabular-nums">{s.present}</Td>
                  <Td className="text-right tabular-nums">{s.late}</Td>
                  <Td className="text-right tabular-nums">{s.partial}</Td>
                  <Td className="text-right tabular-nums">{s.absent}</Td>
                  <Td className="text-[11px] text-slate-500 whitespace-nowrap">
                    {[
                      s.pending ? `${s.pending} pending` : null,
                      s.excused ? `${s.excused} excused` : null,
                      s.cancelled ? `${s.cancelled} cancelled` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <PercentValue value={s.percentage} threshold={s.threshold} />
                    <div className="text-[10px] text-slate-500">
                      {s.attended}/{s.classes_held} · req. {s.threshold}%
                    </div>
                    {s.below_threshold && (
                      <Badge variant="danger" className="mt-1">
                        Below threshold
                      </Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Calendar + selected day */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <AttendanceCalendar records={records} selected={selectedDay} onSelect={setSelectedDay} />
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>{selectedDay ? prettyDate(selectedDay) : 'Select a day'}</CardTitle>
          <CardDescription>Class records for the selected calendar day.</CardDescription>
          <div className="mt-4">
            {!selectedDay ? (
              <p className="text-xs text-slate-500">Choose a day in the calendar to see each class's attendance.</p>
            ) : (
              <DayRecords
                records={records.filter((r) => r.date === selectedDay)}
                openDisputeIds={openDisputeRecordIds}
                onDispute={setDisputeTarget}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Daily details */}
      <Card className="p-0 overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-4 border-b border-slate-100 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Daily class details</CardTitle>
            <CardDescription>
              {range
                ? `Showing classes ${range.from ? 'from ' + prettyDate(range.from, false) : ''} ${range.to ? 'to ' + prettyDate(range.to, false) : ''}`
                : 'Every evaluated class, newest first.'}
            </CardDescription>
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={applyRange} aria-label="Filter by date range">
            <div className="w-40">
              <Input id="att-from" label="From" type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
            </div>
            <div className="w-40">
              <Input id="att-to" label="To" type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} />
            </div>
            <Button type="submit" size="md" variant="secondary">
              Apply
            </Button>
            {range && (
              <Button type="button" size="md" variant="ghost" onClick={clearRange}>
                Clear
              </Button>
            )}
          </form>
        </div>
        {rangeLoading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : rangeError ? (
          <div className="p-5">
            <ErrorState title="Could not load records for this range" message={rangeError} onRetry={rangeState.reload} />
          </div>
        ) : tableRecords.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<CalendarDays className="w-6 h-6" />}
              title={range ? 'No classes in this range' : 'No class records yet'}
              description={range ? 'No evaluated classes fall within the selected dates.' : EMPTY_MESSAGE}
            />
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Subject</Th>
                  <Th>Scheduled</Th>
                  <Th>Actual entry → exit</Th>
                  <Th>Duration</Th>
                  <Th>Status</Th>
                  <Th>Reason</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {pageRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <Td className="whitespace-nowrap text-xs font-medium text-slate-900">{prettyDate(r.date)}</Td>
                    <Td>
                      <div className="font-mono text-xs font-semibold text-blue-700">{r.subject_code}</div>
                      <div className="text-[11px] text-slate-500 max-w-[12rem] truncate" title={r.subject_name || ''}>
                        {r.subject_name}
                      </div>
                    </Td>
                    <Td className="font-mono text-xs whitespace-nowrap">
                      {hhmm(r.scheduled_start)}–{hhmm(r.scheduled_end)}
                    </Td>
                    <Td>
                      <IntervalsCell record={r} />
                    </Td>
                    <Td>
                      <DurationCell record={r} />
                    </Td>
                    <Td>
                      <AttendanceStatusBadge status={r.final_status} corrected={r.is_overridden} />
                    </Td>
                    <Td className="text-[11px] text-slate-500 min-w-[14rem] max-w-xs">
                      {r.status_reason || '—'}
                      {r.is_overridden && r.override_reason && (
                        <div className="mt-0.5 text-slate-600">Correction: {r.override_reason}</div>
                      )}
                    </Td>
                    <Td className="text-right">
                      <DisputeButton record={r} open={openDisputeRecordIds.has(r.id)} onClick={() => setDisputeTarget(r)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {tableRecords.length > PAGE_SIZE && (
              <Pagination total={tableRecords.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
            )}
          </>
        )}
      </Card>

      {/* Review requests */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <CardTitle>My review requests</CardTitle>
          <CardDescription className="mt-1">
            Students cannot edit attendance records. If a class record looks wrong, use “Request review” — your lecturer or an
            administrator will check the RFID evidence and correct the record if needed.
          </CardDescription>
        </div>
        {disputes.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-slate-500">You have not requested any reviews.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Submitted</Th>
                <Th>Class</Th>
                <Th>Your message</Th>
                <Th>Status</Th>
                <Th>Response</Th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((d) => (
                <DisputeRow key={d.id} d={d} />
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <StatusDefinitions policy={policy} />

      <DisputeModal
        key={disputeTarget?.id ?? 'none'}
        record={disputeTarget}
        onClose={() => setDisputeTarget(null)}
        onSubmitted={() => {
          setDisputeTarget(null);
          load();
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------ */

const AttendanceSkeleton: React.FC = () => (
  <div className="space-y-6" aria-busy="true" aria-label="Loading attendance">
    <Skeleton className="h-10 w-64" />
    <Skeleton className="h-12" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
    <Skeleton className="h-56" />
    <Skeleton className="h-72" />
  </div>
);

const AlertsPanel: React.FC<{ alerts: StudentAttendanceSummary['alerts'] }> = ({ alerts }) => {
  const style = (sev: string) =>
    sev === 'danger'
      ? { box: 'border-rose-200 bg-rose-50 text-rose-900', icon: <AlertOctagon className="w-4 h-4 text-rose-600" /> }
      : sev === 'warning'
        ? { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: <AlertTriangle className="w-4 h-4 text-amber-600" /> }
        : { box: 'border-sky-200 bg-sky-50 text-sky-900', icon: <Info className="w-4 h-4 text-sky-600" /> };
  const titles: Record<string, string> = {
    BELOW_THRESHOLD: 'Overall attendance below requirement',
    SUBJECT_BELOW_THRESHOLD: 'Subject below requirement',
    REPEATED_LATE: 'Repeated late arrivals',
    MISSING_EXIT: 'Missing exit scans',
    PENDING_VERIFICATION: 'Awaiting verification',
  };
  return (
    <section aria-label="Attendance alerts" className="grid gap-2 md:grid-cols-2">
      {alerts.map((a, i) => {
        const s = style(a.severity);
        return (
          <div key={`${a.type}-${i}`} className={cn('flex items-start gap-2.5 rounded-xl border px-4 py-3', s.box)} role={a.severity === 'danger' ? 'alert' : undefined}>
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              {s.icon}
            </span>
            <div className="text-xs">
              <p className="font-semibold">{titles[a.type] || 'Attendance notice'}</p>
              <p className="mt-0.5 opacity-90">{a.message}</p>
            </div>
          </div>
        );
      })}
    </section>
  );
};

const DisputeButton: React.FC<{ record: AttendanceRecord; open: boolean; onClick: () => void }> = ({ record, open, onClick }) =>
  open ? (
    <span className="text-[11px] text-slate-500 whitespace-nowrap">Review requested</span>
  ) : (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      leftIcon={<MessageSquareWarning className="w-3.5 h-3.5" />}
      aria-label={`Request review for ${record.subject_code ?? 'class'} on ${prettyDate(record.date)}`}
    >
      Request review
    </Button>
  );

const DisputeRow: React.FC<{ d: AttendanceDispute }> = ({ d }) => (
  <tr>
    <Td className="text-xs whitespace-nowrap">{formatDateTime(d.created_at)}</Td>
    <Td className="text-xs whitespace-nowrap">
      <span className="font-mono font-semibold text-blue-700">{d.subject_code}</span>
      <div className="text-[11px] text-slate-500">{prettyDate(d.date)}</div>
      {d.final_status && (
        <div className="mt-1">
          <AttendanceStatusBadge status={d.final_status} />
        </div>
      )}
    </Td>
    <Td className="text-xs text-slate-600 max-w-sm whitespace-pre-wrap break-words">{d.message}</Td>
    <Td>
      <Badge variant={d.status === 'OPEN' ? 'info' : d.status === 'RESOLVED' ? 'success' : 'danger'}>
        {d.status === 'OPEN' ? 'Open' : d.status === 'RESOLVED' ? 'Resolved' : d.status === 'REJECTED' ? 'Rejected' : d.status}
      </Badge>
    </Td>
    <Td className="text-xs text-slate-600 max-w-sm">
      {d.resolution_note || <span className="text-slate-400">Awaiting review</span>}
      {d.resolved_at && <div className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(d.resolved_at)}</div>}
    </Td>
  </tr>
);

const DayRecords: React.FC<{
  records: AttendanceRecord[];
  openDisputeIds: Set<number>;
  onDispute: (r: AttendanceRecord) => void;
}> = ({ records, openDisputeIds, onDispute }) => {
  if (!records.length) return <p className="text-xs text-slate-500">No class attendance recorded for this day.</p>;
  const sorted = [...records].sort((a, b) => (a.scheduled_start || '').localeCompare(b.scheduled_start || ''));
  return (
    <ul className="space-y-3">
      {sorted.map((r) => (
        <li key={r.id} className="rounded-lg border border-slate-200/80 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-slate-900">
                <span className="font-mono text-blue-700 mr-1">{r.subject_code}</span>
                {r.subject_name}
              </p>
              <p className="font-mono text-[11px] text-slate-500">
                {hhmm(r.scheduled_start)}–{hhmm(r.scheduled_end)}
                {r.room_number ? ` · ${r.room_number}` : ''}
              </p>
            </div>
            <AttendanceStatusBadge status={r.final_status} corrected={r.is_overridden} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Entry → exit</p>
              <IntervalsCell record={r} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Duration</p>
              <DurationCell record={r} />
            </div>
          </div>
          {r.status_reason && <p className="mt-2 text-[11px] text-slate-500">{r.status_reason}</p>}
          <div className="mt-2 flex justify-end">
            <DisputeButton record={r} open={openDisputeIds.has(r.id)} onClick={() => onDispute(r)} />
          </div>
        </li>
      ))}
    </ul>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Calendar
 * ---------------------------------------------------------------------------------------------- */

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const AttendanceCalendar: React.FC<{
  records: AttendanceRecord[];
  selected: string | null;
  onSelect: (iso: string) => void;
}> = ({ records, selected, onSelect }) => {
  const [todayIso] = useState(todayISO);
  const [month, setMonth] = useState(() => (records[0]?.date || todayIso).slice(0, 7) + '-01');
  const gridRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);

  const byDate = useMemo(() => {
    const m = new Map<string, AttendanceRecord[]>();
    records.forEach((r) => {
      const list = m.get(r.date) || [];
      list.push(r);
      m.set(r.date, list);
    });
    m.forEach((list) => list.sort((a, b) => (a.scheduled_start || '').localeCompare(b.scheduled_start || '')));
    return m;
  }, [records]);

  const first = parseISODate(month);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const monthLabel = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const shiftMonth = (n: number) => {
    const d = new Date(first.getFullYear(), first.getMonth() + n, 1);
    setMonth(toISODate(d));
  };

  useEffect(() => {
    if (focusPending.current && selected) {
      focusPending.current = false;
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${selected}"]`)?.focus();
    }
  }, [selected, month]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, iso: string) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = addDays(iso, delta);
    if (next.slice(0, 7) !== month.slice(0, 7)) setMonth(next.slice(0, 7) + '-01');
    focusPending.current = true;
    onSelect(next);
  };

  const monthCount = records.filter((r) => r.date.startsWith(month.slice(0, 7))).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <CardTitle>Attendance calendar</CardTitle>
          <CardDescription aria-live="polite">
            {monthLabel} · {monthCount} class record{monthCount === 1 ? '' : 's'}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMonth(todayIso.slice(0, 7) + '-01')}>
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 py-1">
            {d}
          </div>
        ))}
      </div>
      <div ref={gridRef} className="grid grid-cols-7 gap-1" role="group" aria-label={`Attendance for ${monthLabel}`}>
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`pad-${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const iso = toISODate(new Date(first.getFullYear(), first.getMonth(), i + 1));
          const dayRecs = byDate.get(iso) || [];
          const isSel = selected === iso;
          const label =
            prettyDate(iso) +
            (dayRecs.length
              ? `: ${dayRecs.length} class${dayRecs.length > 1 ? 'es' : ''} — ` +
                dayRecs.map((r) => `${r.subject_code ?? ''} ${ATTENDANCE_STATUS_META[r.final_status]?.label ?? r.final_status}`).join(', ')
              : ': no class records');
          return (
            <button
              key={iso}
              type="button"
              data-day={iso}
              onClick={() => onSelect(iso)}
              onKeyDown={(e) => onKeyDown(e, iso)}
              aria-pressed={isSel}
              aria-label={label}
              className={cn(
                'relative flex flex-col items-center justify-start rounded-lg border p-1 sm:p-1.5 min-h-[3rem] sm:min-h-[3.75rem] text-xs transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                isSel ? 'border-blue-500 bg-blue-50' : dayRecs.length ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-transparent bg-slate-50/60 hover:bg-slate-100',
                iso === todayIso && !isSel && 'border-blue-200'
              )}
            >
              <span className={cn('tabular-nums', iso === todayIso ? 'font-bold text-blue-700' : 'text-slate-700')}>{i + 1}</span>
              {dayRecs.length > 0 && (
                <span className="mt-1 flex flex-wrap justify-center gap-0.5" aria-hidden="true">
                  {dayRecs.slice(0, 6).map((r) => (
                    <span key={r.id} className={cn('w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full', ATTENDANCE_STATUS_META[r.final_status]?.dot || 'bg-slate-300')} />
                  ))}
                  {dayRecs.length > 6 && <span className="text-[9px] leading-none text-slate-500">+{dayRecs.length - 6}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <StatusLegend className="mt-4" />
      <p className="mt-2 text-[11px] text-slate-400">Tip: use the arrow keys to move between days.</p>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Request review modal
 * ---------------------------------------------------------------------------------------------- */

const DisputeModal: React.FC<{ record: AttendanceRecord | null; onClose: () => void; onSubmitted: () => void }> = ({
  record,
  onClose,
  onSubmitted,
}) => {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimmed = message.trim();
  const valid = trimmed.length >= 5 && trimmed.length <= 2000;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record || !valid) return;
    setSaving(true);
    setErr(null);
    try {
      await ApiClient.post(`/attendance/records/${record.id}/dispute`, { message: trimmed });
      toast.success('Review requested', 'Your lecturer has been notified.');
      onSubmitted();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!record} onClose={onClose} title="Request a review" description="Ask your lecturer to re-check this class record." maxWidth="lg">
      {record && (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">
                <span className="font-mono text-blue-700 mr-1">{record.subject_code}</span>
                {prettyDate(record.date)}
              </span>
              <AttendanceStatusBadge status={record.final_status} corrected={record.is_overridden} />
            </div>
            <p className="font-mono text-slate-600">
              Scheduled {hhmm(record.scheduled_start)}–{hhmm(record.scheduled_end)} · attended {record.attended_minutes ?? 0}/
              {record.scheduled_minutes ?? 0} min
            </p>
            {record.status_reason && <p className="text-slate-500">{record.status_reason}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="dispute-msg" className="block text-xs font-medium text-slate-700">
              What looks wrong? <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="dispute-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              required
              aria-describedby="dispute-help"
              placeholder="e.g. I attended the full class but my exit scan was not recorded at the classroom reader."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
            <p id="dispute-help" className="flex justify-between text-[11px] text-slate-500">
              <span>At least 5 characters. You cannot change the record yourself.</span>
              <span className="tabular-nums">{trimmed.length}/2000</span>
            </p>
          </div>
          {err && <ErrorState title="Could not submit the request" message={err} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving} disabled={!valid}>
              Submit request
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
