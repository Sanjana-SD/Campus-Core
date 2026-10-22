/**
 * Types, constants and data hooks shared by the admin attendance / integration / timetable pages.
 * Shapes mirror the FastAPI responses (attendance.py, integrations.py, timetable.py, reports.py).
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiClient } from '../../lib/api';
import { errorMessage } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Backend shapes
// ---------------------------------------------------------------------------

export interface SyncRun {
  id: number;
  trigger: string;
  transport: string | null;
  spreadsheet_id: string | null;
  worksheet_gid: string | null;
  worksheet_title: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | string;
  error_code: string | null;
  error_message: string | null;
  headers_detected: string[] | null;
  column_mapping: Record<string, string> | null;
  rows_read: number | null;
  imported: number | null;
  updated: number | null;
  unchanged: number | null;
  rejected: number | null;
  removed: number | null;
  retry_of_id: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface IntegrationStatus {
  spreadsheet_id: string;
  worksheet_gid: string;
  spreadsheet_url: string;
  configured_transport: string | null;
  credentials_configured: boolean;
  service_account_email: string | null;
  webhook_enabled: boolean;
  webhook_endpoint: string;
  connection_status: 'NOT_TESTED' | 'CONNECTED' | 'ERROR' | string;
  last_attempt: SyncRun | null;
  last_sync: SyncRun | null;
  last_successful_sync: SyncRun | null;
  last_error: SyncRun | null;
  counts: {
    records_imported: number;
    records_removed_from_sheet: number;
    matched_student_rows: number;
    staff_rows: number;
    unmatched_rows: number;
    unmatched_uids: number;
    conflict_rows: number;
    incomplete_rows: number;
    invalid_rows: number;
  };
  date_order: string;
}

export interface SyncResponse {
  success: boolean;
  message: string | null;
  error_code: string | null;
  run: SyncRun;
  recalculation?: Record<string, unknown> | null;
  summary: { rows_read: number; imported: number; updated: number; unchanged: number; rejected: number; removed: number };
}

export interface Interval {
  entry: string | null;
  exit: string | null;
  row_id: number | null;
}

export interface AttendanceRecord {
  id: number;
  student_id: number;
  session_id: number;
  date: string;
  subject_id: number;
  subject_code: string | null;
  subject_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  scheduled_minutes: number | null;
  first_entry: string | null;
  last_exit: string | null;
  intervals: Interval[];
  attended_minutes: number | null;
  duration_percent: number | null;
  computed_status: string;
  final_status: string;
  status_reason: string | null;
  source_row_ids: number[];
  is_overridden: boolean;
  override_status: string | null;
  override_reason: string | null;
  override_stale: boolean;
  policy_version: number | null;
  calculated_at: string | null;
  room_number: string | null;
  lecturer_name: string | null;
  session_status: string | null;
  student_name?: string | null;
  student_usn?: string | null;
  student_uid?: string | null;
}

export interface SheetRow {
  id: number;
  row_number: number | null;
  uid: string | null;
  uid_normalized: string | null;
  name: string | null;
  role: string | null;
  date: string | null;
  entry_time: string | null;
  exit_time: string | null;
  original_status: string | null;
  extra: Record<string, unknown> | null;
  parsed_date: string | null;
  parsed_entry: string | null;
  parsed_exit: string | null;
  role_category: string;
  validity: 'VALID' | 'INCOMPLETE' | 'INVALID' | string;
  issues: string[];
  match_status: string;
  match_note: string | null;
  student_id: number | null;
  student_name: string | null;
  student_usn: string | null;
  lecturer_id: number | null;
  lecturer_name: string | null;
  missing_from_source: boolean;
  ingestion_method: string | null;
  first_seen_at: string | null;
  last_changed_at: string | null;
  calculated_statuses: string[];
}

export interface Policy {
  id: number;
  minimum_percentage: number;
  late_arrival_grace_minutes: number;
  college_timezone: string;
  present_min_percent: number;
  partial_min_percent: number;
  min_required_minutes: number | null;
  missing_exit_policy: string;
  missing_entry_policy: string;
  count_late_as_attended: boolean;
  count_partial_as_attended: boolean;
  tracking_start_date: string | null;
  version: number;
  updated_at: string | null;
}

export interface Aggregate {
  total_sessions: number;
  classes_held: number;
  present: number;
  late: number;
  partial: number;
  absent: number;
  pending: number;
  excused: number;
  cancelled: number;
  attended: number;
  missed: number;
  percentage: number | null;
}

export interface RecalcStats {
  evaluated?: number;
  created?: number;
  updated?: number;
  removed?: number;
  sessions_created?: number;
  message?: string;
  range?: { start: string; end: string };
}

export interface ClassSessionItem {
  id: number;
  schedule_id: number | null;
  date: string;
  start_time: string;
  end_time: string;
  subject_id: number;
  subject_code: string | null;
  subject_name: string | null;
  lecturer_id: number | null;
  lecturer_name: string | null;
  section_id: number | null;
  section: string | null;
  room_number: string | null;
  status: string;
  cancel_reason: string | null;
  counts: Record<string, number>;
}

export interface Dispute {
  id: number;
  record_id: number;
  student_id: number;
  message: string;
  status: string;
  resolution_note: string | null;
  created_at: string | null;
  resolved_at: string | null;
  date: string | null;
  subject_code: string | null;
  final_status: string | null;
  student_name: string | null;
  student_usn: string | null;
}

export interface Paged<T> {
  total: number;
  items: T[];
}

// Lookup entities (academic + people)
export interface Department { id: number; code: string; name: string }
export interface Subject { id: number; code: string; name: string; department_id: number; semester_id?: number | null }
export interface SectionRaw { id: number; semester_id: number; name: string }
export interface Section extends SectionRaw { label: string }
export interface AcademicYear { id: number; name: string; is_current: boolean }
export interface Lecturer { id: number; employee_id: string; rfid_uid: string | null; department_id: number; user?: { full_name: string } | null }
export interface Student {
  id: number;
  student_id_number: string;
  rfid_uid: string | null;
  section_id: number | null;
  user?: { full_name: string } | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CORRECTABLE_STATUSES = ['PRESENT', 'LATE', 'PARTIAL', 'ABSENT', 'EXCUSED'] as const;
export const ALL_STATUSES = ['PRESENT', 'LATE', 'PARTIAL', 'ABSENT', 'PENDING_VERIFICATION', 'EXCUSED', 'CANCELLED'] as const;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Human-readable definitions, mirroring the docstring of backend attendance_engine.py. */
export const STATUS_DEFINITIONS: Record<string, string> = {
  PRESENT: 'Present for at least the "present" share of the scheduled class (and the minimum minutes, if set), first seen within the grace period.',
  LATE: 'Meets the "present" duration, but first presence in class was after start time + grace period.',
  PARTIAL: 'Some presence, at least the "partial" share of the class but below the "present" share.',
  ABSENT: 'No recorded presence during the class, or presence below the partial threshold.',
  PENDING_VERIFICATION: 'An RFID scan with a missing entry or exit could overlap the class. It is never counted as attended until verified or corrected.',
  EXCUSED: 'Set manually by an administrator/lecturer. Excluded from the percentage calculation.',
  CANCELLED: 'The class was cancelled (e.g. holiday). Excluded from the percentage calculation.',
};

