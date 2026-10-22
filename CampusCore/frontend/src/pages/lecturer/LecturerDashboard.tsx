import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BookOpen, Hourglass, MessageSquareWarning } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../lib/api';
import { errorMessage, formatDate } from '../../lib/utils';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorState, StatCard } from '../../components/ui/Kit';
import { useApi } from '../../components/attendance/useApi';
import { todayWeekday, type LecturerOverview, type MyTimetable } from '../../components/attendance/types';

type Loose = any;

export const LecturerDashboard: React.FC = () => {
  const { user } = useAuth();
  const fetchAll = useCallback(async () => {
    const [tt, ov, asg, ann] = await Promise.allSettled([
      ApiClient.get<MyTimetable>('/timetable/my'),
      ApiClient.get<LecturerOverview>('/attendance/lecturer/overview'),
      ApiClient.get<Loose[]>('/assignments'),
      ApiClient.get<Loose[]>('/announcements'),
    ]);
    const list = (r: PromiseSettledResult<Loose[]>) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
    return {
      timetable: tt.status === 'fulfilled' ? tt.value : null,
      timetableError: tt.status === 'rejected' ? errorMessage(tt.reason) : null,
      overview: ov.status === 'fulfilled' ? ov.value : null,
      overviewError: ov.status === 'rejected' ? errorMessage(ov.reason) : null,
      assignments: list(asg),
      announcements: list(ann),
    };
  }, []);
  const { data: dash, loading, reload: load } = useApi(fetchAll);

  if (loading && !dash) return <LoadingSpinner message="Loading lecturer workspace..." />;
  const { timetable, timetableError, overview, overviewError, assignments, announcements } = dash ?? {
    timetable: null, timetableError: null, overview: null, overviewError: null, assignments: [], announcements: [],
  };

  const todayDay = todayWeekday();
  const todaysClasses = (timetable?.entries || []).filter((s) => s.day_of_week === todayDay);
  const belowStudents = new Set((overview?.classes || []).flatMap((c) => c.below_threshold.map((b) => b.student_id))).size;
  const lp = user?.lecturer_profile;
  const noAttendanceYet = overview && overview.classes.length === 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">Faculty Workspace</span>
            <h1 className="text-2xl font-bold mt-1 text-white">Welcome back, {user?.full_name}</h1>
            <p className="text-xs text-blue-200 mt-1">
              {[lp?.designation, lp?.department_name, lp?.employee_id].filter(Boolean).join(' • ')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/lecturer/attendance">
              <Button variant="outline" size="sm" className="bg-white/10 text-white border-white/20 hover:bg-white/20">
                Class attendance
              </Button>
            </Link>
            <Link to="/lecturer/assignments">
              <Button variant="outline" size="sm" className="bg-white/10 text-white border-white/20 hover:bg-white/20">
                Post assignment
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Attendance overview */}
      <section aria-label="Attendance overview" className="space-y-2">
        {overviewError ? (
          <ErrorState title="Could not load the attendance overview" message={overviewError} onRetry={load} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Link to="/lecturer/attendance?tab=classes" className="block">
                <StatCard label="Classes with attendance" value={overview?.classes.length ?? 0} hint="Subject × section" icon={<BookOpen className="w-4 h-4" />} tone="info" />
              </Link>
              <Link to="/lecturer/attendance?tab=classes" className="block">
                <StatCard
                  label="Students below threshold"
                  value={belowStudents}
                  hint={overview ? `Below ${overview.policy.minimum_percentage}% in your classes` : undefined}
                  icon={<AlertTriangle className="w-4 h-4" />}
                  tone={belowStudents ? 'danger' : 'default'}
                />
              </Link>
              <Link to="/lecturer/attendance?tab=pending" className="block">
                <StatCard label="Pending verification" value={overview?.pending_verification ?? 0} hint="Class records to verify" icon={<Hourglass className="w-4 h-4" />} tone="warning" />
              </Link>
              <Link to="/lecturer/attendance?tab=disputes" className="block">
                <StatCard label="Open review requests" value={overview?.open_disputes ?? 0} hint="From students" icon={<MessageSquareWarning className="w-4 h-4" />} tone={overview?.open_disputes ? 'warning' : 'default'} />
              </Link>
            </div>
            {noAttendanceYet && (
              <p className="text-xs text-slate-500">
                No class attendance has been calculated yet — attendance appears once RFID records are synchronised.
              </p>
            )}
          </>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 gap-2">
              <div>
                <CardTitle>Today's teaching schedule ({todayDay})</CardTitle>
                <CardDescription>Your assigned periods for today</CardDescription>
              </div>
              <Link to="/lecturer/classes">
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
                {todaysClasses.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] font-mono">
                        {item.subject?.code}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{item.subject?.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {[item.section_label, item.room_number && `Room ${item.room_number}`].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold text-slate-700 bg-white px-2.5 py-1 rounded border border-slate-200 shadow-2xs">
                        {item.start_time} - {item.end_time}
                      </span>
                      <Link to="/lecturer/attendance?tab=sessions">
                        <Button variant="outline" size="sm" className="text-xs">
                          Attendance
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <CardTitle>Coursework assignments</CardTitle>
                <CardDescription>Active student assignments and grading</CardDescription>
              </div>
              <Link to="/lecturer/assignments">
                <Button variant="link" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  Manage all
                </Button>
              </Link>
            </div>
            {assignments.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">No active assignments posted yet.</div>
            ) : (
              <div className="space-y-3">
                {assignments.slice(0, 3).map((asg) => (
                  <div key={asg.id} className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900">{asg.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono">Due: {formatDate(asg.due_date)}</span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-1">{asg.description}</p>
                    <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 mt-2">
                      <span>Max score: {asg.max_marks} pts</span>
                      <Link to="/lecturer/assignments" className="text-blue-600 font-semibold hover:underline">
                        Review submissions &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Campus announcements</CardTitle>
              <CardDescription>Official institutional notices</CardDescription>
            </CardHeader>
            {announcements.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">No announcements.</div>
            ) : (
              <div className="space-y-3">
                {announcements.slice(0, 3).map((ann) => (
                  <div key={ann.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 line-clamp-1">{ann.title}</span>
                      {ann.priority && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${ann.priority === 'URGENT' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'}`}>
                          {ann.priority}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">{ann.content}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <h4 className="text-xs font-bold text-blue-900 mb-1">Internal assessment marks</h4>
            <p className="text-xs text-blue-700 mb-3">Marks entered here are validated and submitted for administrative publication.</p>
            <Link to="/lecturer/marks">
              <Button variant="primary" size="sm" className="w-full text-xs">
                Open marks entry
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
};
