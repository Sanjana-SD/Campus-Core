import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Clock,
  ExternalLink,
  Globe,
  IndianRupee,
  Info,
  Mail,
  MapPin,
  Monitor,
  User,
  Users,
  Video,
} from 'lucide-react';
import { ApiClient, ApiError } from '../../../lib/api';
import { errorMessage, formatCtc } from '../../../lib/utils';
import { ConfirmDialog, ErrorState, Skeleton } from '../../../components/ui/Kit';
import { Card, CardHeader, CardTitle } from '../../../components/ui/Card';
import { ApplicationStatusBadge, DriveStatusBadge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import {
  CheckOutcomeIcon,
  CompanyLogo,
  EligibilityBadge,
  ExceptionNote,
  ReadOnlyNotice,
  SkillChips,
  StageStepper,
  StageTimeline,
} from './PlacementUi';
import {
  type StudentDrive,
  ATTENDANCE_LABEL,
  JOB_TYPE_LABEL,
  OFFER_STATUS_LABEL,
  REGISTRATION_LABEL,
  RESULT_LABEL,
  WORK_MODE_LABEL,
  canWithdraw,
  deadlineHint,
  fmtDate,
  fmtDateTime,
  formatOfferCtc,
  parseLocal,
  parseUtc,
} from './placementTypes';
import { useApiQuery } from './useApiQuery';

const Row: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex items-start gap-3 py-2">
    <span className="mt-0.5 text-slate-400 shrink-0">{icon}</span>
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 break-words">{children}</dd>
    </div>
  </div>
);

