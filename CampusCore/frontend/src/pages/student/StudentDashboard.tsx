import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Briefcase, CalendarCheck, CreditCard, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../lib/api';
import { errorMessage, formatDate, hhmm } from '../../lib/utils';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { AttendanceStatusBadge, Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorState } from '../../components/ui/Kit';
import { useApi } from '../../components/attendance/useApi';
import { prettyDate, todayWeekday, type StudentAttendanceSummary, type MyTimetable } from '../../components/attendance/types';

interface PlacementOverview {
  counts: {
    upcoming_drives: number;
    open_applications: number;
    applications_submitted: number;
    shortlisted: number;
    offers_received: number;
    confirmed_placements: number;
  };
}

type Loose = any;

export const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const fetchAll = useCallback(async () => {
    const [att, tt, asg, res, ann, plc] = await Promise.allSettled([
      ApiClient.get<StudentAttendanceSummary>('/attendance/my'),
      ApiClient.get<MyTimetable>('/timetable/my'),
      ApiClient.get<Loose[]>('/assignments'),
      ApiClient.get<Loose[]>('/exams/my-results'),
      ApiClient.get<Loose[]>('/announcements'),
      ApiClient.get<PlacementOverview>('/placements/student/overview'),
    ]);
    const list = (r: PromiseSettledResult<Loose[]>) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
    return {
      attendance: att.status === 'fulfilled' ? att.value : null,
      attendanceError: att.status === 'rejected' ? errorMessage(att.reason) : null,
      timetable: tt.status === 'fulfilled' ? tt.value : null,
      timetableError: tt.status === 'rejected' ? errorMessage(tt.reason) : null,
      assignments: list(asg),
      results: list(res),
      announcements: list(ann),
      placements: plc.status === 'fulfilled' ? plc.value : null,
      placementsError: plc.status === 'rejected' ? errorMessage(plc.reason) : null,
    };
  }, []);
  const { data: dash, loading, reload: load } = useApi(fetchAll);

  if (loading && !dash) {
    return <LoadingSpinner message="Loading your dashboard..." />;
  }
  const { attendance, attendanceError, timetable, timetableError, assignments, results, announcements, placements, placementsError } = dash ?? {
    attendance: null, attendanceError: null, timetable: null, timetableError: null, assignments: [], results: [],
    announcements: [], placements: null, placementsError: null,
  };

  const overall = attendance?.overall;
  const threshold = attendance?.policy.minimum_percentage;
  const pctValue = overall?.percentage ?? null;
  const isShortage = pctValue !== null && threshold !== undefined && pctValue < threshold;
  const latest = attendance?.records?.[0];

  const todayDay = todayWeekday();
  const todaysClasses = (timetable?.entries || []).filter((s) => s.day_of_week === todayDay);
  const sp = user?.student_profile;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-blue-200 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-300" />
              <span>Student Portal</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Hello, {user?.full_name}</h1>
            <p className="text-xs text-blue-200 mt-1">
              {[sp?.student_id_number && `USN: ${sp.student_id_number}`, sp?.department_name, sp?.course_name]
                .filter(Boolean)
                .join(' • ')}
            </p>
          </div>
          <Link to="/student/attendance">
            <Button variant="outline" size="sm" className="bg-white/10 text-white border-white/20 hover:bg-white/20">
              My attendance
            </Button>
          </Link>
        </div>
      </div>

      {isShortage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3 shadow-xs" role="alert">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-sm block mb-0.5">Attendance below requirement ({pctValue?.toFixed(1)}%)</span>
            Your overall class attendance is below the required {threshold}%. Check the subject-wise breakdown on the attendance page.
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Attendance */}
        <Card className="relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Overall attendance</span>
            {pctValue !== null && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isShortage ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {isShortage ? 'Below threshold' : 'On track'}
              </span>
            )}
          </div>
          {attendanceError ? (
            <p className="mt-3 text-xs text-rose-600">Could not load attendance: {attendanceError}</p>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className={`text-3xl font-extrabold tabular-nums ${isShortage ? 'text-rose-600' : 'text-slate-900'}`}>
                  {pctValue === null ? '—' : `${pctValue.toFixed(1)}%`}
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden" aria-hidden="true">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isShortage ? 'bg-rose-500' : 'bg-blue-600'}`}
                  style={{ width: `${Math.min(pctValue ?? 0, 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between gap-2">
                <span>
                  {pctValue === null
                    ? 'Not yet calculated — appears once RFID records are synchronised'
                    : `Attended ${overall?.attended ?? 0} of ${overall?.classes_held ?? 0} classes`}
                </span>
                {threshold !== undefined && <span className="shrink-0">Required {threshold}%</span>}
              </div>
            </>
          )}
        </Card>

        {/* Latest class record */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Latest class record</span>
            <CalendarCheck className="w-4 h-4 text-blue-600" />
          </div>
          {latest ? (
            <>
              <div className="mt-3">
                <div className="text-sm font-bold text-slate-900">
                  <span className="font-mono text-blue-700 mr-1">{latest.subject_code}</span>
                  {prettyDate(latest.date, false)}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-1">
                  Entry {hhmm(latest.first_entry)} • Exit {hhmm(latest.last_exit)}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {latest.attended_minutes ?? 0}/{latest.scheduled_minutes ?? 0} min
                </span>
                <AttendanceStatusBadge status={latest.final_status} corrected={latest.is_overridden} />
              </div>
            </>
          ) : (
            <p className="mt-3 text-xs text-slate-500">No class attendance has been calculated yet.</p>
          )}
        </Card>

        {/* RFID card */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Registered RFID card</span>
            <CreditCard className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-3">
            {sp?.rfid_uid ? (
              <div className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 inline-block">
                {sp.rfid_uid}
              </div>
            ) : (
              <Badge variant="warning">No card registered</Badge>
            )}
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Your class attendance is calculated from the scans of this card.
            </p>
          </div>
        </Card>

        {/* Placements */}
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Placements</span>
            <Briefcase className="w-4 h-4 text-emerald-600" />
          </div>
          {placements ? (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-[10px] text-slate-500">Open drives</dt>
                <dd className="text-lg font-bold text-slate-900 tabular-nums">{placements.counts.open_applications}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-slate-500">Applied</dt>
                <dd className="text-lg font-bold text-slate-900 tabular-nums">{placements.counts.applications_submitted}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-slate-500">Offers</dt>
                <dd className="text-lg font-bold text-slate-900 tabular-nums">{placements.counts.offers_received}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              {placementsError ? 'Placement summary is unavailable right now.' : 'No placement data.'}
            </p>
          )}
          <Link to="/student/placements" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline">
            Go to placements <ArrowRight className="w-3 h-3" />
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Today's classes */}
          <Card>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 gap-2">
              <div>
                <CardTitle>Today's classes ({todayDay})</CardTitle>
                <CardDescription>{timetable?.entries[0]?.section_label || 'Your section timetable'}</CardDescription>
              </div>
              <Link to="/student/timetable">
                <Button variant="link" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  Weekly timetable
                </Button>
              </Link>
            </div>
            {timetableError ? (
              <ErrorState title="Could not load your timetable" message={timetableError} onRetry={load} />
            ) : todaysClasses.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">No classes scheduled for {todayDay}.</div>
            ) : (
              <div className="space-y-3">
                {todaysClasses.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] font-mono">
                        {s.subject?.code}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{s.subject?.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {[s.lecturer_name, s.room_number && `Room ${s.room_number}`].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-700 bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs self-start sm:self-center">
                      {s.start_time} - {s.end_time}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Results */}
          <Card>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <CardTitle>Assessment results</CardTitle>
                <CardDescription>Officially published marks</CardDescription>
              </div>
              <Link to="/student/results">
                <Button variant="link" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  Full report
                </Button>
              </Link>
            </div>
            {results.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">No examination results published yet.</div>
            ) : (
              <div className="space-y-3">
                {results.slice(0, 5).map((r) => (
                  <div key={r.id} className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900">{r.exam_name}</span>
                      <span className="text-xs font-bold text-blue-600 font-mono">
                        {r.marks_obtained} / {r.max_marks}
                        {r.percentage !== undefined && r.percentage !== null ? ` (${r.percentage}%)` : ''}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.subject_code} - {r.subject_name}
                    </div>
                    {r.remarks && <div className="text-[11px] text-slate-600 italic pt-1">Remarks: "{r.remarks}"</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active assignments</CardTitle>
              <CardDescription>Upcoming coursework deadlines</CardDescription>
            </CardHeader>
            {assignments.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">No pending assignments.</div>
            ) : (
              <div className="space-y-3">
                {assignments.slice(0, 3).map((asg) => (
                  <div key={asg.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <div className="font-bold text-xs text-slate-900 line-clamp-1">{asg.title}</div>
                    <div className="text-[11px] text-slate-500">Due: {formatDate(asg.due_date)}</div>
                    <div className="pt-2">
                      <Link to="/student/assignments" className="text-[11px] font-semibold text-blue-600 hover:underline">
                        Open assignment &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Announcements</CardTitle>
              <CardDescription>Notices from the college</CardDescription>
            </CardHeader>
            {announcements.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">No announcements.</div>
            ) : (
              <div className="space-y-3">
                {announcements.slice(0, 3).map((ann) => (
                  <div key={ann.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <span className="font-bold text-xs text-slate-900 line-clamp-1">{ann.title}</span>
                    <p className="text-xs text-slate-600 line-clamp-2">{ann.content}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/student/announcements" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline">
              All announcements <ArrowRight className="w-3 h-3" />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
};
