import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarX2, Download, History, RotateCcw, Search, Undo2 } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { errorMessage, formatDate, formatDateTime, hhmm, pct } from '../../lib/utils';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { AttendanceStatusBadge, ATTENDANCE_STATUS_META, Badge, MatchStatusBadge } from '../../components/ui/Badge';
import { ErrorState, PageHeader, Pagination, Table, TableSkeleton, Tabs, Td, Th } from '../../components/ui/Kit';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { Checkbox, FilterGrid, InlineAlert, IntervalsList, KeyValue, TextArea, ValidityBadge } from './AttendanceKit';
import {
  ALL_STATUSES, CORRECTABLE_STATUSES, useApi, useLookups,
  type AttendanceRecord, type ClassSessionItem, type Dispute, type Paged, type SheetRow,
  useResettingPage,
} from './attendanceShared';

const PAGE = 50;
const statusOptions = ALL_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_STATUS_META[s]?.label || s }));

export const AttendanceRecords: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'records';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    if (t === 'records') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };
  return (
    <div className="space-y-2">
      <PageHeader
        eyebrow="Attendance"
        title="Attendance records"
        description="One record per student per class session, calculated from the timetable and matched RFID intervals. Click a record to trace it back to the original Google Sheet rows."
      />
      <Tabs
        tabs={[
          { id: 'records', label: 'Class records' },
          { id: 'sessions', label: 'Sessions' },
          { id: 'disputes', label: 'Disputes' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'records' && <RecordsTab initialStatus={params.get('status') || ''} />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'disputes' && <DisputesTab />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

const RecordsTab: React.FC<{ initialStatus: string }> = ({ initialStatus }) => {
  const toast = useToast();
  const { subjects, sections, lookupError } = useLookups(['subjects', 'sections']);
  const [f, setF] = useState({ date_from: '', date_to: '', subject_id: '', section_id: '', status: initialStatus, search: '', overridden: false });
  const [searchDraft, setSearchDraft] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setF((x) => (x.search === searchDraft ? x : { ...x, search: searchDraft })), 350);
    return () => window.clearTimeout(t);
  }, [searchDraft]);
  const [page, setPage] = useResettingPage(JSON.stringify(f));

  const filters = {
    date_from: f.date_from, date_to: f.date_to, subject_id: f.subject_id, section_id: f.section_id,
    status: f.status, search: f.search.trim(), overridden: f.overridden ? true : undefined,
  };
  const endpoint = '/attendance/records' + qs({ ...filters, skip: (page - 1) * PAGE, limit: PAGE });
  const { data, loading, error, reload } = useApi<Paged<AttendanceRecord>>(endpoint);
  const anyFilter = Object.values(filters).some((v) => v !== '' && v !== undefined);

  const doExport = async () => {
    setExporting(true);
    try {
      await ApiClient.download('/attendance/export' + qs({ date_from: f.date_from, date_to: f.date_to, subject_id: f.subject_id, section_id: f.section_id, status: f.status }), 'class_attendance.csv');
    } catch (e) {
      toast.error('Export failed', errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <FilterGrid>
          <div className="relative sm:col-span-2">
            <Input label="Search student" placeholder="Name, USN or card UID" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} className="pl-8" />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 bottom-2.5" aria-hidden />
          </div>
          <Input label="From" type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} />
          <Input label="To" type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} />
          <Select label="Subject" placeholder="All subjects" value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })} options={subjects.map((s) => ({ value: String(s.id), label: `${s.code} — ${s.name}` }))} />
          <Select label="Section" placeholder="All sections" value={f.section_id} onChange={(e) => setF({ ...f, section_id: e.target.value })} options={sections.map((s) => ({ value: String(s.id), label: s.label }))} />
          <Select label="Final status" placeholder="Any status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={statusOptions} />
          <div className="pb-2"><Checkbox label="Corrected only" checked={f.overridden} onChange={(v) => setF({ ...f, overridden: v })} /></div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-2 xl:col-span-4 justify-end">
            {anyFilter && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchDraft(''); setF({ date_from: '', date_to: '', subject_id: '', section_id: '', status: '', search: '', overridden: false }); }}>
                Clear filters
              </Button>
            )}
            <Button variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={doExport} isLoading={exporting}>
              Export CSV
            </Button>
          </div>
        </FilterGrid>
        {lookupError && <p className="mt-2 text-xs text-amber-700">{lookupError}</p>}
        {(f.search || f.overridden) && <p className="mt-2 text-[11px] text-slate-500">CSV export applies the date, subject, section and status filters (search and “corrected only” are not supported by the export endpoint).</p>}
      </Card>

      <Card className="p-0 overflow-hidden">
        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <TableSkeleton rows={8} cols={7} />
        ) : !data || data.items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<CalendarX2 className="w-5 h-5" />}
              title={anyFilter ? 'No records match these filters' : 'No class attendance records yet'}
              description={anyFilter ? 'Try widening the date range or clearing filters.' : 'Records are created once RFID evidence has been imported from the Google Sheet (or a tracking start date is set) and timetable classes have ended.'}
            />
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th><Th>Student</Th><Th>Subject</Th><Th>Scheduled</Th><Th>Actual entry / exit</Th>
                  <Th className="text-right">Attended / sched.</Th><Th className="text-right">Duration</Th><Th>Final status</Th>
                </tr>
              </thead>
              <tbody className={loading ? 'opacity-60' : undefined}>
                {data.items.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => setOpenId(r.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}
                    className="cursor-pointer hover:bg-blue-50/40 focus:bg-blue-50/60 focus:outline-none"
                  >
                    <Td className="whitespace-nowrap">{formatDate(r.date)}</Td>
                    <Td>
                      <div className="font-medium text-slate-900">{r.student_name || `Student #${r.student_id}`}</div>
                      <div className="text-[11px] font-mono text-slate-500">{r.student_usn}</div>
                    </Td>
                    <Td>
                      <div className="font-mono text-xs font-semibold text-blue-700">{r.subject_code}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[12rem]">{r.subject_name}</div>
                    </Td>
                    <Td className="font-mono text-xs whitespace-nowrap">{hhmm(r.scheduled_start)}–{hhmm(r.scheduled_end)}</Td>
                    <Td><IntervalsList intervals={r.intervals} /></Td>
                    <Td className="text-right tabular-nums text-xs">{r.attended_minutes ?? 0} / {r.scheduled_minutes ?? 0} min</Td>
                    <Td className="text-right tabular-nums text-xs">{pct(r.duration_percent)}</Td>
                    <Td>
                      <AttendanceStatusBadge status={r.final_status} corrected={r.is_overridden} />
                      {r.override_stale && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700" title="The calculated status changed after this correction was made">
                          <AlertTriangle className="w-3 h-3" /> Calculation changed since correction
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={data.total} page={page} pageSize={PAGE} onPage={setPage} />
          </>
        )}
      </Card>

      <RecordDetail key={openId ?? 'closed'} id={openId} onClose={() => setOpenId(null)} onChanged={reload} />
    </div>
  );
};

