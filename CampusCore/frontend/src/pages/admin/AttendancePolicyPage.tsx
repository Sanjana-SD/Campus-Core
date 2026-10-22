import React, { useMemo, useState } from 'react';
import { BookOpen, Calculator, Pencil, Plus, Save, Trash2, UserMinus } from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { errorMessage, formatDate, formatDateTime } from '../../lib/utils';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { AttendanceStatusBadge } from '../../components/ui/Badge';
import { ConfirmDialog, ErrorState, PageHeader, Skeleton, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import { useToast } from '../../components/ui/Toast';
import { Checkbox, InlineAlert, SearchableSelect, StatusLegend } from './AttendanceKit';
import { recalcText, toSecs, useApi, useLookups, type Policy, type RecalcStats } from './attendanceShared';

interface PolicyForm {
  minimum_percentage: string;
  late_arrival_grace_minutes: string;
  present_min_percent: string;
  partial_min_percent: string;
  min_required_minutes: string;
  missing_exit_policy: string;
  missing_entry_policy: string;
  count_late_as_attended: boolean;
  count_partial_as_attended: boolean;
  tracking_start_date: string;
  college_timezone: string;
}

const toForm = (p: Policy): PolicyForm => ({
  minimum_percentage: String(p.minimum_percentage ?? ''),
  late_arrival_grace_minutes: String(p.late_arrival_grace_minutes ?? ''),
  present_min_percent: String(p.present_min_percent ?? ''),
  partial_min_percent: String(p.partial_min_percent ?? ''),
  min_required_minutes: p.min_required_minutes === null || p.min_required_minutes === undefined ? '' : String(p.min_required_minutes),
  missing_exit_policy: p.missing_exit_policy || 'PENDING_VERIFICATION',
  missing_entry_policy: p.missing_entry_policy || 'PENDING_VERIFICATION',
  count_late_as_attended: !!p.count_late_as_attended,
  count_partial_as_attended: !!p.count_partial_as_attended,
  tracking_start_date: p.tracking_start_date || '',
  college_timezone: p.college_timezone || '',
});

const MISSING_OPTS = [
  { value: 'PENDING_VERIFICATION', label: 'Pending verification (not counted until resolved)' },
  { value: 'ABSENT', label: 'Ignore the incomplete scan (treat as no presence)' },
];

const TIMEZONES: string[] = (() => {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    return fn ? fn('timeZone') : ['Asia/Kolkata', 'UTC'];
  } catch {
    return ['Asia/Kolkata', 'UTC'];
  }
})();

/** Client-side mirror of backend attendance_engine.evaluate_session for a single scan (past date). */
function evaluateExample(
  ex: { start: string; end: string; entry: string; exit: string },
  rules: { grace: number; present: number; partial: number; minReq: number | null; missingExit: string; missingEntry: string }
) {
  if (!ex.start || !ex.end) return null;
  const S = toSecs(ex.start);
  const E = toSecs(ex.end);
  const schedSecs = Math.max(E - S, 0);
  const schedMin = Math.floor(schedSecs / 60);
  let attSecs = 0;
  let first: number | null = null;
  if (ex.entry && ex.exit) {
    const a = Math.max(toSecs(ex.entry), S);
    const b = Math.min(toSecs(ex.exit), E);
    if (b > a) {
      attSecs = b - a;
      first = a;
    }
  }
  const attMin = Math.floor(attSecs / 60);
  const pctV = schedSecs ? Math.round((attSecs / schedSecs) * 100 * 100) / 100 : 0;
  const meetsPresent = pctV >= rules.present && (rules.minReq === null || attMin >= rules.minReq);
  let status: string;
  let reason: string;
  if (attSecs > 0 && meetsPresent) {
    if (first !== null && first > S + rules.grace * 60) {
      status = 'LATE';
      reason = `Present for ${attMin}/${schedMin} min (${pctV.toFixed(2)}%); first presence after the ${rules.grace}-minute grace period`;
    } else {
      status = 'PRESENT';
      reason = `Present for ${attMin}/${schedMin} min (${pctV.toFixed(2)}%)`;
    }
  } else if (attSecs > 0 && pctV >= rules.partial) {
    status = 'PARTIAL';
    reason = `Present for only ${attMin}/${schedMin} min (${pctV.toFixed(2)}%)`;
  } else {
    status = 'ABSENT';
    reason = attSecs === 0 ? 'No recorded presence during the class' : `Present for ${attMin}/${schedMin} min (${pctV.toFixed(2)}%), below the partial threshold`;
  }
  const openEntry = !!ex.entry && !ex.exit && toSecs(ex.entry) < E;
  const openExit = !ex.entry && !!ex.exit && toSecs(ex.exit) > S;
  if (status !== 'PRESENT' && status !== 'LATE' && (openEntry || openExit)) {
    if ((openEntry && rules.missingExit === 'PENDING_VERIFICATION') || (openExit && rules.missingEntry === 'PENDING_VERIFICATION')) {
      status = 'PENDING_VERIFICATION';
      reason = `A scan with a missing ${openEntry ? 'exit' : 'entry'} time could overlap this class; presence cannot be confirmed without verification`;
    } else {
      reason += ' (incomplete scan ignored per policy)';
    }
  }
  return { status, reason, attMin, schedMin, pctV };
}

