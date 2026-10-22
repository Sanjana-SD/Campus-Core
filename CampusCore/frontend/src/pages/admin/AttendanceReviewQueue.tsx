import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, Fingerprint, GraduationCap, RotateCcw, ShieldCheck, UserCog } from 'lucide-react';
import { ApiClient, ApiError, qs } from '../../lib/api';
import { errorMessage, formatDate } from '../../lib/utils';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge, MatchStatusBadge } from '../../components/ui/Badge';
import { ErrorState, PageHeader, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { Checkbox, InlineAlert, SearchableSelect, TextArea } from './AttendanceKit';
import { useApi, useLookups } from './attendanceShared';

interface UidGroup {
  uid: string | null;
  raw_uids: string[];
  names: string[];
  roles: string[];
  row_count: number;
  first_date: string | null;
  last_date: string | null;
  match_status: string;
  notes: string[];
  row_ids: number[];
}

type MapKind = 'student' | 'lecturer';

export const AttendanceReviewQueue: React.FC = () => {
  const toast = useToast();
  const [includeIgnored, setIncludeIgnored] = useState(false);
  const { data, loading, error, reload } = useApi<UidGroup[]>('/integrations/unmatched' + qs({ include_ignored: includeIgnored ? true : undefined }));
  const { students, lecturers, lookupError } = useLookups(['students', 'lecturers']);

  const [mapTarget, setMapTarget] = useState<{ g: UidGroup; kind: MapKind } | null>(null);
  const [personId, setPersonId] = useState('');
  const [reason, setReason] = useState('');
  const [replace, setReplace] = useState(false);
  const [mapErr, setMapErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [ignoreTarget, setIgnoreTarget] = useState<{ g: UidGroup; ignore: boolean } | null>(null);
  const [ignoreReason, setIgnoreReason] = useState('');

  const studentOpts = useMemo(
    () => students.map((s) => ({ value: String(s.id), label: `${s.user?.full_name || 'Unnamed'} (${s.student_id_number})`, hint: s.rfid_uid ? `UID ${s.rfid_uid}` : 'no UID' })),
    [students]
  );
  const lecturerOpts = useMemo(
    () => lecturers.map((l) => ({ value: String(l.id), label: `${l.user?.full_name || 'Unnamed'} (${l.employee_id})`, hint: l.rfid_uid ? `UID ${l.rfid_uid}` : 'no UID' })),
    [lecturers]
  );

  const selectedExistingUid = useMemo(() => {
    if (!mapTarget || !personId) return null;
    const p = mapTarget.kind === 'student' ? students.find((s) => String(s.id) === personId) : lecturers.find((l) => String(l.id) === personId);
    const uid = p?.rfid_uid;
    return uid && uid.toUpperCase() !== (mapTarget.g.uid || '').toUpperCase() ? uid : null;
  }, [mapTarget, personId, students, lecturers]);

  const openMap = (g: UidGroup, kind: MapKind) => {
    setMapTarget({ g, kind });
    setPersonId('');
    setReason('');
    setReplace(false);
    setMapErr(null);
  };

  const submitMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapTarget?.g.uid) return;
    setMapErr(null);
    if (!personId) return setMapErr(`Select a ${mapTarget.kind}.`);
    if (!reason.trim()) return setMapErr('A reason is required for the audit trail.');
    if (selectedExistingUid && !replace) return setMapErr(`This ${mapTarget.kind} already has UID ${selectedExistingUid}. Tick “Replace existing UID” to continue.`);
    setBusy(true);
    try {
      const res = await ApiClient.post<{ message: string; rows_rematched: number }>('/integrations/uid-mappings', {
        uid: mapTarget.g.uid,
        student_id: mapTarget.kind === 'student' ? Number(personId) : null,
        lecturer_id: mapTarget.kind === 'lecturer' ? Number(personId) : null,
        replace_existing: replace,
        reason: reason.trim(),
      });
      toast.success('UID mapped', `${res.message}. ${res.rows_rematched} row(s) re-matched and attendance recalculated.`);
      setMapTarget(null);
      reload();
    } catch (err) {
      const msg = errorMessage(err);
      setMapErr(err instanceof ApiError && err.status === 409 ? `Conflict: ${msg}` : msg);
    } finally {
      setBusy(false);
    }
  };

  const submitIgnore = async () => {
    if (!ignoreTarget?.g.uid) return;
    if (!ignoreReason.trim()) {
      toast.warning('Reason required', 'Explain why this UID is being ignored or restored.');
      return;
    }
    setBusy(true);
    try {
      const res = await ApiClient.post<{ message: string }>('/integrations/uid-ignore', { uid: ignoreTarget.g.uid, ignore: ignoreTarget.ignore, reason: ignoreReason.trim() });
      toast.success(ignoreTarget.ignore ? 'UID ignored' : 'UID restored', res.message);
      setIgnoreTarget(null);
      setIgnoreReason('');
      reload();
    } catch (e) {
      toast.error('Action failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const items = data || [];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Attendance"
        title="UID review queue"
        description="RFID card UIDs in the Google Sheet that are not registered to anyone, or that conflict with the registered owner."
        actions={<Link to="/admin/attendance/source?match_status=UNMATCHED"><Button variant="outline" size="sm">View source rows</Button></Link>}
      />

      <InlineAlert tone="info" title="Matching uses the exact card UID only">
        Rows are linked to a student or lecturer solely by an exact (case-insensitive) UID match against the UID stored on their profile. Names in the
        sheet are shown to help you identify the person but are <strong>never</strong> used for matching. Mapping a UID updates the profile, re-matches every
        row with that UID and recalculates attendance. A UID can belong to only one person.
      </InlineAlert>

      <div className="flex items-center justify-between gap-3">
        <Checkbox label="Show ignored UIDs" checked={includeIgnored} onChange={setIncludeIgnored} />
        {lookupError && <p className="text-xs text-amber-700">{lookupError}</p>}
      </div>

      <Card className="p-0 overflow-hidden">
        {error ? (
          <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <TableSkeleton rows={5} cols={7} />
        ) : items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<ShieldCheck className="w-5 h-5" />}
              title="Nothing to review"
              description="No unmatched or conflicting UIDs in the imported RFID rows. If the Google Sheet is not connected yet, no rows have been imported, so this queue is empty."
              action={<Link to="/admin/google-sheets"><Button size="sm" variant="outline">Integration status</Button></Link>}
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr><Th>UID</Th><Th>Names in sheet</Th><Th>Roles in sheet</Th><Th className="text-right">Rows</Th><Th>First / last date</Th><Th>Notes</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr>
            </thead>
            <tbody>
              {items.map((g, i) => (
                <tr key={g.uid || `empty-${i}`} className="hover:bg-slate-50/70">
                  <Td>
                    <div className="font-mono text-sm font-semibold text-slate-900 flex items-center gap-1.5"><Fingerprint className="w-3.5 h-3.5 text-slate-400" />{g.uid || <span className="text-rose-600 font-sans text-xs">empty UID</span>}</div>
                    {g.raw_uids.filter((r) => r && r !== g.uid).length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-0.5">Raw: {g.raw_uids.filter(Boolean).map((r) => `“${r}”`).join(', ')}</div>
                    )}
                  </Td>
                  <Td className="text-xs">{g.names.length ? g.names.join(', ') : <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-xs">{g.roles.length ? g.roles.join(', ') : <span className="text-slate-400">blank</span>}</Td>
                  <Td className="text-right tabular-nums">{g.row_count}</Td>
                  <Td className="text-xs whitespace-nowrap">{g.first_date ? formatDate(g.first_date) : '—'}{g.last_date && g.last_date !== g.first_date ? ` → ${formatDate(g.last_date)}` : ''}</Td>
                  <Td className="text-xs max-w-xs">
                    {g.notes.map((n) => (
                      <p key={n} className={/leading zero/i.test(n) ? 'text-amber-700 font-medium' : 'text-slate-600'}>{n}</p>
                    ))}
                  </Td>
                  <Td><MatchStatusBadge status={g.match_status} /></Td>
                  <Td className="text-right whitespace-nowrap">
                    {g.uid ? (
                      <div className="flex justify-end gap-1">
                        {g.match_status !== 'IGNORED' ? (
                          <>
                            <Button size="sm" variant="outline" leftIcon={<GraduationCap className="w-3.5 h-3.5" />} onClick={() => openMap(g, 'student')}>Map to student</Button>
                            <Button size="sm" variant="ghost" leftIcon={<UserCog className="w-3.5 h-3.5" />} onClick={() => openMap(g, 'lecturer')}>Lecturer</Button>
                            <Button size="sm" variant="ghost" className="text-slate-500" leftIcon={<EyeOff className="w-3.5 h-3.5" />} onClick={() => { setIgnoreReason(''); setIgnoreTarget({ g, ignore: true }); }}>Ignore</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" leftIcon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => { setIgnoreReason(''); setIgnoreTarget({ g, ignore: false }); }}>Restore</Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">Fix the UID in the sheet</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        isOpen={!!mapTarget}
        onClose={() => setMapTarget(null)}
        title={mapTarget?.kind === 'lecturer' ? 'Map UID to a lecturer' : 'Map UID to a student'}
        description={mapTarget ? `UID ${mapTarget.g.uid} · ${mapTarget.g.row_count} row(s)${mapTarget.g.names.length ? ` · sheet name: ${mapTarget.g.names.join(', ')}` : ''}` : undefined}
        maxWidth="lg"
      >
        <form onSubmit={submitMap} className="space-y-4">
          {mapErr && <InlineAlert tone="danger">{mapErr}</InlineAlert>}
          {mapTarget?.g.notes.some((n) => /leading zero/i.test(n)) && (
            <InlineAlert tone="warning" title="Possible leading-zero mismatch">{mapTarget.g.notes.find((n) => /leading zero/i.test(n))}</InlineAlert>
          )}
          <SearchableSelect
            label={mapTarget?.kind === 'lecturer' ? 'Lecturer' : 'Student'}
            required
            options={mapTarget?.kind === 'lecturer' ? lecturerOpts : studentOpts}
            value={personId}
            onChange={(v) => { setPersonId(v); setReplace(false); }}
            placeholder="Search by name, USN / employee ID or UID"
          />
          {selectedExistingUid && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-900">This {mapTarget?.kind} already has card UID <span className="font-mono font-semibold">{selectedExistingUid}</span>. Replacing it will un-link rows carrying the old UID.</p>
              <Checkbox label="Replace existing UID" checked={replace} onChange={setReplace} />
            </div>
          )}
          <TextArea label="Reason" required value={reason} onChange={setReason} placeholder="e.g. Verified card in person with the student ID card" helperText="Stored in the audit log." />
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={() => setMapTarget(null)} disabled={busy}>Cancel</Button>
            <Button type="submit" isLoading={busy}>Assign UID</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!ignoreTarget} onClose={() => setIgnoreTarget(null)} title={ignoreTarget?.ignore ? 'Ignore this UID?' : 'Return UID to review?'} description={ignoreTarget ? `UID ${ignoreTarget.g.uid}` : undefined}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {ignoreTarget?.ignore
              ? 'Ignored UIDs (e.g. visitor or test cards) are hidden from this queue and never used for attendance. You can restore them later.'
              : 'The UID returns to the unmatched queue so it can be mapped.'}
          </p>
          <TextArea label="Reason" required value={ignoreReason} onChange={setIgnoreReason} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIgnoreTarget(null)} disabled={busy}>Cancel</Button>
            <Button variant={ignoreTarget?.ignore ? 'danger' : 'primary'} onClick={submitIgnore} isLoading={busy}>{ignoreTarget?.ignore ? 'Ignore UID' : 'Restore'}</Button>
          </div>
        </div>
      </Modal>
      {items.some((g) => g.match_status === 'IGNORED') && <p className="text-[11px] text-slate-500"><Badge variant="neutral">Ignored</Badge> UIDs are excluded from attendance.</p>}
    </div>
  );
};
