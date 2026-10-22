import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, ChevronDown, ChevronRight } from 'lucide-react';
import { ErrorState, PageHeader, Table, TableSkeleton, Td, Th } from '../../../components/ui/Kit';
import { ApplicationStatusBadge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/LoadingSpinner';
import { CompanyLogo, PlacementNav, ReadOnlyNotice, StageStepper, StageTimeline } from './PlacementUi';
import {
  type Application,
  ATTENDANCE_LABEL,
  OFFER_STATUS_LABEL,
  REGISTRATION_LABEL,
  RESULT_LABEL,
  fmtDate,
  formatOfferCtc,
  parseLocal,
  parseUtc,
} from './placementTypes';
import { useApiQuery } from './useApiQuery';

export const StudentApplications: React.FC = () => {
  const navigate = useNavigate();
  const { data: items, loading, error, reload: load } = useApiQuery<Application[]>('/placements/student/applications');
  const [open, setOpen] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Placements"
        title="My applications"
        description="Every drive you have applied to, with the latest status recorded by the placement office."
      />
      <PlacementNav />
      <ReadOnlyNotice />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          {loading && !items ? (
            <TableSkeleton rows={5} cols={6} />
          ) : items && items.length ? (
            <Table>
              <caption className="sr-only">Placement applications</caption>
              <thead>
                <tr>
                  <Th scope="col" className="w-8">
                    <span className="sr-only">Expand</span>
                  </Th>
                  <Th scope="col">Company / role</Th>
                  <Th scope="col">Applied</Th>
                  <Th scope="col">Registration</Th>
                  <Th scope="col">Attendance</Th>
                  <Th scope="col">Current stage</Th>
                  <Th scope="col">Result</Th>
                  <Th scope="col">Offer</Th>
                  <Th scope="col">Status</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const isOpen = open.has(a.id);
                  return (
                    <React.Fragment key={a.id}>
                      <tr className="hover:bg-slate-50/60">
                        <Td>
                          <button
                            type="button"
                            onClick={() => toggle(a.id)}
                            aria-expanded={isOpen}
                            aria-controls={`app-${a.id}-timeline`}
                            aria-label={`${isOpen ? 'Hide' : 'Show'} timeline for ${a.drive.job_title}`}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-3 min-w-[220px]">
                            <CompanyLogo name={a.drive.company_name} url={a.drive.company_logo} size="sm" />
                            <div className="min-w-0">
                              <Link
                                to={`/student/placements/drives/${a.drive_id}`}
                                className="block font-medium text-slate-900 hover:text-blue-700 truncate"
                              >
                                {a.drive.job_title}
                              </Link>
                              <p className="text-[11px] text-slate-500 truncate">{a.drive.company_name || '—'}</p>
                            </div>
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap">{fmtDate(parseUtc(a.applied_at))}</Td>
                        <Td className="whitespace-nowrap">{REGISTRATION_LABEL[a.registration_status] || a.registration_status}</Td>
                        <Td className="whitespace-nowrap">{ATTENDANCE_LABEL[a.attendance_status] || a.attendance_status}</Td>
                        <Td>{a.current_stage || '—'}</Td>
                        <Td className="whitespace-nowrap">{RESULT_LABEL[a.result] || a.result}</Td>
                        <Td className="whitespace-nowrap text-xs">
                          {a.offer ? (
                            <div>
                              <p className="font-semibold text-slate-800">{formatOfferCtc(a.offer.offered_ctc)}</p>
                              <p className="text-slate-500">
                                {OFFER_STATUS_LABEL[a.offer.status] || a.offer.status}
                                {a.offer.offer_date ? ` · ${fmtDate(parseLocal(a.offer.offer_date))}` : ''}
                              </p>
                            </div>
                          ) : (
                            '—'
                          )}
                        </Td>
                        <Td>
                          <ApplicationStatusBadge status={a.overall_status} />
                        </Td>
                      </tr>
                      {isOpen && (
                        <tr id={`app-${a.id}-timeline`} className="bg-slate-50/50">
                          <td colSpan={9} className="px-6 py-4 border-b border-slate-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Status timeline</h3>
                                <StageTimeline application={a} />
                              </div>
                              {a.drive.selection_process.length > 0 && (
                                <div>
                                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Selection process</h3>
                                  <StageStepper stages={a.drive.selection_process} current={a.current_stage} />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              className="m-4"
              icon={<Briefcase className="w-6 h-6" />}
              title="No applications yet"
              description="Applications you submit to placement drives will be listed here with their progress."
              action={
                <Button size="sm" onClick={() => navigate('/student/placements/drives')}>
                  Browse drives
                </Button>
              }
            />
          )}
        </div>
      )}
    </div>
  );
};
