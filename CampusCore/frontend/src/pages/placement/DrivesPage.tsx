import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Download, Eye, Pencil, Plus, Rocket, Shuffle } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { errorMessage } from '../../lib/utils';
import { ConfirmDialog, ErrorState, PageHeader, Pagination, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { DriveStatusBadge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { CompanyLogo, InfoTip, SearchInput } from './placementShared';
import { DriveStatusModal } from './DriveActions';
import { ALLOWED_TRANSITIONS, Company, Drive, DRIVE_STATUSES, fmtDay, fmtLocalDateTime, label, n, publishDrive, useApi, useDebounced } from './placementUtils';

const PAGE_SIZE = 20;
const SORTS = [
  { value: 'drive_date_desc', label: 'Drive date (newest first)' },
  { value: 'drive_date_asc', label: 'Drive date (oldest first)' },
  { value: 'deadline_asc', label: 'Application deadline (soonest)' },
  { value: 'company', label: 'Company (A–Z)' },
  { value: 'created_desc', label: 'Recently created' },
];

export const DrivesPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [search, setSearchRaw] = useState('');
  const debounced = useDebounced(search);
  const [status, setStatusRaw] = useState(params.get('status') ?? '');
  const [companyId, setCompanyIdRaw] = useState(params.get('company_id') ?? '');
  const [sort, setSortRaw] = useState('drive_date_desc');
  const [page, setPage] = useState(1);
  // any filter/sort change returns to the first page
  const resetting =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };
  const setSearch = resetting(setSearchRaw);
  const setStatus = resetting(setStatusRaw);
  const setCompanyId = resetting(setCompanyIdRaw);
  const setSort = resetting(setSortRaw);

  const list = useApi<{ total: number; items: Drive[] }>(
    '/placements/drives' +
      qs({ search: debounced.trim(), status, company_id: companyId, sort, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE })
  );
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const { loading, error, reload: load } = list;
  const companies = useApi<{ items: Company[] }>('/placements/companies' + qs({ limit: 500 })).data?.items ?? [];
  const [exporting, setExporting] = useState(false);

  const [publishTarget, setPublishTarget] = useState<Drive | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Drive | null>(null);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await ApiClient.download('/placements/drives/export', 'placement_drives.csv');
    } catch (e) {
      toast.error('Export failed', errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const doPublish = async () => {
    if (!publishTarget) return;
    setPublishing(true);
    try {
      const d = await publishDrive(publishTarget.id);
      toast.success('Drive published', `${d.notified_students ?? 0} potentially eligible students notified.`);
      setPublishTarget(null);
      load();
    } catch (e) {
      toast.error('Could not publish drive', errorMessage(e));
    } finally {
      setPublishing(false);
    }
  };

  const filtered = !!(debounced || status || companyId);

  return (
    <div>
      <PageHeader
        eyebrow="Placement office"
        title="Placement drives"
        description="Create, publish and track recruitment drives. Status reflects the application window in college local time."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} isLoading={exporting} leftIcon={<Download className="w-4 h-4" />}>
              Export CSV
            </Button>
            <Button onClick={() => navigate('/placement/drives/new')} leftIcon={<Plus className="w-4 h-4" />}>
              New drive
            </Button>
          </>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="grid gap-3 p-4 border-b border-slate-100 md:grid-cols-[1fr_repeat(3,minmax(0,12rem))]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search job title or company" label="Search drives" />
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={DRIVE_STATUSES.map((s) => ({ value: s, label: label(s) }))}
            placeholder="All statuses"
          />
          <Select
            aria-label="Company"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            options={companies.map((c) => ({ value: c.id, label: c.status === 'ARCHIVED' ? `${c.name} (archived)` : c.name }))}
            placeholder="All companies"
          />
          <Select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)} options={SORTS} />
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : loading && items.length === 0 ? (
          <TableSkeleton cols={8} />
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Briefcase className="w-6 h-6" />}
              title={filtered ? 'No drives match these filters' : 'No placement drives yet'}
              description={
                filtered
                  ? 'Try a different status or company, or clear the search.'
                  : companies.length === 0
                    ? 'Add a company first, then create its first placement drive.'
                    : 'Create a drive as a draft, review the eligibility criteria and publish it to students.'
              }
              action={
                filtered ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setStatus('');
                      setCompanyId('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : companies.length === 0 ? (
                  <Button onClick={() => navigate('/placement/companies?new=1')} leftIcon={<Plus className="w-4 h-4" />}>
                    Add your first company
                  </Button>
                ) : (
                  <Button onClick={() => navigate('/placement/drives/new')} leftIcon={<Plus className="w-4 h-4" />}>
                    Create a drive
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Company / role</Th>
                  <Th>Deadline</Th>
                  <Th>Drive date</Th>
                  <Th className="text-right">
                    <span className="inline-flex items-center gap-1">
                      Eligible <InfoTip text="Active students who currently pass every criterion (students with missing data are not counted)." />
                    </span>
                  </Th>
                  <Th className="text-right">Applied</Th>
                  <Th className="text-right">Attended</Th>
                  <Th className="text-right">Selected</Th>
                  <Th className="text-right">
                    <span className="inline-flex items-center gap-1">
                      Placed <InfoTip text="Accepted offers confirmed as a final placement." />
                    </span>
                  </Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className={loading ? 'opacity-60' : ''}>
                {items.map((d) => {
                  const canEdit = !['COMPLETED', 'CANCELLED'].includes(d.status);
                  const canChange = (ALLOWED_TRANSITIONS[d.status] ?? []).length > 0;
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/60">
                      <Td>
                        <Link to={`/placement/drives/${d.id}`} className="flex items-center gap-3 group focus:outline-none">
                          <CompanyLogo name={d.company?.name} url={d.company?.logo_url} />
                          <span className="min-w-0">
                            <span className="block font-medium text-slate-900 group-hover:text-blue-700 group-focus:text-blue-700">
                              {d.job_title}
                            </span>
                            <span className="block text-[11px] text-slate-500">{d.company?.name}</span>
                          </span>
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap">{fmtLocalDateTime(d.application_deadline)}</Td>
                      <Td className="whitespace-nowrap">{fmtDay(d.drive_date)}</Td>
                      <Td className="text-right tabular-nums">{n(d.counts?.eligible)}</Td>
                      <Td className="text-right tabular-nums">{n(d.counts?.applications)}</Td>
                      <Td className="text-right tabular-nums">{n(d.counts?.attended)}</Td>
                      <Td className="text-right tabular-nums">{n(d.counts?.selected)}</Td>
                      <Td className="text-right tabular-nums">{n(d.counts?.placed)}</Td>
                      <Td>
                        <DriveStatusBadge status={d.effective_status} />
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/placement/drives/${d.id}`)} aria-label={`View ${d.job_title}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/placement/drives/${d.id}/edit`)}
                              aria-label={`Edit ${d.job_title}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {d.status === 'DRAFT' && (
                            <Button size="sm" variant="ghost" onClick={() => setPublishTarget(d)} aria-label={`Publish ${d.job_title}`}>
                              <Rocket className="w-4 h-4" />
                            </Button>
                          )}
                          {canChange && (
                            <Button size="sm" variant="ghost" onClick={() => setStatusTarget(d)} aria-label={`Change status of ${d.job_title}`}>
                              <Shuffle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
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

      <ConfirmDialog
        isOpen={!!publishTarget}
        title="Publish drive?"
        message={
          <>
            <p>
              <strong>{publishTarget?.job_title}</strong> at {publishTarget?.company?.name} becomes visible to students, and
              every student who is not clearly ineligible is notified.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Publishing requires a job description, a drive date and an application deadline in the future.
            </p>
          </>
        }
        confirmLabel="Publish"
        isLoading={publishing}
        onConfirm={doPublish}
        onClose={() => setPublishTarget(null)}
      />

      {statusTarget && (
        <DriveStatusModal
          key={statusTarget.id}
          drive={statusTarget}
          onClose={() => setStatusTarget(null)}
          onDone={(d) => {
            setStatusTarget(null);
            toast.success('Drive status updated', `${d.job_title}: ${label(d.effective_status)}`);
            load();
          }}
        />
      )}
    </div>
  );
};
