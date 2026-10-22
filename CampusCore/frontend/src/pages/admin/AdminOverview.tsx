import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, CalendarCheck, Clock, FileSpreadsheet, Gauge, HelpCircle, Plus, RefreshCw, UserX, Users,
} from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { errorMessage, formatDate, formatDateTime, pct } from '../../lib/utils';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MatchStatusBadge } from '../../components/ui/Badge';
import { ErrorState, PageHeader, Skeleton, StatCard, Table, Td, Th } from '../../components/ui/Kit';
import { useToast } from '../../components/ui/Toast';
import { ConnectionBadge, InlineAlert, SyncCounts } from './AttendanceKit';
import { isSetupError, useApi, type Aggregate, type IntegrationStatus, type Policy, type SheetRow, type SyncResponse } from './attendanceShared';

interface Summary {
  policy: Policy;
  tracking_start: string | null;
  total_students: number;
  total_scheduled_sessions: number;
  completed_sessions: number;
  overall: Aggregate;
  today: Aggregate & { date: string };
  students_below_threshold: number;
  pending_verification: number;
  unmatched_rfid_rows: number;
  conflict_rfid_rows: number;
  open_disputes: number | null;
}

export const AdminOverview: React.FC = () => {
  const toast = useToast();
  const sumQ = useApi<Summary>('/attendance/summary');
  const statQ = useApi<IntegrationStatus>('/integrations/google-sheets/status');
  const rowsQ = useApi<{ items: SheetRow[] }>('/integrations/google-sheets/rows?limit=8');
  const summary = sumQ.data;
  const status = statQ.data;
  const recentRows = rowsQ.data?.items || [];
  const loading = sumQ.loading || statQ.loading;
  const error = sumQ.error;
  const statusError = statQ.error;
  const [syncing, setSyncing] = useState(false);
  const [syncRes, setSyncRes] = useState<SyncResponse | null>(null);

  const fetchData = () => {
    sumQ.reload();
    statQ.reload();
    rowsQ.reload();
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncRes(null);
    try {
      const res = await ApiClient.post<SyncResponse>('/integrations/google-sheets/sync');
      setSyncRes(res);
      if (res.success) toast.success('Synchronization complete', res.message || undefined);
      else toast.error('Synchronization failed', `${res.error_code || ''} ${res.message || ''}`.trim());
      fetchData();
    } catch (e) {
      toast.error('Synchronization failed', errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const header = (
    <PageHeader
      title="Institution overview"
      description="Snapshot of class attendance, RFID data quality and the Google Sheets pipeline."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={handleSync} isLoading={syncing} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>Sync Google Sheet</Button>
          <Link to="/admin/students"><Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>Add student</Button></Link>
        </>
      }
    />
  );

  if (loading && !summary && !status) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const t = summary?.today;
  const reviewCount = (summary?.unmatched_rfid_rows ?? 0) + (summary?.conflict_rfid_rows ?? 0);
  const lastAttempt = status?.last_attempt;
  const failing = lastAttempt?.status === 'FAILED';

  return (
    <div className="space-y-6">
      {header}

      {error && <ErrorState title="Attendance summary unavailable" message={error} onRetry={fetchData} />}

      {syncRes && (
        <InlineAlert tone={syncRes.success ? 'success' : 'danger'} title={syncRes.success ? 'Synchronization finished' : `Synchronization failed${syncRes.error_code ? ` — ${syncRes.error_code}` : ''}`} action={<Button size="sm" variant="ghost" onClick={() => setSyncRes(null)}>Dismiss</Button>}>
          {syncRes.success ? <SyncCounts run={syncRes.run} /> : syncRes.message}
        </InlineAlert>
      )}

      {reviewCount > 0 && (
        <InlineAlert tone="warning" title={`${reviewCount} RFID row(s) need identity review`} action={<Link to="/admin/attendance/unmatched"><Button size="sm" variant="outline">Review queue →</Button></Link>}>
          Card UIDs in the Google Sheet that are not registered to a student or lecturer, or conflict with the registered owner. These rows do not count toward attendance until resolved.
        </InlineAlert>
      )}

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active students" value={summary.total_students} icon={<Users className="w-4 h-4" />} tone="info" />
          <StatCard label="Overall attendance" value={pct(summary.overall.percentage)} hint={`${summary.overall.attended} of ${summary.overall.classes_held} applicable classes`} icon={<Gauge className="w-4 h-4" />} tone="success" />
          <StatCard label="Below threshold" value={summary.students_below_threshold} hint={`Required ${summary.policy.minimum_percentage}%`} icon={<UserX className="w-4 h-4" />} tone={summary.students_below_threshold ? 'danger' : 'default'} />
          <StatCard label="Pending verification" value={summary.pending_verification} hint="Incomplete scans" icon={<HelpCircle className="w-4 h-4" />} tone={summary.pending_verification ? 'warning' : 'default'} />
          <StatCard label={`Today (${formatDate(t?.date)})`} value={pct(t?.percentage)} hint={`${t?.total_sessions ?? 0} class records evaluated`} icon={<CalendarCheck className="w-4 h-4" />} />
          <StatCard label="Late today" value={t?.late ?? 0} hint={`After ${summary.policy.late_arrival_grace_minutes}-min grace`} icon={<Clock className="w-4 h-4" />} tone="warning" />
          <StatCard label="Absent today" value={t?.absent ?? 0} icon={<AlertTriangle className="w-4 h-4" />} tone="danger" />
          <StatCard label="Open disputes" value={summary.open_disputes ?? '—'} icon={<HelpCircle className="w-4 h-4" />} />
        </div>
      )}

      {summary && !summary.tracking_start && (
        <InlineAlert tone="info" title="Attendance evaluation has not started">
          Classes are evaluated from the first date with imported RFID evidence, or from the tracking start date in the{' '}
          <Link to="/admin/attendance/policy" className="underline">attendance policy</Link>. No student is marked absent before then.
        </InlineAlert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Google Sheets pipeline</CardTitle>
              {status && <ConnectionBadge status={status.connection_status} />}
            </div>
            <CardDescription>RFID attendance worksheet</CardDescription>
          </CardHeader>
          {statusError ? (
            <ErrorState message={statusError} onRetry={fetchData} />
          ) : status ? (
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-slate-500">Last successful synchronization</dt>
                <dd className="text-sm text-slate-800">{status.last_successful_sync ? formatDateTime(status.last_successful_sync.finished_at || status.last_successful_sync.started_at) : 'Never'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Rows imported</dt>
                <dd className="text-sm text-slate-800">{status.counts.records_imported} ({status.counts.unmatched_uids} unmatched UIDs)</dd>
              </div>
              {failing && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-rose-800 break-words">
                  <span className="font-mono font-semibold">{lastAttempt?.error_code}</span> {lastAttempt?.error_message}
                  {isSetupError(lastAttempt?.error_code) && <p className="mt-1 font-medium">The sheet is not connected yet — open the integration console for the setup checklist.</p>}
                </div>
              )}
              <Link to="/admin/google-sheets"><Button variant="outline" size="sm" className="w-full mt-1">Open integration console</Button></Link>
            </dl>
          ) : null}
        </Card>

        <Card className="lg:col-span-2 p-0 overflow-hidden">
          <div className="p-5 pb-3 flex items-center justify-between">
            <div>
              <CardTitle>Latest RFID rows</CardTitle>
              <CardDescription>Most recent rows imported from the Google Sheet (original values)</CardDescription>
            </div>
            <Link to="/admin/attendance/source"><Button variant="link" size="sm" rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}>View all</Button></Link>
          </div>
          {recentRows.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-500">
              No RFID rows have been imported{failing ? ' — the Google Sheet could not be read on the last attempt.' : ' yet.'}
            </p>
          ) : (
            <Table>
              <thead><tr><Th>UID</Th><Th>Name</Th><Th>Date</Th><Th>Entry</Th><Th>Exit</Th><Th>Original status</Th><Th>Match</Th></tr></thead>
              <tbody>
                {recentRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <Td className="font-mono text-xs">{r.uid ?? '—'}</Td>
                    <Td className="text-xs">{r.student_name || r.name || '—'}</Td>
                    <Td className="font-mono text-xs">{r.date ?? '—'}</Td>
                    <Td className="font-mono text-xs">{r.entry_time ?? '—'}</Td>
                    <Td className="font-mono text-xs">{r.exit_time ?? '—'}</Td>
                    <Td className="text-xs">{r.original_status ?? '—'}</Td>
                    <Td><MatchStatusBadge status={r.match_status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link to="/admin/attendance"><Button variant="ghost" size="sm">Attendance dashboard</Button></Link>
        <Link to="/admin/attendance/records"><Button variant="ghost" size="sm">Class records</Button></Link>
        <Link to="/admin/timetable"><Button variant="ghost" size="sm">Timetable</Button></Link>
        <Link to="/admin/reports"><Button variant="ghost" size="sm">Reports</Button></Link>
      </div>
    </div>
  );
};
