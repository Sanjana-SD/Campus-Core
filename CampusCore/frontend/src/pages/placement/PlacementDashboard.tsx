import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Award,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  DoorOpen,
  FileText,
  GraduationCap,
  Handshake,
  Plus,
  Send,
  UserCheck,
  Users,
} from 'lucide-react';
import { hhmm, pct } from '../../lib/utils';
import { BarList, ColumnChart, ErrorState, PageHeader, Skeleton, StatCard } from '../../components/ui/Kit';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { DriveStatusBadge } from '../../components/ui/Badge';
import { CompanyLogo, InfoTip } from './placementShared';
import { Drive, fmtDay, n, useApi } from './placementUtils';

interface DashboardData {
  cards: Record<string, number>;
  company_applications: { label: string; value: number }[];
  drive_participation: { drive_id: number; label: string; applications: number; attended: number; selected: number }[];
  department_outcomes: { department: string; applied: number; selected: number; placed: number }[];
  monthly_activity: { month: string; applications: number; offers: number; drives: number }[];
  funnel: Record<'applied' | 'registered' | 'attended' | 'shortlisted' | 'selected' | 'offers' | 'accepted' | 'placed', number>;
  conversion: {
    attendance_rate: number | null;
    selection_rate_of_attended: number | null;
    offer_acceptance_rate: number | null;
    placement_rate_of_students: number | null;
  };
  definitions: Record<string, string>;
  upcoming: Drive[];
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

const FUNNEL_STEPS: { key: keyof DashboardData['funnel']; label: string; hint: string }[] = [
  { key: 'applied', label: 'Applications', hint: 'Applications submitted (withdrawn excluded)' },
  { key: 'registered', label: 'Registration confirmed', hint: 'Drive registration confirmed by the placement office' },
  { key: 'attended', label: 'Attended drive', hint: 'Actually present at the drive' },
  { key: 'shortlisted', label: 'Shortlisted', hint: 'Shortlisted or selected' },
  { key: 'selected', label: 'Selected', hint: 'Official result = Selected' },
  { key: 'offers', label: 'Offers recorded', hint: 'Offers recorded (revoked excluded)' },
  { key: 'accepted', label: 'Offers accepted', hint: 'Offer accepted by the student' },
  { key: 'placed', label: 'Confirmed placements', hint: 'Accepted offers confirmed as final placement' },
];

export const PlacementDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { data, loading, error, reload: load } = useApi<DashboardData>('/placements/dashboard');

  const header = (
    <PageHeader
      eyebrow="Placement office"
      title="Placement overview"
      description="Live recruitment pipeline across all companies and drives. Every number below is computed from recorded applications, results and offers."
      actions={
        <>
          <Button variant="outline" onClick={() => navigate('/placement/companies')} leftIcon={<Building2 className="w-4 h-4" />}>
            Companies
          </Button>
          <Button onClick={() => navigate('/placement/drives/new')} leftIcon={<Plus className="w-4 h-4" />}>
            New drive
          </Button>
        </>
      }
    />
  );

  if (loading && !data)
    return (
      <div>
        {header}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );

  if (error || !data)
    return (
      <div>
        {header}
        <ErrorState title="Could not load the placement dashboard" message={error || 'No data returned'} onRetry={load} />
      </div>
    );

  const c = data.cards;
  const defs = data.definitions || {};
  const hasActivity =
    c.total_applications > 0 || c.published_drives > 0 || c.completed_drives > 0 || data.drive_participation.length > 0;
  const studentHint = defs.student_counts;