export const AttendancePolicyPage: React.FC = () => {
  const toast = useToast();
  const { data: policy, loading, error, reload, setData } = useApi<Policy>('/attendance/policy');
  // Draft edits are tied to the policy they were made against; a newly loaded/saved policy resets the form.
  const [draft, setDraft] = useState<{ stamp: string; form: PolicyForm } | null>(null);
  const stamp = policy ? JSON.stringify(policy) : '';
  const form: PolicyForm | null = policy ? (draft && draft.stamp === stamp ? draft.form : toForm(policy)) : null;
  const setForm = (next: PolicyForm | ((f: PolicyForm | null) => PolicyForm | null)) => {
    const value = typeof next === 'function' ? next(form) : next;
    if (value) setDraft({ stamp, form: value });
  };
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [recalc, setRecalc] = useState<RecalcStats | null | undefined>(undefined);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [ex, setEx] = useState({ start: '09:00', end: '10:00', entry: '09:10', exit: '10:00' });

  const num = (s: string, d = 0) => (s.trim() === '' || isNaN(Number(s)) ? d : Number(s));
  const example = useMemo(() => {
    if (!form) return null;
    return evaluateExample(ex, {
      grace: num(form.late_arrival_grace_minutes),
      present: num(form.present_min_percent),
      partial: num(form.partial_min_percent),
      minReq: form.min_required_minutes.trim() === '' ? null : num(form.min_required_minutes),
      missingExit: form.missing_exit_policy,
      missingEntry: form.missing_entry_policy,
    });
  }, [form, ex]);

  const dirty = !!(form && policy && JSON.stringify(form) !== JSON.stringify(toForm(policy)));

  const validate = (): string | null => {
    if (!form) return 'Form not loaded';
    const pcts: [string, string][] = [['Minimum attendance', form.minimum_percentage], ['Present threshold', form.present_min_percent], ['Partial threshold', form.partial_min_percent]];
    for (const [l, v] of pcts) {
      const n = Number(v);
      if (v.trim() === '' || isNaN(n) || n < 0 || n > 100) return `${l} must be between 0 and 100.`;
    }
    const g = Number(form.late_arrival_grace_minutes);
    if (form.late_arrival_grace_minutes.trim() === '' || isNaN(g) || g < 0 || g > 180) return 'Grace period must be between 0 and 180 minutes.';
    if (Number(form.partial_min_percent) > Number(form.present_min_percent)) return 'The partial threshold cannot be higher than the present threshold.';
    if (form.min_required_minutes.trim() !== '' && (isNaN(Number(form.min_required_minutes)) || Number(form.min_required_minutes) < 0)) return 'Minimum required minutes must be 0 or more (or empty).';
    if (!form.college_timezone.trim()) return 'Timezone is required.';
    return null;
  };

  const askSave = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    setFormErr(v);
    if (!v) setConfirmSave(true);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await ApiClient.put<Policy & { recalculation: RecalcStats | null }>('/attendance/policy', {
        minimum_percentage: Number(form.minimum_percentage),
        late_arrival_grace_minutes: Math.round(Number(form.late_arrival_grace_minutes)),
        present_min_percent: Number(form.present_min_percent),
        partial_min_percent: Number(form.partial_min_percent),
        min_required_minutes: form.min_required_minutes.trim() === '' ? null : Math.round(Number(form.min_required_minutes)),
        clear_min_required_minutes: form.min_required_minutes.trim() === '',
        missing_exit_policy: form.missing_exit_policy,
        missing_entry_policy: form.missing_entry_policy,
        count_late_as_attended: form.count_late_as_attended,
        count_partial_as_attended: form.count_partial_as_attended,
        tracking_start_date: form.tracking_start_date || null,
        clear_tracking_start_date: !form.tracking_start_date,
        college_timezone: form.college_timezone.trim(),
        recalculate: true,
      });
      const { recalculation, ...p } = res;
      setData(p);
      setRecalc(recalculation);
      setConfirmSave(false);
      toast.success(`Policy saved (version ${p.version})`, recalculation ? recalcText(recalculation) : 'No values changed.');
    } catch (e) {
      setConfirmSave(false);
      setFormErr(errorMessage(e));
      toast.error('Could not save policy', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof PolicyForm>(k: K, v: PolicyForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance"
        title="Attendance policy"
        description="Rules used to turn RFID presence intervals into per-class statuses and percentages. Saving a change creates a new policy version and recalculates attendance."
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !form || !policy ? (
        <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-96 lg:col-span-2 rounded-xl" /><Skeleton className="h-96 rounded-xl" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3 items-start">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Global policy</CardTitle>
                <span className="text-xs text-slate-500">Version <strong className="text-slate-800">{policy.version}</strong>{policy.updated_at ? ` · updated ${formatDateTime(policy.updated_at + (policy.updated_at.endsWith('Z') ? '' : 'Z'))}` : ''}</span>
              </div>
              <CardDescription>Subject-specific overrides below take precedence for that subject.</CardDescription>
            </CardHeader>
            <form onSubmit={askSave} className="space-y-6">
              {formErr && <InlineAlert tone="danger">{formErr}</InlineAlert>}
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 sm:col-span-2">Class status thresholds</legend>
                <Input label="Present — minimum % of class duration" type="number" step="0.5" min={0} max={100} required value={form.present_min_percent} onChange={(e) => set('present_min_percent', e.target.value)} helperText="At or above this share → Present (or Late)." />
                <Input label="Partial — minimum % of class duration" type="number" step="0.5" min={0} max={100} required value={form.partial_min_percent} onChange={(e) => set('partial_min_percent', e.target.value)} helperText="Between this and the present threshold → Partial; below → Absent." />
                <Input label="Late-arrival grace period (minutes)" type="number" min={0} max={180} required value={form.late_arrival_grace_minutes} onChange={(e) => set('late_arrival_grace_minutes', e.target.value)} helperText="First presence after start + grace → Late." />
                <div className="space-y-1">
                  <Input label="Minimum required minutes (optional)" type="number" min={0} value={form.min_required_minutes} onChange={(e) => set('min_required_minutes', e.target.value)} placeholder="Not set" helperText="Additional absolute minimum for Present/Late." />
                  {form.min_required_minutes !== '' && <Button type="button" variant="link" size="sm" onClick={() => set('min_required_minutes', '')}>Clear</Button>}
                </div>
              </fieldset>

              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 sm:col-span-2">Incomplete RFID scans</legend>
                <Select label="Entry recorded but no exit" value={form.missing_exit_policy} onChange={(e) => set('missing_exit_policy', e.target.value)} options={MISSING_OPTS} />
                <Select label="Exit recorded but no entry" value={form.missing_entry_policy} onChange={(e) => set('missing_entry_policy', e.target.value)} options={MISSING_OPTS} />
                <p className="text-[11px] text-slate-500 sm:col-span-2">Missing times are never invented. A class today whose entry has no exit yet always stays pending until the day is over.</p>
              </fieldset>

              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 sm:col-span-2">Percentage calculation</legend>
                <Input label="Minimum attendance required (%)" type="number" step="0.5" min={0} max={100} required value={form.minimum_percentage} onChange={(e) => set('minimum_percentage', e.target.value)} helperText="Overall and per-subject threshold for warnings." />
                <div className="space-y-3 pt-5">
                  <Checkbox label="Count Late as attended" checked={form.count_late_as_attended} onChange={(v) => set('count_late_as_attended', v)} />
                  <Checkbox label="Count Partial as attended" checked={form.count_partial_as_attended} onChange={(v) => set('count_partial_as_attended', v)} />
                </div>
              </fieldset>

              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 sm:col-span-2">Evaluation window</legend>
                <div className="space-y-1">
                  <Input label="Tracking start date (optional)" type="date" value={form.tracking_start_date} onChange={(e) => set('tracking_start_date', e.target.value)} helperText="Empty = start from the first date that has RFID evidence. Classes before this date are not evaluated." />
                  {form.tracking_start_date && <Button type="button" variant="link" size="sm" onClick={() => set('tracking_start_date', '')}>Clear</Button>}
                </div>
                <div>
                  <Input label="College timezone" list="tz-list" required value={form.college_timezone} onChange={(e) => set('college_timezone', e.target.value)} helperText="IANA name, e.g. Asia/Kolkata. Decides when “today” ends." />
                  <datalist id="tz-list">{TIMEZONES.map((t) => <option key={t} value={t} />)}</datalist>
                </div>
              </fieldset>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                {dirty && <Button type="button" variant="ghost" onClick={() => { setForm(toForm(policy)); setFormErr(null); }}>Discard changes</Button>}
                <Button type="submit" leftIcon={<Save className="w-4 h-4" />} disabled={!dirty} isLoading={saving}>Save policy</Button>
              </div>
              {recalc !== undefined && (
                <InlineAlert tone="success" title="Recalculation result">{recalcText(recalc)}</InlineAlert>
              )}
            </form>
          </Card>

          <div className="space-y-6 lg:sticky lg:top-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Calculator className="w-4 h-4 text-blue-600" /> Worked example</CardTitle>
                <CardDescription>Live preview using the values in the form (not yet saved).</CardDescription>
              </CardHeader>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Class start" type="time" value={ex.start} onChange={(e) => setEx({ ...ex, start: e.target.value })} />
                <Input label="Class end" type="time" value={ex.end} onChange={(e) => setEx({ ...ex, end: e.target.value })} />
                <Input label="RFID entry" type="time" value={ex.entry} onChange={(e) => setEx({ ...ex, entry: e.target.value })} />
                <Input label="RFID exit" type="time" value={ex.exit} onChange={(e) => setEx({ ...ex, exit: e.target.value })} />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Clear entry or exit to see how incomplete scans are handled (assumes a past date).</p>
              {example && (
                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Attended</span>
                    <span className="text-sm font-semibold tabular-nums">{example.attMin} / {example.schedMin} min = {example.pctV.toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Status</span>
                    <AttendanceStatusBadge status={example.status} />
                  </div>
                  <p className="text-xs text-slate-600">{example.reason}</p>
                  <p className="text-xs text-slate-600">
                    Counts toward attendance %:{' '}
                    <strong>
                      {example.status === 'PRESENT' || (example.status === 'LATE' && form.count_late_as_attended) || (example.status === 'PARTIAL' && form.count_partial_as_attended) ? 'yes' : 'no'}
                    </strong>
                  </p>
                </div>
              )}
            </Card>
            <Card>
              <CardHeader><CardTitle>Status definitions</CardTitle></CardHeader>
              <StatusLegend compact />
            </Card>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmSave}
        title="Save policy and recalculate?"
        message="A new policy version is created and every evaluated class is recalculated with the new rules. Manual corrections are kept."
        confirmLabel="Save & recalculate"
        isLoading={saving}
        onConfirm={save}
        onClose={() => setConfirmSave(false)}
      />

      <SubjectRules globalPolicy={policy} />
      <EnrollmentExceptions />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Subject overrides
// ---------------------------------------------------------------------------

interface SubjectRule {
  subject_id: number;
  subject_code: string | null;
  late_arrival_grace_minutes: number | null;
  present_min_percent: number | null;
  partial_min_percent: number | null;
  min_required_minutes: number | null;
  minimum_percentage: number | null;
}
type RuleField = 'late_arrival_grace_minutes' | 'present_min_percent' | 'partial_min_percent' | 'min_required_minutes' | 'minimum_percentage';
const RULE_FIELDS: { key: RuleField; label: string; int?: boolean }[] = [
  { key: 'present_min_percent', label: 'Present min %' },
  { key: 'partial_min_percent', label: 'Partial min %' },
  { key: 'late_arrival_grace_minutes', label: 'Grace (min)', int: true },
  { key: 'min_required_minutes', label: 'Min minutes', int: true },
  { key: 'minimum_percentage', label: 'Required attendance %' },
];

const SubjectRules: React.FC<{ globalPolicy: Policy | null }> = ({ globalPolicy }) => {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<SubjectRule[]>('/attendance/subject-rules');
  const { subjects } = useLookups(['subjects']);
  const [edit, setEdit] = useState<{ subject_id: string; values: Record<RuleField, string>; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<SubjectRule | null>(null);

  const openEdit = (r?: SubjectRule) => {
    const values = {} as Record<RuleField, string>;
    RULE_FIELDS.forEach((f) => (values[f.key] = r && r[f.key] !== null && r[f.key] !== undefined ? String(r[f.key]) : ''));
    setEdit({ subject_id: r ? String(r.subject_id) : '', values, isNew: !r });
  };

  const save = async () => {
    if (!edit?.subject_id) {
      toast.warning('Choose a subject');
      return;
    }
    const body: Record<string, number | null> = {};
    for (const f of RULE_FIELDS) {
      const v = edit.values[f.key].trim();
      if (v !== '' && (isNaN(Number(v)) || Number(v) < 0)) {
        toast.warning('Invalid value', `${f.label} must be a non-negative number or empty.`);
        return;
      }
      body[f.key] = v === '' ? null : f.int ? Math.round(Number(v)) : Number(v);
    }
    setBusy(true);
    try {
      const res = await ApiClient.put<{ message: string }>(`/attendance/subject-rules/${edit.subject_id}`, body);
      toast.success(res.message || 'Subject rule saved', 'Attendance for this subject has been recalculated.');
      setEdit(null);
      reload();
    } catch (e) {
      toast.error('Could not save rule', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      const res = await ApiClient.delete<{ message: string }>(`/attendance/subject-rules/${del.subject_id}`);
      toast.success('Override removed', res.message);
      setDel(null);
      reload();
    } catch (e) {
      toast.error('Could not remove override', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const subjName = (id: number) => subjects.find((s) => s.id === id)?.name;
  const inherit = (k: RuleField) => {
    if (!globalPolicy) return '';
    const v = globalPolicy[k as keyof Policy];
    return v === null || v === undefined ? 'not set' : String(v);
  };
  const used = new Set((data || []).map((r) => r.subject_id));

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-600" /> Subject-specific overrides</CardTitle>
          <CardDescription>Empty values inherit the global policy. Missing-scan handling and counting rules always come from the global policy.</CardDescription>
        </div>
        <Button size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => openEdit()}>Add override</Button>
      </div>
      {error ? (
        <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
      ) : loading && !data ? (
        <TableSkeleton rows={3} cols={6} />
      ) : !data || data.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-slate-500">No overrides — every subject uses the global policy.</p>
      ) : (
        <Table>
          <thead><tr><Th>Subject</Th>{RULE_FIELDS.map((f) => <Th key={f.key} className="text-right">{f.label}</Th>)}<Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.subject_id} className="hover:bg-slate-50/70">
                <Td><span className="font-mono text-xs font-semibold text-blue-700">{r.subject_code}</span><div className="text-[11px] text-slate-500">{subjName(r.subject_id)}</div></Td>
                {RULE_FIELDS.map((f) => (
                  <Td key={f.key} className="text-right tabular-nums text-xs">
                    {r[f.key] !== null && r[f.key] !== undefined ? <strong>{r[f.key]}</strong> : <span className="text-slate-400">inherit ({inherit(f.key)})</span>}
                  </Td>
                ))}
                <Td className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" aria-label="Edit override" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Remove override" className="text-rose-600" onClick={() => setDel(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.isNew ? 'Add subject override' : 'Edit subject override'} description="Leave a field empty to inherit the global value. Saving recalculates attendance." maxWidth="lg">
        {edit && (
          <div className="space-y-4">
            <Select
              label="Subject"
              required
              disabled={!edit.isNew}
              placeholder="Select subject"
              value={edit.subject_id}
              onChange={(e) => setEdit({ ...edit, subject_id: e.target.value })}
              options={subjects.filter((s) => !edit.isNew || !used.has(s.id)).map((s) => ({ value: String(s.id), label: `${s.code} — ${s.name}` }))}
            />
            <div className="grid grid-cols-2 gap-3">
              {RULE_FIELDS.map((f) => (
                <Input key={f.key} label={f.label} type="number" min={0} step={f.int ? 1 : 0.5} placeholder={`inherit (${inherit(f.key)})`} value={edit.values[f.key]} onChange={(e) => setEdit({ ...edit, values: { ...edit.values, [f.key]: e.target.value } })} />
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="outline" onClick={() => setEdit(null)} disabled={busy}>Cancel</Button>
              <Button onClick={save} isLoading={busy}>Save override</Button>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog isOpen={!!del} danger title="Remove subject override?" message={`${del?.subject_code} will inherit the global policy and its attendance will be recalculated.`} confirmLabel="Remove" isLoading={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Enrollment exceptions
// ---------------------------------------------------------------------------

interface EnrollmentException {
  id: number;
  student_id: number;
  student_name: string | null;
  student_usn: string | null;
  subject_id: number;
  subject_code: string | null;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
}

const EnrollmentExceptions: React.FC = () => {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<EnrollmentException[]>('/attendance/enrollment-exceptions');
  const { students, subjects } = useLookups(['students', 'subjects']);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ student_id: '', subject_id: '', effective_from: '', effective_to: '' });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<EnrollmentException | null>(null);

  const add = async () => {
    if (!form.student_id || !form.subject_id) {
      toast.warning('Select a student and a subject');
      return;
    }
    if (form.effective_from && form.effective_to && form.effective_to < form.effective_from) {
      toast.warning('Invalid range', 'The end date must be on or after the start date.');
      return;
    }
    setBusy(true);
    try {
      await ApiClient.post('/attendance/enrollment-exceptions', {
        student_id: Number(form.student_id),
        subject_id: Number(form.subject_id),
        effective_from: form.effective_from || null,
        effective_to: form.effective_to || null,
      });
      toast.success('Exception added', 'The student is no longer expected in this subject for the given period.');
      setOpen(false);
      setForm({ student_id: '', subject_id: '', effective_from: '', effective_to: '' });
      reload();
    } catch (e) {
      toast.error('Could not add exception', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await ApiClient.delete(`/attendance/enrollment-exceptions/${del.id}`);
      toast.success('Exception removed', 'Attendance for this student has been recalculated.');
      setDel(null);
      reload();
    } catch (e) {
      toast.error('Could not remove exception', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><UserMinus className="w-4 h-4 text-rose-500" /> Enrollment exceptions (dropped subjects)</CardTitle>
          <CardDescription>Students are expected in every class of their section. Add an exception when a student does not take a subject.</CardDescription>
        </div>
        <Button size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setOpen(true)}>Add exception</Button>
      </div>
      {error ? (
        <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
      ) : loading && !data ? (
        <TableSkeleton rows={3} cols={5} />
      ) : !data || data.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-slate-500">No exceptions.</p>
      ) : (
        <Table>
          <thead><tr><Th>Student</Th><Th>Subject</Th><Th>Status</Th><Th>Effective</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50/70">
                <Td><div className="font-medium text-slate-900">{e.student_name}</div><div className="text-[11px] font-mono text-slate-500">{e.student_usn}</div></Td>
                <Td className="font-mono text-xs font-semibold text-blue-700">{e.subject_code}</Td>
                <Td className="text-xs">{e.status}</Td>
                <Td className="text-xs">{e.effective_from ? formatDate(e.effective_from) : 'Always'} → {e.effective_to ? formatDate(e.effective_to) : 'open-ended'}</Td>
                <Td className="text-right"><Button size="sm" variant="ghost" className="text-rose-600" aria-label="Remove exception" onClick={() => setDel(e)}><Trash2 className="w-3.5 h-3.5" /></Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add enrollment exception" description="The student will not be expected in this subject's classes during the period." maxWidth="lg">
        <div className="space-y-4">
          <SearchableSelect label="Student" required value={form.student_id} onChange={(v) => setForm({ ...form, student_id: v })} options={students.map((s) => ({ value: String(s.id), label: `${s.user?.full_name || 'Unnamed'} (${s.student_id_number})` }))} />
          <Select label="Subject" required placeholder="Select subject" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} options={subjects.map((s) => ({ value: String(s.id), label: `${s.code} — ${s.name}` }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Effective from" type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} helperText="Empty = from the start" />
            <Input label="Effective to" type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} helperText="Empty = open-ended" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={add} isLoading={busy}>Add exception</Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!del} danger title="Remove exception?" message={`${del?.student_name} will be expected in ${del?.subject_code} again and attendance will be recalculated.`} confirmLabel="Remove" isLoading={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </Card>
  );
};
