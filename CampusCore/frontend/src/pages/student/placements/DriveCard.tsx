import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, CalendarDays, Clock, IndianRupee, MapPin, Monitor } from 'lucide-react';
import { cn, formatCtc } from '../../../lib/utils';
import { ApplicationStatusBadge, Badge, DriveStatusBadge } from '../../../components/ui/Badge';
import { CompanyLogo, EligibilityBadge, SkillChips } from './PlacementUi';
import {
  type StudentDrive,
  JOB_TYPE_LABEL,
  WORK_MODE_LABEL,
  deadlineHint,
  fmtDate,
  fmtDateTime,
  parseLocal,
} from './placementTypes';

export const DriveCard: React.FC<{ drive: StudentDrive }> = ({ drive: d }) => {
  const ctc = formatCtc(d.ctc_min, d.ctc_max, d.ctc_text);
  const hint = d.effective_status === 'APPLICATIONS_OPEN' ? deadlineHint(d.application_deadline) : null;
  const companyName = d.company?.name || 'Company';
  return (
    <article className="group bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col">
      <div className="p-5 flex-1 space-y-4">
        <header className="flex items-start gap-3">
          <CompanyLogo name={companyName} url={d.company?.logo_url} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500 truncate">{companyName}</p>
            <h3 className="text-sm font-semibold text-slate-900 leading-snug">
              <Link
                to={`/student/placements/drives/${d.id}`}
                className="hover:text-blue-700 focus:outline-none focus-visible:underline"
              >
                {d.job_title}
              </Link>
            </h3>
          </div>
          <DriveStatusBadge status={d.effective_status} />
        </header>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-600">
          {d.job_location && (
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <dt className="sr-only">Location</dt>
              <dd className="truncate">{d.job_location}</dd>
            </div>
          )}
          {d.work_mode && (
            <div className="flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <dt className="sr-only">Work mode</dt>
              <dd>{WORK_MODE_LABEL[d.work_mode] || d.work_mode}</dd>
            </div>
          )}
          {d.job_type && (
            <div className="flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <dt className="sr-only">Job type</dt>
              <dd>{JOB_TYPE_LABEL[d.job_type] || d.job_type}</dd>
            </div>
          )}
          {ctc && (
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <IndianRupee className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <dt className="sr-only">CTC</dt>
              <dd>{ctc}</dd>
            </div>
          )}
        </dl>

        <SkillChips skills={d.required_skills} max={5} />

        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs">
          <div>
            <dt className="flex items-center gap-1 text-slate-500">
              <Clock className="w-3.5 h-3.5" /> Apply by
            </dt>
            <dd className="font-medium text-slate-800 mt-0.5">{fmtDateTime(parseLocal(d.application_deadline))}</dd>
            {hint && (
              <dd className={cn('text-[11px] mt-0.5', hint.urgent ? 'text-rose-600 font-semibold' : 'text-slate-500')}>
                {hint.text}
              </dd>
            )}
          </div>
          <div>
            <dt className="flex items-center gap-1 text-slate-500">
              <CalendarDays className="w-3.5 h-3.5" /> Drive date
            </dt>
            <dd className="font-medium text-slate-800 mt-0.5">
              {fmtDate(parseLocal(d.drive_date))}
              {d.drive_time ? `, ${d.drive_time}` : ''}
            </dd>
          </div>
        </dl>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
        <EligibilityBadge eligibility={d.eligibility} />
        {d.my_application ? (
          <ApplicationStatusBadge status={d.my_application.overall_status} />
        ) : (
          <Badge variant="neutral">Not applied</Badge>
        )}
        <Link
          to={`/student/placements/drives/${d.id}`}
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={`View details for ${d.job_title} at ${companyName}`}
        >
          View details <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </footer>
    </article>
  );
};

export const DriveCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-slate-200/80 p-5 space-y-4" aria-hidden="true">
    <div className="flex gap-3">
      <div className="w-11 h-11 rounded-xl bg-slate-200/70 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 rounded bg-slate-200/70 animate-pulse" />
        <div className="h-4 w-40 rounded bg-slate-200/70 animate-pulse" />
      </div>
    </div>
    <div className="h-3 w-3/4 rounded bg-slate-200/70 animate-pulse" />
    <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
  </div>
);
