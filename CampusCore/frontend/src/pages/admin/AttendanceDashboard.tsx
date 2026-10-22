import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CalendarCheck, CalendarOff, CheckCircle2, Clock, FileSpreadsheet, Gauge, HelpCircle,
  ListChecks, MessageSquareWarning, RefreshCw, ScanLine, Settings2, Timer, UserX, Users,
} from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { errorMessage, formatDate, formatDateTime, pct, todayISO } from '../../lib/utils';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { BarList, ConfirmDialog, ErrorState, PageHeader, Skeleton, StatCard, Table, Td, Th } from '../../components/ui/Kit';
import { useToast } from '../../components/ui/Toast';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { InlineAlert, StatusLegend, SyncRunStatusBadge, TextArea } from './AttendanceKit';
import { isSetupError, recalcText, useApi, useLookups, type Aggregate, type Policy, type RecalcStats, type SyncRun } from './attendanceShared';

interface Summary {
  policy: Policy;
  tracking_start: string | null;
  total_students: number;
  total_scheduled_sessions: number;
  completed_sessions: number;
  overall: Aggregate;
  today: Aggregate & { date: string };
  students_below_threshold: number;
  below_threshold: {
    student_id: number;
    student_name: string | null;
    student_usn: string | null;
    percentage: number;
    attended: number;
    classes_held: number;
  }[];
  late_arrivals: number;
  partial_attendance: number;
  pending_verification: number;
  unmatched_rfid_rows: number;
  conflict_rfid_rows: number;
  incomplete_events: number;
  open_disputes: number | null;
  sync: { last_successful: SyncRun | null; last_attempt: SyncRun | null };
}

