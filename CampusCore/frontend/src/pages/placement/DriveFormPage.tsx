import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Info, Plus, Rocket, Save, X } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { cn, errorMessage } from '../../lib/utils';
import { ErrorState, PageHeader, Skeleton } from '../../components/ui/Kit';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { TextArea } from './placementShared';
import { Company, Course, DEFAULT_STAGES, Department, Drive, isEmail, JOB_TYPES, label, opts, publishDrive, Semester, URL_RE, WORK_MODES } from './placementUtils';

interface FormState {
  company_id: string;
  job_title: string;
  job_description: string;
  job_type: string;
  job_location: string;
  work_mode: string;
  ctc_min: string;
  ctc_max: string;
  ctc_text: string;
  required_skills: string[];
  eligible_department_ids: number[];
  eligible_course_ids: number[];
  eligible_semesters: number[];
  graduation_years: number[];
  min_cgpa: string;
  max_active_backlogs: string;
  other_requirements: string;
  application_open_at: string;
  application_deadline: string;
  drive_date: string;
  drive_time: string;
  venue: string;
  meeting_link: string;
  selection_process: string[];
  vacancies: string;
  instructions: string;
  contact_person: string;
  contact_email: string;
}

const EMPTY: FormState = {
  company_id: '',
  job_title: '',
  job_description: '',
  job_type: 'FULL_TIME',
  job_location: '',
  work_mode: '',
  ctc_min: '',
  ctc_max: '',
  ctc_text: '',
  required_skills: [],
  eligible_department_ids: [],
  eligible_course_ids: [],
  eligible_semesters: [],
  graduation_years: [],
  min_cgpa: '',
  max_active_backlogs: '',
  other_requirements: '',
  application_open_at: '',
  application_deadline: '',
  drive_date: '',
  drive_time: '',
  venue: '',
  meeting_link: '',
  selection_process: [...DEFAULT_STAGES],
  vacancies: '',
  instructions: '',
  contact_person: '',
  contact_email: '',
};

type Errors = Partial<Record<keyof FormState, string>>;

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
/** Backend datetimes are naive college-local ISO strings; datetime-local wants "YYYY-MM-DDTHH:MM". */
const toLocalInput = (v: string | null) => (v ? v.slice(0, 16) : '');

function fromDrive(d: Drive): FormState {
  return {
    company_id: str(d.company_id),
    job_title: d.job_title ?? '',
    job_description: str(d.job_description),
    job_type: d.job_type || 'FULL_TIME',
    job_location: str(d.job_location),
    work_mode: str(d.work_mode),
    ctc_min: str(d.ctc_min),
    ctc_max: str(d.ctc_max),
    ctc_text: str(d.ctc_text),
    required_skills: d.required_skills ?? [],
    eligible_department_ids: d.eligible_department_ids ?? [],
    eligible_course_ids: d.eligible_course_ids ?? [],
    eligible_semesters: d.eligible_semesters ?? [],
    graduation_years: d.graduation_years ?? [],
    min_cgpa: str(d.min_cgpa),
    max_active_backlogs: str(d.max_active_backlogs),
    other_requirements: str(d.other_requirements),
    application_open_at: toLocalInput(d.application_open_at),
    application_deadline: toLocalInput(d.application_deadline),
    drive_date: str(d.drive_date),
    drive_time: d.drive_time ? d.drive_time.slice(0, 5) : '',
    venue: str(d.venue),
    meeting_link: str(d.meeting_link),
    selection_process: d.selection_process ?? [],
    vacancies: str(d.vacancies),
    instructions: str(d.instructions),
    contact_person: str(d.contact_person),
    contact_email: str(d.contact_email),
  };
}

