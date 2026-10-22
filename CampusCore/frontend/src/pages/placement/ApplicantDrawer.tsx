import React, { useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Circle, History, ShieldCheck, XCircle } from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { cn, errorMessage, todayISO } from '../../lib/utils';
import { ErrorState, Skeleton } from '../../components/ui/Kit';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ApplicationStatusBadge, Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { Drawer, Field, TextArea } from './placementShared';
import { Application, ATTENDANCE, DEFAULT_STAGES, Eligibility, fmtDay, fmtUtc, label, n, OFFER_STATUSES, opts, REGISTRATION, RESULTS, useApi } from './placementUtils';
import { EligibilityChecks, EligibilityBadge } from './EligibilityTab';

type Detail = Application & { eligibility_now: Eligibility };

export const ApplicantDrawer: React.FC<{
  applicationId: number | null;
  stages: string[];
  driveLocked: string | null;
  onClose: () => void;
  onChanged: () => void;
}> = ({ applicationId, stages, driveLocked, onClose, onChanged }) => {
  const res = useApi<Detail>(applicationId === null ? null : `/placements/applications/${applicationId}`);
  // keep showing the current applicant while a post-save refresh is in flight
  const data = res.data && res.data.id === applicationId ? res.data : null;
  const error = res.error;
  const load = res.reload;

  const refreshed = () => {
    load();
    onChanged();
  };

  const st = data?.student;
  return (
    <Drawer
      open={applicationId !== null}
      onClose={onClose}
      title={st?.name ?? 'Applicant'}
      subtitle={st ? [st.usn, st.department, st.email].filter(Boolean).join(' · ') : undefined}
    >
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <ApplicationStatusBadge status={data.overall_status} />
              {data.application_status === 'WITHDRAWN' && <Badge variant="neutral">Withdrawn by student</Badge>}
              {data.via_exception && (
                <Badge variant="warning">
                  <ShieldCheck className="w-3 h-3 mr-1" /> Applied via eligibility exception
                </Badge>
              )}
              <span className="text-[11px] text-slate-500 ml-auto">Applied {fmtUtc(data.applied_at)}</span>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="USN">{st?.usn || '—'}</Field>
              <Field label="Department">{st?.department || '—'}</Field>
              <Field label="Semester">{n(st?.semester)}</Field>
              <Field label="Graduation year">{st?.graduation_year ?? '—'}</Field>
              <Field label="CGPA">{st?.cgpa ?? '—'}</Field>
              <Field label="Active backlogs">{n(st?.active_backlogs)}</Field>
            </dl>
          </Card>

          <Lifecycle app={data} />

          <section aria-labelledby="ad-elig">
            <div className="flex items-center justify-between mb-2">
              <h3 id="ad-elig" className="text-sm font-semibold text-slate-800">
                Eligibility (current profile)
              </h3>
              <EligibilityBadge status={data.eligibility_now.status} exception={data.eligibility_now.has_exception} />
            </div>
            <Card className="p-0 overflow-hidden">
              <EligibilityChecks e={data.eligibility_now} />
            </Card>
          </section>

          {driveLocked ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {driveLocked}
            </div>
          ) : data.application_status === 'WITHDRAWN' ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              This application was withdrawn and can no longer be updated.
            </div>
          ) : (
            <>
              <ProgressForm key={`p-${data.id}-${data.history.length}-${data.notes ?? ''}`} app={data} stages={stages} onSaved={refreshed} />
              <OfferForm key={`o-${data.id}-${data.history.length}`} app={data} onSaved={refreshed} />
            </>
          )}

          <HistoryList app={data} />
        </>
      )}
    </Drawer>
  );
};

// ---------------------------------------------------------------------------

