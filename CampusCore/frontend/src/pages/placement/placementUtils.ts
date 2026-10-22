/**
 * Non-component placement helpers: API types (mirroring backend/app/services/placement_service.py
 * serialisers), labels, formatting and data hooks.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiClient, ApiError } from '../../lib/api';
import { errorMessage, formatDateTime } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Company {
  id: number;
  name: string;
  logo_url: string | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  location: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | string;
  recruiter_name?: string | null;
  recruiter_email?: string | null;
  recruiter_phone?: string | null;
  notes?: string | null;
  created_at?: string | null;
  drive_count?: number;
}

export interface DriveCounts {
  applications: number;
  registered: number;
  attended: number;
  shortlisted: number;
  selected: number;
  offers: number;
  placed: number;
  eligible?: number;
}

export interface Drive {
  id: number;
  company_id: number;
  company: Company | null;
  job_title: string;
  job_description: string | null;
  job_type: string;
  job_location: string | null;
  work_mode: string | null;
  ctc_min: number | null;
  ctc_max: number | null;
  ctc_text: string | null;
  required_skills: string[];
  eligible_department_ids: number[];
  eligible_departments: string[];
  eligible_course_ids: number[];
  eligible_courses: string[];
  eligible_semesters: number[];
  graduation_years: number[];
  min_cgpa: number | null;
  max_active_backlogs: number | null;
  other_requirements: string | null;
  application_open_at: string | null;
  application_deadline: string | null;
  drive_date: string | null;
  drive_time: string | null;
  venue: string | null;
  meeting_link: string | null;
  selection_process: string[];
  vacancies: number | null;
  instructions: string | null;
  contact_person: string | null;
  contact_email: string | null;
  status: string;
  effective_status: string;
  published_at: string | null;
  created_at: string | null;
  counts?: DriveCounts;
  notified_students?: number;
}

export interface EligibilityCheck {
  criterion: string;
  requirement: string;
  student_value: string | number | null;
  outcome: 'PASS' | 'FAIL' | 'MISSING' | string;
  note: string;
}

export interface Eligibility {
  status: 'ELIGIBLE' | 'INELIGIBLE' | 'INCOMPLETE_INFORMATION' | string;
  checks: EligibilityCheck[];
  has_exception: boolean;
  exception_reason: string | null;
  can_apply_by_eligibility: boolean;
  other_requirements: string | null;
}

export interface Offer {
  id: number;
  offered_ctc: number | null;
  offer_date: string | null;
  joining_date: string | null;
  status: string;
  is_placed: boolean;
  placed_confirmed_at: string | null;
  notes?: string | null;
}

export interface HistoryEntry {
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string | null;
  notes?: string | null;
  changed_by?: string | null;
}

export interface Application {
  id: number;
  drive_id: number;
  student_id: number;
  applied_at: string | null;
  application_status: string;
  registration_status: string;
  attendance_status: string;
  current_stage: string | null;
  result: string;
  result_date: string | null;
  overall_status: string;
  offer: Offer | null;
  drive: {
    job_title: string;
    company_name: string | null;
    company_logo: string | null;
    drive_date: string | null;
    effective_status: string;
    selection_process: string[];
  };
  history: HistoryEntry[];
  notes?: string | null;
  via_exception?: boolean;
  student?: {
    id: number;
    name: string | null;
    usn: string | null;
    email: string | null;
    department: string | null;
    semester: number | null;
    graduation_year: number | null;
    cgpa: number | null;
    active_backlogs: number | null;
  };
  eligibility_now?: string | Eligibility | null;
}

export interface Department {
  id: number;
  code: string;
  name: string;
}
export interface Course {
  id: number;
  code: string;
  name: string;
  department_id: number;
  total_semesters?: number;
}
export interface Semester {
  id: number;
  course_id: number;
  number: number;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const DRIVE_STATUSES = [
  'DRAFT',
  'UPCOMING',
  'APPLICATIONS_OPEN',
  'APPLICATIONS_CLOSED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export const JOB_TYPES = ['FULL_TIME', 'INTERNSHIP', 'INTERNSHIP_PPO', 'CONTRACT'] as const;
export const WORK_MODES = ['ONSITE', 'REMOTE', 'HYBRID'] as const;
export const REGISTRATION = ['PENDING', 'CONFIRMED', 'REJECTED'] as const;
export const ATTENDANCE = ['NOT_RECORDED', 'ATTENDED', 'DID_NOT_ATTEND'] as const;
export const RESULTS = ['IN_PROCESS', 'SHORTLISTED', 'SELECTED', 'REJECTED'] as const;
export const OFFER_STATUSES = ['OFFERED', 'ACCEPTED', 'DECLINED', 'REVOKED'] as const;
/** Mirrors placement_service.DEFAULT_STAGES. */
export const DEFAULT_STAGES = [
  'Application Submitted',
  'Eligibility Verified',
  'Assessment',
  'Technical Interview',
  'HR Interview',
];

const LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  INTERNSHIP: 'Internship',
  INTERNSHIP_PPO: 'Internship + PPO',
  CONTRACT: 'Contract',
  ONSITE: 'On-site',
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  NOT_RECORDED: 'Not recorded',
  ATTENDED: 'Attended',
  DID_NOT_ATTEND: 'Did not attend',
  IN_PROCESS: 'In process',
  SHORTLISTED: 'Shortlisted',
  SELECTED: 'Selected',
  OFFERED: 'Offered',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  REVOKED: 'Revoked',
  NONE: 'No offer',
  ELIGIBLE: 'Eligible',
  INELIGIBLE: 'Ineligible',
  INCOMPLETE_INFORMATION: 'Needs verification',
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  UPCOMING: 'Upcoming',
  APPLICATIONS_OPEN: 'Applications open',
  APPLICATIONS_CLOSED: 'Applications closed',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
  APPLIED: 'Applied',
  WITHDRAWN: 'Withdrawn',
};

export function label(v: string | null | undefined): string {
  if (!v) return '—';
  return LABELS[v] ?? v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: label(v) }));

/** Display a date-only ISO string ("2026-10-25") without timezone drift. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Naive ISO datetime (college local time) -> "22 Oct 2026, 10:00". */
export function fmtLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.slice(0, 19));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Audit timestamps (applied_at, changed_at, placed_confirmed_at, created_at, published_at) are stored as
 * naive UTC by the backend; mark them as UTC before formatting in the viewer's locale.
 */
export function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return '—';
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso.slice(10));
  return formatDateTime(hasTz ? iso : `${iso}Z`);
}

export const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('en-IN'));

export function eligibilityStatusOf(e: Application['eligibility_now']): string | null {
  if (!e) return null;
  return typeof e === 'string' ? e : e.status;
}

export const URL_RE = /^https?:\/\//i;
export function isEmail(v: string): boolean {
  const at = v.indexOf('@');
  return at > 0 && v.slice(at + 1).includes('.');
}

/** Debounces a value (used for search inputs that hit the API). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * GET `url` (null = idle). Loading is derived from the request key, so state is only set
 * asynchronously; the previous data stays available while a new request is in flight.
 * `extraKey` forces a refetch when it changes; `reload()` refetches the same URL.
 */
export function useApi<T>(url: string | null, extraKey: string | number = '') {
  const [nonce, setNonce] = useState(0);
  const key = url === null ? null : `${url}#${extraKey}#${nonce}`;
  const [res, setRes] = useState<{ key: string | null; data?: T; error?: string; status?: number }>({ key: null });

  useEffect(() => {
    if (url === null || key === null) return;
    let cancelled = false;
    ApiClient.get<T>(url).then(
      (data) => {
        if (!cancelled) setRes({ key, data });
      },
      (e: unknown) => {
        if (!cancelled)
          setRes((r) => ({ key, data: r.data, error: errorMessage(e), status: e instanceof ApiError ? e.status : undefined }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  const reload = useCallback(() => setNonce((x) => x + 1), []);
  const settled = res.key === key;
  return {
    data: res.data,
    /** true when `data` belongs to the current request */
    fresh: settled && !res.error,
    loading: key !== null && !settled,
    error: settled ? (res.error ?? null) : null,
    status: settled ? res.status : undefined,
    reload,
  };
}

// ---------------------------------------------------------------------------
// Drive status actions
// ---------------------------------------------------------------------------

/** Mirrors the `allowed` map in set_drive_status (keyed by the stored status). */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['CANCELLED'],
  PUBLISHED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'PUBLISHED'],
  COMPLETED: ['IN_PROGRESS'],
  CANCELLED: [],
};

export const TRANSITION_COPY: Record<string, { title: string; help: string }> = {
  IN_PROGRESS: { title: 'Mark as in progress', help: 'The drive is underway (assessments / interviews happening).' },
  COMPLETED: { title: 'Mark as completed', help: 'The selection process is finished. Results and offers can still be recorded.' },
  CANCELLED: {
    title: 'Cancel drive',
    help: 'All applicants are notified with your reason. A cancelled drive cannot be reopened or edited.',
  },
  PUBLISHED: { title: 'Move back to published', help: 'Re-open the drive as published (application window rules apply again).' },
};

export const transitionLabel = (s: string) => TRANSITION_COPY[s]?.title ?? label(s);


/** Publishes a draft drive. Throws with the backend message on failure. */
export async function publishDrive(id: number): Promise<Drive> {
  return ApiClient.post<Drive>(`/placements/drives/${id}/publish`);
}
