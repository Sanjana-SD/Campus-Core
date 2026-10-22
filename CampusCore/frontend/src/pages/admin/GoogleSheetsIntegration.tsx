import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, FileSpreadsheet, PlugZap, RefreshCw, RotateCcw, Webhook, XCircle } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { errorMessage, formatDateTime } from '../../lib/utils';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ErrorState, PageHeader, Pagination, Skeleton, StatCard, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import { useToast } from '../../components/ui/Toast';
import { ConnectionBadge, InlineAlert, KeyValue, SetupChecklist, SyncCounts, SyncRunStatusBadge } from './AttendanceKit';
import { isSetupError, useApi, type IntegrationStatus, type Paged, type SyncResponse, type SyncRun } from './attendanceShared';

interface TestResult {
  ok: boolean;
  run: SyncRun;
  transport: string | null;
  error_code: string | null;
  message: string | null;
  worksheet_title: string | null;
  headers: string[];
  column_mapping: Record<string, string> | null;
  missing_required_columns: string[];
  unmapped_columns: string[];
  row_count: number;
  preview: { row_number: number; values: string[] }[];
  service_account_email: string | null;
  attempts: { transport: string; ok: boolean; error_code?: string | null; message?: string | null }[];
}

const RUNS_PAGE = 15;

const FIELD_LABELS: Record<string, string> = {
  uid: 'UID', name: 'Name', role: 'Role', date: 'Date', entry_time: 'Entry Time', exit_time: 'Exit Time', status: 'Status',
};

