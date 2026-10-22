import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Award,
  BadgeCheck,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  DoorOpen,
  FileCheck2,
  History,
  ListChecks,
  Send,
  Star,
} from 'lucide-react';
import { ErrorState, PageHeader, Skeleton, StatCard } from '../../../components/ui/Kit';
import { Card, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/LoadingSpinner';
import { ApplicationStatusBadge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { DriveCard, DriveCardSkeleton } from './DriveCard';
import { CompanyLogo, MissingProfileNotice, PlacementNav } from './PlacementUi';
import { type StudentOverview, fmtDate, parseUtc } from './placementTypes';
import { useApiQuery } from './useApiQuery';

export const StudentPlacements: React.FC = () => {
  const navigate = useNavigate();
  const { data, loading, error, reload: load } = useApiQuery<StudentOverview>('/placements/student/overview');

  const c = data?.counts;
  const stats: { label: string; value?: number; icon: React.ReactNode; tone: 'default' | 'success' | 'warning' | 'danger' | 'info'; to?: string; hint?: string }[] = [
    { label: 'Upcoming drives', value: c?.upcoming_drives, icon: <CalendarClock className="w-4 h-4" />, tone: 'info', to: '/student/placements/drives' },
    { label: 'Open for applications', value: c?.open_applications, icon: <DoorOpen className="w-4 h-4" />, tone: 'info', to: '/student/placements/drives' },
    { label: 'Applications submitted', value: c?.applications_submitted, icon: <Send className="w-4 h-4" />, tone: 'default', to: '/student/placements/applications', hint: 'Excludes withdrawn' },
    { label: 'Drives attended', value: c?.drives_attended, icon: <ClipboardList className="w-4 h-4" />, tone: 'default' },
    { label: 'Shortlisted', value: c?.shortlisted, icon: <ListChecks className="w-4 h-4" />, tone: 'warning' },
    { label: 'Selection results', value: c?.selections, icon: <Star className="w-4 h-4" />, tone: 'success', hint: c ? `${c.companies_selected} compan${c.companies_selected === 1 ? 'y' : 'ies'}` : undefined },
    { label: 'Offers received', value: c?.offers_received, icon: <Award className="w-4 h-4" />, tone: 'success' },
    { label: 'Offers accepted', value: c?.offers_accepted, icon: <FileCheck2 className="w-4 h-4" />, tone: 'success' },
    { label: 'Confirmed placements', value: c?.confirmed_placements, icon: <BadgeCheck className="w-4 h-4" />, tone: 'success' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Placements"
        title="Placement overview"
        description="Track campus recruitment drives, your applications and outcomes in one place."
        actions={
          <>
            <Button variant="outline" leftIcon={<History className="w-4 h-4" />} onClick={() => navigate('/student/placements/history')}>
              History
            </Button>
            <Button leftIcon={<Briefcase className="w-4 h-4" />} onClick={() => navigate('/student/placements/drives')}>
              Browse drives
            </Button>
          </>
        }
      />
      <PlacementNav />

      {error && <ErrorState message={error} onRetry={load} />}

      {data && <MissingProfileNotice fields={data.profile.missing_fields} />}

      <section aria-label="Placement summary" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {loading && !data
          ? Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-[84px] rounded-xl" />)
          : stats.map((s) => (
              <StatCard
                key={s.label}
                label={s.label}
                value={s.value ?? '—'}
                icon={s.icon}
                tone={s.tone}
                hint={s.hint}
                onClick={s.to ? () => navigate(s.to as string) : undefined}
              />
            ))}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-3" aria-labelledby="open-drives-h">
          <div className="flex items-center justify-between">
            <h2 id="open-drives-h" className="text-base font-semibold text-slate-900">
              Open drives
            </h2>
            <Link to="/student/placements/drives" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              View all drives
            </Link>
          </div>
          {loading && !data ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DriveCardSkeleton />
              <DriveCardSkeleton />
            </div>
          ) : data && data.open_drives.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.open_drives.map((d) => (
                <DriveCard key={d.id} drive={d} />
              ))}
            </div>
          ) : data ? (
            <EmptyState
              icon={<Briefcase className="w-6 h-6" />}
              title="No drives are open right now"
              description="When the placement office publishes a drive and its application window opens, it will appear here. You will also get a notification."
              action={
                <Button size="sm" variant="outline" onClick={() => navigate('/student/placements/drives?timeframe=all')}>
                  See all drives
                </Button>
              }
            />
          ) : null}
        </section>

        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent applications</CardTitle>
              <CardDescription>Your latest five applications</CardDescription>
            </div>
            <Link to="/student/placements/applications" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </CardHeader>
          {loading && !data ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : data && data.recent_applications.length ? (
            <ul className="divide-y divide-slate-100 -my-2">
              {data.recent_applications.map((a) => (
                <li key={a.id} className="py-2.5 flex items-center gap-3">
                  <CompanyLogo name={a.drive.company_name} url={a.drive.company_logo} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/student/placements/drives/${a.drive_id}`}
                      className="block text-sm font-medium text-slate-900 truncate hover:text-blue-700"
                    >
                      {a.drive.job_title}
                    </Link>
                    <p className="text-[11px] text-slate-500 truncate">
                      {a.drive.company_name || '—'} · Applied {fmtDate(parseUtc(a.applied_at))}
                    </p>
                  </div>
                  <ApplicationStatusBadge status={a.overall_status} />
                </li>
              ))}
            </ul>
          ) : data ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-6 h-6 mx-auto text-slate-300" />
              <p className="mt-2 text-xs text-slate-500">You have not applied to any drive yet.</p>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
};