interface RecordDetailResp {
  record: AttendanceRecord;
  source_rows: SheetRow[];
  same_day_rows: SheetRow[];
  corrections: { old_status: string | null; new_status: string | null; reason: string; by: string | null; at: string }[];
}

const RecordDetail: React.FC<{ id: number | null; onClose: () => void; onChanged: () => void }> = ({ id, onClose, onChanged }) => {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<RecordDetailResp>(id ? `/attendance/records/${id}` : null);
  const [statusChoice, setStatus] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const currentStatus = data?.record ? data.record.override_status || data.record.computed_status : 'PRESENT';
  const status = statusChoice ?? ((CORRECTABLE_STATUSES as readonly string[]).includes(currentStatus) ? currentStatus : 'PRESENT');

  const submit = async (remove: boolean) => {
    if (!id) return;
    setFormErr(null);
    if (reason.trim().length < 3) {
      setFormErr('A reason of at least 3 characters is required for the audit trail.');
      return;
    }
    setBusy(true);
    try {
      await ApiClient.post(`/attendance/records/${id}/correct`, { status: remove ? null : status, reason: reason.trim() });
      toast.success(remove ? 'Correction removed' : 'Attendance corrected', remove ? 'The calculated status applies again.' : `Final status set to ${ATTENDANCE_STATUS_META[status]?.label || status}.`);
      setReason('');
      reload();
      onChanged();
    } catch (e) {
      setFormErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const r = data?.record;
  const sourceIds = new Set(data?.source_rows.map((x) => x.id));
  const otherRows = (data?.same_day_rows || []).filter((x) => !sourceIds.has(x.id));
  const cancelled = r?.computed_status === 'CANCELLED';

  return (
    <Modal isOpen={id !== null} onClose={onClose} title="Class attendance record" description={r ? `${r.student_name || ''} · ${r.subject_code || ''} · ${formatDate(r.date)}` : undefined} maxWidth="2xl">
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !r ? (
        <TableSkeleton rows={5} cols={3} />
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <KeyValue label="Student">{r.student_name}<span className="block font-mono text-xs text-slate-500">{r.student_usn}{r.student_uid ? ` · UID ${r.student_uid}` : ''}</span></KeyValue>
            <KeyValue label="Class">{r.subject_code} — {r.subject_name}<span className="block text-xs text-slate-500">{r.lecturer_name || 'No lecturer'}{r.room_number ? ` · ${r.room_number}` : ''}</span></KeyValue>
            <KeyValue label="Scheduled">{formatDate(r.date)}, {hhmm(r.scheduled_start)}–{hhmm(r.scheduled_end)} ({r.scheduled_minutes} min)</KeyValue>
            <KeyValue label="Presence intervals (clipped to class)"><IntervalsList intervals={r.intervals} /></KeyValue>
            <KeyValue label="Attended">{r.attended_minutes ?? 0} min · {pct(r.duration_percent, 2)}</KeyValue>
            <KeyValue label="Final status"><AttendanceStatusBadge status={r.final_status} corrected={r.is_overridden} /></KeyValue>
          </section>

          <section className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-700">How this was calculated</p>
            <p className="text-sm text-slate-800">
              Calculated status: <AttendanceStatusBadge status={r.computed_status} /> — {r.status_reason || 'No reason recorded'}
            </p>
            <p className="text-[11px] text-slate-500">Policy version {r.policy_version ?? '—'} · calculated {formatDateTime(r.calculated_at ? r.calculated_at + (r.calculated_at.endsWith('Z') ? '' : 'Z') : null)}</p>
            {r.is_overridden && (
              <p className="text-xs text-slate-700">Manual correction: <strong>{r.override_status}</strong> — “{r.override_reason}”</p>
            )}
            {r.override_stale && (
              <InlineAlert tone="warning" title="Correction may be outdated">The calculated status changed after this correction was made (e.g. new RFID rows were imported). Review whether the correction is still needed.</InlineAlert>
            )}
          </section>

          <section>
            <h4 className="text-sm font-semibold text-slate-900 mb-2">Contributing Google Sheet rows</h4>
            <SourceRowsTable rows={data!.source_rows} empty="No RFID rows overlapped this class." />
          </section>

          {otherRows.length > 0 && (
            <section>
              <h4 className="text-sm font-semibold text-slate-900 mb-1">Other rows for this student on the same day</h4>
              <p className="text-xs text-slate-500 mb-2">These scans did not overlap the class window (or were excluded as invalid/removed).</p>
              <SourceRowsTable rows={otherRows} />
            </section>
          )}

          <section>
            <h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5"><History className="w-4 h-4 text-slate-400" /> Correction history</h4>
            {data!.corrections.length === 0 ? (
              <p className="text-xs text-slate-500">No manual corrections.</p>
            ) : (
              <ul className="space-y-2">
                {data!.corrections.map((c, i) => (
                  <li key={i} className="text-xs border-l-2 border-slate-200 pl-3">
                    <span className="font-medium text-slate-800">{c.old_status || '—'} → {c.new_status || 'correction removed'}</span>
                    <span className="text-slate-500"> · {c.by || 'Unknown'} · {formatDateTime(c.at)}</span>
                    <p className="text-slate-600">“{c.reason}”</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-t border-slate-100 pt-4">
            <h4 className="text-sm font-semibold text-slate-900 mb-3">Correct attendance</h4>
            {cancelled ? (
              <InlineAlert tone="info">This class was cancelled. Restore the session from the Sessions tab instead of correcting attendance.</InlineAlert>
            ) : (
              <div className="space-y-3">
                {formErr && <InlineAlert tone="danger">{formErr}</InlineAlert>}
                <Select label="New final status" value={status} onChange={(e) => setStatus(e.target.value)} options={CORRECTABLE_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_STATUS_META[s]?.label || s }))} />
                <TextArea label="Reason" required value={reason} onChange={setReason} placeholder="e.g. Card reader at LH-101 was offline; lecturer confirmed presence" />
                <div className="flex flex-wrap justify-end gap-2">
                  {r.is_overridden && (
                    <Button variant="outline" size="sm" leftIcon={<Undo2 className="w-3.5 h-3.5" />} onClick={() => submit(true)} isLoading={busy}>
                      Remove correction
                    </Button>
                  )}
                  <Button size="sm" onClick={() => submit(false)} isLoading={busy}>Save correction</Button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
};

const SourceRowsTable: React.FC<{ rows: SheetRow[]; empty?: string }> = ({ rows, empty = 'None' }) => {
  if (!rows.length) return <p className="text-xs text-slate-500">{empty}</p>;
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <Table>
        <thead>
          <tr><Th>Sheet row</Th><Th>Raw UID</Th><Th>Raw date</Th><Th>Raw entry</Th><Th>Raw exit</Th><Th>Original status</Th><Th>Validity</Th></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <Td className="tabular-nums">#{s.row_number ?? '—'}{s.missing_from_source && <Badge variant="warning" className="ml-1">removed</Badge>}</Td>
              <Td className="font-mono text-xs">{s.uid ?? <span className="text-slate-400">empty</span>}</Td>
              <Td className="font-mono text-xs">{s.date ?? '—'}</Td>
              <Td className="font-mono text-xs">{s.entry_time || <span className="text-amber-600">empty</span>}</Td>
              <Td className="font-mono text-xs">{s.exit_time || <span className="text-amber-600">empty</span>}</Td>
              <Td className="text-xs">{s.original_status || '—'}</Td>
              <Td>
                <ValidityBadge validity={s.validity} />
                {s.match_status && s.match_status !== 'MATCHED' && <span className="ml-1"><MatchStatusBadge status={s.match_status} /></span>}
                {s.issues?.length > 0 && <div className="text-[10px] text-slate-500 mt-0.5">{s.issues.join('; ')}</div>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const SessionsTab: React.FC = () => {
  const toast = useToast();
  const { subjects, sections, lecturers } = useLookups(['subjects', 'sections', 'lecturers']);
  const [f, setF] = useState({ date_from: '', date_to: '', section_id: '', subject_id: '', lecturer_id: '' });
  const [page, setPage] = useResettingPage(JSON.stringify(f));
  const { data, loading, error, reload } = useApi<Paged<ClassSessionItem>>('/attendance/sessions' + qs({ ...f, skip: (page - 1) * PAGE, limit: PAGE }));
  const [cancelTarget, setCancelTarget] = useState<ClassSessionItem | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ClassSessionItem | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const doCancel = async () => {
    if (!cancelTarget) return;
    if (reason.trim().length < 3) {
      toast.warning('Reason required', 'Enter at least 3 characters.');
      return;
    }
    setBusy(true);
    try {
      await ApiClient.post(`/attendance/sessions/${cancelTarget.id}/cancel`, { reason: reason.trim() });
      toast.success('Session cancelled', `${cancelTarget.subject_code} on ${formatDate(cancelTarget.date)} is excluded from attendance.`);
      setCancelTarget(null);
      setReason('');
      reload();
    } catch (e) {
      toast.error('Could not cancel session', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const doRestore = async () => {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      await ApiClient.post(`/attendance/sessions/${restoreTarget.id}/restore`);
      toast.success('Session restored', 'Attendance for this class has been recalculated.');
      setRestoreTarget(null);
      reload();
    } catch (e) {
      toast.error('Could not restore session', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const countKeys = ['PRESENT', 'LATE', 'PARTIAL', 'ABSENT', 'PENDING_VERIFICATION', 'EXCUSED'];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <FilterGrid className="xl:grid-cols-5">
          <Input label="From" type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} />
          <Input label="To" type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} />
          <Select label="Section" placeholder="All sections" value={f.section_id} onChange={(e) => setF({ ...f, section_id: e.target.value })} options={sections.map((s) => ({ value: String(s.id), label: s.label }))} />
          <Select label="Subject" placeholder="All subjects" value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })} options={subjects.map((s) => ({ value: String(s.id), label: s.code }))} />
          <Select label="Lecturer" placeholder="All lecturers" value={f.lecturer_id} onChange={(e) => setF({ ...f, lecturer_id: e.target.value })} options={lecturers.map((l) => ({ value: String(l.id), label: l.user?.full_name || l.employee_id }))} />
        </FilterGrid>
        <p className="mt-2 text-[11px] text-slate-500">Sessions are generated from the timetable for dates that are being evaluated. Cancelling a session marks every student’s record for it as “Class cancelled”.</p>
      </Card>
      <Card className="p-0 overflow-hidden">
        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !data || data.items.length === 0 ? (
          <div className="p-5"><EmptyState icon={<CalendarX2 className="w-5 h-5" />} title="No class sessions" description="No concrete sessions exist for these filters yet. Sessions are created when attendance is evaluated or a week view is opened." /></div>
        ) : (
          <>
            <Table>
              <thead>
                <tr><Th>Date</Th><Th>Time</Th><Th>Subject</Th><Th>Section</Th><Th>Lecturer / room</Th><Th>Status</Th><Th>Records</Th><Th className="text-right">Actions</Th></tr>
              </thead>
              <tbody className={loading ? 'opacity-60' : undefined}>
                {data.items.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <Td className="whitespace-nowrap">{formatDate(s.date)}</Td>
                    <Td className="font-mono text-xs whitespace-nowrap">{s.start_time}–{s.end_time}</Td>
                    <Td><span className="font-mono text-xs font-semibold text-blue-700">{s.subject_code}</span><div className="text-[11px] text-slate-500">{s.subject_name}</div></Td>
                    <Td className="text-xs">{s.section || '—'}</Td>
                    <Td className="text-xs">{s.lecturer_name || '—'}<div className="text-slate-500">{s.room_number}</div></Td>
                    <Td>
                      {s.status === 'CANCELLED' ? <Badge variant="neutral">Cancelled</Badge> : <Badge variant="info">Scheduled</Badge>}
                      {s.cancel_reason && <div className="text-[10px] text-slate-500 mt-0.5 max-w-[12rem]">{s.cancel_reason}</div>}
                    </Td>
                    <Td>
                      {Object.keys(s.counts).length === 0 ? (
                        <span className="text-xs text-slate-400">Not evaluated</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-[16rem]">
                          {[...countKeys, 'CANCELLED'].filter((k) => s.counts[k]).map((k) => (
                            <span key={k} className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                              <span className={`w-1.5 h-1.5 rounded-full ${ATTENDANCE_STATUS_META[k]?.dot}`} />
                              {ATTENDANCE_STATUS_META[k]?.label}: <strong className="tabular-nums">{s.counts[k]}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {s.status === 'CANCELLED' ? (
                        <Button size="sm" variant="outline" leftIcon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setRestoreTarget(s)}>Restore</Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => { setReason(''); setCancelTarget(s); }}>Cancel class</Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={data.total} page={page} pageSize={PAGE} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel this class?" description={cancelTarget ? `${cancelTarget.subject_code} · ${formatDate(cancelTarget.date)} ${cancelTarget.start_time}–${cancelTarget.end_time}` : undefined}>
        <div className="space-y-4">
          <TextArea label="Reason" required value={reason} onChange={setReason} placeholder="e.g. Lecturer on leave" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={busy}>Keep class</Button>
            <Button variant="danger" onClick={doCancel} isLoading={busy}>Cancel class</Button>
          </div>
        </div>
      </Modal>
      <Modal isOpen={!!restoreTarget} onClose={() => setRestoreTarget(null)} title="Restore this class?" maxWidth="sm">
        <p className="text-sm text-slate-600">The class becomes scheduled again and attendance for {restoreTarget ? formatDate(restoreTarget.date) : ''} is recalculated from RFID evidence.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRestoreTarget(null)} disabled={busy}>Close</Button>
          <Button onClick={doRestore} isLoading={busy}>Restore</Button>
        </div>
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

const DisputesTab: React.FC = () => {
  const toast = useToast();
  const [status, setStatus] = useState('OPEN');
  const { data, loading, error, reload } = useApi<Dispute[]>('/attendance/disputes' + qs({ status: status === 'ALL' ? '' : status }));
  const [target, setTarget] = useState<{ d: Dispute; outcome: 'RESOLVED' | 'REJECTED' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [openRecord, setOpenRecord] = useState<number | null>(null);

  const resolve = async () => {
    if (!target) return;
    if (note.trim().length < 3) {
      toast.warning('Note required', 'Explain the decision to the student (at least 3 characters).');
      return;
    }
    setBusy(true);
    try {
      await ApiClient.post(`/attendance/disputes/${target.d.id}/resolve`, { status: target.outcome, note: note.trim() });
      toast.success(target.outcome === 'RESOLVED' ? 'Dispute resolved' : 'Dispute rejected', 'The student has been notified.');
      setTarget(null);
      setNote('');
      reload();
    } catch (e) {
      toast.error('Could not update dispute', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const items = useMemo(() => data || [], [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'OPEN', label: 'Open' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'REJECTED', label: 'Rejected' }, { value: 'ALL', label: 'All' }]} />
        </div>
        <p className="text-xs text-slate-500 pb-2">Resolving a dispute does not change attendance by itself — open the record and save a correction if the student is right.</p>
      </div>
      <Card className="p-0 overflow-hidden">
        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <TableSkeleton rows={4} cols={5} />
        ) : items.length === 0 ? (
          <div className="p-5"><EmptyState title={status === 'OPEN' ? 'No open disputes' : 'No disputes'} description="Students can dispute a class record from their attendance page." /></div>
        ) : (
          <Table>
            <thead>
              <tr><Th>Raised</Th><Th>Student</Th><Th>Class</Th><Th>Current status</Th><Th>Message</Th><Th>State</Th><Th className="text-right">Actions</Th></tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70">
                  <Td className="text-xs whitespace-nowrap">{formatDateTime(d.created_at)}</Td>
                  <Td><div className="font-medium text-slate-900">{d.student_name}</div><div className="text-[11px] font-mono text-slate-500">{d.student_usn}</div></Td>
                  <Td className="text-xs"><span className="font-mono font-semibold text-blue-700">{d.subject_code}</span><div className="text-slate-500">{formatDate(d.date || undefined)}</div></Td>
                  <Td>{d.final_status ? <AttendanceStatusBadge status={d.final_status} /> : '—'}</Td>
                  <Td className="text-xs max-w-xs"><p className="line-clamp-3">{d.message}</p>{d.resolution_note && <p className="mt-1 text-slate-500">Note: {d.resolution_note}</p>}</Td>
                  <Td><Badge variant={d.status === 'OPEN' ? 'warning' : d.status === 'RESOLVED' ? 'success' : 'neutral'}>{d.status}</Badge></Td>
                  <Td className="text-right whitespace-nowrap space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setOpenRecord(d.record_id)}>Record</Button>
                    {d.status === 'OPEN' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setNote(''); setTarget({ d, outcome: 'RESOLVED' }); }}>Resolve</Button>
                        <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => { setNote(''); setTarget({ d, outcome: 'REJECTED' }); }}>Reject</Button>
                      </>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Modal isOpen={!!target} onClose={() => setTarget(null)} title={target?.outcome === 'RESOLVED' ? 'Resolve dispute' : 'Reject dispute'} description={target ? `${target.d.student_name} · ${target.d.subject_code} · ${formatDate(target.d.date || undefined)}` : undefined}>
        <div className="space-y-4">
          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">“{target?.d.message}”</p>
          <TextArea label="Note to the student" required value={note} onChange={setNote} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTarget(null)} disabled={busy}>Close</Button>
            <Button variant={target?.outcome === 'REJECTED' ? 'danger' : 'primary'} onClick={resolve} isLoading={busy}>{target?.outcome === 'RESOLVED' ? 'Mark resolved' : 'Reject'}</Button>
          </div>
        </div>
      </Modal>
      <RecordDetail key={openRecord ?? 'closed'} id={openRecord} onClose={() => setOpenRecord(null)} onChanged={reload} />
    </div>
  );
};