const nowLocalInput = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function validate(f: FormState, forPublish: boolean): Errors {
  const e: Errors = {};
  if (!f.company_id) e.company_id = 'Select a company.';
  const title = f.job_title.trim();
  if (title.length < 2) e.job_title = 'Job title must be at least 2 characters.';
  else if (title.length > 200) e.job_title = 'Job title must be at most 200 characters.';

  const num = (k: keyof FormState, v: string, opts: { min?: number; max?: number; int?: boolean }) => {
    if (v.trim() === '') return null;
    const x = Number(v);
    if (!Number.isFinite(x)) {
      e[k] = 'Enter a number.';
      return null;
    }
    if (opts.int && !Number.isInteger(x)) e[k] = 'Enter a whole number.';
    else if (opts.min !== undefined && x < opts.min) e[k] = `Must be at least ${opts.min}.`;
    else if (opts.max !== undefined && x > opts.max) e[k] = `Must be at most ${opts.max}.`;
    return x;
  };
  const min = num('ctc_min', f.ctc_min, { min: 0 });
  const max = num('ctc_max', f.ctc_max, { min: 0 });
  if (min !== null && max !== null && max < min && !e.ctc_max) e.ctc_max = 'Maximum CTC cannot be lower than minimum CTC.';
  num('min_cgpa', f.min_cgpa, { min: 0, max: 10 });
  num('max_active_backlogs', f.max_active_backlogs, { min: 0, int: true });
  num('vacancies', f.vacancies, { min: 0, int: true });

  if (f.application_open_at && f.application_deadline && f.application_deadline <= f.application_open_at)
    e.application_deadline = 'The application deadline must be after the opening date.';
  if (f.application_deadline && f.drive_date && f.drive_date < f.application_deadline.slice(0, 10))
    e.drive_date = 'The drive date cannot be before the application deadline.';
  if (f.meeting_link.trim() && !URL_RE.test(f.meeting_link.trim())) e.meeting_link = 'Must start with http:// or https://';
  if (f.contact_email.trim() && !isEmail(f.contact_email.trim())) e.contact_email = 'Enter a valid e-mail address.';

  if (forPublish) {
    if (!f.job_description.trim()) e.job_description = 'A job description is required to publish.';
    if (!f.drive_date) e.drive_date = e.drive_date || 'A drive date is required to publish.';
    if (!f.application_deadline) e.application_deadline = e.application_deadline || 'An application deadline is required to publish.';
    else if (f.application_deadline < nowLocalInput() && !e.application_deadline)
      e.application_deadline = 'Cannot publish: the application deadline has already passed.';
  }
  return e;
}

function toPayload(f: FormState) {
  const s = (v: string) => (v.trim() === '' ? null : v.trim());
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  return {
    company_id: Number(f.company_id),
    job_title: f.job_title.trim(),
    job_description: s(f.job_description),
    job_type: f.job_type,
    job_location: s(f.job_location),
    work_mode: s(f.work_mode),
    ctc_min: num(f.ctc_min),
    ctc_max: num(f.ctc_max),
    ctc_text: s(f.ctc_text),
    required_skills: f.required_skills,
    eligible_department_ids: f.eligible_department_ids,
    eligible_course_ids: f.eligible_course_ids,
    eligible_semesters: f.eligible_semesters,
    graduation_years: f.graduation_years,
    min_cgpa: num(f.min_cgpa),
    max_active_backlogs: num(f.max_active_backlogs),
    other_requirements: s(f.other_requirements),
    // naive "YYYY-MM-DDTHH:MM" — the backend compares in college local time
    application_open_at: f.application_open_at || null,
    application_deadline: f.application_deadline || null,
    drive_date: f.drive_date || null,
    drive_time: f.drive_time || null,
    venue: s(f.venue),
    meeting_link: s(f.meeting_link),
    selection_process: f.selection_process.map((x) => x.trim()).filter(Boolean),
    vacancies: num(f.vacancies),
    instructions: s(f.instructions),
    contact_person: s(f.contact_person),
    contact_email: s(f.contact_email),
  };
}