  return (
    <div className="space-y-6">
      {header}

      {!hasActivity && (
        <EmptyState
          icon={<Briefcase className="w-6 h-6" />}
          title="No placement activity yet"
          description="Start by adding the companies that recruit from your campus, then create and publish a placement drive. Charts and counts fill in as students apply."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate('/placement/companies?new=1')} leftIcon={<Plus className="w-4 h-4" />}>
                Add your first company
              </Button>
              <Button variant="outline" onClick={() => navigate('/placement/drives/new')}>
                Create a drive
              </Button>
            </div>
          }
        />
      )}

      <section aria-labelledby="pl-overview">
        <h2 id="pl-overview" className="text-sm font-semibold text-slate-700 mb-3">
          Drives & students
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Registered students" value={n(c.total_students)} hint="Active student profiles" icon={<GraduationCap className="w-4 h-4" />} />
          <StatCard
            label="Upcoming drives"
            value={n(c.upcoming_drives)}
            hint={<Defn text={defs.upcoming_drives} short="Drive date today or later" />}
            icon={<CalendarClock className="w-4 h-4" />}
            tone="info"
            onClick={() => navigate('/placement/drives')}
          />
          <StatCard
            label="Open for applications"
            value={n(c.open_applications)}
            hint={<Defn text={defs.open_applications} short="Window open now" />}
            icon={<DoorOpen className="w-4 h-4" />}
            tone="success"
            onClick={() => navigate('/placement/drives?status=APPLICATIONS_OPEN')}
          />
          <StatCard label="Completed drives" value={n(c.completed_drives)} icon={<CheckCircle2 className="w-4 h-4" />} />
          <StatCard label="Companies visiting" value={n(c.companies_visiting)} hint="Published, in-progress or completed drives" icon={<Building2 className="w-4 h-4" />} />
          <StatCard label="Total applications" value={n(c.total_applications)} hint="Applications, not students" icon={<FileText className="w-4 h-4" />} />
        </div>
      </section>

      <section aria-labelledby="pl-students">
        <h2 id="pl-students" className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
          Student pipeline <span className="font-normal text-slate-500">(distinct students)</span>
          {studentHint && <InfoTip text={studentHint} />}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Students applied" value={n(c.students_applied)} icon={<Send className="w-4 h-4" />} />
          <StatCard label="Registration confirmed" value={n(c.students_registered)} icon={<ClipboardList className="w-4 h-4" />} />
          <StatCard label="Attended a drive" value={n(c.students_attended)} icon={<UserCheck className="w-4 h-4" />} />
          <StatCard label="Shortlisted" value={n(c.students_shortlisted)} hint="Shortlisted or selected" icon={<Users className="w-4 h-4" />} tone="info" />
          <StatCard label="Selected" value={n(c.students_selected)} hint="Official result = Selected" icon={<Award className="w-4 h-4" />} tone="success" />
        </div>
      </section>

      <section aria-labelledby="pl-offers">
        <h2 id="pl-offers" className="text-sm font-semibold text-slate-700 mb-3">
          Offers & placements
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Offers received"
            value={n(c.offers_received)}
            hint={<Defn text={defs.offers_received} short="Revoked excluded" />}
            icon={<FileText className="w-4 h-4" />}
            tone="info"
          />
          <StatCard label="Offers accepted" value={n(c.offers_accepted)} icon={<Handshake className="w-4 h-4" />} tone="success" />
          <StatCard label="Confirmed placements" value={n(c.confirmed_placements)} hint="Accepted offers confirmed as final" icon={<CheckCircle2 className="w-4 h-4" />} tone="success" />
          <StatCard
            label="Unique students placed"
            value={n(c.unique_students_placed)}
            hint={<Defn text={defs.unique_students_placed} short="Distinct students" />}
            icon={<GraduationCap className="w-4 h-4" />}
            tone="success"
          />
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Selection funnel</CardTitle>
            <CardDescription>Applications at each lifecycle step. Each step is recorded separately — applied ≠ registered ≠ attended ≠ selected ≠ offered ≠ placed.</CardDescription>
          </CardHeader>
          <Funnel funnel={data.funnel} />
          <dl className="mt-5 grid grid-cols-2 gap-3">
            <Rate label="Attendance rate" value={data.conversion.attendance_rate} hint="Attended ÷ registration confirmed" />
            <Rate label="Selection rate" value={data.conversion.selection_rate_of_attended} hint="Selected ÷ attended" />
            <Rate label="Offer acceptance" value={data.conversion.offer_acceptance_rate} hint="Accepted ÷ offers recorded" />
            <Rate label="Placement rate" value={data.conversion.placement_rate_of_students} hint="Unique students placed ÷ registered students" />
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming drives</CardTitle>
            <CardDescription>Published drives with a drive date today or later (next 6).</CardDescription>
          </CardHeader>
          {data.upcoming.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No upcoming drives scheduled.</p>
          ) : (
            <ul className="divide-y divide-slate-100 -my-2">
              {data.upcoming.map((d) => (
                <li key={d.id}>
                  <Link
                    to={`/placement/drives/${d.id}`}
                    className="flex items-center gap-3 py-2.5 rounded-lg hover:bg-slate-50 px-2 -mx-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <CompanyLogo name={d.company?.name} url={d.company?.logo_url} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{d.job_title}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {d.company?.name} · {fmtDay(d.drive_date)}
                        {d.drive_time ? ` · ${hhmm(d.drive_time)}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <DriveStatusBadge status={d.effective_status} />
                      <p className="text-[11px] text-slate-500 mt-1 tabular-nums">{n(d.counts?.applications ?? 0)} applications</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company-wise applications</CardTitle>
            <CardDescription>Applications received per company across all its drives.</CardDescription>
          </CardHeader>
          <BarList data={data.company_applications.slice(0, 10)} valueLabel="Applications" emptyText="No applications yet" />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Drive-wise participation</CardTitle>
            <CardDescription>Applications vs. students who actually attended (bar) and were selected (listed).</CardDescription>
          </CardHeader>
          <BarList
            data={data.drive_participation.slice(0, 10).map((d) => ({
              label: `${d.label} · ${d.selected} selected`,
              value: d.applications,
              secondary: d.attended,
            }))}
            valueLabel="Applications"
            secondaryLabel="Attended"
            emptyText="No published drives yet"
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Department-wise outcomes</CardTitle>
            <CardDescription>Distinct students per department who applied, were selected and were placed.</CardDescription>
          </CardHeader>
          <ColumnChart
            data={data.department_outcomes.map((d) => ({ label: d.department, values: [d.applied, d.selected, d.placed] }))}
            series={['Applied', 'Selected', 'Placed']}
            emptyText="No applications yet"
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly recruitment activity</CardTitle>
            <CardDescription>Applications (by applied date), offers (by offer date) and drives (by drive date).</CardDescription>
          </CardHeader>
          <ColumnChart
            data={data.monthly_activity.map((m) => ({ label: monthLabel(m.month), values: [m.applications, m.offers, m.drives] }))}
            series={['Applications', 'Offers', 'Drives']}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offer responses</CardTitle>
            <CardDescription>Recorded offers by student response.</CardDescription>
          </CardHeader>
          {c.offers_received === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No offers recorded yet</p>
          ) : (
            <BarList
              data={[
                { label: 'Accepted', value: c.offers_accepted },
                { label: 'Declined', value: c.offers_declined },
                { label: 'Awaiting response', value: Math.max(0, c.offers_received - c.offers_accepted - c.offers_declined) },
              ]}
            />
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Placed students vs. offers</CardTitle>
            <CardDescription>A student can hold several offers; placements count distinct students.</CardDescription>
          </CardHeader>
          {c.offers_received === 0 && c.unique_students_placed === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No offers recorded yet</p>
          ) : (
            <BarList
              data={[
                { label: 'Total offers recorded', value: c.offers_received },
                { label: 'Confirmed placements', value: c.confirmed_placements },
                { label: 'Unique students placed', value: c.unique_students_placed },
              ]}
            />
          )}
        </Card>
      </div>

      {Object.keys(defs).length > 0 && (
        <Card className="bg-slate-50/60">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">How these numbers are counted</h2>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            {Object.entries(defs).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="font-medium text-slate-700 shrink-0 capitalize">{k.replace(/_/g, ' ')}:</dt>
                <dd className="text-slate-600">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
};

const Defn: React.FC<{ text?: string; short: string }> = ({ text, short }) => (
  <span className="inline-flex items-center gap-1">
    {short}
    {text && <InfoTip text={text} />}
  </span>
);

const Rate: React.FC<{ label: string; value: number | null; hint: string }> = ({ label, value, hint }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
    <dt className="text-[11px] text-slate-500 flex items-center gap-1">
      {label} <InfoTip text={hint} />
    </dt>
    <dd className="text-lg font-semibold text-slate-900 tabular-nums">{pct(value)}</dd>
  </div>
);

const Funnel: React.FC<{ funnel: DashboardData['funnel'] }> = ({ funnel }) => {
  const max = Math.max(1, ...FUNNEL_STEPS.map((s) => funnel[s.key] ?? 0));
  return (
    <ol className="space-y-2">
      {FUNNEL_STEPS.map((s, i) => {
        const v = funnel[s.key] ?? 0;
        const prev = i > 0 ? funnel[FUNNEL_STEPS[i - 1].key] ?? 0 : null;
        const conv = prev ? Math.round((v / prev) * 1000) / 10 : null;
        return (
          <li key={s.key} className="grid grid-cols-[9.5rem_1fr_auto] items-center gap-3 text-xs">
            <span className="text-slate-700 flex items-center gap-1 truncate">
              {s.label} <InfoTip text={s.hint} />
            </span>
            <span className="h-5 rounded-md bg-slate-100 overflow-hidden" role="img" aria-label={`${s.label}: ${v}`}>
              <span
                className="block h-full rounded-md bg-gradient-to-r from-blue-600 to-violet-500"
                style={{ width: `${(v / max) * 100}%` }}
              />
            </span>
            <span className="tabular-nums text-slate-700 w-20 text-right">
              {v}
              {conv !== null && <span className="text-slate-400 ml-1">({conv}%)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
};
