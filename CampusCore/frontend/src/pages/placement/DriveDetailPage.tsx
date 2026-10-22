import React, { useCallback, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, CalendarDays, ExternalLink, MapPin, Pencil, Rocket, Shuffle, Wallet } from 'lucide-react';
import { errorMessage, formatCtc, hhmm } from '../../lib/utils';
import { ConfirmDialog, ErrorState, Skeleton, Tabs } from '../../components/ui/Kit';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { DriveStatusBadge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { CompanyLogo, Field, InfoTip } from './placementShared';
import { DriveStatusModal } from './DriveActions';
import { ALLOWED_TRANSITIONS, DEFAULT_STAGES, Drive, fmtDay, fmtLocalDateTime, fmtUtc, label, n, publishDrive, useApi } from './placementUtils';
import { ParticipantsTab } from './ParticipantsTab';
import { EligibilityTab } from './EligibilityTab';
import { ApplicantDrawer } from './ApplicantDrawer';

const COUNT_DEFS: { key: keyof NonNullable<Drive['counts']>; label: string; hint: string }[] = [
  { key: 'applications', label: 'Applied', hint: 'Active applications (withdrawn excluded)' },
  { key: 'registered', label: 'Registration confirmed', hint: 'Registration confirmed by the placement office' },
  { key: 'attended', label: 'Attended', hint: 'Actually present at the drive' },
  { key: 'shortlisted', label: 'Shortlisted', hint: 'Shortlisted or selected' },
  { key: 'selected', label: 'Selected', hint: 'Official result = Selected' },
  { key: 'offers', label: 'Offers', hint: 'Offers recorded (revoked excluded)' },
  { key: 'placed', label: 'Placed', hint: 'Accepted offers confirmed as final placement' },
];

export const DriveDetailPage: React.FC = () => {
  const { driveId } = useParams();
  const id = Number(driveId);
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'participants';

  const res = useApi<Drive>(`/placements/drives/${id}`);
  const drive = res.data && res.data.id === id ? res.data : null;
  const loading = res.loading && !drive;
  const error = res.error ? { msg: res.error, status: res.status } : null;
  const load = res.reload;
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [openApp, setOpenApp] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const onChanged = useCallback(() => {
    load();
  }, [load]);

  const doPublish = async () => {
    setPublishing(true);
    try {
      const d = await publishDrive(id);
      toast.success('Drive published', `${d.notified_students ?? 0} potentially eligible students notified.`);
      setPublishOpen(false);
      load();
    } catch (e) {
      toast.error('Could not publish drive', errorMessage(e));
    } finally {
      setPublishing(false);
    }
  };

  const back = (
    <Link to="/placement/drives" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-3">
      <ArrowLeft className="w-3.5 h-3.5" /> All drives
    </Link>
  );

  if (loading)
    return (
      <div>
        {back}
        <Skeleton className="h-40 rounded-xl mb-4" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  if (!drive)
    return (
      <div>
        {back}
        {error?.status === 404 ? (
          <EmptyState
            icon={<Briefcase className="w-6 h-6" />}
            title="Drive not found"
            description="It may have been removed, or the link is incorrect."
            action={<Button onClick={() => navigate('/placement/drives')}>All drives</Button>}
          />
        ) : (
          <ErrorState message={error?.msg ?? 'Unknown error'} onRetry={load} />
        )}
      </div>
    );

  const canEdit = !['COMPLETED', 'CANCELLED'].includes(drive.status);
  const canChange = (ALLOWED_TRANSITIONS[drive.status] ?? []).length > 0;
  const locked =
    drive.status === 'DRAFT'
      ? 'Applications of a draft drive cannot be updated. Publish the drive first.'
      : drive.status === 'CANCELLED'
        ? 'This drive is cancelled; applications can no longer be updated.'
        : null;
  const ctc = formatCtc(drive.ctc_min, drive.ctc_max, drive.ctc_text);
  const c = drive.counts;

  return (
    <div className="space-y-5">
      <div>
        {back}
        <Card>
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <CompanyLogo name={drive.company?.name} url={drive.company?.logo_url} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">{drive.job_title}</h1>
                <DriveStatusBadge status={drive.effective_status} />
              </div>
              <p className="text-sm text-slate-600 mt-0.5">
                {drive.company?.name} · {label(drive.job_type)}
                {drive.work_mode ? ` · ${label(drive.work_mode)}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                  Apply by {fmtLocalDateTime(drive.application_deadline)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                  Drive {fmtDay(drive.drive_date)}
                  {drive.drive_time ? ` at ${hhmm(drive.drive_time)}` : ''}
                </span>
                {(drive.venue || drive.job_location) && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {drive.venue || drive.job_location}
                  </span>
                )}
                {ctc && (
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-slate-400" />
                    {ctc}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {canEdit && (
                <Button variant="outline" onClick={() => navigate(`/placement/drives/${drive.id}/edit`)} leftIcon={<Pencil className="w-4 h-4" />}>
                  Edit
                </Button>
              )}
              {canChange && (
                <Button variant="outline" onClick={() => setStatusOpen(true)} leftIcon={<Shuffle className="w-4 h-4" />}>
                  Set status
                </Button>
              )}
              {drive.status === 'DRAFT' && (
                <Button onClick={() => setPublishOpen(true)} leftIcon={<Rocket className="w-4 h-4" />}>
                  Publish
                </Button>
              )}
            </div>
          </div>

          {c && (
            <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 border-t border-slate-100 pt-4">
              {COUNT_DEFS.map((d) => (
                <div key={d.key} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-[11px] text-slate-500 flex items-center gap-1">
                    {d.label} <InfoTip text={d.hint} />
                  </dt>
                  <dd className="text-lg font-semibold text-slate-900 tabular-nums">{n(c[d.key])}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>

      <div>
        <Tabs
          tabs={[
            { id: 'participants', label: `Participants${c ? ` (${c.applications})` : ''}` },
            { id: 'eligibility', label: 'Eligibility' },
            { id: 'details', label: 'Drive details' },
          ]}
          active={tab}
          onChange={(t) => {
            params.set('tab', t);
            setParams(params, { replace: true });
          }}
        />
        {tab === 'participants' && (
          <ParticipantsTab
            driveId={drive.id}
            locked={locked}
            refreshKey={refreshKey}
            onOpenApplication={setOpenApp}
            onChanged={onChanged}
          />
        )}
        {tab === 'eligibility' && <EligibilityTab driveId={drive.id} onOpenApplication={setOpenApp} />}
        {tab === 'details' && <DriveDetails drive={drive} />}
      </div>

      <ApplicantDrawer
        applicationId={openApp}
        stages={[...DEFAULT_STAGES, ...drive.selection_process.filter((s) => !DEFAULT_STAGES.includes(s))]}
        driveLocked={locked}
        onClose={() => setOpenApp(null)}
        onChanged={() => {
          load();
          setRefreshKey((k) => k + 1);
        }}
      />

      <ConfirmDialog
        isOpen={publishOpen}
        title="Publish drive?"
        message={
          <>
            <p>The drive becomes visible to students and every student who is not clearly ineligible is notified.</p>
            <p className="mt-2 text-xs text-slate-500">
              Requires a job description, a drive date and an application deadline in the future.
            </p>
          </>
        }
        confirmLabel="Publish"
        isLoading={publishing}
        onConfirm={doPublish}
        onClose={() => setPublishOpen(false)}
      />

      {statusOpen && (
        <DriveStatusModal
          key={`${drive.id}-${drive.status}`}
          drive={drive}
          onClose={() => setStatusOpen(false)}
          onDone={(d) => {
            setStatusOpen(false);
            toast.success('Drive status updated', label(d.effective_status));
            load();
          }}
        />
      )}
    </div>
  );
};

const List: React.FC<{ items: (string | number)[]; empty: string }> = ({ items, empty }) =>
  items.length ? (
    <span className="flex flex-wrap gap-1">
      {items.map((x) => (
        <span key={x} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {x}
        </span>
      ))}
    </span>
  ) : (
    <span className="text-slate-400">{empty}</span>
  );

const DriveDetails: React.FC<{ drive: Drive }> = ({ drive: d }) => (
  <div className="grid lg:grid-cols-3 gap-4">
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Job description</CardTitle>
      </CardHeader>
      {d.job_description ? (
        <p className="text-sm text-slate-700 whitespace-pre-line">{d.job_description}</p>
      ) : (
        <p className="text-sm text-slate-400">No description yet (required before publishing).</p>
      )}
      <div className="mt-4">
        <Field label="Required skills">
          <List items={d.required_skills} empty="Not specified" />
        </Field>
      </div>
      {d.instructions && (
        <div className="mt-4">
          <Field label="Instructions">
            <span className="whitespace-pre-line">{d.instructions}</span>
          </Field>
        </div>
      )}
      <div className="mt-4">
        <Field label="Selection process">
          {d.selection_process.length ? (
            <ol className="mt-1 flex flex-wrap gap-1.5">
              {d.selection_process.map((s, i) => (
                <li key={`${s}-${i}`} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs">
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
          ) : (
            <span className="text-slate-400">Standard stages only</span>
          )}
        </Field>
      </div>
    </Card>

    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Eligibility</CardTitle>
        </CardHeader>
        <dl className="space-y-3">
          <Field label="Departments">
            <List items={d.eligible_departments} empty="All departments" />
          </Field>
          <Field label="Branches / programmes">
            <List items={d.eligible_courses} empty="All programmes" />
          </Field>
          <Field label="Semesters">
            <List items={d.eligible_semesters} empty="Any semester" />
          </Field>
          <Field label="Graduation years">
            <List items={d.graduation_years} empty="Any year" />
          </Field>
          <Field label="Minimum CGPA">{d.min_cgpa ?? <span className="text-slate-400">No rule</span>}</Field>
          <Field label="Max active backlogs">
            {d.max_active_backlogs ?? <span className="text-slate-400">No rule</span>}
          </Field>
          {d.other_requirements && <Field label="Other requirements">{d.other_requirements}</Field>}
        </dl>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Logistics</CardTitle>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-3">
          <Field label="Applications open">{fmtLocalDateTime(d.application_open_at)}</Field>
          <Field label="Deadline">{fmtLocalDateTime(d.application_deadline)}</Field>
          <Field label="Drive date">{fmtDay(d.drive_date)}</Field>
          <Field label="Drive time">{hhmm(d.drive_time)}</Field>
          <Field label="Venue">{d.venue || '—'}</Field>
          <Field label="Location">{d.job_location || '—'}</Field>
          <Field label="Vacancies">{n(d.vacancies)}</Field>
          <Field label="Stored status">{label(d.status)}</Field>
          <div className="col-span-2">
            <Field label="Meeting link">
              {d.meeting_link ? (
                <a href={d.meeting_link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-blue-600 hover:underline break-all">
                  {d.meeting_link} <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ) : (
                '—'
              )}
            </Field>
          </div>
          <Field label="Contact">{d.contact_person || '—'}</Field>
          <Field label="Contact e-mail">{d.contact_email || '—'}</Field>
          <Field label="Created">{fmtUtc(d.created_at)}</Field>
          <Field label="Published">{fmtUtc(d.published_at)}</Field>
        </dl>
      </Card>
    </div>
  </div>
);