function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export const StudentDriveDetail: React.FC = () => {
  const { driveId } = useParams();
  const toast = useToast();
  const q = useApiQuery<StudentDrive>(driveId ? `/placements/student/drives/${encodeURIComponent(driveId)}` : null);
  const load = q.reload;
  const loading = q.loading;
  // never show a previously viewed drive while another one loads
  const drive = q.data && String(q.data.id) === driveId ? q.data : null;
  const error = q.error ? { message: q.error, status: q.errorStatus } : null;
  const [confirm, setConfirm] = useState<'apply' | 'withdraw' | null>(null);
  const [busy, setBusy] = useState(false);

  const doApply = async () => {
    if (!drive) return;
    setBusy(true);
    try {
      await ApiClient.post(`/placements/student/drives/${drive.id}/apply`);
      toast.success('Application submitted', `You applied to ${drive.company?.name || 'the company'} – ${drive.job_title}.`);
      setConfirm(null);
      load();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      toast.error(status === 409 ? 'Already applied' : 'Could not apply', errorMessage(e));
      setConfirm(null);
      if (status === 400 || status === 409) load();
    } finally {
      setBusy(false);
    }
  };

  const doWithdraw = async () => {
    if (!drive?.my_application) return;
    setBusy(true);
    try {
      await ApiClient.post(`/placements/student/applications/${drive.my_application.id}/withdraw`);
      toast.success('Application withdrawn');
      setConfirm(null);
      load();
    } catch (e) {
      toast.error('Could not withdraw', errorMessage(e));
      setConfirm(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link
      to="/student/placements/drives"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 mb-4"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> All drives
    </Link>
  );

  if (loading && !drive) {
    return (
      <div aria-busy="true">
        {back}
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-80 rounded-xl lg:col-span-2" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !drive) {
    if (!error) return null;
    return (
      <div>
        {back}
        <ErrorState
          title={error?.status === 404 ? 'Drive not found' : 'Could not load this drive'}
          message={error?.status === 404 ? 'This drive does not exist or is not published.' : error?.message || 'Unknown error'}
          onRetry={error?.status === 404 ? undefined : load}
        />
      </div>
    );
  }

  const d = drive;
  const ctc = formatCtc(d.ctc_min, d.ctc_max, d.ctc_text);
  const app = d.my_application;
  const hint = d.effective_status === 'APPLICATIONS_OPEN' ? deadlineHint(d.application_deadline) : null;
  const companyName = d.company?.name || 'Company';
  const website = safeUrl(d.company?.website);
  const meeting = safeUrl(d.meeting_link);
  const hasRequirements =
    d.eligible_departments.length ||
    d.eligible_courses.length ||
    d.eligible_semesters.length ||
    d.graduation_years.length ||
    d.min_cgpa != null ||
    d.max_active_backlogs != null ||
    d.other_requirements;

  return (
    <div className="space-y-6">
      <div>{back}</div>

      {/* Header */}
      <section className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <CompanyLogo name={companyName} url={d.company?.logo_url} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-500">{companyName}</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{d.job_title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DriveStatusBadge status={d.effective_status} />
              <EligibilityBadge eligibility={d.eligibility} />
              {app && <ApplicationStatusBadge status={app.overall_status} />}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {d.job_location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> {d.job_location}
                </span>
              )}
              {d.work_mode && (
                <span className="inline-flex items-center gap-1">
                  <Monitor className="w-3.5 h-3.5 text-slate-400" /> {WORK_MODE_LABEL[d.work_mode] || d.work_mode}
                </span>
              )}
              {d.job_type && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" /> {JOB_TYPE_LABEL[d.job_type] || d.job_type}
                </span>
              )}
              {ctc && (
                <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                  <IndianRupee className="w-3.5 h-3.5 text-slate-400" /> {ctc}
                </span>
              )}
              {d.vacancies != null && (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-slate-400" /> {d.vacancies} vacanc{d.vacancies === 1 ? 'y' : 'ies'}
                </span>
              )}
            </div>
          </div>

          <div className="sm:w-64 shrink-0 space-y-2">
            {d.can_apply ? (
              <Button className="w-full" size="lg" onClick={() => setConfirm('apply')}>
                Apply now
              </Button>
            ) : (
              d.apply_blocker && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex items-start gap-2" role="status">
                  <Info className="w-4 h-4 shrink-0 text-slate-400" />
                  <span>{d.apply_blocker}</span>
                </div>
              )
            )}
            {canWithdraw(app) && (
              <Button className="w-full" variant="outline" onClick={() => setConfirm('withdraw')}>
                Withdraw application
              </Button>
            )}
            {hint && <p className={`text-xs text-center ${hint.urgent ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>{hint.text}</p>}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {d.job_description && (
            <Card>
              <CardHeader>
                <CardTitle>Job description</CardTitle>
              </CardHeader>
              <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{d.job_description}</p>
              {d.required_skills.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Required skills</h3>
                  <SkillChips skills={d.required_skills} />
                </div>
              )}
            </Card>
          )}
          {!d.job_description && d.required_skills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Required skills</CardTitle>
              </CardHeader>
              <SkillChips skills={d.required_skills} />
            </Card>
          )}

          {/* Eligibility */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Eligibility</CardTitle>
              <EligibilityBadge eligibility={d.eligibility} />
            </CardHeader>
            <div className="space-y-4">
              <ExceptionNote eligibility={d.eligibility} />
              {d.eligibility.status === 'INCOMPLETE_INFORMATION' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  Some information needed to check your eligibility is missing from your academic profile. This does not mean you
                  are ineligible &mdash; contact the placement office to have your record updated.
                </div>
              )}
              {d.eligibility.checks.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <caption className="sr-only">Eligibility checks</caption>
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th scope="col" className="py-2 pr-4 font-semibold">Criterion</th>
                        <th scope="col" className="py-2 pr-4 font-semibold">Requirement</th>
                        <th scope="col" className="py-2 pr-4 font-semibold">Your record</th>
                        <th scope="col" className="py-2 font-semibold">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.eligibility.checks.map((c) => (
                        <tr key={c.criterion} className="border-b border-slate-100 align-top">
                          <td className="py-2.5 pr-4 font-medium text-slate-800">{c.criterion}</td>
                          <td className="py-2.5 pr-4 text-slate-600">{c.requirement}</td>
                          <td className="py-2.5 pr-4 text-slate-600">{c.student_value ?? '—'}</td>
                          <td className="py-2.5">
                            <span className="inline-flex items-start gap-1.5 text-xs">
                              <CheckOutcomeIcon outcome={c.outcome} />
                              <span
                                className={
                                  c.outcome === 'PASS'
                                    ? 'text-emerald-700 font-medium'
                                    : c.outcome === 'FAIL'
                                      ? 'text-rose-700 font-medium'
                                      : 'text-amber-700'
                                }
                              >
                                {c.outcome === 'PASS'
                                  ? 'Meets'
                                  : c.outcome === 'FAIL'
                                    ? 'Does not meet'
                                    : 'Information missing — contact placement office'}
                              </span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-600">This drive has no academic eligibility restrictions.</p>
              )}
              {hasRequirements ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs pt-2 border-t border-slate-100">
                  {d.eligible_departments.length > 0 && (
                    <div>
                      <dt className="text-slate-500">Departments</dt>
                      <dd className="text-slate-800">{d.eligible_departments.join(', ')}</dd>
                    </div>
                  )}
                  {d.eligible_courses.length > 0 && (
                    <div>
                      <dt className="text-slate-500">Programmes</dt>
                      <dd className="text-slate-800">{d.eligible_courses.join(', ')}</dd>
                    </div>
                  )}
                  {d.eligible_semesters.length > 0 && (
                    <div>
                      <dt className="text-slate-500">Semesters</dt>
                      <dd className="text-slate-800">{d.eligible_semesters.join(', ')}</dd>
                    </div>
                  )}
                  {d.graduation_years.length > 0 && (
                    <div>
                      <dt className="text-slate-500">Graduation years</dt>
                      <dd className="text-slate-800">{d.graduation_years.join(', ')}</dd>
                    </div>
                  )}
                  {d.min_cgpa != null && (
                    <div>
                      <dt className="text-slate-500">Minimum CGPA</dt>
                      <dd className="text-slate-800">{d.min_cgpa}</dd>
                    </div>
                  )}
                  {d.max_active_backlogs != null && (
                    <div>
                      <dt className="text-slate-500">Maximum active backlogs</dt>
                      <dd className="text-slate-800">{d.max_active_backlogs}</dd>
                    </div>
                  )}
                  {d.other_requirements && (
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500">Other requirements</dt>
                      <dd className="text-slate-800 whitespace-pre-line">{d.other_requirements}</dd>
                    </div>
                  )}
                </dl>
              ) : null}
            </div>
          </Card>

          {d.selection_process.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Selection process</CardTitle>
              </CardHeader>
              <StageStepper stages={d.selection_process} current={app?.current_stage ?? null} />
            </Card>
          )}

          {d.instructions && (
            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
              </CardHeader>
              <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{d.instructions}</p>
            </Card>
          )}

          {d.company && (d.company.description || d.company.industry || website || d.company.location) && (
            <Card>
              <CardHeader>
                <CardTitle>About {companyName}</CardTitle>
              </CardHeader>
              {d.company.description && <p className="text-sm text-slate-700 whitespace-pre-line">{d.company.description}</p>}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {d.company.industry && <span>Industry: {d.company.industry}</span>}
                {d.company.location && <span>HQ: {d.company.location}</span>}
                {website && (
                  <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                    <Globe className="w-3.5 h-3.5" /> Website
                  </a>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
            </CardHeader>
            <dl className="-my-2 divide-y divide-slate-100">
              <Row icon={<Clock className="w-4 h-4" />} label="Applications open">
                {fmtDateTime(parseLocal(d.application_open_at))}
              </Row>
              <Row icon={<Clock className="w-4 h-4" />} label="Application deadline">
                {fmtDateTime(parseLocal(d.application_deadline))}
              </Row>
              <Row icon={<CalendarDays className="w-4 h-4" />} label="Drive date">
                {fmtDate(parseLocal(d.drive_date))}
                {d.drive_time ? ` at ${d.drive_time}` : ''}
              </Row>
              {d.venue && (
                <Row icon={<MapPin className="w-4 h-4" />} label="Venue">
                  {d.venue}
                </Row>
              )}
              {meeting && (
                <Row icon={<Video className="w-4 h-4" />} label="Meeting link">
                  <a href={meeting} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline break-all">
                    Join meeting <ExternalLink className="w-3 h-3" />
                  </a>
                </Row>
              )}
              {ctc && (
                <Row icon={<IndianRupee className="w-4 h-4" />} label="Salary (CTC)">
                  {ctc}
                </Row>
              )}
            </dl>
          </Card>

          {(d.contact_person || d.contact_email) && (
            <Card>
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <dl className="-my-2">
                {d.contact_person && (
                  <Row icon={<User className="w-4 h-4" />} label="Contact person">
                    {d.contact_person}
                  </Row>
                )}
                {d.contact_email && (
                  <Row icon={<Mail className="w-4 h-4" />} label="Email">
                    <a href={`mailto:${d.contact_email}`} className="text-blue-600 hover:underline break-all">
                      {d.contact_email}
                    </a>
                  </Row>
                )}
              </dl>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>My application</CardTitle>
            </CardHeader>
            {app ? (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Status</dt>
                    <dd className="mt-0.5">
                      <ApplicationStatusBadge status={app.overall_status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Applied on</dt>
                    <dd className="text-slate-800 mt-0.5">{fmtDateTime(parseUtc(app.applied_at))}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Registration</dt>
                    <dd className="text-slate-800 mt-0.5">{REGISTRATION_LABEL[app.registration_status] || app.registration_status}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Drive attendance</dt>
                    <dd className="text-slate-800 mt-0.5">{ATTENDANCE_LABEL[app.attendance_status] || app.attendance_status}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Current stage</dt>
                    <dd className="text-slate-800 mt-0.5">{app.current_stage || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Result</dt>
                    <dd className="text-slate-800 mt-0.5">{RESULT_LABEL[app.result] || app.result}</dd>
                  </div>
                  {app.offer && (
                    <div className="col-span-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                      <dt className="text-emerald-700 font-medium">Offer</dt>
                      <dd className="text-emerald-900 mt-0.5">
                        {formatOfferCtc(app.offer.offered_ctc)} · {OFFER_STATUS_LABEL[app.offer.status] || app.offer.status}
                        {app.offer.offer_date ? ` · ${fmtDate(parseLocal(app.offer.offer_date))}` : ''}
                        {app.offer.is_placed ? ' · Placement confirmed' : ''}
                      </dd>
                    </div>
                  )}
                </dl>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Timeline</h3>
                  <StageTimeline application={app} />
                </div>
                <ReadOnlyNotice>Updates after you apply are recorded by the placement office.</ReadOnlyNotice>
              </div>
            ) : (
              <p className="text-sm text-slate-500">You have not applied to this drive.</p>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirm === 'apply'}
        title="Apply to this drive?"
        message={
          <div className="space-y-2">
            <p>
              You are applying for <strong>{d.job_title}</strong> at <strong>{companyName}</strong>.
            </p>
            <p className="text-xs text-slate-500">
              Only one application is allowed per drive. If you withdraw later, you will not be able to apply again.
            </p>
          </div>
        }
        confirmLabel="Submit application"
        isLoading={busy}
        onConfirm={doApply}
        onClose={() => !busy && setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm === 'withdraw'}
        title="Withdraw application?"
        message="Withdrawing is permanent — you will not be able to apply to this drive again."
        confirmLabel="Withdraw"
        danger
        isLoading={busy}
        onConfirm={doWithdraw}
        onClose={() => !busy && setConfirm(null)}
      />
    </div>
  );
};