export const AttendanceDashboard: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<Summary>('/attendance/summary');
  const { sections } = useLookups(['sections']);

  const [confirmRecalc, setConfirmRecalc] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [lastRecalc, setLastRecalc] = useState<RecalcStats | null>(null);

  const [dayOpen, setDayOpen] = useState(false);
  const [day, setDay] = useState({ date: todayISO(), reason: '', section_id: '' });
  const [dayBusy, setDayBusy] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);

  const runRecalc = async () => {
    setRecalcBusy(true);
    try {
      const res = await ApiClient.post<RecalcStats>('/attendance/recalculate', {});
      setLastRecalc(res);
      toast.success('Attendance recalculated', recalcText(res));
      setConfirmRecalc(false);
      reload();
    } catch (e) {
      toast.error('Recalculation failed', errorMessage(e));
    } finally {
      setRecalcBusy(false);
    }
  };

  const cancelDay = async (e: React.FormEvent) => {
    e.preventDefault();
    setDayError(null);
    if (day.reason.trim().length < 3) {
      setDayError('Please give a reason (at least 3 characters).');
      return;
    }
    setDayBusy(true);
    try {
      const res = await ApiClient.post<{ cancelled_sessions: number }>('/attendance/cancel-day', {
        date: day.date,
        reason: day.reason.trim(),
        section_id: day.section_id ? Number(day.section_id) : null,
      });
      toast.success(
        'Classes cancelled',
        res.cancelled_sessions
          ? `${res.cancelled_sessions} class session(s) on ${formatDate(day.date)} were cancelled and excluded from attendance.`
          : `No timetable classes were scheduled on ${formatDate(day.date)}; nothing was cancelled.`
      );
      setDayOpen(false);
      setDay({ date: todayISO(), reason: '', section_id: '' });
      reload();
    } catch (err) {
      setDayError(errorMessage(err));
    } finally {
      setDayBusy(false);
    }
  };

  const actions = (
    <>
      <Button variant="outline" size="sm" leftIcon={<CalendarOff className="w-3.5 h-3.5" />} onClick={() => { setDayError(null); setDayOpen(true); }}>
        Cancel classes for a day
      </Button>
      <Button size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => setConfirmRecalc(true)}>
        Recalculate attendance
      </Button>
    </>
  );

  const header = (
    <PageHeader
      eyebrow="Attendance"
      title="Attendance dashboard"
      description="Per-class attendance computed from the timetable and RFID evidence imported from the Google Sheet."
      actions={actions}
    />
  );

  const modals = (
    <>
      <ConfirmDialog
        isOpen={confirmRecalc}
        title="Recalculate attendance?"
        message={
          <>
            Every class from the tracking start date until today is re-evaluated against the current policy and imported RFID rows.
            Manual corrections are kept (and flagged if the calculated value changes).
          </>
        }
        confirmLabel="Recalculate"
        isLoading={recalcBusy}
        onConfirm={runRecalc}
        onClose={() => setConfirmRecalc(false)}
      />
      <Modal isOpen={dayOpen} onClose={() => setDayOpen(false)} title="Cancel classes for a day" description="For holidays or institution-wide closures. Cancelled classes are excluded from percentages.">
        <form onSubmit={cancelDay} className="space-y-4">
          {dayError && <InlineAlert tone="danger">{dayError}</InlineAlert>}
          <Input label="Date" type="date" required value={day.date} onChange={(e) => setDay({ ...day, date: e.target.value })} />
          <Select
            label="Section"
            value={day.section_id}
            onChange={(e) => setDay({ ...day, section_id: e.target.value })}
            placeholder="All sections"
            options={sections.map((s) => ({ value: String(s.id), label: s.label }))}
          />
          <TextArea label="Reason" required value={day.reason} onChange={(v) => setDay({ ...day, reason: v })} placeholder="e.g. Public holiday — Diwali" helperText="Recorded in the audit log and shown on each cancelled class." />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setDayOpen(false)} disabled={dayBusy}>Close</Button>
            <Button type="submit" variant="danger" isLoading={dayBusy}>Cancel classes</Button>
          </div>
          <p className="text-[11px] text-slate-500">Individual sessions can be restored later from Attendance records → Sessions.</p>
        </form>
      </Modal>
    </>
  );

  if (loading && !data) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        {modals}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState title="Could not load attendance analytics" message={error || 'No data returned'} onRetry={reload} />
        {modals}
      </div>
    );
  }

  const o = data.overall;
  const t = data.today;
  const lastOk = data.sync.last_successful;
  const lastAttempt = data.sync.last_attempt;
  const syncFailing = lastAttempt?.status === 'FAILED';
  const threshold = data.policy.minimum_percentage;

  return (
    <div className="space-y-6">
      {header}

      {!data.tracking_start && (
        <InlineAlert
          tone="info"
          title="Attendance is not being evaluated yet"
          action={
            <Link to="/admin/attendance/policy">
              <Button size="sm" variant="outline" leftIcon={<Settings2 className="w-3.5 h-3.5" />}>Policy</Button>
            </Link>
          }
        >
          Class attendance is evaluated only from the first date that has RFID evidence imported from the Google Sheet, or from a
          tracking start date configured in the attendance policy. Until then no student is marked absent, so the figures below are
          legitimately zero.
        </InlineAlert>
      )}

      {syncFailing && (
        <InlineAlert
          tone={isSetupError(lastAttempt?.error_code) ? 'warning' : 'danger'}
          title="The last Google Sheets synchronization failed"
          action={<Link to="/admin/google-sheets"><Button size="sm" variant="outline">Open integration</Button></Link>}
        >
          <span className="font-mono font-semibold mr-1">{lastAttempt?.error_code}</span>
          {lastAttempt?.error_message}
        </InlineAlert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Overall attendance" value={pct(o.percentage)} hint={`${o.attended} attended of ${o.classes_held} applicable classes`} icon={<Gauge className="w-4 h-4" />} tone={o.percentage !== null && o.percentage < threshold ? 'danger' : 'success'} />
        <StatCard label="Scheduled sessions (to date)" value={data.total_scheduled_sessions} hint={`${data.completed_sessions} evaluated (not cancelled)`} icon={<CalendarCheck className="w-4 h-4" />} tone="info" />
        <StatCard label="Students below threshold" value={data.students_below_threshold} hint={`Threshold ${threshold}% · ${data.total_students} active students`} icon={<UserX className="w-4 h-4" />} tone={data.students_below_threshold ? 'danger' : 'default'} />
        <StatCard label="Pending verification" value={data.pending_verification} hint="Missing entry/exit; not counted as attended" icon={<HelpCircle className="w-4 h-4" />} tone={data.pending_verification ? 'warning' : 'default'} onClick={() => navigate('/admin/attendance/records?status=PENDING_VERIFICATION')} />
        <StatCard label="Late arrivals" value={data.late_arrivals} hint={`After ${data.policy.late_arrival_grace_minutes}-min grace`} icon={<Clock className="w-4 h-4" />} tone="warning" />
        <StatCard label="Partial attendance" value={data.partial_attendance} hint={`Below ${data.policy.present_min_percent}% of class duration`} icon={<Timer className="w-4 h-4" />} />
        <StatCard label="Unmatched RFID rows" value={data.unmatched_rfid_rows} hint={`${data.conflict_rfid_rows} conflicting rows`} icon={<ScanLine className="w-4 h-4" />} tone={data.unmatched_rfid_rows || data.conflict_rfid_rows ? 'danger' : 'default'} onClick={() => navigate('/admin/attendance/unmatched')} />
        <StatCard label="Open disputes" value={data.open_disputes ?? '—'} hint={`${data.incomplete_events} incomplete RFID events`} icon={<MessageSquareWarning className="w-4 h-4" />} tone={data.open_disputes ? 'warning' : 'default'} onClick={() => navigate('/admin/attendance/records?tab=disputes')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today — {formatDate(t.date)}</CardTitle>
            <CardDescription>Only classes that have already ended are evaluated.</CardDescription>
          </CardHeader>
          {t.total_sessions === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No class records have been evaluated for today yet.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Mini label="Attendance" value={pct(t.percentage)} />
                <Mini label="Class records" value={t.total_sessions} />
                <Mini label="Present" value={t.present} />
                <Mini label="Late" value={t.late} />
                <Mini label="Partial" value={t.partial} />
                <Mini label="Absent" value={t.absent} />
                <Mini label="Pending" value={t.pending} />
                <Mini label="Cancelled" value={t.cancelled} />
              </div>
              <BarList
                data={[
                  { label: 'Present', value: t.present },
                  { label: 'Late', value: t.late },
                  { label: 'Partial', value: t.partial },
                  { label: 'Absent', value: t.absent },
                  { label: 'Pending verification', value: t.pending },
                  { label: 'Excused', value: t.excused },
                ]}
              />
            </div>
          )}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-700 mb-3">All evaluated classes</p>
            {o.total_sessions === 0 ? (
              <p className="text-xs text-slate-500">No class records yet.</p>
            ) : (
              <BarList
                data={[
                  { label: 'Present', value: o.present },
                  { label: 'Late', value: o.late },
                  { label: 'Partial', value: o.partial },
                  { label: 'Absent', value: o.absent },
                  { label: 'Pending verification', value: o.pending },
                  { label: 'Excused', value: o.excused },
                  { label: 'Cancelled', value: o.cancelled },
                ]}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Google Sheets sync</CardTitle>
              {lastAttempt ? <SyncRunStatusBadge status={lastAttempt.status} /> : null}
            </div>
            <CardDescription>RFID evidence source</CardDescription>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Last successful synchronization</dt>
              <dd className="text-slate-800">{lastOk ? formatDateTime(lastOk.finished_at || lastOk.started_at) : <span className="text-slate-500">Never</span>}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Last attempt</dt>
              <dd className="text-slate-800">{lastAttempt ? `${formatDateTime(lastAttempt.started_at)} (${lastAttempt.trigger})` : <span className="text-slate-500">No attempts yet</span>}</dd>
            </div>
            {lastAttempt?.status === 'FAILED' && (
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Error</dt>
                <dd className="text-xs text-rose-700 break-words"><span className="font-mono font-semibold">{lastAttempt.error_code}</span> {lastAttempt.error_message}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex flex-col gap-2">
            <Link to="/admin/google-sheets"><Button variant="outline" size="sm" className="w-full">Integration settings</Button></Link>
            <Link to="/admin/attendance/source"><Button variant="ghost" size="sm" className="w-full">View RFID source data</Button></Link>
          </div>
        </Card>
      </div>

      {lastRecalc && (
        <InlineAlert tone="success" title="Last recalculation">{recalcText(lastRecalc)}</InlineAlert>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="p-5 pb-3 flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-500" /> Students below {threshold}%</CardTitle>
            <CardDescription>Overall attendance across all evaluated classes{data.students_below_threshold > 50 ? ' (lowest 50 shown)' : ''}.</CardDescription>
          </div>
          <Link to="/admin/reports"><Button variant="link" size="sm">Reports</Button></Link>
        </div>
        {data.below_threshold.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState icon={<CheckCircle2 className="w-5 h-5" />} title="No students below the threshold" description={o.total_sessions === 0 ? 'No class records have been evaluated yet.' : 'Every evaluated student meets the minimum attendance requirement.'} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr><Th>Student</Th><Th>USN</Th><Th className="text-right">Attended / held</Th><Th className="text-right">Attendance</Th><Th className="text-right">Short by</Th></tr>
            </thead>
            <tbody>
              {data.below_threshold.map((s) => (
                <tr key={s.student_id} className="hover:bg-slate-50/70">
                  <Td className="font-medium text-slate-900">{s.student_name || `Student #${s.student_id}`}</Td>
                  <Td className="font-mono text-xs">{s.student_usn || '—'}</Td>
                  <Td className="text-right tabular-nums">{s.attended} / {s.classes_held}</Td>
                  <Td className="text-right font-semibold text-rose-600 tabular-nums">{pct(s.percentage, 2)}</Td>
                  <Td className="text-right text-xs text-rose-500 tabular-nums">{(threshold - s.percentage).toFixed(2)} pts</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-blue-600" /> Status definitions</CardTitle>
          <CardDescription>
            Attendance % = attended classes ÷ applicable classes. Attended = Present{data.policy.count_late_as_attended ? ' + Late' : ''}
            {data.policy.count_partial_as_attended ? ' + Partial' : ''}. Cancelled and excused classes are not applicable; pending verification is applicable but not attended.
          </CardDescription>
        </CardHeader>
        <StatusLegend />
        <p className="mt-4 text-[11px] text-slate-500 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Policy version {data.policy.version}. Thresholds are configured on the <Link className="text-blue-600 hover:underline" to="/admin/attendance/policy">policy page</Link>.</p>
      </Card>

      {modals}
    </div>
  );
};

const Mini: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
    <p className="text-[11px] text-slate-500">{label}</p>
    <p className="text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
  </div>
);
