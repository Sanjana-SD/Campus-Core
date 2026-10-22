import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Database, Download, FileSpreadsheet, RefreshCw, Search, SearchX } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { errorMessage, formatDate, formatDateTime, hhmm } from '../../lib/utils';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { AttendanceStatusBadge, ATTENDANCE_STATUS_META, Badge, MatchStatusBadge } from '../../components/ui/Badge';
import { ErrorState, PageHeader, Pagination, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { Checkbox, FilterGrid, InlineAlert, IntervalsList, KeyValue, SyncCounts, ValidityBadge } from './AttendanceKit';
import {
  ALL_STATUSES, isSetupError, useApi,
  type AttendanceRecord, type IntegrationStatus, type SheetRow, type SyncResponse, type SyncRun,
  useResettingPage,
} from './attendanceShared';

const PAGE = 50;

interface RowsResp {
  total: number;
  items: SheetRow[];
  original_statuses: string[];
}

const EMPTY = {
  search: '', on_date: '', date_from: '', date_to: '', role: '', original_status: '', match_status: '',
  validity: '', calculated_status: '', include_removed: false,
};

/** "CS501 09:00: PRESENT" -> badge with the subject prefix. */
const CalcStatus: React.FC<{ text: string }> = ({ text }) => {
  const i = text.lastIndexOf(': ');
  const label = i >= 0 ? text.slice(0, i) : text;
  const status = i >= 0 ? text.slice(i + 2) : '';
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="font-mono text-[11px] text-slate-600">{label}</span>
      {status && <AttendanceStatusBadge status={status} />}
    </div>
  );
};

