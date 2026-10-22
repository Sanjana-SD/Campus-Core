import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, BadgeCheck, Building2, FilterX, History } from 'lucide-react';
import { qs } from '../../../lib/api';
import { useApiQuery } from './useApiQuery';
import { ErrorState, PageHeader, Skeleton, StatCard, Table, TableSkeleton, Td, Th } from '../../../components/ui/Kit';
import { ApplicationStatusBadge } from '../../../components/ui/Badge';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/LoadingSpinner';
import { CompanyLogo, PlacementNav, ReadOnlyNotice } from './PlacementUi';
import {
  type Application,
  ATTENDANCE_LABEL,
  OFFER_STATUS_LABEL,
  OVERALL_STATUSES,
  RESULT_LABEL,
  fmtDate,
  formatOfferCtc,
  parseLocal,
  parseUtc,
} from './placementTypes';

interface HistoryResponse {
  items: Application[];
  academic_years: string[];
}

const statusParam = (label: string) => label.toUpperCase().replace(/ /g, '_');

export const StudentPlacementHistory: React.FC = () => {
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('');
  // Unfiltered history feeds the summary and the academic-year options (the backend derives
  // academic_years from the filtered result, so a filtered response would only list one year).
  const base = useApiQuery<HistoryResponse>('/placements/student/history');
  const filtered = year || status;
  const sub = useApiQuery<HistoryResponse>(
    filtered ? `/placements/student/history${qs({ academic_year: year, status: status ? statusParam(status) : '' })}` : null
  );
  const all = base.data;
  const rows: Application[] | null = filtered ? (sub.data?.items ?? null) : (all?.items ?? null);
  const loading = base.loading || (!!filtered && sub.loading);
  const error = base.error || (filtered ? sub.error : null);
  const load = () => {
    base.reload();
    if (filtered) sub.reload();
  };

  const summary = useMemo(() => {
    const items = all?.items || [];
    const active = items.filter((a) => a.application_status !== 'WITHDRAWN');
    return {
      companies: new Set(active.filter((a) => a.result === 'SELECTED').map((a) => a.drive.company_name || `#${a.drive_id}`)).size,
      offers: active.filter((a) => a.offer).length,
      placed: active.filter((a) => a.offer?.is_placed).length,
    };
  }, [all]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Placements"
        title="Placement history"
        description="A complete record of the drives you took part in and their final outcomes."
      />
      <PlacementNav />

      <section aria-label="Outcome summary" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {loading && !all ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[84px] rounded-xl" />)
        ) : (
          <>
            <StatCard label="Companies selected by" value={all ? summary.companies : '—'} icon={<Building2 className="w-4 h-4" />} tone="info" hint="Distinct companies with a 'Selected' result" />
            <StatCard label="Offers received" value={all ? summary.offers : '—'} icon={<Award className="w-4 h-4" />} tone="success" hint="Revoked offers excluded" />
            <StatCard label="Confirmed placements" value={all ? summary.placed : '—'} icon={<BadgeCheck className="w-4 h-4" />} tone="success" />
          </>
        )}
      </section>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-4 border-b border-slate-100">
          <div className="sm:w-48">
            <Select
              id="h-year"
              label="Academic year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="All years"
              options={(all?.academic_years || []).map((y) => ({ value: y, label: y }))}
            />
          </div>
          <div className="sm:w-56">
            <Select
              id="h-status"
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="All statuses"
              options={OVERALL_STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          {(year || status) && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<FilterX className="w-3.5 h-3.5" />}
              onClick={() => {
                setYear('');
                setStatus('');
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {error ? (
          <ErrorState className="m-4" message={error} onRetry={load} />
        ) : loading && !rows ? (
          <TableSkeleton rows={5} cols={7} />
        ) : rows && rows.length ? (
          <Table className={loading ? 'opacity-60' : undefined}>
            <caption className="sr-only">Placement history</caption>
            <thead>
              <tr>
                <Th scope="col">Company / role</Th>
                <Th scope="col">Drive date</Th>
                <Th scope="col">Applied</Th>
                <Th scope="col">Attendance</Th>
                <Th scope="col">Selection</Th>
                <Th scope="col">Offer</Th>
                <Th scope="col">Final outcome</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60">
                  <Td>
                    <div className="flex items-center gap-3 min-w-[220px]">
                      <CompanyLogo name={a.drive.company_name} url={a.drive.company_logo} size="sm" />
                      <div className="min-w-0">
                        <Link to={`/student/placements/drives/${a.drive_id}`} className="block font-medium text-slate-900 hover:text-blue-700 truncate">
                          {a.drive.job_title}
                        </Link>
                        <p className="text-[11px] text-slate-500 truncate">
                          {a.drive.company_name || '—'}
                          {a.academic_year ? ` · ${a.academic_year}` : ''}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDate(parseLocal(a.drive.drive_date))}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(parseUtc(a.applied_at))}</Td>
                  <Td className="whitespace-nowrap">{ATTENDANCE_LABEL[a.attendance_status] || a.attendance_status}</Td>
                  <Td className="whitespace-nowrap">{RESULT_LABEL[a.result] || a.result}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    {a.offer ? (
                      <span>
                        <span className="font-semibold text-slate-800">{formatOfferCtc(a.offer.offered_ctc)}</span>
                        <span className="text-slate-500"> · {OFFER_STATUS_LABEL[a.offer.status] || a.offer.status}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    <ApplicationStatusBadge status={a.overall_status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            className="m-4"
            icon={<History className="w-6 h-6" />}
            title={year || status ? 'No records match these filters' : 'No placement history yet'}
            description={
              year || status
                ? 'Try another academic year or status.'
                : 'Once you apply to drives, your participation and outcomes will be recorded here.'
            }
          />
        )}
      </div>

      <ReadOnlyNotice>Outcomes shown here are official records maintained by the placement office.</ReadOnlyNotice>
    </div>
  );
};
