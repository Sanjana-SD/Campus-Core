import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck, ShieldOff, Users } from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { cn, errorMessage } from '../../lib/utils';
import { ConfirmDialog, ErrorState, Pagination, StatCard, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { SearchInput, TextArea } from './placementShared';
import { Eligibility, label, n, useApi } from './placementUtils';

interface EligRow {
  student_id: number;
  name: string;
  usn: string | null;
  department: string | null;
  graduation_year: number | null;
  cgpa: number | null;
  active_backlogs: number | null;
  eligibility: Eligibility;
  applied: boolean;
  application_id: number | null;
}

export const EligibilityBadge: React.FC<{ status: string | null | undefined; exception?: boolean }> = ({ status, exception }) => {
  const variant = status === 'ELIGIBLE' ? 'success' : status === 'INELIGIBLE' ? 'danger' : status ? 'warning' : 'neutral';
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <Badge variant={variant}>{label(status)}</Badge>
      {exception && (
        <Badge variant="info">
          <ShieldCheck className="w-3 h-3 mr-1" />
          Exception
        </Badge>
      )}
    </span>
  );
};

export const EligibilityChecks: React.FC<{ e: Eligibility }> = ({ e }) => (
  <div>
    {e.checks.length === 0 ? (
      <p className="p-3 text-xs text-slate-500">This drive has no automatic eligibility criteria — every active student qualifies.</p>
    ) : (
      <Table>
        <thead>
          <tr>
            <Th>Criterion</Th>
            <Th>Requirement</Th>
            <Th>Student value</Th>
            <Th>Outcome</Th>
          </tr>
        </thead>
        <tbody>
          {e.checks.map((c) => (
            <tr key={c.criterion}>
              <Td className="font-medium text-slate-800">{c.criterion}</Td>
              <Td>{c.requirement}</Td>
              <Td>{c.student_value ?? <span className="text-slate-400">Not recorded</span>}</Td>
              <Td>
                <Badge variant={c.outcome === 'PASS' ? 'success' : c.outcome === 'FAIL' ? 'danger' : 'warning'}>
                  {c.outcome === 'PASS' ? 'Pass' : c.outcome === 'FAIL' ? 'Fail' : 'Needs verification'}
                </Badge>
                {c.note && <p className="text-[11px] text-slate-500 mt-1">{c.note}</p>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    )}
    {e.has_exception && (
      <p className="px-3 py-2 text-xs text-blue-800 bg-blue-50 border-t border-blue-100">
        <ShieldCheck className="inline w-3.5 h-3.5 mr-1" />
        Exception granted{e.exception_reason ? `: ${e.exception_reason}` : ''}
      </p>
    )}
    {e.other_requirements && (
      <p className="px-3 py-2 text-xs text-slate-600 border-t border-slate-100">
        <span className="font-medium">Other requirements (checked manually):</span> {e.other_requirements}
      </p>
    )}
  </div>
);

const PAGE_SIZE = 25;

export const EligibilityTab: React.FC<{ driveId: number; onOpenApplication: (id: number) => void }> = ({
  driveId,
  onOpenApplication,
}) => {
  const toast = useToast();
  const [status, setStatusRaw] = useState('');
  const [applied, setAppliedRaw] = useState('');
  const [search, setSearchRaw] = useState('');
  const [page, setPage] = useState(1);
  const resetting = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };
  const setStatus = resetting(setStatusRaw);
  const setApplied = resetting(setAppliedRaw);
  const setSearch = resetting(setSearchRaw);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [grantFor, setGrantFor] = useState<EligRow | null>(null);
  const [revokeFor, setRevokeFor] = useState<EligRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Fetch the full list once and filter locally so the summary always reflects all active students.
  const res = useApi<{ summary: Record<string, number>; items: EligRow[] }>(`/placements/drives/${driveId}/eligibility`);
  const rows = useMemo(() => res.data?.items ?? [], [res.data]);
  const { loading, error, reload: load } = res;

  const summary = useMemo(() => {
    const s = { ELIGIBLE: 0, INELIGIBLE: 0, INCOMPLETE_INFORMATION: 0, exceptions: 0, applied: 0 };
    rows.forEach((r) => {
      if (r.eligibility.status in s) s[r.eligibility.status as 'ELIGIBLE']++;
      if (r.eligibility.has_exception) s.exceptions++;
      if (r.applied) s.applied++;
    });
    return s;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!status || (status === 'EXCEPTION' ? r.eligibility.has_exception : r.eligibility.status === status)) &&
        (!applied || (applied === 'yes') === r.applied) &&
        (!q || `${r.name} ${r.usn ?? ''}`.toLowerCase().includes(q))
    );
  }, [rows, status, applied, search]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const revoke = async () => {
    if (!revokeFor) return;
    setRevoking(true);
    try {
      const r = await ApiClient.delete<{ message: string }>(`/placements/drives/${driveId}/exceptions/${revokeFor.student_id}`);
      toast.success('Exception revoked', r.message);
      setRevokeFor(null);
      load();
    } catch (e) {
      toast.error('Could not revoke exception', errorMessage(e));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Eligible" value={n(summary.ELIGIBLE)} tone="success" onClick={() => setStatus('ELIGIBLE')} />
        <StatCard label="Ineligible" value={n(summary.INELIGIBLE)} tone="danger" onClick={() => setStatus('INELIGIBLE')} />
        <StatCard
          label="Needs verification"
          value={n(summary.INCOMPLETE_INFORMATION)}
          hint="Profile data missing for a rule"
          tone="warning"
          onClick={() => setStatus('INCOMPLETE_INFORMATION')}
        />
        <StatCard label="Exceptions granted" value={n(summary.exceptions)} tone="info" onClick={() => setStatus('EXCEPTION')} />
      </div>
      <p className="text-xs text-slate-500">
        Evaluated live against each active student's current profile. Missing profile data is shown as{' '}
        <strong>needs verification</strong> rather than ineligible. An exception lets a student apply regardless of the automatic
        result; revoking it keeps any application already submitted.
      </p>

      <Card className="p-0 overflow-hidden">
        <div className="grid gap-3 p-4 border-b border-slate-100 md:grid-cols-[1fr_12rem_12rem]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or USN" label="Search students" />
          <Select
            aria-label="Eligibility"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="All outcomes"
            options={[
              { value: 'ELIGIBLE', label: 'Eligible' },
              { value: 'INELIGIBLE', label: 'Ineligible' },
              { value: 'INCOMPLETE_INFORMATION', label: 'Needs verification' },
              { value: 'EXCEPTION', label: 'Has exception' },
            ]}
          />
          <Select
            aria-label="Applied"
            value={applied}
            onChange={(e) => setApplied(e.target.value)}
            placeholder="Applied or not"
            options={[
              { value: 'yes', label: 'Applied' },
              { value: 'no', label: 'Not applied' },
            ]}
          />
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : loading && rows.length === 0 ? (
          <TableSkeleton cols={7} />
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title={rows.length === 0 ? 'No active students' : 'No students match these filters'}
              description={rows.length === 0 ? 'There are no active student profiles to evaluate.' : 'Try clearing the filters.'}
            />
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="w-8">
                    <span className="sr-only">Expand</span>
                  </Th>
                  <Th>Student</Th>
                  <Th>Dept</Th>
                  <Th>Grad. year</Th>
                  <Th className="text-right">CGPA</Th>
                  <Th className="text-right">Backlogs</Th>
                  <Th>Eligibility</Th>
                  <Th>Applied</Th>
                  <Th className="text-right">Exception</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const isOpen = open.has(r.student_id);
                  return (
                    <React.Fragment key={r.student_id}>
                      <tr className={cn('hover:bg-slate-50/60', isOpen && 'bg-slate-50/60')}>
                        <Td>
                          <button
                            onClick={() => toggle(r.student_id)}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? 'Hide' : 'Show'} checks for ${r.name}`}
                            className="p-1 rounded text-slate-500 hover:bg-slate-100"
                          >
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </Td>
                        <Td>
                          <span className="block font-medium text-slate-900">{r.name || '—'}</span>
                          <span className="block text-[11px] text-slate-500">{r.usn}</span>
                        </Td>
                        <Td>{r.department || '—'}</Td>
                        <Td>{r.graduation_year ?? '—'}</Td>
                        <Td className="text-right tabular-nums">{r.cgpa ?? '—'}</Td>
                        <Td className="text-right tabular-nums">{n(r.active_backlogs)}</Td>
                        <Td>
                          <EligibilityBadge status={r.eligibility.status} exception={r.eligibility.has_exception} />
                        </Td>
                        <Td>
                          {r.applied && r.application_id ? (
                            <Button size="sm" variant="link" onClick={() => onOpenApplication(r.application_id as number)}>
                              View application
                            </Button>
                          ) : (
                            <span className="text-slate-400 text-xs">No</span>
                          )}
                        </Td>
                        <Td className="text-right whitespace-nowrap">
                          {r.eligibility.has_exception ? (
                            <Button size="sm" variant="ghost" onClick={() => setRevokeFor(r)} leftIcon={<ShieldOff className="w-3.5 h-3.5" />}>
                              Revoke
                            </Button>
                          ) : r.eligibility.status !== 'ELIGIBLE' ? (
                            <Button size="sm" variant="outline" onClick={() => setGrantFor(r)} leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}>
                              Grant
                            </Button>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </Td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={9} className="bg-slate-50/60 px-4 pb-4 border-b border-slate-100">
                            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                              <EligibilityChecks e={r.eligibility} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </Table>
            <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </Card>

      {grantFor && (
        <GrantExceptionModal
          driveId={driveId}
          row={grantFor}
          onClose={() => setGrantFor(null)}
          onDone={() => {
            setGrantFor(null);
            toast.success('Exception granted', `${grantFor.name} can now apply to this drive.`);
            load();
          }}
        />
      )}
      <ConfirmDialog
        isOpen={!!revokeFor}
        title="Revoke eligibility exception?"
        message={
          <>
            <strong>{revokeFor?.name}</strong> will again be evaluated by the automatic criteria only. An application already
            submitted is kept.
          </>
        }
        confirmLabel="Revoke"
        danger
        isLoading={revoking}
        onConfirm={revoke}
        onClose={() => setRevokeFor(null)}
      />
    </div>
  );
};

const GrantExceptionModal: React.FC<{ driveId: number; row: EligRow; onClose: () => void; onDone: () => void }> = ({
  driveId,
  row,
  onClose,
  onDone,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const failing = row.eligibility.checks.filter((c) => c.outcome !== 'PASS');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError('Please give a reason of at least 5 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await ApiClient.post(`/placements/drives/${driveId}/exceptions`, { student_id: row.student_id, reason: reason.trim() });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Grant eligibility exception" description={`${row.name} · ${row.usn ?? ''}`}>
      <form onSubmit={submit} className="space-y-4">
        {failing.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-medium mb-1">Criteria not met:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              {failing.map((c) => (
                <li key={c.criterion}>
                  {c.criterion}: requires {c.requirement}, student has {c.student_value ?? 'not recorded'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <ErrorState title="Exception not granted" message={error} />}
        <TextArea
          id="exc-reason"
          label="Reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helperText="Recorded in the audit log. The student is notified that they may apply."
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={saving}>
            Grant exception
          </Button>
        </div>
      </form>
    </Modal>
  );
};