export const AttendanceManagement: React.FC = () => {
  const toast = useToast();
  const [params] = useSearchParams();
  const [f, setF] = useState(() => ({ ...EMPTY, match_status: params.get('match_status') || '', validity: params.get('validity') || '' }));
  const [searchDraft, setSearchDraft] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setF((x) => (x.search === searchDraft ? x : { ...x, search: searchDraft })), 350);
    return () => window.clearTimeout(t);
  }, [searchDraft]);
  const [page, setPage] = useResettingPage(JSON.stringify(f));

  const filters = {
    search: f.search.trim(),
    on_date: f.on_date,
    date_from: f.on_date ? '' : f.date_from,
    date_to: f.on_date ? '' : f.date_to,
    role: f.role,
    original_status: f.original_status,
    match_status: f.match_status,
    validity: f.validity,
    calculated_status: f.calculated_status,
    include_removed: f.include_removed ? true : undefined,
  };
  const anyFilter = Object.values(filters).some((v) => v !== '' && v !== undefined);

  const rows = useApi<RowsResp>('/integrations/google-sheets/rows' + qs({ ...filters, skip: (page - 1) * PAGE, limit: PAGE }));
  const status = useApi<IntegrationStatus>('/integrations/google-sheets/status');

  const sync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await ApiClient.post<SyncResponse>('/integrations/google-sheets/sync');
      setSyncResult(res);
      if (res.success) toast.success('Synchronization complete', res.message || undefined);
      else toast.error('Synchronization failed', `${res.error_code || ''} ${res.message || ''}`.trim());
      rows.reload();
      status.reload();
    } catch (e) {
      toast.error('Synchronization failed', errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      // The export endpoint has no on_date parameter; a single date is sent as a one-day range.
      const ex = { ...filters, on_date: undefined, date_from: f.on_date || filters.date_from, date_to: f.on_date || filters.date_to };
      await ApiClient.download('/integrations/google-sheets/rows/export' + qs(ex), 'rfid_attendance_source.csv');
    } catch (e) {
      toast.error('Export failed', errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const st = status.data;
  const lastOk = st?.last_successful_sync;
  const neverImported = st ? st.counts.records_imported === 0 && st.counts.records_removed_from_sheet === 0 : false;
  const lastFailed: SyncRun | null | undefined = st?.last_attempt?.status === 'FAILED' ? st.last_attempt : null;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Attendance"
        title="RFID source data"
        description="Rows exactly as they appear in the Google Sheet written by the RFID Apps Script. Original values are never edited; the calculated class attendance is shown separately."
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={doExport} isLoading={exporting}>Export CSV</Button>
            <Button size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={sync} isLoading={syncing}>Synchronize now</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          Last successful synchronization:{' '}
          <strong className="text-slate-800">{status.loading && !st ? '…' : lastOk ? formatDateTime(lastOk.finished_at || lastOk.started_at) : 'never'}</strong>
        </span>
        {st && <span>{st.counts.records_imported} rows stored · {st.counts.records_removed_from_sheet} removed from sheet</span>}
        <Link to="/admin/google-sheets" className="text-blue-600 hover:underline">Integration settings</Link>
      </div>

      {syncResult && (
        <InlineAlert
          tone={syncResult.success ? 'success' : 'danger'}
          title={syncResult.success ? 'Synchronization finished' : `Synchronization failed${syncResult.error_code ? ` (${syncResult.error_code})` : ''}`}
          action={<Button size="sm" variant="ghost" onClick={() => setSyncResult(null)}>Dismiss</Button>}
        >
          {syncResult.success ? <SyncCounts run={syncResult.run} /> : <span className="break-words">{syncResult.message}</span>}
          {!syncResult.success && isSetupError(syncResult.error_code) && (
            <p className="mt-1"><Link className="font-medium underline" to="/admin/google-sheets">See the setup checklist →</Link></p>
          )}
        </InlineAlert>
      )}

      {!syncResult && lastFailed && (
        <InlineAlert tone="warning" title="The Google Sheet could not be read on the last attempt" action={<Link to="/admin/google-sheets"><Button size="sm" variant="outline">Fix integration</Button></Link>}>
          <span className="font-mono font-semibold mr-1">{lastFailed.error_code}</span>{lastFailed.error_message}
        </InlineAlert>
      )}

      <Card className="p-4">
        <FilterGrid>
          <div className="relative sm:col-span-2">
            <Input label="Search" placeholder="Name or UID (sheet or matched student)" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} className="pl-8" />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 bottom-2.5" aria-hidden />
          </div>
          <Input label="Single date" type="date" value={f.on_date} onChange={(e) => setF({ ...f, on_date: e.target.value })} />
          <Input label="From" type="date" value={f.date_from} disabled={!!f.on_date} onChange={(e) => setF({ ...f, date_from: e.target.value })} />
          <Input label="To" type="date" value={f.date_to} disabled={!!f.on_date} onChange={(e) => setF({ ...f, date_to: e.target.value })} />
          <Select label="Role" placeholder="Any role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={[
            { value: 'STUDENT', label: 'Student' }, { value: 'LECTURER', label: 'Lecturer / staff' }, { value: 'OTHER', label: 'Other' }, { value: 'UNKNOWN', label: 'Unknown (blank)' },
          ]} />
          <Select label="Original status" placeholder="Any" value={f.original_status} onChange={(e) => setF({ ...f, original_status: e.target.value })} options={(rows.data?.original_statuses || []).map((s) => ({ value: s, label: s }))} />
          <Select label="Match status" placeholder="Any" value={f.match_status} onChange={(e) => setF({ ...f, match_status: e.target.value })} options={[
            { value: 'MATCHED', label: 'Matched student' }, { value: 'UNMATCHED', label: 'Unmatched UID' }, { value: 'CONFLICT', label: 'Conflict' }, { value: 'STAFF', label: 'Staff' }, { value: 'IGNORED', label: 'Ignored' },
          ]} />
          <Select label="Validity" placeholder="Any" value={f.validity} onChange={(e) => setF({ ...f, validity: e.target.value })} options={[
            { value: 'VALID', label: 'Valid' }, { value: 'INCOMPLETE', label: 'Incomplete (missing entry/exit)' }, { value: 'INVALID', label: 'Invalid' },
          ]} />
          <Select label="Calculated status" placeholder="Any" value={f.calculated_status} onChange={(e) => setF({ ...f, calculated_status: e.target.value })} options={ALL_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_STATUS_META[s]?.label || s }))} />
          <div className="pb-2 sm:col-span-2"><Checkbox label="Include rows removed from the sheet" checked={f.include_removed} onChange={(v) => setF({ ...f, include_removed: v })} /></div>
          <div className="flex justify-end sm:col-span-2 lg:col-span-4 xl:col-span-6">
            {anyFilter && <Button variant="ghost" size="sm" onClick={() => { setSearchDraft(''); setF(EMPTY); }}>Clear filters</Button>}
          </div>
        </FilterGrid>
      </Card>

      <Card className="p-0 overflow-hidden">
        {rows.error ? (
          <div className="p-4"><ErrorState title="Could not load RFID rows" message={rows.error} onRetry={rows.reload} /></div>
        ) : rows.loading && !rows.data ? (
          <TableSkeleton rows={8} cols={9} />
        ) : !rows.data || rows.data.items.length === 0 ? (
          <div className="p-5">
            {anyFilter && !neverImported ? (
              <EmptyState icon={<SearchX className="w-5 h-5" />} title="No rows match these filters" description="Try clearing some filters or widening the date range." action={<Button size="sm" variant="outline" onClick={() => { setSearchDraft(''); setF(EMPTY); }}>Clear filters</Button>} />
            ) : neverImported && (lastFailed || !st?.credentials_configured) ? (
              <EmptyState
                icon={<FileSpreadsheet className="w-5 h-5" />}
                title="No data — the Google Sheet is not connected"
                description="No RFID rows have been imported because Campus Core cannot read the sheet yet. Configure the integration (service account + sharing), then synchronize."
                action={<Link to="/admin/google-sheets"><Button size="sm">Configure integration</Button></Link>}
              />
            ) : (
              <EmptyState icon={<Database className="w-5 h-5" />} title="No RFID rows imported yet" description="The sheet has not produced any rows yet. Click “Synchronize now” to fetch the latest data." />
            )}
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th colSpan={8} className="bg-emerald-50/70 text-emerald-800 border-r border-slate-200">Original (Google Sheet)</Th>
                  <Th colSpan={3} className="bg-blue-50/70 text-blue-800">Campus Core (calculated)</Th>
                </tr>
                <tr>
                  <Th>Row</Th><Th>UID</Th><Th>Name</Th><Th>Role</Th><Th>Date</Th><Th>Entry Time</Th><Th>Exit Time</Th><Th className="border-r border-slate-200">Original Status</Th>
                  <Th>Matched student</Th><Th>Calculated attendance</Th><Th>Validity / issues</Th>
                </tr>
              </thead>
              <tbody className={rows.loading ? 'opacity-60' : undefined}>
                {rows.data.items.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => setOpenId(r.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}
                    className={`cursor-pointer hover:bg-blue-50/40 focus:bg-blue-50/60 focus:outline-none ${r.missing_from_source ? 'opacity-60' : ''}`}
                  >
                    <Td className="tabular-nums text-xs text-slate-500">#{r.row_number ?? '—'}</Td>
                    <Td className="font-mono text-xs">{r.uid ?? <Blank />}</Td>
                    <Td className="text-xs">{r.name ?? <Blank />}</Td>
                    <Td className="text-xs">{r.role ?? <Blank />}</Td>
                    <Td className="font-mono text-xs whitespace-nowrap">{r.date ?? <Blank />}</Td>
                    <Td className="font-mono text-xs">{r.entry_time ?? <Blank />}</Td>
                    <Td className="font-mono text-xs">{r.exit_time ?? <Blank />}</Td>
                    <Td className="text-xs border-r border-slate-100">{r.original_status ?? <Blank />}</Td>
                    <Td className="text-xs">
                      {r.match_status === 'MATCHED' && r.student_name ? (
                        <>
                          <div className="font-medium text-slate-900">{r.student_name}</div>
                          <div className="font-mono text-[11px] text-slate-500">{r.student_usn}</div>
                        </>
                      ) : r.match_status === 'STAFF' && r.lecturer_name ? (
                        <><MatchStatusBadge status="STAFF" /><div className="text-[11px] text-slate-500 mt-0.5">{r.lecturer_name}</div></>
                      ) : (
                        <MatchStatusBadge status={r.match_status} />
                      )}
                    </Td>
                    <Td>
                      {r.calculated_statuses.length === 0 ? (
                        <span className="text-[11px] text-slate-400">{r.match_status === 'MATCHED' ? 'No overlapping class' : '—'}</span>
                      ) : (
                        <div className="space-y-1">{r.calculated_statuses.map((c, i) => <CalcStatus key={i} text={c} />)}</div>
                      )}
                    </Td>
                    <Td className="text-xs">
                      <ValidityBadge validity={r.validity} />
                      {r.missing_from_source && <Badge variant="warning" className="ml-1">Removed from sheet</Badge>}
                      {r.issues.length > 0 && <div className="text-[10px] text-slate-500 mt-0.5 max-w-[14rem]">{r.issues.join('; ')}</div>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={rows.data.total} page={page} pageSize={PAGE} onPage={setPage} />
          </>
        )}
      </Card>

      <RowDetail id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
};

const Blank: React.FC = () => <span className="text-slate-300 italic">blank</span>;

interface RowDetailResp {
  row: SheetRow;
  revisions: { change_type: string; old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null; sync_run_id: number | null; changed_at: string }[];
  attendance_records: AttendanceRecord[];
}

const RAW_LABELS: Record<string, string> = {
  uid: 'UID', name: 'Name', role: 'Role', date: 'Date', entry_time: 'Entry Time', exit_time: 'Exit Time', status: 'Status', row_number: 'Row',
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(blank)';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const RowDetail: React.FC<{ id: number | null; onClose: () => void }> = ({ id, onClose }) => {
  const { data, loading, error, reload } = useApi<RowDetailResp>(id ? `/integrations/google-sheets/rows/${id}` : null);
  const r = data?.row;
  return (
    <Modal isOpen={id !== null} onClose={onClose} title={r ? `Sheet row #${r.row_number ?? '—'}` : 'Sheet row'} description="Original values, interpretation, revision history and linked class records" maxWidth="2xl">
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !r ? (
        <TableSkeleton rows={5} cols={3} />
      ) : (
        <div className="space-y-6">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2">Original values (as in the sheet)</h4>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
              <KeyValue label="UID" mono>{r.uid ?? '(blank)'}</KeyValue>
              <KeyValue label="Name">{r.name ?? '(blank)'}</KeyValue>
              <KeyValue label="Role">{r.role ?? '(blank)'}</KeyValue>
              <KeyValue label="Date" mono>{r.date ?? '(blank)'}</KeyValue>
              <KeyValue label="Entry Time" mono>{r.entry_time ?? '(blank)'}</KeyValue>
              <KeyValue label="Exit Time" mono>{r.exit_time ?? '(blank)'}</KeyValue>
              <KeyValue label="Status">{r.original_status ?? '(blank)'}</KeyValue>
              {r.extra && Object.keys(r.extra).length > 0 && <KeyValue label="Extra columns" mono>{fmtVal(r.extra)}</KeyValue>}
            </dl>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2">How Campus Core interpreted it</h4>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl border border-blue-100 bg-blue-50/30 p-4">
              <KeyValue label="Normalised UID" mono>{r.uid_normalized ?? '—'}</KeyValue>
              <KeyValue label="Parsed date">{r.parsed_date ? formatDate(r.parsed_date) : '—'}</KeyValue>
              <KeyValue label="Parsed entry / exit" mono>{hhmm(r.parsed_entry)} → {hhmm(r.parsed_exit)}</KeyValue>
              <KeyValue label="Role category">{r.role_category}</KeyValue>
              <KeyValue label="Match"><MatchStatusBadge status={r.match_status} />{r.student_name && <span className="block text-xs mt-1">{r.student_name} ({r.student_usn})</span>}{r.lecturer_name && <span className="block text-xs mt-1">{r.lecturer_name}</span>}</KeyValue>
              <KeyValue label="Validity"><ValidityBadge validity={r.validity} /></KeyValue>
              <KeyValue label="Ingestion">{r.ingestion_method || '—'}</KeyValue>
              <KeyValue label="First seen / last changed"><span className="text-xs">{formatDateTime(r.first_seen_at)}<br />{formatDateTime(r.last_changed_at)}</span></KeyValue>
            </dl>
            {r.match_note && <p className="mt-2 text-xs text-slate-600">Match note: {r.match_note}</p>}
            {r.issues.length > 0 && <p className="mt-1 text-xs text-amber-700">Issues: {r.issues.join('; ')}</p>}
            {r.missing_from_source && <InlineAlert tone="warning" className="mt-2">This row is no longer present in the Google Sheet. It is kept for audit but excluded from attendance calculations.</InlineAlert>}
          </section>
          <section>
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Linked class attendance records</h4>
            {data!.attendance_records.length === 0 ? (
              <p className="text-xs text-slate-500">This row did not contribute to any class record.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <thead><tr><Th>Class</Th><Th>Scheduled</Th><Th>Intervals</Th><Th className="text-right">Attended</Th><Th>Final status</Th></tr></thead>
                  <tbody>
                    {data!.attendance_records.map((a) => (
                      <tr key={a.id}>
                        <Td className="font-mono text-xs font-semibold text-blue-700">{a.subject_code}</Td>
                        <Td className="font-mono text-xs">{formatDate(a.date)} {hhmm(a.scheduled_start)}–{hhmm(a.scheduled_end)}</Td>
                        <Td><IntervalsList intervals={a.intervals} /></Td>
                        <Td className="text-right text-xs tabular-nums">{a.attended_minutes}/{a.scheduled_minutes} min</Td>
                        <Td><AttendanceStatusBadge status={a.final_status} corrected={a.is_overridden} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </section>
          <section>
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Revision history</h4>
            {data!.revisions.length === 0 ? (
              <p className="text-xs text-slate-500">No revisions recorded.</p>
            ) : (
              <ol className="space-y-3">
                {data!.revisions.map((v, i) => {
                  const keys = Array.from(new Set([...Object.keys(v.old_values || {}), ...Object.keys(v.new_values || {})])).filter((k) => k in RAW_LABELS || k === 'extra');
                  const changed = keys.filter((k) => fmtVal(v.old_values?.[k]) !== fmtVal(v.new_values?.[k]));
                  return (
                    <li key={i} className="border-l-2 border-slate-200 pl-3">
                      <p className="text-xs"><Badge variant="neutral">{v.change_type}</Badge> <span className="text-slate-500">{formatDateTime(v.changed_at)}{v.sync_run_id ? ` · sync #${v.sync_run_id}` : ''}</span></p>
                      {v.old_values && changed.length > 0 && (
                        <ul className="mt-1 text-xs space-y-0.5">
                          {changed.map((k) => (
                            <li key={k}><span className="text-slate-500">{RAW_LABELS[k] || k}:</span> <span className="font-mono line-through text-rose-600">{fmtVal(v.old_values?.[k])}</span> → <span className="font-mono text-emerald-700">{fmtVal(v.new_values?.[k])}</span></li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
};