const Lifecycle: React.FC<{ app: Application }> = ({ app }) => {
  const o = app.offer && app.offer.status !== 'REVOKED' ? app.offer : null;
  const steps: { label: string; state: 'done' | 'no' | 'pending'; note: string }[] = [
    { label: 'Applied', state: app.application_status === 'APPLIED' ? 'done' : 'no', note: 'Student submitted an application' },
    {
      label: 'Registration confirmed',
      state: app.registration_status === 'CONFIRMED' ? 'done' : app.registration_status === 'REJECTED' ? 'no' : 'pending',
      note: 'Placement office confirmed the drive registration',
    },
    {
      label: 'Attended drive',
      state: app.attendance_status === 'ATTENDED' ? 'done' : app.attendance_status === 'DID_NOT_ATTEND' ? 'no' : 'pending',
      note: 'Actual presence at the drive (not class attendance)',
    },
    {
      label: 'Selected',
      state: app.result === 'SELECTED' ? 'done' : app.result === 'REJECTED' ? 'no' : 'pending',
      note: 'Official company result',
    },
    { label: 'Offer received', state: o ? 'done' : 'pending', note: 'An offer has been recorded' },
    {
      label: 'Offer accepted',
      state: o?.status === 'ACCEPTED' ? 'done' : o?.status === 'DECLINED' ? 'no' : 'pending',
      note: 'Student accepted the offer',
    },
    { label: 'Placed', state: o?.is_placed ? 'done' : 'pending', note: 'Accepted offer confirmed as the final placement' },
  ];
  return (
    <section aria-labelledby="ad-life">
      <h3 id="ad-life" className="text-sm font-semibold text-slate-800 mb-1">
        Placement lifecycle
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Each step is recorded separately: applied ≠ registration confirmed ≠ attended ≠ selected ≠ offer received ≠ offer accepted ≠ placed.
      </p>
      <ol className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {steps.map((s) => (
          <li
            key={s.label}
            title={s.note}
            className={cn(
              'rounded-lg border px-2 py-2 text-center text-[11px] leading-tight',
              s.state === 'done' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              s.state === 'no' && 'border-rose-200 bg-rose-50 text-rose-800',
              s.state === 'pending' && 'border-slate-200 bg-white text-slate-500'
            )}
          >
            <span className="flex justify-center mb-1">
              {s.state === 'done' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : s.state === 'no' ? (
                <XCircle className="w-4 h-4" />
              ) : (
                <Circle className="w-4 h-4" />
              )}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
    </section>
  );
};

// ---------------------------------------------------------------------------

const ProgressForm: React.FC<{ app: Application; stages: string[]; onSaved: () => void }> = ({ app, stages, onSaved }) => {
  const toast = useToast();
  const [reg, setReg] = useState(app.registration_status);
  const [att, setAtt] = useState(app.attendance_status);
  const [stage, setStage] = useState(app.current_stage ?? '');
  const [result, setResult] = useState(app.result);
  const [resultDate, setResultDate] = useState(app.result_date ?? todayISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageOptions = (() => {
    const all = stages.length ? [...stages] : [...DEFAULT_STAGES, ...app.drive.selection_process];
    if (app.current_stage && !all.includes(app.current_stage)) all.unshift(app.current_stage);
    return Array.from(new Set(all)).map((s) => ({ value: s, label: s }));
  })();

  const changes: Record<string, string> = {};
  if (reg !== app.registration_status) changes.registration_status = reg;
  if (att !== app.attendance_status) changes.attendance_status = att;
  if (stage && stage !== (app.current_stage ?? '')) changes.current_stage = stage;
  if (result !== app.result) changes.result = result;
  const hasChanges = Object.keys(changes).length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges && !notes.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await ApiClient.patch(`/placements/applications/${app.id}`, {
        ...changes,
        ...(changes.result ? { result_date: resultDate || null } : {}),
        notes: notes.trim() || null,
      });
      toast.success(hasChanges ? 'Application updated' : 'Note saved');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      toast.error('Update rejected', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Drive progress</h3>
          <p className="text-xs text-slate-500">
            Registration must be confirmed before attendance can be recorded, and the student must have attended before being
            marked Selected.
          </p>
        </div>
        {error && <ErrorState title="Update rejected" message={error} />}
        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            id="ad-reg"
            label="Drive registration"
            value={reg}
            onChange={(e) => setReg(e.target.value)}
            options={opts(REGISTRATION)}
          />
          <Select
            id="ad-att"
            label="Actual drive attendance"
            value={att}
            onChange={(e) => setAtt(e.target.value)}
            options={opts(ATTENDANCE)}
          />
          <Select
            id="ad-stage"
            label="Selection stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            options={stageOptions}
            placeholder={app.current_stage ? undefined : 'Not set'}
          />
          <Select id="ad-result" label="Result" value={result} onChange={(e) => setResult(e.target.value)} options={opts(RESULTS)} />
          {changes.result && (
            <Input
              id="ad-result-date"
              label="Result date"
              type="date"
              value={resultDate}
              onChange={(e) => setResultDate(e.target.value)}
              helperText="Defaults to today if left empty."
            />
          )}
        </div>
        <TextArea
          id="ad-notes"
          label="Note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          helperText={
            hasChanges
              ? 'Attached to this change in the selection history.'
              : app.notes
                ? `Saved as the application note (replaces: "${app.notes}").`
                : 'With no status change, this is saved as the application note.'
          }
        />
        <div className="flex justify-end">
          <Button type="submit" isLoading={saving} disabled={!hasChanges && !notes.trim()}>
            {hasChanges ? `Save ${Object.keys(changes).length} change${Object.keys(changes).length > 1 ? 's' : ''}` : 'Save note'}
          </Button>
        </div>
      </form>
    </Card>
  );
};

// ---------------------------------------------------------------------------

const OfferForm: React.FC<{ app: Application; onSaved: () => void }> = ({ app, onSaved }) => {
  const toast = useToast();
  const o = app.offer;
  const [ctc, setCtc] = useState(o?.offered_ctc != null ? String(o.offered_ctc) : '');
  const [offerDate, setOfferDate] = useState(o?.offer_date ?? '');
  const [joinDate, setJoinDate] = useState(o?.joining_date ?? '');
  const [status, setStatus] = useState(o?.status ?? 'OFFERED');
  const [placed, setPlaced] = useState(!!o?.is_placed);
  const [notes, setNotes] = useState(o?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRecord = app.result === 'SELECTED';
  if (!o && !canRecord)
    return (
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-800">Offer</h3>
        <p className="text-xs text-slate-500 mt-1">
          An offer can only be recorded once the official result is <strong>Selected</strong>. Being selected is not the same as
          receiving an offer — record the offer when the company issues it.
        </p>
      </Card>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (ctc.trim() && (!Number.isFinite(Number(ctc)) || Number(ctc) < 0)) {
      setError('Offered CTC must be a positive number.');
      return;
    }
    if (offerDate && joinDate && joinDate < offerDate) {
      setError('The joining date cannot be before the offer date.');
      return;
    }
    const base = {
      offered_ctc: ctc.trim() ? Number(ctc) : null,
      offer_date: offerDate || null,
      joining_date: joinDate || null,
      notes: notes.trim() || null,
    };
    const statusChanged = status !== (o?.status ?? 'OFFERED');
    const placedChanged = placed !== !!o?.is_placed;
    setSaving(true);
    try {
      // The backend applies the status change before the placement flag; un-confirming a placement
      // must happen first when the status also changes.
      if (o?.is_placed && !placed && statusChanged) {
        await ApiClient.post(`/placements/applications/${app.id}/offer`, { is_placed: false });
        await ApiClient.post(`/placements/applications/${app.id}/offer`, { ...base, status });
      } else {
        await ApiClient.post(`/placements/applications/${app.id}/offer`, {
          ...base,
          ...(statusChanged || !o ? { status } : {}),
          ...(placedChanged ? { is_placed: placed } : {}),
        });
      }
      toast.success(o ? 'Offer updated' : 'Offer recorded');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      toast.error('Offer not saved', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{o ? 'Offer' : 'Record offer'}</h3>
          <p className="text-xs text-slate-500">
            Offer received → accepted/declined by the student → confirmed as the final placement. Only an accepted offer can be
            confirmed as placed.
          </p>
        </div>
        {error && <ErrorState title="Offer not saved" message={error} />}
        <div className="grid sm:grid-cols-2 gap-3">
          <Input id="of-ctc" label="Offered CTC (LPA)" type="number" min={0} step="0.01" value={ctc} onChange={(e) => setCtc(e.target.value)} />
          <Select
            id="of-status"
            label="Offer status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              if (e.target.value !== 'ACCEPTED') setPlaced(false);
            }}
            options={opts(OFFER_STATUSES)}
          />
          <Input id="of-date" label="Offer date" type="date" value={offerDate} onChange={(e) => setOfferDate(e.target.value)} />
          <Input id="of-join" label="Joining date" type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
        </div>
        <label
          className={cn(
            'flex items-start gap-3 rounded-lg border p-3',
            status === 'ACCEPTED' ? 'border-slate-200 cursor-pointer' : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
          )}
        >
          <input
            type="checkbox"
            className="mt-0.5 accent-emerald-600"
            checked={placed}
            disabled={status !== 'ACCEPTED'}
            onChange={(e) => setPlaced(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">Confirm final placement</span>
            <span className="block text-xs text-slate-500">
              {status === 'ACCEPTED'
                ? 'Counts this student as placed in reports. The student is notified.'
                : 'Available once the offer status is Accepted.'}
            </span>
          </span>
        </label>
        <TextArea id="of-notes" label="Offer notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {o?.placed_confirmed_at && (
          <p className="text-[11px] text-emerald-700 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Placement confirmed {fmtUtc(o.placed_confirmed_at)}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" isLoading={saving}>
            {o ? 'Save offer' : 'Record offer'}
          </Button>
        </div>
      </form>
    </Card>
  );
};

// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  application: 'Application',
  registration: 'Registration',
  attendance: 'Drive attendance',
  stage: 'Stage',
  result: 'Result',
  offer: 'Offer',
  placement: 'Final placement',
};

const val = (field: string, v: string | null) => {
  if (v === null || v === '') return '—';
  if (field === 'placement') return v === 'True' ? 'Confirmed' : 'Not confirmed';
  if (field === 'stage') return v;
  return label(v);
};

const HistoryList: React.FC<{ app: Application }> = ({ app }) => (
  <section aria-labelledby="ad-hist">
    <h3 id="ad-hist" className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
      <History className="w-4 h-4 text-slate-400" /> Selection history
    </h3>
    {app.notes && (
      <p className="mb-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <span className="font-medium">Application note:</span> {app.notes}
      </p>
    )}
    {app.history.length === 0 ? (
      <p className="text-xs text-slate-500">No changes recorded yet.</p>
    ) : (
      <ol className="relative border-l border-slate-200 ml-2 space-y-3">
        {[...app.history]
          .sort((a, b) => (b.changed_at ?? '').localeCompare(a.changed_at ?? ''))
          .map((h, i) => (
            <li key={i} className="ml-4">
              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border-2 border-white bg-blue-500" />
              <p className="text-xs text-slate-800">
                <span className="font-medium">{FIELD_LABELS[h.field] ?? h.field}:</span> {val(h.field, h.old_value)} →{' '}
                <span className="font-medium">{val(h.field, h.new_value)}</span>
              </p>
              <p className="text-[11px] text-slate-500">
                {fmtUtc(h.changed_at)}
                {h.changed_by ? ` · by ${h.changed_by}` : ''}
              </p>
              {h.notes && <p className="text-[11px] text-slate-600 italic mt-0.5">“{h.notes}”</p>}
            </li>
          ))}
      </ol>
    )}
    {app.result_date && <p className="mt-3 text-[11px] text-slate-500">Result date: {fmtDay(app.result_date)}</p>}
  </section>
);
