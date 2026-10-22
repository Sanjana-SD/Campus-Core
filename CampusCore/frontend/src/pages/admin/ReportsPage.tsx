import React, { useState } from 'react';
import { AlertTriangle, Download, Printer } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { errorMessage, formatDate, hhmm, pct, todayISO } from '../../lib/utils';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { AttendanceStatusBadge, ATTENDANCE_STATUS_META } from '../../components/ui/Badge';
import { BarList, ErrorState, PageHeader, StatCard, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { IntervalsList } from './AttendanceKit';
import { ALL_STATUSES, useApi, useLookups, type Aggregate, type AttendanceRecord } from './attendanceShared';

interface DailyReport extends Aggregate {
  report_type: string;
  date: string;
  records: AttendanceRecord[];
}

interface ThresholdReport {
  threshold: number;
  total_warning_students: number;
  students: {
    student_id: number;
    usn: string | null;
    name: string | null;
    department: string | null;
    attended: number;
    classes_held: number;
    pending: number;
    attendance_percentage: number;
    threshold: number;
  }[];
}

export const ReportsPage: React.FC = () => {
  const toast = useToast();
  const { departments } = useLookups(['departments']);
  const [day, setDay] = useState(todayISO());
  const [dept, setDept] = useState('');
  const [threshold, setThreshold] = useState('');
  const [exp, setExp] = useState({ start_date: '', end_date: '', status_filter: '' });
  const [exporting, setExporting] = useState(false);

  const daily = useApi<DailyReport>('/reports/daily' + qs({ date_val: day, department_id: dept }));
  const warn = useApi<ThresholdReport>('/reports/threshold-warnings' + qs({ threshold: threshold.trim() === '' ? undefined : threshold, department_id: dept }));

  const doExport = async () => {
    setExporting(true);
    try {
      await ApiClient.download('/reports/export/csv' + qs(exp), 'attendance_report.csv');
    } catch (e) {
      toast.error('Export failed', errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const d = daily.data;
  const deptLabel = dept ? departments.find((x) => String(x.id) === dept)?.code : 'All departments';

  return (
    <div className="space-y-6">
      {/* Hide the app shell (sidebar / top bar) when printing this page. */}
      <style>{'@media print { aside, header { display: none !important; } main { padding: 0 !important; max-width: none !important; } }'}</style>
      <div className="print:hidden">
        <PageHeader
          eyebrow="Reports"
          title="Attendance reports"
          description="Computed from per-class attendance records (never from raw scan counts)."
          actions={<Button variant="outline" size="sm" leftIcon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>Print</Button>}
        />
      </div>
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Attendance report — {formatDate(day)}</h1>
        <p className="text-xs text-slate-600">{deptLabel}</p>
      </div>

      <Card className="print:hidden p-4">
        <div className="grid gap-3 sm:grid-cols-3 items-end">
          <Input label="Report date" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <Select label="Department" placeholder="All departments" value={dept} onChange={(e) => setDept(e.target.value)} options={departments.map((x) => ({ value: String(x.id), label: `${x.code} — ${x.name}` }))} />
          <Input label="Warning threshold (%)" type="number" min={0} max={100} placeholder={warn.data ? `Policy: ${warn.data.threshold}` : 'Policy default'} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden print:shadow-none print:border-0">
        <div className="p-5 pb-3">
          <CardTitle>Daily class attendance — {formatDate(day)}</CardTitle>
          <CardDescription>Only classes that have ended are evaluated.</CardDescription>
        </div>
        {daily.error ? (
          <div className="p-4"><ErrorState message={daily.error} onRetry={daily.reload} /></div>
        ) : daily.loading && !d ? (
          <TableSkeleton rows={5} cols={6} />
        ) : !d ? null : (
          <>
            <div className="px-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <StatCard label="Attendance" value={pct(d.percentage)} hint={`${d.attended}/${d.classes_held} applicable`} />
              <StatCard label="Present" value={d.present} />
              <StatCard label="Late" value={d.late} />
              <StatCard label="Partial" value={d.partial} />
              <StatCard label="Absent" value={d.absent} />
              <StatCard label="Pending" value={d.pending} />
              <StatCard label="Cancelled / excused" value={`${d.cancelled} / ${d.excused}`} />
            </div>
            {d.records.length === 0 ? (
              <div className="p-5"><EmptyState title="No class records for this date" description="Either no classes were scheduled, they have not ended yet, or attendance tracking has not started (no RFID evidence imported)." /></div>
            ) : (
              <div className="mt-4">
                <Table>
                  <thead>
                    <tr><Th>Time</Th><Th>Subject</Th><Th>Student</Th><Th>Entry / exit</Th><Th className="text-right">Attended</Th><Th className="text-right">Duration</Th><Th>Status</Th></tr>
                  </thead>
                  <tbody>
                    {d.records.map((r) => (
                      <tr key={r.id} className="break-inside-avoid">
                        <Td className="font-mono text-xs whitespace-nowrap">{hhmm(r.scheduled_start)}–{hhmm(r.scheduled_end)}</Td>
                        <Td><span className="font-mono text-xs font-semibold text-blue-700">{r.subject_code}</span><div className="text-[11px] text-slate-500">{r.subject_name}</div></Td>
                        <Td><div className="text-sm font-medium text-slate-900">{r.student_name}</div><div className="font-mono text-[11px] text-slate-500">{r.student_usn}</div></Td>
                        <Td><IntervalsList intervals={r.intervals} /></Td>
                        <Td className="text-right text-xs tabular-nums">{r.attended_minutes ?? 0}/{r.scheduled_minutes ?? 0} min</Td>
                        <Td className="text-right text-xs tabular-nums">{pct(r.duration_percent)}</Td>
                        <Td><AttendanceStatusBadge status={r.final_status} corrected={r.is_overridden} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
            {d.records.length > 0 && (
              <div className="p-5 border-t border-slate-100 print:hidden">
                <BarList data={[
                  { label: 'Present', value: d.present }, { label: 'Late', value: d.late }, { label: 'Partial', value: d.partial },
                  { label: 'Absent', value: d.absent }, { label: 'Pending verification', value: d.pending },
                ]} />
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="p-0 overflow-hidden print:shadow-none print:border-0">
        <div className="p-5 pb-3">
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-500" /> Attendance shortage{warn.data ? ` — below ${warn.data.threshold}%` : ''}</CardTitle>
          <CardDescription>Overall attendance across all evaluated classes. Pending verification counts as applicable but not attended.</CardDescription>
        </div>
        {warn.error ? (
          <div className="p-4"><ErrorState message={warn.error} onRetry={warn.reload} /></div>
        ) : warn.loading && !warn.data ? (
          <TableSkeleton rows={4} cols={6} />
        ) : !warn.data || warn.data.students.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">No students are below the threshold.</p>
        ) : (
          <Table>
            <thead><tr><Th>USN</Th><Th>Student</Th><Th>Dept.</Th><Th className="text-right">Attended / held</Th><Th className="text-right">Pending</Th><Th className="text-right">Attendance</Th><Th className="text-right">Short by</Th></tr></thead>
            <tbody>
              {warn.data.students.map((s) => (
                <tr key={s.student_id} className="break-inside-avoid">
                  <Td className="font-mono text-xs font-semibold">{s.usn}</Td>
                  <Td className="font-medium text-slate-900">{s.name}</Td>
                  <Td className="text-xs">{s.department || '—'}</Td>
                  <Td className="text-right tabular-nums">{s.attended} / {s.classes_held}</Td>
                  <Td className="text-right tabular-nums text-xs">{s.pending}</Td>
                  <Td className="text-right tabular-nums font-semibold text-rose-600">{pct(s.attendance_percentage, 2)}</Td>
                  <Td className="text-right tabular-nums text-xs text-rose-500">{(s.threshold - s.attendance_percentage).toFixed(2)} pts</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Export class attendance (CSV)</CardTitle>
          <CardDescription>One row per student per class with entry/exit intervals, minutes, calculated and final status, corrections and policy version.</CardDescription>
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-4 items-end">
          <Input label="From" type="date" value={exp.start_date} onChange={(e) => setExp({ ...exp, start_date: e.target.value })} />
          <Input label="To" type="date" value={exp.end_date} onChange={(e) => setExp({ ...exp, end_date: e.target.value })} />
          <Select label="Final status" placeholder="Any" value={exp.status_filter} onChange={(e) => setExp({ ...exp, status_filter: e.target.value })} options={ALL_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_STATUS_META[s]?.label || s }))} />
          <Button leftIcon={<Download className="w-4 h-4" />} onClick={doExport} isLoading={exporting}>Download CSV</Button>
        </div>
      </Card>
    </div>
  );
};
