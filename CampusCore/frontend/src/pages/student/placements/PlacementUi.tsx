/** Presentational building blocks shared by the student placement pages. */
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { CheckCircle2, Circle, Info, Lock, ShieldCheck, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Badge } from '../../../components/ui/Badge';
import {
  type Application,
  type Eligibility,
  fmtDateTime,
  historyFieldLabel,
  historyValueLabel,
  initials,
  parseUtc,
} from './placementTypes';

export const CompanyLogo: React.FC<{ name: string | null | undefined; url?: string | null; size?: 'sm' | 'md' | 'lg' }> = ({
  name,
  url,
  size = 'md',
}) => {
  const [failed, setFailed] = useState(false);
  const sizes = { sm: 'w-9 h-9 text-xs', md: 'w-11 h-11 text-sm', lg: 'w-16 h-16 text-lg' };
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={`${name || 'Company'} logo`}
        onError={() => setFailed(true)}
        className={cn('rounded-xl object-contain bg-white border border-slate-200 p-1 shrink-0', sizes[size])}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'rounded-xl shrink-0 flex items-center justify-center font-bold text-white bg-gradient-to-br from-blue-600 to-violet-600',
        sizes[size]
      )}
    >
      {initials(name)}
    </span>
  );
};

export const EligibilityBadge: React.FC<{ eligibility: Eligibility }> = ({ eligibility }) => {
  if (eligibility.status === 'ELIGIBLE') return <Badge variant="success">Eligible</Badge>;
  if (eligibility.has_exception) return <Badge variant="info">Eligible by exception</Badge>;
  if (eligibility.status === 'INCOMPLETE_INFORMATION') return <Badge variant="warning">Needs profile info</Badge>;
  return <Badge variant="danger">Not eligible</Badge>;
};

export const CheckOutcomeIcon: React.FC<{ outcome: string }> = ({ outcome }) =>
  outcome === 'PASS' ? (
    <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-label="Pass" />
  ) : outcome === 'FAIL' ? (
    <XCircle className="w-4 h-4 text-rose-500" aria-label="Does not meet" />
  ) : (
    <AlertCircle className="w-4 h-4 text-amber-500" aria-label="Information missing" />
  );

export const SkillChips: React.FC<{ skills: string[]; max?: number }> = ({ skills, max }) => {
  if (!skills.length) return null;
  const shown = max ? skills.slice(0, max) : skills;
  const rest = skills.length - shown.length;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Required skills">
      {shown.map((s) => (
        <li key={s} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium">
          {s}
        </li>
      ))}
      {rest > 0 && <li className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[11px]">+{rest} more</li>}
    </ul>
  );
};

/** Vertical timeline of an application's recorded status changes (oldest first). */
export const StageTimeline: React.FC<{ application: Application }> = ({ application }) => {
  const entries = [...application.history].sort(
    (a, b) => (parseUtc(a.changed_at)?.getTime() ?? 0) - (parseUtc(b.changed_at)?.getTime() ?? 0)
  );
  if (!entries.length) return <p className="text-xs text-slate-500">No status updates recorded yet.</p>;
  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-3">
      {entries.map((h, i) => {
        const last = i === entries.length - 1;
        return (
          <li key={i} className="ml-4">
            <span
              className={cn(
                'absolute -left-[7px] mt-1 w-3.5 h-3.5 rounded-full border-2 border-white',
                last ? 'bg-blue-600' : 'bg-slate-300'
              )}
              aria-hidden="true"
            />
            <p className="text-xs font-semibold text-slate-800">
              {historyFieldLabel(h.field)}: {historyValueLabel(h.field, h.new_value)}
            </p>
            <p className="text-[11px] text-slate-500">
              {h.old_value ? `from ${historyValueLabel(h.field, h.old_value)} · ` : ''}
              {fmtDateTime(parseUtc(h.changed_at))}
            </p>
          </li>
        );
      })}
    </ol>
  );
};

/** Horizontal stepper of the drive's selection process with the current stage highlighted. */
export const StageStepper: React.FC<{ stages: string[]; current: string | null }> = ({ stages, current }) => {
  if (!stages.length) return null;
  const idx = current ? stages.indexOf(current) : -1;
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Selection stages">
      {stages.map((s, i) => {
        const done = idx >= 0 && i < idx;
        const active = i === idx;
        return (
          <li
            key={`${s}-${i}`}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium',
              active
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-500'
            )}
          >
            {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            <span>
              {i + 1}. {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

export const ReadOnlyNotice: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs text-blue-900">
    <Lock className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
    <p>
      {children ||
        'Registration, drive attendance, selection results and offers are recorded by the placement office. This view is read-only.'}
    </p>
  </div>
);

export const MissingProfileNotice: React.FC<{ fields: string[] }> = ({ fields }) =>
  fields.length ? (
    <div
      className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900"
      role="status"
    >
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
      <p>
        Your academic profile is missing <strong>{fields.join(', ')}</strong>. Drives that check these criteria will show
        &ldquo;information missing&rdquo; and you may not be able to apply. Students cannot edit these details &mdash; please
        contact the placement office to have them updated.
      </p>
    </div>
  ) : null;

const NAV = [
  { to: '/student/placements', label: 'Overview', end: true },
  { to: '/student/placements/drives', label: 'Drives', end: false },
  { to: '/student/placements/applications', label: 'My applications', end: true },
  { to: '/student/placements/history', label: 'History', end: true },
];

export const PlacementNav: React.FC = () => (
  <nav aria-label="Placements" className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
    {NAV.map((n) => (
      <NavLink
        key={n.to}
        to={n.to}
        end={n.end}
        className={({ isActive }) =>
          cn(
            'px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t',
            isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          )
        }
      >
        {n.label}
      </NavLink>
    ))}
  </nav>
);

export const ExceptionNote: React.FC<{ eligibility: Eligibility }> = ({ eligibility }) =>
  eligibility.has_exception ? (
    <div className="flex items-start gap-2 rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-xs text-violet-900">
      <ShieldCheck className="w-4 h-4 shrink-0 text-violet-600" />
      <p>
        The placement office has granted you an eligibility exception for this drive
        {eligibility.exception_reason ? `: ${eligibility.exception_reason}` : '.'}
      </p>
    </div>
  ) : null;
