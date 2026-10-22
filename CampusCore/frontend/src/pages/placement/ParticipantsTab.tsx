import React, { useMemo, useState } from 'react';
import { Download, Users, X } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { errorMessage } from '../../lib/utils';
import { ErrorState, Pagination, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { ApplicationStatusBadge, Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { SearchInput, TextArea } from './placementShared';
import { Application, ATTENDANCE, eligibilityStatusOf, label, n, OFFER_STATUSES, opts, REGISTRATION, RESULTS, useApi, useDebounced } from './placementUtils';
import { EligibilityBadge } from './EligibilityTab';

const PAGE_SIZE = 25;

type BulkField = 'registration_status' | 'attendance_status' | 'current_stage' | 'result';
const BULK_FIELDS: { value: BulkField; label: string }[] = [
  { value: 'registration_status', label: 'Drive registration' },
  { value: 'attendance_status', label: 'Actual drive attendance' },
  { value: 'current_stage', label: 'Selection stage' },
  { value: 'result', label: 'Result' },
];

interface BulkResult {
  updated: number;
  errors: { application_id: number; student?: string | null; error: string }[];
}

const tone = (v: string, good: string[], bad: string[]) =>
  good.includes(v) ? 'success' : bad.includes(v) ? 'danger' : 'neutral';

export const ParticipantsTab: React.FC<{
  driveId: number;
  locked: string | null;
  refreshKey: number;
  onOpenApplication: (id: number) => void;
  onChanged: () => void;
}> = ({ driveId, locked, refreshKey, onOpenApplication, onChanged }) => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [filters, setFilters] = useState({ registration: '', attendance: '', result: '', stage: '', offer: '', sort: 'name' });
  const [page, setPage] = useState(1);
  const { registration, attendance, result, stage, offer, sort } = filters;
  const setFilter = (k: keyof typeof filters) => (v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const setRegistration = setFilter('registration');
  const setAttendance = setFilter('attendance');
  const setResult = setFilter('result');
  const setStage = setFilter('stage');
  const setOffer = setFilter('offer');
  const setSort = setFilter('sort');
  const onSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const list = useApi<{ total: number; items: Application[]; stages: string[] }>(
    `/placements/drives/${driveId}/participants` +
      qs({
        search: debounced.trim(),
        registration,
        attendance,
        result,
        stage,
        offer_status: offer,
        sort,
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
    refreshKey
  );
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const stages = useMemo(() => list.data?.stages ?? [], [list.data]);
  const { loading, error, reload: load } = list;
  const [exporting, setExporting] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkField, setBulkField] = useState<BulkField>('registration_status');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  // remember names of rows that were selected so per-row errors stay readable after reload
  const [nameById, setNameById] = useState<Record<number, string>>({});

  const bulkOptions = useMemo(() => {
    if (bulkField === 'registration_status') return opts(REGISTRATION);
    if (bulkField === 'attendance_status') return opts(ATTENDANCE);
    if (bulkField === 'result') return opts(RESULTS);
    return stages.map((s) => ({ value: s, label: s }));
  }, [bulkField, stages]);

  const selectable = items.filter((a) => a.application_status !== 'WITHDRAWN');
  const allOnPage = selectable.length > 0 && selectable.every((a) => selected.has(a.id));

  const toggle = (a: Application) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(a.id)) next.delete(a.id);
      else next.add(a.id);
      return next;
    });
    setNameById((m) => ({ ...m, [a.id]: a.student?.name ?? `#${a.id}` }));
  };
  const toggleAll = () => {
    setSelected((s) => {
      const next = new Set(s);
      selectable.forEach((a) => (allOnPage ? next.delete(a.id) : next.add(a.id)));
      return next;
    });
    setNameById((m) => ({ ...m, ...Object.fromEntries(selectable.map((a) => [a.id, a.student?.name ?? `#${a.id}`])) }));
  };

  const runBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkValue || selected.size === 0) return;
    setBulkSaving(true);
    setBulkResult(null);
    try {
      const res = await ApiClient.post<BulkResult>(`/placements/drives/${driveId}/bulk-update`, {
        application_ids: Array.from(selected),
        [bulkField]: bulkValue,
        notes: bulkNotes.trim() || null,
      });
      setBulkResult(res);
      if (res.errors.length === 0) {
        toast.success(`${res.updated} application${res.updated === 1 ? '' : 's'} updated`);
        setSelected(new Set());
        setBulkNotes('');
      } else {
        toast.warning(`${res.updated} updated, ${res.errors.length} rejected`, 'See the details above the table.');
        setSelected(new Set(res.errors.map((x) => x.application_id)));
      }
      load();
      onChanged();
    } catch (err) {
      toast.error('Bulk update failed', errorMessage(err));
    } finally {
      setBulkSaving(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await ApiClient.download(`/placements/drives/${driveId}/participants/export`, `drive_${driveId}_participants.csv`);
    } catch (e) {
      toast.error('Export failed', errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const filtered = !!(debounced || registration || attendance || result || stage || offer);

  return (
    <div className="space-y-4">
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <SearchInput value={search} onChange={onSearch} placeholder="Search name or USN" label="Search participants" className="flex-1" />
            <Select
              aria-label="Sort by"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="md:w-48"
              options={[
                { value: 'name', label: 'Sort: name' },
                { value: 'usn', label: 'Sort: USN' },
                { value: 'applied_at', label: 'Sort: applied (oldest)' },
                { value: 'cgpa', label: 'Sort: CGPA (highest)' },
              ]}
            />
            <Button variant="outline" onClick={exportCsv} isLoading={exporting} leftIcon={<Download className="w-4 h-4" />}>
              Export CSV
            </Button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Select aria-label="Registration" value={registration} onChange={(e) => setRegistration(e.target.value)} options={opts(REGISTRATION)} placeholder="Any registration" />
            <Select aria-label="Drive attendance" value={attendance} onChange={(e) => setAttendance(e.target.value)} options={opts(ATTENDANCE)} placeholder="Any attendance" />
            <Select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} options={stages.map((s) => ({ value: s, label: s }))} placeholder="Any stage" />
            <Select aria-label="Result" value={result} onChange={(e) => setResult(e.target.value)} options={opts(RESULTS)} placeholder="Any result" />
            <Select
              aria-label="Offer status"
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              options={[{ value: 'NONE', label: 'No offer' }, ...opts(OFFER_STATUSES)]}
              placeholder="Any offer status"
            />
          </div>
        </div>

        {bulkResult && bulkResult.errors.length > 0 && (
          <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3" role="status">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-amber-900">
                {bulkResult.updated} updated · {bulkResult.errors.length} could not be updated
              </p>
              <button onClick={() => setBulkResult(null)} aria-label="Dismiss" className="text-amber-700 hover:text-amber-900">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-amber-900">
              {bulkResult.errors.map((x) => (
                <li key={x.application_id}>
                  <span className="font-medium">
                    {nameById[x.application_id] ?? `Application #${x.application_id}`}
                    {x.student ? ` (${x.student})` : ''}:
                  </span>{' '}
                  {x.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {selected.size > 0 && !locked && (
          <form onSubmit={runBulk} className="m-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-3" aria-label="Bulk update">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-blue-900">{selected.size} selected</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
            <div className="grid sm:grid-cols-[12rem_12rem_1fr_auto] gap-2 items-start">
              <Select
                aria-label="Field to update"
                value={bulkField}
                onChange={(e) => {
                  setBulkField(e.target.value as BulkField);
                  setBulkValue('');
                }}
                options={BULK_FIELDS}
              />
              <Select aria-label="New value" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} options={bulkOptions} placeholder="Set to…" />
              <TextArea aria-label="Note for the history (optional)" rows={1} value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} placeholder="Note for the selection history (optional)" />
              <Button type="submit" isLoading={bulkSaving} disabled={!bulkValue}>
                Apply
              </Button>
            </div>
            <p className="text-[11px] text-blue-900/80">
              Each application is validated individually (e.g. attendance needs a confirmed registration; Selected needs
              attendance). Rejected rows are listed with the reason and stay selected.
            </p>
          </form>
        )}

        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : loading && items.length === 0 ? (
          <TableSkeleton cols={9} />
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title={filtered ? 'No participants match these filters' : 'No applications yet'}
              description={
                filtered
                  ? 'Try clearing a filter.'
                  : 'Students appear here once they apply. Check the Eligibility tab to see who can apply.'
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allOnPage}
                      onChange={toggleAll}
                      disabled={!!locked || selectable.length === 0}
                      className="accent-blue-600"
                    />
                  </Th>
                  <Th>Student</Th>
                  <Th>Dept</Th>
                  <Th>Sem</Th>
                  <Th>Grad.</Th>
                  <Th>Eligibility now</Th>
                  <Th>Application</Th>
                  <Th>Registration</Th>
                  <Th>Drive attendance</Th>
                  <Th>Stage</Th>
                  <Th>Result</Th>
                  <Th>Offer</Th>
                  <Th>Overall</Th>
                </tr>
              </thead>
              <tbody className={loading ? 'opacity-60' : ''}>
                {items.map((a) => {
                  const s = a.student;
                  const withdrawn = a.application_status === 'WITHDRAWN';
                  return (
                    <tr key={a.id} className={withdrawn ? 'bg-slate-50/80 text-slate-400' : 'hover:bg-slate-50/60'}>
                      <Td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${s?.name ?? a.id}`}
                          checked={selected.has(a.id)}
                          onChange={() => toggle(a)}
                          disabled={!!locked || withdrawn}
                          className="accent-blue-600"
                        />
                      </Td>
                      <Td>
                        <button
                          onClick={() => onOpenApplication(a.id)}
                          className="text-left focus:outline-none group"
                        >
                          <span className="block font-medium text-slate-900 group-hover:text-blue-700 group-focus:text-blue-700 group-focus:underline">
                            {s?.name || '—'}
                          </span>
                          <span className="block text-[11px] text-slate-500">{s?.usn}</span>
                        </button>
                      </Td>
                      <Td>{s?.department || '—'}</Td>
                      <Td className="tabular-nums">{n(s?.semester)}</Td>
                      <Td className="tabular-nums">{s?.graduation_year ?? '—'}</Td>
                      <Td>
                        <EligibilityBadge status={eligibilityStatusOf(a.eligibility_now)} />
                        {a.via_exception && <span className="block text-[10px] text-blue-700 mt-0.5">via exception</span>}
                      </Td>
                      <Td>
                        <Badge variant={withdrawn ? 'neutral' : 'info'}>{label(a.application_status)}</Badge>
                      </Td>
                      <Td>
                        <Badge variant={tone(a.registration_status, ['CONFIRMED'], ['REJECTED'])}>{label(a.registration_status)}</Badge>
                      </Td>
                      <Td>
                        <Badge variant={tone(a.attendance_status, ['ATTENDED'], ['DID_NOT_ATTEND'])}>{label(a.attendance_status)}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap">{a.current_stage || '—'}</Td>
                      <Td>
                        <Badge variant={a.result === 'SELECTED' ? 'success' : a.result === 'REJECTED' ? 'danger' : a.result === 'SHORTLISTED' ? 'info' : 'neutral'}>
                          {label(a.result)}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {a.offer ? (
                          <>
                            <Badge variant={tone(a.offer.status, ['ACCEPTED'], ['DECLINED', 'REVOKED'])}>{label(a.offer.status)}</Badge>
                            {a.offer.is_placed && <span className="block text-[10px] text-emerald-700 mt-0.5">placed</span>}
                          </>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </Td>
                      <Td>
                        <ApplicationStatusBadge status={a.overall_status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination total={total} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
};
