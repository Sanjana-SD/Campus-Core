/**
 * Types and pure helpers for the timetable-based attendance and timetable APIs
 * (backend/app/api/v1/endpoints/attendance.py, timetable.py, services/attendance_engine.py).
 */

export type AttendanceStatus =
  | 'PRESENT'
  | 'LATE'
  | 'PARTIAL'
  | 'ABSENT'
  | 'PENDING_VERIFICATION'
  | 'EXCUSED'
  | 'CANCELLED';

/** Display order used by legends, tables and filters. */
export const STATUS_ORDER: AttendanceStatus[] = [
  'PRESENT',
  'LATE',
  'PARTIAL',
  'ABSENT',
  'PENDING_VERIFICATION',
  'EXCUSED',
  'CANCELLED',
];

/** Statuses a lecturer/admin may set through POST /attendance/records/{id}/correct. */
export const CORRECTABLE_STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'PARTIAL', 'ABSENT', 'EXCUSED'];

export interface AttendancePolicy {
  id?: number;
  minimum_percentage: number;
  late_arrival_grace_minutes: number | null;
  college_timezone?: string | null;
  present_min_percent: number;
  partial_min_percent: number;
  min_required_minutes: number | null;
  missing_exit_policy: string;
  missing_entry_policy: string;
  count_late_as_attended: boolean;
  count_partial_as_attended: boolean;
  tracking_start_date: string | null;
  version: number;
  updated_at?: string | null;
}

export interface AttendanceAggregate {
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

export interface SubjectAggregate extends AttendanceAggregate {
  subject_id: number;
  subject_code: string | null;
  subject_name: string | null;
  threshold: number;
  below_threshold: boolean;
}

export interface AttendanceInterval {
  entry: string | null;
  exit: string | null;
  row_id?: number | null;
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
  intervals: AttendanceInterval[];
  attended_minutes: number | null;
  duration_percent: number | null;
  computed_status: string;
  final_status: string;
  status_reason: string | null;
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

export interface AttendanceAlert {
  type: string;
  severity: 'danger' | 'warning' | 'info' | string;
  message: string;
}

export interface AttendanceDispute {
  id: number;
  record_id: number;
  student_id: number;
  message: string;
  status: 'OPEN' | 'RESOLVED' | 'REJECTED' | string;
  resolution_note: string | null;
  created_at: string | null;
  resolved_at: string | null;
  date: string | null;
  subject_code: string | null;
  final_status: string | null;
  student_name?: string | null;
  student_usn?: string | null;
  student_uid?: string | null;
}

export interface StudentAttendanceSummary {
  policy: AttendancePolicy;
  overall: AttendanceAggregate;
  subjects: SubjectAggregate[];
  subjects_below_threshold: number;
  records: AttendanceRecord[];
  alerts: AttendanceAlert[];
  tracking_start: string | null;
  last_sync_at?: string | null;
  student?: {
    id: number;
    usn?: string | null;
    rfid_uid?: string | null;
    section?: string | null;
    student_name?: string | null;
    student_usn?: string | null;
    student_uid?: string | null;
  };
  disputes?: AttendanceDispute[];
}

export interface Paged<T> {
  total: number;
  items: T[];
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

export interface LecturerClassStats extends AttendanceAggregate {
  subject_id: number;
  subject_code: string | null;
  subject_name: string | null;
  section_id: number | null;
  section: string | null;
  sessions: number;
  below_threshold: {
    student_id: number;
    student_name: string | null;
    student_usn: string | null;
    student_uid: string | null;
    percentage: number;
  }[];
}

export interface LecturerOverview {
  policy: AttendancePolicy;
  classes: LecturerClassStats[];
  pending_verification: number;
  open_disputes: number;
}

export interface TimetableEntry {
  id: number;
  subject_id: number;
  lecturer_id: number;
  section_id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room_number: string | null;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  subject: { id: number; code: string; name: string } | null;
  lecturer_name: string | null;
  section_label: string | null;
}

export interface TimetableBreak {
  id: number;
  section_id: number | null;
  section_label: string | null;
  day_of_week: string;
  start_time: string;
  end_time: string;
  label: string;
}

export interface MyTimetable {
  entries: TimetableEntry[];
  breaks: TimetableBreak[];
}

export interface WeekSession {
  id: number;
  date: string;
  day: string;
  start_time: string;
  end_time: string;
  subject_code: string | null;
  subject_name: string | null;
  lecturer_name: string | null;
  section: string | null;
  room_number: string | null;
  status: string;
  cancel_reason: string | null;
}

export interface WeekResponse {
  start: string;
  end: string;
  sessions: WeekSession[];
}

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Local calendar date -> "YYYY-MM-DD" (no UTC shift). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" -> local Date at midnight. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const d = parseISODate(iso);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toISODate(d);
}

/** "2026-10-22" -> "Thu, 22 Oct 2026". */
export function prettyDate(iso: string | null | undefined, withWeekday = true): string {
  if (!iso) return '—';
  const d = parseISODate(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    weekday: withWeekday ? 'short' : undefined,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function todayWeekday(): string {
  return WEEK_DAYS[(new Date().getDay() + 6) % 7];
}

/** Sentence describing exactly which statuses count as attended under the policy. */
export function countingRuleText(policy: AttendancePolicy | null | undefined): string {
  if (!policy) return '';
  const counted = ['Present'];
  if (policy.count_late_as_attended) counted.push('Late');
  if (policy.count_partial_as_attended) counted.push('Partial');
  const notCounted: string[] = ['Absent'];
  if (!policy.count_late_as_attended) notCounted.push('Late');
  if (!policy.count_partial_as_attended) notCounted.push('Partial');
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  return (
    `Attendance % = attended classes ÷ classes held × 100. ${join(counted)} ${counted.length > 1 ? 'count' : 'counts'} as attended; ` +
    `${join(notCounted)} ${notCounted.length > 1 ? 'do' : 'does'} not. Cancelled and excused classes are excluded from classes held. ` +
    `Pending verification classes are included in classes held but are not counted as attended until they are verified.`
  );
}
