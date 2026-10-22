/**
 * Types and pure helpers for the student placement pages. Shapes mirror
 * backend/app/services/placement_service.py (drive_to_dict, application_to_dict, evaluate_eligibility)
 * and the "Student" section of backend/app/api/v1/endpoints/placements.py.
 */

export type CheckOutcome = 'PASS' | 'FAIL' | 'MISSING';
export type EligibilityStatus = 'ELIGIBLE' | 'INELIGIBLE' | 'INCOMPLETE_INFORMATION';

export interface EligibilityCheck {
  criterion: string;
  requirement: string;
  student_value: string | number | null;
  outcome: CheckOutcome;
  note: string;
}

export interface Eligibility {
  status: EligibilityStatus;
  checks: EligibilityCheck[];
  has_exception: boolean;
  exception_reason: string | null;
  can_apply_by_eligibility: boolean;
  other_requirements: string | null;
}

export interface CompanyInfo {
  id: number;
  name: string;
  logo_url: string | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  location: string | null;
  status: string;
}

export interface Offer {
  id: number;
  offered_ctc: number | null;
  offer_date: string | null;
  joining_date: string | null;
  status: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';
  is_placed: boolean;
  placed_confirmed_at: string | null;
}

export interface HistoryEntry {
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string | null;
}

export interface Application {
  id: number;
  drive_id: number;
  student_id: number;
  applied_at: string | null;
  application_status: 'APPLIED' | 'WITHDRAWN';
  registration_status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  attendance_status: 'NOT_RECORDED' | 'ATTENDED' | 'DID_NOT_ATTEND';
  current_stage: string | null;
  result: 'IN_PROCESS' | 'SHORTLISTED' | 'SELECTED' | 'REJECTED';
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
  /** only on /student/history */
  academic_year?: string | null;
}

export interface StudentDrive {
  id: number;
  company_id: number;
  company: CompanyInfo | null;
  job_title: string;
  job_description: string | null;
  job_type: string | null;
  job_location: string | null;
  work_mode: string | null;
  ctc_min: number | null;
  ctc_max: number | null;
  ctc_text: string | null;
  required_skills: string[];
  eligible_departments: string[];
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
  eligibility: Eligibility;
  my_application: Application | null;
  can_apply: boolean;
  apply_blocker: string | null;
}

export interface StudentOverview {
  counts: {
    upcoming_drives: number;
    open_applications: number;
    applications_submitted: number;
    drives_attended: number;
    shortlisted: number;
    selections: number;
    companies_selected: number;
    offers_received: number;
    offers_accepted: number;
    confirmed_placements: number;
  };
  open_drives: StudentDrive[];
  recent_applications: Application[];
  profile: {
    graduation_year: number | null;
    cgpa: number | null;
    active_backlogs: number | null;
    department: string | null;
    missing_fields: string[];
  };
}

// ----------------------------------------------------------------------------
// Labels
// ----------------------------------------------------------------------------

export const WORK_MODE_LABEL: Record<string, string> = { ONSITE: 'On-site', REMOTE: 'Remote', HYBRID: 'Hybrid' };
export const JOB_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: 'Full-time',
  INTERNSHIP: 'Internship',
  INTERNSHIP_PPO: 'Internship + PPO',
  CONTRACT: 'Contract',
};
export const REGISTRATION_LABEL: Record<string, string> = {
  PENDING: 'Pending confirmation',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
};
export const ATTENDANCE_LABEL: Record<string, string> = {
  NOT_RECORDED: 'Not recorded',
  ATTENDED: 'Attended',
  DID_NOT_ATTEND: 'Did not attend',
};
export const RESULT_LABEL: Record<string, string> = {
  IN_PROCESS: 'In process',
  SHORTLISTED: 'Shortlisted',
  SELECTED: 'Selected',
  REJECTED: 'Not selected',
};
export const OFFER_STATUS_LABEL: Record<string, string> = {
  OFFERED: 'Offer received',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  REVOKED: 'Revoked',
};
export const APPLICATION_LABEL: Record<string, string> = { APPLIED: 'Applied', WITHDRAWN: 'Withdrawn' };

/** All overall_status labels produced by placement_service.overall_label. */
export const OVERALL_STATUSES = [
  'Applied',
  'Registration Confirmed',
  'Registration Rejected',
  'Attended',
  'Did Not Attend',
  'Shortlisted',
  'Selected',
  'Rejected',
  'Offer Received',
  'Offer Accepted',
  'Offer Declined',
  'Placed',
  'Withdrawn',
];

const FIELD_LABEL: Record<string, string> = {
  application: 'Application',
  registration: 'Registration',
  attendance: 'Drive attendance',
  stage: 'Selection stage',
  result: 'Result',
  offer: 'Offer',
};

const FIELD_VALUE_LABELS: Record<string, Record<string, string>> = {
  application: APPLICATION_LABEL,
  registration: REGISTRATION_LABEL,
  attendance: ATTENDANCE_LABEL,
  result: RESULT_LABEL,
  offer: OFFER_STATUS_LABEL,
};

export function historyFieldLabel(field: string): string {
  return FIELD_LABEL[field] || field;
}

export function historyValueLabel(field: string, value: string | null): string {
  if (value === null || value === '') return '—';
  return FIELD_VALUE_LABELS[field]?.[value] || value;
}

// ----------------------------------------------------------------------------
// Dates
// ----------------------------------------------------------------------------

/** Timestamps produced with datetime.utcnow() are serialised without a zone; treat them as UTC. */
export function parseUtc(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso.slice(10));
  const d = new Date(iso.length > 10 && !hasZone ? `${iso}Z` : iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Drive windows (open/deadline) are stored in college local time; parse as local. */
export function parseLocal(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "Closes in 3 days" / "Closes today" / "Closed" for an application deadline. */
export function deadlineHint(deadline: string | null): { text: string; urgent: boolean } | null {
  const d = parseLocal(deadline);
  if (!d) return null;
  const ms = d.getTime() - Date.now();
  if (ms < 0) return { text: 'Closed', urgent: false };
  const hours = ms / 36e5;
  if (hours < 24) return { text: hours < 1 ? 'Closes within an hour' : `Closes in ${Math.floor(hours)} h`, urgent: true };
  const days = Math.ceil(hours / 24);
  return { text: `Closes in ${days} day${days === 1 ? '' : 's'}`, urgent: days <= 2 };
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

export function formatOfferCtc(ctc: number | null | undefined): string {
  return ctc == null ? '—' : `₹${ctc} LPA`;
}

/** Withdraw is allowed while the window is open and the placement office has not processed it. */
export function canWithdraw(a: Application | null | undefined): boolean {
  return (
    !!a &&
    a.application_status === 'APPLIED' &&
    a.registration_status === 'PENDING' &&
    a.result === 'IN_PROCESS' &&
    a.drive.effective_status === 'APPLICATIONS_OPEN'
  );
}