export const GoogleSheetsIntegration: React.FC = () => {
  const toast = useToast();
  const status = useApi<IntegrationStatus>('/integrations/google-sheets/status');
  const [runsPage, setRunsPage] = useState(1);
  const runs = useApi<Paged<SyncRun>>('/integrations/sync-runs' + qs({ skip: (runsPage - 1) * RUNS_PAGE, limit: RUNS_PAGE }));

  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncRes, setSyncRes] = useState<SyncResponse | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);

  const refreshAll = () => {
    status.reload();
    runs.reload();
  };

  const doTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await ApiClient.post<TestResult>('/integrations/google-sheets/test');
      setTest(res);
      if (res.ok) toast.success('Connection OK', res.message || undefined);
      else toast.error('Connection failed', `${res.error_code || ''} ${res.message || ''}`.trim());
      refreshAll();
    } catch (e) {
      toast.error('Test failed', errorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  const doSync = async () => {
    setSyncing(true);
    setSyncRes(null);
    try {
      const res = await ApiClient.post<SyncResponse>('/integrations/google-sheets/sync');
      setSyncRes(res);
      if (res.success) toast.success('Synchronization complete', res.message || undefined);
      else toast.error('Synchronization failed', `${res.error_code || ''} ${res.message || ''}`.trim());
      refreshAll();
    } catch (e) {
      toast.error('Synchronization failed', errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const doRetry = async (run: SyncRun) => {
    setRetrying(run.id);
    try {
      const res = await ApiClient.post<{ success: boolean; run: SyncRun; message: string | null }>(`/integrations/google-sheets/sync/${run.id}/retry`);
      if (res.success) toast.success(`Retry of run #${run.id} succeeded`, res.message || undefined);
      else toast.error(`Retry of run #${run.id} failed`, `${res.run.error_code || ''} ${res.message || ''}`.trim());
      refreshAll();
    } catch (e) {
      toast.error('Retry failed', errorMessage(e));
    } finally {
      setRetrying(null);
    }
  };

  const s = status.data;
  const currentError = s?.last_attempt?.status === 'FAILED' ? s.last_attempt : null;
  const showChecklist = !!s && (!s.credentials_configured || isSetupError(currentError?.error_code) || (test && !test.ok && isSetupError(test.error_code)));
  const checklistCode = (test && !test.ok ? test.error_code : null) || currentError?.error_code || (!s?.credentials_configured ? 'NOT_CONFIGURED' : null);
  const checklistMsg = (test && !test.ok ? test.message : null) || currentError?.error_message;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Google Sheets integration"
        description="Campus Core reads the RFID attendance worksheet (UID, Name, Role, Date, Entry Time, Exit Time, Status) written by the existing Apps Script. Data is only read, never written back."
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon={<PlugZap className="w-3.5 h-3.5" />} onClick={doTest} isLoading={testing}>Test connection</Button>
            <Button size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={doSync} isLoading={syncing}>Synchronize now</Button>
          </>
        }
      />

      {status.error ? (
        <ErrorState title="Could not load integration status" message={status.error} onRetry={status.reload} />
      ) : status.loading && !s ? (
        <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-64 rounded-xl lg:col-span-2" /><Skeleton className="h-64 rounded-xl" /></div>
      ) : s ? (
        <>
          {syncRes && (
            <InlineAlert
              tone={syncRes.success ? 'success' : 'danger'}
              title={syncRes.success ? 'Synchronization finished' : `Synchronization failed${syncRes.error_code ? ` — ${syncRes.error_code}` : ''}`}
              action={<Button size="sm" variant="ghost" onClick={() => setSyncRes(null)}>Dismiss</Button>}
            >
              {syncRes.success ? (
                <>
                  <SyncCounts run={syncRes.run} />
                  {syncRes.message && <p className="mt-1">{syncRes.message}</p>}
                </>
              ) : (
                <span className="break-words">{syncRes.message}</span>
              )}
            </InlineAlert>
          )}

          <div className="grid gap-6 lg:grid-cols-3 items-start">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Connection</CardTitle>
                  <ConnectionBadge status={s.connection_status} />
                </div>
                <CardDescription>Settings are read from the backend environment (.env). Credentials are never shown here.</CardDescription>
              </CardHeader>
              <dl className="grid gap-4 sm:grid-cols-2">
                <KeyValue label="Spreadsheet ID" mono>{s.spreadsheet_id || '(not set)'}</KeyValue>
                <KeyValue label="Worksheet GID" mono>{s.worksheet_gid}</KeyValue>
                <KeyValue label="Sheet">
                  {s.spreadsheet_url ? (
                    <a href={s.spreadsheet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">Open in Google Sheets <ExternalLink className="w-3.5 h-3.5" /></a>
                  ) : '—'}
                </KeyValue>
                <KeyValue label="Configured transport">
                  {s.configured_transport ? <Badge variant="info">{s.configured_transport === 'SERVICE_ACCOUNT' ? 'Service account (Sheets API)' : s.configured_transport === 'APPS_SCRIPT' ? 'Apps Script web app' : s.configured_transport}</Badge> : <Badge variant="danger">None configured</Badge>}
                </KeyValue>
                <KeyValue label="Service account e-mail" mono>{s.service_account_email || <span className="font-sans text-slate-500">—</span>}</KeyValue>
                <KeyValue label="Date format in sheet">{s.date_order}</KeyValue>
                <KeyValue label="Last attempt">
                  {s.last_attempt ? (
                    <span className="inline-flex flex-wrap items-center gap-2">{formatDateTime(s.last_attempt.started_at)} <SyncRunStatusBadge status={s.last_attempt.status} /> <span className="text-xs text-slate-500">{s.last_attempt.trigger}</span></span>
                  ) : 'Never'}
                </KeyValue>
                <KeyValue label="Last successful synchronization">{s.last_successful_sync ? formatDateTime(s.last_successful_sync.finished_at || s.last_successful_sync.started_at) : 'Never'}</KeyValue>
              </dl>
              {s.last_error && (
                <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Last error · {formatDateTime(s.last_error.started_at)}{currentError ? '' : ' (resolved since)'}</p>
                  <p className="text-sm text-rose-900 mt-1 break-words"><span className="font-mono font-semibold mr-1.5">{s.last_error.error_code}</span>{s.last_error.error_message}</p>
                </div>
              )}
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Records imported" value={s.counts.records_imported} hint={`${s.counts.matched_student_rows} student · ${s.counts.staff_rows} staff`} />
              <StatCard label="Unmatched UIDs" value={s.counts.unmatched_uids} hint={`${s.counts.unmatched_rows} rows`} tone={s.counts.unmatched_uids ? 'danger' : 'default'} />
              <StatCard label="Conflicts" value={s.counts.conflict_rows} tone={s.counts.conflict_rows ? 'warning' : 'default'} />
              <StatCard label="Incomplete" value={s.counts.incomplete_rows} hint="Missing entry or exit" tone={s.counts.incomplete_rows ? 'warning' : 'default'} />
              <StatCard label="Invalid" value={s.counts.invalid_rows} tone={s.counts.invalid_rows ? 'danger' : 'default'} />
              <StatCard label="Removed from sheet" value={s.counts.records_removed_from_sheet} hint="Kept for audit" />
              <div className="col-span-2 flex flex-col gap-2">
                <Link to="/admin/attendance/source"><Button variant="outline" size="sm" className="w-full">View RFID source data</Button></Link>
                <Link to="/admin/attendance/unmatched"><Button variant="ghost" size="sm" className="w-full">Review unmatched UIDs</Button></Link>
              </div>
            </div>
          </div>

          {showChecklist && (
            <Card>
              <CardHeader>
                <CardTitle>Setup checklist</CardTitle>
                <CardDescription>The sheet cannot be read yet. Complete these steps on the server; no data is shown until the connection works.</CardDescription>
              </CardHeader>
              <SetupChecklist
                errorCode={checklistCode}
                message={checklistMsg}
                serviceAccountEmail={s.service_account_email || test?.service_account_email}
                spreadsheetUrl={s.spreadsheet_url}
                spreadsheetId={s.spreadsheet_id}
                worksheetGid={s.worksheet_gid}
              />
            </Card>
          )}

          {test && <TestResultCard t={test} />}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Webhook className="w-4 h-4 text-violet-600" /> Real-time push (optional)</CardTitle>
              <CardDescription>The existing Apps Script can push each new or updated row as it is written.</CardDescription>
            </CardHeader>
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                Endpoint: <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded break-all">POST {s.webhook_endpoint}</code>{' '}
                {s.webhook_enabled ? <Badge variant="success">Secret configured</Badge> : <Badge variant="warning">INTEGRATION_WEBHOOK_SECRET not set</Badge>}
              </p>
              <p className="text-xs text-slate-600">
                Google Apps Script runs on Google’s servers, so it can only reach Campus Core if the backend is available at a <strong>publicly reachable HTTPS URL</strong>
                {' '}(e.g. your deployed domain or a tunnel). <code className="font-mono">localhost</code> will not work. Configure the full URL and the shared secret in the Apps Script
                properties; pushed rows are de-duplicated against pulled rows, so you can use both. Manual or scheduled synchronization works without it.
              </p>
            </div>
          </Card>
        </>
      ) : null}

      <Card className="p-0 overflow-hidden">
        <div className="p-5 pb-3 flex items-center justify-between gap-3">
          <div>
            <CardTitle>Synchronization history</CardTitle>
            <CardDescription>Every test, manual sync, retry and webhook push.</CardDescription>
          </div>
          <Button size="sm" variant="ghost" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={runs.reload}>Refresh</Button>
        </div>
        {runs.error ? (
          <div className="p-4"><ErrorState message={runs.error} onRetry={runs.reload} /></div>
        ) : runs.loading && !runs.data ? (
          <TableSkeleton rows={5} cols={6} />
        ) : !runs.data || runs.data.items.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">No synchronization attempts yet.</p>
        ) : (
          <>
            <Table>
              <thead>
                <tr><Th>#</Th><Th>Started</Th><Th>Trigger</Th><Th>Transport</Th><Th>Status</Th><Th>Result</Th><Th className="text-right">Actions</Th></tr>
              </thead>
              <tbody className={runs.loading ? 'opacity-60' : undefined}>
                {runs.data.items.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <Td className="tabular-nums text-xs text-slate-500">{r.id}{r.retry_of_id ? <div className="text-[10px]">retry of #{r.retry_of_id}</div> : null}</Td>
                    <Td className="text-xs whitespace-nowrap">{formatDateTime(r.started_at)}</Td>
                    <Td className="text-xs">{r.trigger}</Td>
                    <Td className="text-xs">{r.transport || '—'}</Td>
                    <Td><SyncRunStatusBadge status={r.status} /></Td>
                    <Td className="text-xs max-w-md">
                      {r.status === 'FAILED' ? (
                        <span className="text-rose-700 break-words"><span className="font-mono font-semibold">{r.error_code}</span> {r.error_message}</span>
                      ) : r.trigger === 'TEST' ? (
                        <span className="text-slate-600">{r.error_message}</span>
                      ) : (
                        <SyncCounts run={r} />
                      )}
                    </Td>
                    <Td className="text-right">
                      {r.status === 'FAILED' && r.trigger !== 'TEST' && (
                        <Button size="sm" variant="outline" leftIcon={<RotateCcw className="w-3.5 h-3.5" />} isLoading={retrying === r.id} disabled={retrying !== null} onClick={() => doRetry(r)}>Retry</Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={runs.data.total} page={runsPage} pageSize={RUNS_PAGE} onPage={setRunsPage} />
          </>
        )}
      </Card>
    </div>
  );
};

const TestResultCard: React.FC<{ t: TestResult }> = ({ t }) => (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          {t.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />} Connection test result
        </CardTitle>
        <span className="text-xs text-slate-500">{formatDateTime(t.run.started_at)}</span>
      </div>
      <CardDescription className={t.ok ? undefined : 'text-rose-700'}>
        {t.error_code && <span className="font-mono font-semibold mr-1">{t.error_code}</span>}
        {t.message}
      </CardDescription>
    </CardHeader>
    <div className="space-y-5">
      <dl className="grid gap-4 sm:grid-cols-4">
        <KeyValue label="Transport">{t.transport || '—'}</KeyValue>
        <KeyValue label="Worksheet">{t.worksheet_title || '—'}</KeyValue>
        <KeyValue label="Data rows">{t.row_count}</KeyValue>
        <KeyValue label="Service account" mono>{t.service_account_email || '—'}</KeyValue>
      </dl>

      {t.headers?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2">Headers found</p>
          <div className="flex flex-wrap gap-1.5">
            {t.headers.map((h, i) => {
              const mapped = Object.values(t.column_mapping || {}).includes(h);
              return <Badge key={`${h}-${i}`} variant={mapped ? 'success' : 'neutral'}>{h || '(blank)'}</Badge>;
            })}
          </div>
        </div>
      )}

      {(t.column_mapping || t.missing_required_columns?.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Column mapping</p>
            <ul className="text-xs space-y-1">
              {Object.keys(FIELD_LABELS).map((k) => (
                <li key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                  <span className="text-slate-500">{FIELD_LABELS[k]}</span>
                  <span className="font-mono">{t.column_mapping?.[k] ?? <span className="text-rose-600 font-sans">not found</span>}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            {t.missing_required_columns?.length > 0 && (
              <InlineAlert tone="danger" title="Missing required columns">{t.missing_required_columns.join(', ')}</InlineAlert>
            )}
            {t.unmapped_columns?.length > 0 && <p className="text-xs text-slate-600">Extra columns (kept as source data): {t.unmapped_columns.join(', ')}</p>}
          </div>
        </div>
      )}

      {t.preview?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2">Preview (first {t.preview.length} rows, raw values)</p>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <thead><tr><Th>Row</Th>{t.headers.map((h, i) => <Th key={i}>{h}</Th>)}</tr></thead>
              <tbody>
                {t.preview.map((p) => (
                  <tr key={p.row_number}>
                    <Td className="text-xs tabular-nums text-slate-500">#{p.row_number}</Td>
                    {t.headers.map((_, i) => <Td key={i} className="font-mono text-xs">{p.values[i] ?? ''}</Td>)}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      )}

      {t.attempts?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2">Attempts</p>
          <ul className="text-xs space-y-1">
            {t.attempts.map((a, i) => (
              <li key={i} className="flex gap-2">
                {a.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />}
                <span><strong>{a.transport}</strong>{a.error_code ? ` · ${a.error_code}` : ''}{a.message ? ` — ${a.message}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </Card>
);