export const DriveFormPage: React.FC = () => {
  const { driveId } = useParams();
  const isEdit = !!driveId;
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const location = useLocation();

  const [form, setForm] = useState<FormState>(() => ({ ...EMPTY, company_id: params.get('company_id') ?? '' }));
  const [drive, setDrive] = useState<Drive | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  // a publish failure right after creating a draft redirects here with the message in router state
  const [serverError, setServerError] = useState<string | null>(
    () => (location.state as { publishError?: string } | null)?.publishError ?? null
  );
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [c, d, co, se, dr] = await Promise.all([
          ApiClient.get<{ items: Company[] }>('/placements/companies' + qs({ limit: 500 })),
          ApiClient.get<Department[]>('/academic/departments'),
          ApiClient.get<Course[]>('/academic/courses'),
          ApiClient.get<Semester[]>('/academic/semesters'),
          isEdit ? ApiClient.get<Drive>(`/placements/drives/${driveId}`) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCompanies(c.items);
        setDepartments(d);
        setCourses(co);
        setSemesters(se);
        if (dr) {
          setDrive(dr);
          setForm(fromDrive(dr));
        }
      } catch (e) {
        if (!cancelled) setLoadError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driveId, isEdit, reloadKey]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };
  const bind = (k: keyof FormState) => ({
    name: k,
    id: `drive-${k}`,
    value: form[k] as string,
    error: errors[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(k, e.target.value as never),
  });

  const companyOptions = useMemo(
    () =>
      companies
        .filter((c) => c.status === 'ACTIVE' || String(c.id) === form.company_id)
        .map((c) => ({ value: c.id, label: c.status === 'ACTIVE' ? c.name : `${c.name} (archived)` })),
    [companies, form.company_id]
  );

  const semesterNumbers = useMemo(() => {
    const maxFromCourses = Math.max(0, ...courses.map((c) => c.total_semesters ?? 0));
    const maxFromSems = Math.max(0, ...semesters.map((s) => s.number));
    const max = Math.max(maxFromCourses, maxFromSems, ...form.eligible_semesters) || 8;
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [courses, semesters, form.eligible_semesters]);

  const visibleCourses = useMemo(
    () =>
      form.eligible_department_ids.length
        ? courses.filter((c) => form.eligible_department_ids.includes(c.department_id) || form.eligible_course_ids.includes(c.id))
        : courses,
    [courses, form.eligible_department_ids, form.eligible_course_ids]
  );

  const save = async (mode: 'draft' | 'publish') => {
    setServerError(null);
    const errs = validate(form, mode === 'publish');
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Please fix the highlighted fields');
      const first = Object.keys(errs)[0];
      document.getElementById(`drive-${first}`)?.focus();
      return;
    }
    setSaving(mode);
    let saved: Drive | null = null;
    try {
      const payload = toPayload(form);
      saved = isEdit
        ? await ApiClient.put<Drive>(`/placements/drives/${driveId}`, payload)
        : await ApiClient.post<Drive>('/placements/drives', payload);
    } catch (e) {
      setServerError(errorMessage(e));
      toast.error('Drive not saved', errorMessage(e));
      setSaving(null);
      return;
    }
    if (mode === 'publish' && saved.status === 'DRAFT') {
      try {
        const p = await publishDrive(saved.id);
        toast.success('Drive published', `${p.notified_students ?? 0} potentially eligible students notified.`);
        navigate(`/placement/drives/${saved.id}`);
      } catch (e) {
        // the draft is saved; keep the officer on its edit form so a retry doesn't create a duplicate
        setServerError(`Saved as draft, but could not publish: ${errorMessage(e)}`);
        toast.warning('Saved as draft, not published', errorMessage(e));
        if (!isEdit)
          navigate(`/placement/drives/${saved.id}/edit`, {
            replace: true,
            state: { publishError: `Saved as draft, but could not publish: ${errorMessage(e)}` },
          });
      } finally {
        setSaving(null);
      }
      return;
    }
    toast.success(isEdit ? 'Drive updated' : 'Draft saved', saved.job_title);
    setSaving(null);
    navigate(`/placement/drives/${saved.id}`);
  };

  const backTo = isEdit ? `/placement/drives/${driveId}` : '/placement/drives';
  const header = (
    <div className="mb-2">
      <Link to={backTo} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> {isEdit ? 'Back to drive' : 'All drives'}
      </Link>
      <PageHeader
        eyebrow="Placement office"
        title={isEdit ? `Edit drive${drive ? ` · ${drive.job_title}` : ''}` : 'New placement drive'}
        description="Drives are saved as drafts and only become visible to students once published."
      />
    </div>
  );

  if (loading)
    return (
      <div>
        {header}
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  if (loadError)
    return (
      <div>
        {header}
        <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  if (drive && ['COMPLETED', 'CANCELLED'].includes(drive.status))
    return (
      <div>
        {header}
        <EmptyState
          title={`This drive is ${label(drive.status).toLowerCase()}`}
          description={`A ${drive.status.toLowerCase()} drive cannot be edited.`}
          action={<Button onClick={() => navigate(backTo)}>Back to drive</Button>}
        />
      </div>
    );
  if (!isEdit && companyOptions.length === 0)
    return (
      <div>
        {header}
        <EmptyState
          title="No active companies"
          description="A drive belongs to a company. Add (or restore) a company before creating a drive."
          action={
            <Button onClick={() => navigate('/placement/companies?new=1')} leftIcon={<Plus className="w-4 h-4" />}>
              Add your first company
            </Button>
          }
        />
      </div>
    );

  const isDraft = !drive || drive.status === 'DRAFT';

  return (
    <div>
      {header}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save('draft');
        }}
        className="space-y-5"
      >
        {serverError && <ErrorState title="The server rejected this drive" message={serverError} />}

        <Card>
          <CardHeader>
            <CardTitle>Role</CardTitle>
            <CardDescription>What the company is hiring for.</CardDescription>
          </CardHeader>
          <div className="grid md:grid-cols-2 gap-4">
            <Select {...bind('company_id')} label="Company" required options={companyOptions} placeholder="Select a company" />
            <Input {...bind('job_title')} label="Job title" required maxLength={200} placeholder="e.g. Graduate Engineer Trainee" />
            <Select {...bind('job_type')} label="Job type" options={opts(JOB_TYPES)} />
            <Select {...bind('work_mode')} label="Work mode" options={opts(WORK_MODES)} placeholder="Not specified" />
            <Input {...bind('job_location')} label="Job location" />
            <Input {...bind('vacancies')} label="Vacancies" type="number" min={0} step={1} helperText="Leave empty if not disclosed." />
          </div>
          <div className="mt-4">
            <TextArea
              {...bind('job_description')}
              label="Job description"
              rows={5}
              helperText="Required before the drive can be published."
            />
          </div>
          <div className="mt-4">
            <TagInput
              id="drive-required_skills"
              label="Required skills"
              values={form.required_skills}
              onChange={(v) => set('required_skills', v)}
              placeholder="Type a skill and press Enter"
            />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compensation</CardTitle>
            <CardDescription>Give a range in LPA, or describe it in words (the text takes precedence when shown).</CardDescription>
          </CardHeader>
          <div className="grid md:grid-cols-3 gap-4">
            <Input {...bind('ctc_min')} label="CTC min (LPA)" type="number" min={0} step="0.01" />
            <Input {...bind('ctc_max')} label="CTC max (LPA)" type="number" min={0} step="0.01" />
            <Input {...bind('ctc_text')} label="CTC as text" placeholder="e.g. ₹6 LPA + joining bonus" />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eligibility criteria</CardTitle>
            <CardDescription>Students are checked against these rules automatically.</CardDescription>
          </CardHeader>
          <div className="mb-4 flex gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Leave a criterion empty for <strong>no restriction</strong>. When a rule is set but a student's profile is missing
              that value (e.g. CGPA not recorded), the student is shown as <strong>needs verification</strong>, not ineligible —
              you can review them in the Eligibility tab and grant an exception.
            </p>
          </div>
          <div className="space-y-5">
            <ChipMulti
              label="Eligible departments"
              hint="None selected = all departments"
              options={departments.map((d) => ({ value: d.id, label: d.code, title: d.name }))}
              values={form.eligible_department_ids}
              onChange={(v) => set('eligible_department_ids', v)}
            />
            <ChipMulti
              label="Eligible branches / programmes"
              hint={
                form.eligible_department_ids.length
                  ? 'Showing programmes of the selected departments. None selected = all.'
                  : 'None selected = all programmes'
              }
              options={visibleCourses.map((c) => ({ value: c.id, label: c.code, title: c.name }))}
              values={form.eligible_course_ids}
              onChange={(v) => set('eligible_course_ids', v)}
            />
            <ChipMulti
              label="Eligible semesters"
              hint="None selected = any semester"
              options={semesterNumbers.map((s) => ({ value: s, label: `Sem ${s}` }))}
              values={form.eligible_semesters}
              onChange={(v) => set('eligible_semesters', v)}
            />
            <YearInput values={form.graduation_years} onChange={(v) => set('graduation_years', v)} />
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                {...bind('min_cgpa')}
                label="Minimum CGPA"
                type="number"
                min={0}
                max={10}
                step="0.01"
                helperText="0–10. Empty = no CGPA rule."
              />
              <Input
                {...bind('max_active_backlogs')}
                label="Maximum active backlogs"
                type="number"
                min={0}
                step={1}
                helperText="Empty = no backlog rule. 0 = no active backlogs allowed."
              />
            </div>
            <TextArea
              {...bind('other_requirements')}
              label="Other requirements"
              helperText="Shown to students; not checked automatically."
            />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>All times are in college local time.</CardDescription>
          </CardHeader>
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              {...bind('application_open_at')}
              label="Applications open"
              type="datetime-local"
              helperText="Empty = open as soon as the drive is published."
            />
            <Input
              {...bind('application_deadline')}
              label="Application deadline"
              type="datetime-local"
              helperText="Must be after the opening time, and in the future to publish."
            />
            <Input {...bind('drive_date')} label="Drive date" type="date" helperText="Cannot be before the deadline date." />
            <Input {...bind('drive_time')} label="Drive time" type="time" />
            <Input {...bind('venue')} label="Venue" />
            <Input {...bind('meeting_link')} label="Meeting link" type="url" placeholder="https://" />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Selection process</CardTitle>
            <CardDescription>
              Ordered rounds. The standard stages ({DEFAULT_STAGES.join(', ')}) are always available when updating applicants;
              custom stages added here are offered too.
            </CardDescription>
          </CardHeader>
          <StageEditor values={form.selection_process} onChange={(v) => set('selection_process', v)} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instructions & contact</CardTitle>
          </CardHeader>
          <TextArea {...bind('instructions')} label="Instructions for students" rows={4} />
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <Input {...bind('contact_person')} label="Contact person" />
            <Input {...bind('contact_email')} label="Contact e-mail" type="email" />
          </div>
        </Card>

        <div className="sticky bottom-0 z-20 -mx-1 rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg shadow-slate-900/5">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-xs text-slate-500 hidden sm:block">
              {isDraft ? 'Drafts are not visible to students.' : `This drive is ${label(drive?.effective_status).toLowerCase()}; changes apply immediately.`}
            </p>
            <Button type="button" variant="outline" onClick={() => navigate(backTo)} disabled={!!saving}>
              Cancel
            </Button>
            <Button type="submit" variant={isDraft ? 'outline' : 'primary'} isLoading={saving === 'draft'} disabled={!!saving} leftIcon={<Save className="w-4 h-4" />}>
              {isDraft ? 'Save as draft' : 'Save changes'}
            </Button>
            {isDraft && (
              <Button type="button" onClick={() => save('publish')} isLoading={saving === 'publish'} disabled={!!saving} leftIcon={<Rocket className="w-4 h-4" />}>
                Save & publish
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const TagInput: React.FC<{
  id: string;
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}> = ({ id, label: lbl, values, onChange, placeholder }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));
    if (parts.length) onChange([...values, ...parts]);
    setDraft('');
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {lbl}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-600">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-100 px-2 py-0.5 text-xs text-blue-800">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-blue-500 hover:text-blue-800"
              aria-label={`Remove ${v}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={add}
          placeholder={values.length ? '' : placeholder}
          className="flex-1 min-w-[10rem] border-0 bg-transparent py-0.5 text-sm focus:outline-none placeholder:text-slate-400"
        />
      </div>
      <p className="text-xs text-slate-500">Press Enter or comma to add.</p>
    </div>
  );
};

const ChipMulti: React.FC<{
  label: string;
  hint?: string;
  options: { value: number; label: string; title?: string }[];
  values: number[];
  onChange: (v: number[]) => void;
}> = ({ label: lbl, hint, options, values, onChange }) => (
  <fieldset>
    <legend className="text-xs font-medium text-slate-700">{lbl}</legend>
    {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
    {options.length === 0 ? (
      <p className="text-xs text-slate-400">No options configured in Academic Administration.</p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              title={o.title}
              onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30',
                on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    )}
  </fieldset>
);

const YearInput: React.FC<{ values: number[]; onChange: (v: number[]) => void }> = ({ values, onChange }) => {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [thisYear] = useState(() => new Date().getFullYear());
  const quick = [thisYear, thisYear + 1, thisYear + 2];
  const add = (y: number) => {
    if (!values.includes(y)) onChange([...values, y].sort((a, b) => a - b));
  };
  const submit = () => {
    if (!draft.trim()) return;
    const y = Number(draft);
    if (!Number.isInteger(y) || y < 1990 || y > 2100) {
      setErr('Enter a 4-digit year.');
      return;
    }
    setErr(null);
    add(y);
    setDraft('');
  };
  return (
    <fieldset>
      <legend className="text-xs font-medium text-slate-700">Graduation years</legend>
      <p className="text-xs text-slate-500 mb-2">None = any graduation year</p>
      <div className="flex flex-wrap items-center gap-2">
        {values.map((y) => (
          <span key={y} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
            {y}
            <button type="button" onClick={() => onChange(values.filter((v) => v !== y))} aria-label={`Remove ${y}`}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {quick
          .filter((y) => !values.includes(y))
          .map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => add(y)}
              className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-400"
            >
              + {y}
            </button>
          ))}
        <input
          aria-label="Add graduation year"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Other year"
          className="h-8 w-28 rounded-lg border border-slate-300 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <Button type="button" size="sm" variant="ghost" onClick={submit}>
          Add
        </Button>
      </div>
      {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
    </fieldset>
  );
};

const StageEditor: React.FC<{ values: string[]; onChange: (v: string[]) => void }> = ({ values, onChange }) => {
  const [draft, setDraft] = useState('');
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    const s = draft.trim();
    if (!s || values.includes(s)) return;
    onChange([...values, s]);
    setDraft('');
  };
  const suggestions = ['Pre-placement Talk', 'Aptitude Test', 'Coding Round', 'Group Discussion', 'Managerial Interview'].filter(
    (s) => !values.includes(s)
  );
  return (
    <div className="space-y-3">
      {values.length === 0 ? (
        <p className="text-xs text-slate-500">No rounds listed. Only the standard stages will be available.</p>
      ) : (
        <ol className="space-y-1.5">
          {values.map((s, i) => (
            <li key={`${s}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <input
                aria-label={`Stage ${i + 1} name`}
                value={s}
                onChange={(e) => onChange(values.map((v, k) => (k === i ? e.target.value : v)))}
                className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === values.length - 1} aria-label="Move down">
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(values.filter((_, k) => k !== i))} aria-label={`Remove ${s}`}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          aria-label="New stage name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a round, e.g. Coding Round"
          className="h-9.5 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
        />
        <Button type="button" variant="outline" onClick={add} leftIcon={<Plus className="w-4 h-4" />}>
          Add round
        </Button>
        <Button type="button" variant="ghost" onClick={() => onChange([...DEFAULT_STAGES])}>
          Reset to defaults
        </Button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] text-slate-500">Common rounds:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...values, s])}
              className="rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-400"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