/** Error codes that mean the Google Sheet cannot be read until an administrator fixes the setup. */
export const SETUP_ERROR_CODES = [
  'NOT_CONFIGURED', 'PERMISSION_DENIED', 'API_DISABLED', 'CREDENTIALS_INVALID', 'CREDENTIALS_FILE_MISSING',
  'WORKSHEET_NOT_FOUND', 'HEADERS_MISSING', 'SPREADSHEET_NOT_FOUND', 'SHEET_PRIVATE',
];

export function isSetupError(code: string | null | undefined): boolean {
  if (!code) return false;
  return SETUP_ERROR_CODES.includes(code) || code.startsWith('CREDENTIALS_');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function sectionLabels(
  sections: SectionRaw[],
  semesters: { id: number; course_id: number; number: number }[],
  courses: { id: number; code: string }[]
): Section[] {
  const sem = new Map(semesters.map((s) => [s.id, s]));
  const crs = new Map(courses.map((c) => [c.id, c]));
  return sections.map((s) => {
    const se = sem.get(s.semester_id);
    const co = se ? crs.get(se.course_id) : undefined;
    return { ...s, label: `${co?.code ?? ''} Sem ${se?.number ?? '?'} - ${s.name}`.trim() };
  });
}

/** Minutes between two "HH:MM" strings (end - start). */
export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export function toSecs(t: string): number {
  const [h, m, s] = t.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

/** Monday of the week containing `iso` (local date). */
export function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return localISO(d);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localISO(d);
}

function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function recalcText(s: RecalcStats | null | undefined): string {
  if (!s) return 'No recalculation was needed.';
  if (s.message) return s.message;
  return `${s.evaluated ?? 0} class records evaluated (${s.created ?? 0} created, ${s.updated ?? 0} changed, ${s.removed ?? 0} removed)` +
    (s.range ? ` for ${s.range.start} → ${s.range.end}.` : '.');
}

export function personName(p: { user?: { full_name: string } | null } | null | undefined, fallback = '—'): string {
  return p?.user?.full_name || fallback;
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

/**
 * Generic GET loader with loading / error / reload. `loading` is derived (true until the response for
 * the current endpoint+reload tick has arrived); the previous data stays visible while refreshing.
 */
export function useApi<T>(endpoint: string | null) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null });
  const key = endpoint ? `${endpoint}#${tick}` : null;

  useEffect(() => {
    if (!endpoint || !key) return;
    let alive = true;
    ApiClient.get<T>(endpoint)
      .then((d) => {
        if (alive) setState({ key, data: d, error: null });
      })
      .catch((e) => {
        if (alive) setState((s) => ({ key, data: s.data, error: errorMessage(e) }));
      });
    return () => {
      alive = false;
    };
  }, [endpoint, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((d: T | null) => setState((s) => ({ ...s, data: d })), []);
  const loading = key !== null && state.key !== key;
  const error = state.key === key ? state.error : null;
  return { data: state.data, loading, error, reload, setData };
}

/** Page number that automatically returns to 1 whenever `resetKey` (e.g. serialized filters) changes. */
export function useResettingPage(resetKey: string): [number, (p: number) => void] {
  const [s, set] = useState({ key: resetKey, page: 1 });
  const page = s.key === resetKey ? s.page : 1;
  const setPage = useCallback((p: number) => set({ key: resetKey, page: p }), [resetKey]);
  return [page, setPage];
}

export type LookupKind = 'departments' | 'subjects' | 'sections' | 'lecturers' | 'students' | 'years';

export interface Lookups {
  departments: Department[];
  subjects: Subject[];
  sections: Section[];
  lecturers: Lecturer[];
  students: Student[];
  years: AcademicYear[];
}

/** Loads dropdown data. Failures of individual lists are reported but never replaced by sample data. */
export function useLookups(kinds: LookupKind[]) {
  const key = kinds.join(',');
  const [data, setData] = useState<Lookups>({
    departments: [], subjects: [], sections: [], lecturers: [], students: [], years: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const want = new Set(key.split(','));
    const safe = <T,>(p: Promise<T>, fallback: T, errs: string[], label: string) =>
      p.catch((e) => {
        errs.push(`${label}: ${errorMessage(e)}`);
        return fallback;
      });
    (async () => {
      const errs: string[] = [];
      const [departments, subjects, sectionsRaw, semesters, courses, lecturers, students, years] = await Promise.all([
        want.has('departments') ? safe(ApiClient.get<Department[]>('/academic/departments'), [], errs, 'departments') : [],
        want.has('subjects') ? safe(ApiClient.get<Subject[]>('/academic/subjects'), [], errs, 'subjects') : [],
        want.has('sections') ? safe(ApiClient.get<SectionRaw[]>('/academic/sections'), [], errs, 'sections') : [],
        want.has('sections') ? safe(ApiClient.get<{ id: number; course_id: number; number: number }[]>('/academic/semesters'), [], errs, 'semesters') : [],
        want.has('sections') ? safe(ApiClient.get<{ id: number; code: string }[]>('/academic/courses'), [], errs, 'courses') : [],
        want.has('lecturers') ? safe(ApiClient.get<Lecturer[]>('/lecturers?limit=500'), [], errs, 'lecturers') : [],
        want.has('students') ? safe(ApiClient.get<Student[]>('/students?limit=500'), [], errs, 'students') : [],
        want.has('years') ? safe(ApiClient.get<AcademicYear[]>('/academic/academic-years'), [], errs, 'academic years') : [],
      ]);
      if (!alive) return;
      setData({
        departments: departments || [],
        subjects: subjects || [],
        sections: sectionLabels(sectionsRaw || [], semesters || [], courses || []),
        lecturers: lecturers || [],
        students: students || [],
        years: years || [],
      });
      setError(errs.length ? `Some dropdown lists could not be loaded (${errs.join('; ')})` : null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [key]);

  return { ...data, lookupError: error, lookupsLoading: loading };
}
