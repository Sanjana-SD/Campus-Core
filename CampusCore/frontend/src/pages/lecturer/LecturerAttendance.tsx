import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  Hourglass,
  MessageSquareWarning,
  PencilLine,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { ApiClient, ApiError, qs } from '../../lib/api';
import { useApi } from '../../components/attendance/useApi';
import { cn, errorMessage, formatDateTime, hhmm, todayISO } from '../../lib/utils';
import { useToast } from '../../components/ui/Toast';
import { Card, CardDescription, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { ATTENDANCE_STATUS_META, AttendanceStatusBadge, Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { ErrorState, PageHeader, Pagination, Skeleton, StatCard, Table, TableSkeleton, Tabs, Td, Th } from '../../components/ui/Kit';
import { DurationCell, IntervalsCell, PercentValue, StatusDefinitions } from '../../components/attendance/AttendanceShared';
import {
  CORRECTABLE_STATUSES,
  STATUS_ORDER,
  addDays,
  countingRuleText,
  prettyDate,
  type AttendanceDispute,
  type AttendanceRecord,
  type ClassSessionItem,
  type LecturerOverview,
  type Paged,
  type StudentAttendanceSummary,
} from '../../components/attendance/types';

const EMPTY_MESSAGE =
  'No class attendance has been calculated yet — attendance appears once RFID records are synchronised.';
const PAGE_SIZE = 25;
const TAB_IDS = ['classes', 'sessions', 'students', 'pending', 'disputes'] as const;
type TabId = (typeof TAB_IDS)[number];

/* ------------------------------------------------------------------------------------------------ */

export const LecturerAttendance: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as TabId | null;
  const tab: TabId = tabParam && (TAB_IDS as readonly string[]).includes(tabParam) ? tabParam : 'classes';
  const setTab = (id: string) => setParams((p) => {
    const n = new URLSearchParams(p);
    n.set('tab', id);
    return n;
  }, { replace: true });

  const fetchOverview = useCallback(() => ApiClient.get<LecturerOverview>('/attendance/lecturer/overview'), []);
  const { data: overview, loading: overviewLoading, error: overviewError, reload: loadOverview } = useApi(fetchOverview);
  const [version, setVersion] = useState(0);

  const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const refresh = () => {
    loadOverview();
    setVersion((v) => v + 1);
  };

  const belowStudents = useMemo(
    () => new Set((overview?.classes || []).flatMap((c) => c.below_threshold.map((b) => b.student_id))).size,
    [overview]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teaching"
        title="Class Attendance"
        description="Timetable-based attendance for the classes you teach, calculated from students' RFID scans. You can verify, correct and export records for your own classes only."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={refresh} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
              Refresh
            </Button>
            <Button size="sm" onClick={() => setExportOpen(true)} leftIcon={<Download className="w-3.5 h-3.5" />}>
              Export CSV
            </Button>
          </>
        }
      />

      {overviewError ? (
        <ErrorState title="Could not load the attendance overview" message={overviewError} onRetry={loadOverview} />
      ) : overviewLoading && !overview ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Classes" value={overview?.classes.length ?? 0} hint="Subject × section with records" icon={<BookOpen className="w-4 h-4" />} tone="info" onClick={() => setTab('classes')} />
          <StatCard
            label="Students below threshold"
            value={belowStudents}
            hint={overview ? `Below ${overview.policy.minimum_percentage}%` : undefined}
            icon={<AlertTriangle className="w-4 h-4" />}
            tone={belowStudents ? 'danger' : 'default'}
            onClick={() => setTab('classes')}
          />
          <StatCard label="Pending verification" value={overview?.pending_verification ?? 0} hint="Not counted as attended" icon={<Hourglass className="w-4 h-4" />} tone="warning" onClick={() => setTab('pending')} />
          <StatCard
            label="Open review requests"
            value={overview?.open_disputes ?? 0}
            hint="Raised by students"
            icon={<MessageSquareWarning className="w-4 h-4" />}
            tone={overview?.open_disputes ? 'warning' : 'default'}
            onClick={() => setTab('disputes')}
          />
        </div>
      )}

      <div>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'classes', label: 'Classes' },
            { id: 'sessions', label: 'By session / date' },
            { id: 'students', label: 'Students' },
            {
              id: 'pending',
              label: (
                <span className="flex items-center gap-1.5">
                  Pending verification
                  {!!overview?.pending_verification && <Badge variant="info">{overview.pending_verification}</Badge>}
                </span>
              ),
            },
            {
              id: 'disputes',
              label: (
                <span className="flex items-center gap-1.5">
                  Review requests
                  {!!overview?.open_disputes && <Badge variant="warning">{overview.open_disputes}</Badge>}
                </span>
              ),
            },
          ]}
        />
        <div role="tabpanel">
          {tab === 'classes' && <ClassesTab overview={overview} loading={overviewLoading} onStudent={setStudentId} />}
          {tab === 'sessions' && <SessionsTab version={version} onCorrect={setCorrecting} onStudent={setStudentId} />}
          {tab === 'students' && <StudentsTab version={version} onCorrect={setCorrecting} onStudent={setStudentId} />}
          {tab === 'pending' && <PendingTab version={version} onCorrect={setCorrecting} onStudent={setStudentId} />}
          {tab === 'disputes' && <DisputesTab version={version} onCorrect={setCorrecting} onChanged={refresh} />}
        </div>
      </div>

      <StatusDefinitions policy={overview?.policy} />

      <CorrectionModal
        key={correcting?.id ?? 'none'}
        record={correcting}
        onClose={() => setCorrecting(null)}
        onSaved={() => {
          setCorrecting(null);
          refresh();
        }}
      />
      <StudentSummaryModal studentId={studentId} onClose={() => setStudentId(null)} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} overview={overview} />
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Shared records table
 * ---------------------------------------------------------------------------------------------- */

const RecordsTable: React.FC<{
  records: AttendanceRecord[];
  showStudent?: boolean;
  showDate?: boolean;
  showSubject?: boolean;
  onCorrect: (r: AttendanceRecord) => void;
  onStudent?: (id: number) => void;
}> = ({ records, showStudent = true, showDate = true, showSubject = true, onCorrect, onStudent }) => (
  <Table>
    <thead>
      <tr>
        {showStudent && <Th>Student</Th>}
        {showDate && <Th>Date</Th>}
        {showSubject && <Th>Subject</Th>}
        <Th>Scheduled</Th>
        <Th>Entry → exit</Th>
        <Th>Duration</Th>
        <Th>Status</Th>
        <Th>Reason</Th>
        <Th>
          <span className="sr-only">Actions</span>
        </Th>
      </tr>
    </thead>
    <tbody>
      {records.map((r) => (
        <tr key={r.id} className="hover:bg-slate-50/60">
          {showStudent && (
            <Td className="whitespace-nowrap">
              {onStudent ? (
                <button
                  type="button"
                  onClick={() => onStudent(r.student_id)}
                  className="text-left text-xs font-semibold text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                >
                  {r.student_name || `Student #${r.student_id}`}
                </button>
              ) : (
                <span className="text-xs font-semibold text-slate-900">{r.student_name}</span>
              )}
              <div className="font-mono text-[11px] text-slate-500">{r.student_usn}</div>
            </Td>
          )}
          {showDate && <Td className="whitespace-nowrap text-xs">{prettyDate(r.date)}</Td>}
          {showSubject && (
            <Td className="whitespace-nowrap">
              <span className="font-mono text-xs font-semibold text-blue-700">{r.subject_code}</span>
            </Td>
          )}
          <Td className="font-mono text-xs whitespace-nowrap">
            {hhmm(r.scheduled_start)}–{hhmm(r.scheduled_end)}
          </Td>
          <Td>
            <IntervalsCell record={r} />
          </Td>
          <Td>
            <DurationCell record={r} />
          </Td>
          <Td>
            <AttendanceStatusBadge status={r.final_status} corrected={r.is_overridden} />
            {r.is_overridden && r.computed_status !== r.final_status && (
              <div className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">
                Calculated: {ATTENDANCE_STATUS_META[r.computed_status]?.label ?? r.computed_status}
              </div>
            )}
            {r.override_stale && <div className="text-[10px] text-amber-600 mt-0.5">Evidence changed since correction</div>}
          </Td>
          <Td className="text-[11px] text-slate-500 min-w-[12rem] max-w-xs">
            {r.status_reason || '—'}
            {r.is_overridden && r.override_reason && <div className="mt-0.5 text-slate-600">Correction: {r.override_reason}</div>}
          </Td>
          <Td className="text-right">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onCorrect(r)}
              disabled={r.computed_status === 'CANCELLED'}
              title={r.computed_status === 'CANCELLED' ? 'Cancelled classes cannot be corrected' : undefined}
              leftIcon={<PencilLine className="w-3.5 h-3.5" />}
              aria-label={`Correct attendance for ${r.student_name ?? 'student'} on ${prettyDate(r.date)}`}
            >
              Correct
            </Button>
          </Td>
        </tr>
      ))}
    </tbody>
  </Table>
);

/** Paged GET /attendance/records with the given filters. */
function usePagedRecords(filters: Record<string, string | number | undefined>, version: number, enabled = true) {
  const key = JSON.stringify(filters);
  // The page resets to 1 whenever the filters change.
  const [pageState, setPageState] = useState({ key, page: 1 });
  const page = pageState.key === key ? pageState.page : 1;
  const setPage = useCallback((p: number) => setPageState({ key, page: p }), [key]);

  const fetcher = useMemo(() => {
    if (!enabled) return null;
    const f = JSON.parse(key) as Record<string, string | number | undefined>;
    const url = '/attendance/records' + qs({ ...f, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
    void version; // a parent refresh bumps `version`, producing a new fetcher and a refetch
    return () => ApiClient.get<Paged<AttendanceRecord>>(url);
  }, [key, page, enabled, version]);
  const { data, loading, error, reload } = useApi(fetcher);
  return { data: enabled ? data : null, loading, error, page, setPage, reload };
}

const PagedRecords: React.FC<{
  state: ReturnType<typeof usePagedRecords>;
  emptyTitle: string;
  emptyDescription: string;
  onCorrect: (r: AttendanceRecord) => void;
  onStudent: (id: number) => void;
}> = ({ state, emptyTitle, emptyDescription, onCorrect, onStudent }) => {
  const { data, loading, error, page, setPage, reload } = state;
  if (loading && !data) return <TableSkeleton rows={6} cols={7} />;
  if (error) return <div className="p-5"><ErrorState title="Could not load attendance records" message={error} onRetry={reload} /></div>;
  if (!data || data.items.length === 0)
    return (
      <div className="p-5">
        <EmptyState icon={<CalendarDays className="w-6 h-6" />} title={emptyTitle} description={emptyDescription} />
      </div>
    );
  return (
    <div className={cn(loading && 'opacity-60 transition-opacity')}>
      <RecordsTable records={data.items} onCorrect={onCorrect} onStudent={onStudent} />
      <Pagination total={data.total} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Tabs
 * ---------------------------------------------------------------------------------------------- */

const ClassesTab: React.FC<{ overview: LecturerOverview | null; loading: boolean; onStudent: (id: number) => void }> = ({
  overview,
  loading,
  onStudent,
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (loading && !overview) return <Card className="p-0"><TableSkeleton rows={4} cols={8} /></Card>;
  if (!overview) return null;
  const threshold = overview.policy.minimum_percentage;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <CardTitle>Attendance by class</CardTitle>
        <CardDescription className="mt-1 leading-relaxed">
          Class attendance % is across all student-class records for that subject and section. {countingRuleText(overview.policy)}
        </CardDescription>
      </div>
      {overview.classes.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={<BookOpen className="w-6 h-6" />} title="No class attendance yet" description={EMPTY_MESSAGE} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Class</Th>
              <Th className="text-right">Sessions</Th>
              <Th className="text-right">Present</Th>
              <Th className="text-right">Late</Th>
              <Th className="text-right">Partial</Th>
              <Th className="text-right">Absent</Th>
              <Th className="text-right">Pending</Th>
              <Th className="text-right">Class attendance</Th>
              <Th>Below {threshold}%</Th>
            </tr>
          </thead>
          <tbody>
            {overview.classes.map((c) => {
              const key = `${c.subject_id}:${c.section_id}`;
              const isOpen = expanded === key;
              return (
                <React.Fragment key={key}>
                  <tr className="hover:bg-slate-50/60">
                    <Td>
                      <div className="font-mono text-xs font-semibold text-blue-700">{c.subject_code}</div>
                      <div className="text-xs text-slate-700">{c.subject_name}</div>
                      <div className="text-[11px] text-slate-500">{c.section}</div>
                    </Td>
                    <Td className="text-right tabular-nums">{c.sessions}</Td>
                    <Td className="text-right tabular-nums">{c.present}</Td>
                    <Td className="text-right tabular-nums">{c.late}</Td>
                    <Td className="text-right tabular-nums">{c.partial}</Td>
                    <Td className="text-right tabular-nums">{c.absent}</Td>
                    <Td className="text-right tabular-nums">{c.pending}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <PercentValue value={c.percentage} threshold={threshold} />
                      <div className="text-[10px] text-slate-500">
                        {c.attended}/{c.classes_held} records
                      </div>
                    </Td>
                    <Td>
                      {c.below_threshold.length === 0 ? (
                        <span className="text-xs text-slate-400">None</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : key)}
                          aria-expanded={isOpen}
                          className="inline-flex items-center gap-1 rounded text-xs font-semibold text-rose-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          {c.below_threshold.length} student{c.below_threshold.length > 1 ? 's' : ''}
                        </button>
                      )}
                    </Td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={9} className="bg-rose-50/40 px-4 py-3 border-b border-slate-100">
                        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {c.below_threshold.map((b) => (
                            <li key={b.student_id}>
                              <button
                                type="button"
                                onClick={() => onStudent(b.student_id)}
                                className="w-full flex items-center justify-between gap-2 rounded-lg border border-rose-100 bg-white px-3 py-2 text-left hover:border-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              >
                                <span className="min-w-0">
                                  <span className="block text-xs font-semibold text-slate-900 truncate">{b.student_name}</span>
                                  <span className="block font-mono text-[11px] text-slate-500">{b.student_usn}</span>
                                </span>
                                <PercentValue value={b.percentage} threshold={threshold} className="text-xs" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
};

type RecordTabProps = { version: number; onCorrect: (r: AttendanceRecord) => void; onStudent: (id: number) => void };

const SessionsTab: React.FC<RecordTabProps> = ({ version, onCorrect, onStudent }) => {
  const today = todayISO();
  const [from, setFrom] = useState(addDays(today, -13));
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState({ from: addDays(today, -13), to: today });
  const [selected, setSelected] = useState<ClassSessionItem | null>(null);
  const fetchSessions = useMemo(() => {
    const url = '/attendance/sessions' + qs({ date_from: applied.from, date_to: applied.to, limit: 500 });
    void version; // refetch on parent refresh
    return () => ApiClient.get<Paged<ClassSessionItem>>(url);
  }, [applied, version]);
  const { data: sessions, loading, error, reload: load } = useApi(fetchSessions);

  const records = usePagedRecords(selected ? { session_id: selected.id } : {}, version, !!selected);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    if (from && to && to < from) return;
    setSelected(null);
    setApplied({ from, to });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <Card className="p-0 overflow-hidden xl:col-span-2">
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          <div>
            <CardTitle>Class sessions</CardTitle>
            <CardDescription>
              {sessions ? `${sessions.total} session${sessions.total === 1 ? '' : 's'} in range` : 'Sessions you teach'}
            </CardDescription>
          </div>
          <form onSubmit={apply} className="flex flex-wrap items-end gap-2" aria-label="Session date range">
            <div className="w-36">
              <Input id="sess-from" label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="w-36">
              <Input id="sess-to" label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={from && to && to < from ? 'Before start' : undefined} />
            </div>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </form>
        </div>
        {loading && !sessions ? (
          <TableSkeleton rows={6} cols={3} />
        ) : error ? (
          <div className="p-5">
            <ErrorState title="Could not load sessions" message={error} onRetry={load} />
          </div>
        ) : !sessions || sessions.items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<CalendarDays className="w-6 h-6" />}
              title="No sessions in this range"
              description="Sessions are generated from the timetable once attendance is evaluated for those dates."
            />
          </div>
        ) : (
          <ul className="max-h-[36rem] overflow-y-auto divide-y divide-slate-100" aria-label="Sessions">
            {sessions.items.map((s) => {
              const total = Object.values(s.counts || {}).reduce((a, b) => a + b, 0);
              const isSel = selected?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(s)}
                    aria-pressed={isSel}
                    className={cn(
                      'w-full text-left px-5 py-3 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
                      isSel && 'bg-blue-50/70 hover:bg-blue-50'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        <span className="font-mono text-blue-700 mr-1">{s.subject_code}</span>
                        {prettyDate(s.date)}
                      </span>
                      {s.status === 'CANCELLED' ? (
                        <Badge variant="danger">Cancelled</Badge>
                      ) : (
                        <span className="font-mono text-[11px] text-slate-500">
                          {s.start_time}–{s.end_time}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {[s.section, s.room_number && `Room ${s.room_number}`].filter(Boolean).join(' · ')}
                    </div>
                    {total > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                        {STATUS_ORDER.filter((st) => s.counts[st]).map((st) => (
                          <span key={st} className="flex items-center gap-1 text-[10px] text-slate-600">
                            <span className={cn('w-2 h-2 rounded-full', ATTENDANCE_STATUS_META[st].dot)} aria-hidden="true" />
                            {s.counts[st]} {ATTENDANCE_STATUS_META[st].label.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-[10px] text-slate-400">No attendance calculated</div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-0 overflow-hidden xl:col-span-3">
        {!selected ? (
          <div className="p-5">
            <EmptyState icon={<Users className="w-6 h-6" />} title="Select a session" description="Choose a class session to see each student's entry, exit, minutes and status." />
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-slate-100">
              <CardTitle>
                <span className="font-mono text-blue-700 mr-1.5">{selected.subject_code}</span>
                {selected.subject_name}
              </CardTitle>
              <CardDescription>
                {prettyDate(selected.date)} · {selected.start_time}–{selected.end_time}
                {selected.section && ` · ${selected.section}`}
                {selected.room_number && ` · Room ${selected.room_number}`}
              </CardDescription>
              {selected.status === 'CANCELLED' && (
                <p className="mt-2 text-xs text-rose-700">This class was cancelled{selected.cancel_reason ? `: ${selected.cancel_reason}` : ''}.</p>
              )}
            </div>
            {records.loading && !records.data ? (
              <TableSkeleton rows={6} cols={6} />
            ) : records.error ? (
              <div className="p-5">
                <ErrorState title="Could not load records" message={records.error} onRetry={records.reload} />
              </div>
            ) : !records.data || records.data.items.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<CalendarDays className="w-6 h-6" />}
                  title="No student records for this session"
                  description="Attendance is calculated after the class ends and RFID records are synchronised."
                />
              </div>
            ) : (
              <>
                <RecordsTable records={records.data.items} showDate={false} showSubject={false} onCorrect={onCorrect} onStudent={onStudent} />
                <Pagination total={records.data.total} page={records.page} pageSize={PAGE_SIZE} onPage={records.setPage} />
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

const StudentsTab: React.FC<RecordTabProps> = ({ version, onCorrect, onStudent }) => {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const state = usePagedRecords({ search: search || undefined, status: status || undefined }, version);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-slate-100 md:flex-row md:items-end md:justify-between">
        <div>
          <CardTitle>Student records</CardTitle>
          <CardDescription>Search your students by name, USN or RFID UID. Select a student's name to see their summary in your classes.</CardDescription>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(input.trim());
          }}
          role="search"
        >
          <div className="w-56">
            <Input id="stu-search" label="Search" placeholder="Name, USN or UID" value={input} onChange={(e) => setInput(e.target.value)} />
          </div>
          <div className="w-44">
            <Select
              id="stu-status"
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="All statuses"
              options={STATUS_ORDER.map((s) => ({ value: s, label: ATTENDANCE_STATUS_META[s].label }))}
            />
          </div>
          <Button type="submit" variant="secondary" leftIcon={<Search className="w-3.5 h-3.5" />}>
            Search
          </Button>
        </form>
      </div>
      <PagedRecords
        state={state}
        emptyTitle={search || status ? 'No matching records' : 'No attendance records yet'}
        emptyDescription={search || status ? 'Try a different name, USN or status.' : EMPTY_MESSAGE}
        onCorrect={onCorrect}
        onStudent={onStudent}
      />
    </Card>
  );
};

const PendingTab: React.FC<RecordTabProps> = ({ version, onCorrect, onStudent }) => {
  const state = usePagedRecords({ status: 'PENDING_VERIFICATION' }, version);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <CardTitle>Pending verification</CardTitle>
        <CardDescription className="mt-1">
          These classes have an RFID scan with a missing entry or exit that could overlap the class, so presence cannot be
          confirmed automatically. They are not counted as attended until verified. Use “Correct” to set the final status after
          checking with the student.
        </CardDescription>
      </div>
      <PagedRecords
        state={state}
        emptyTitle="Nothing pending"
        emptyDescription="No class records in your classes are awaiting verification."
        onCorrect={onCorrect}
        onStudent={onStudent}
      />
    </Card>
  );
};

const DisputesTab: React.FC<{ version: number; onCorrect: (r: AttendanceRecord) => void; onChanged: () => void }> = ({
  version,
  onCorrect,
  onChanged,
}) => {
  const toast = useToast();
  const [status, setStatus] = useState('OPEN');
  const [resolving, setResolving] = useState<AttendanceDispute | null>(null);
  const [openingRecord, setOpeningRecord] = useState<number | null>(null);
  const fetchDisputes = useMemo(() => {
    // An explicit empty status lists every request (the backend defaults to OPEN when omitted).
    const url = status ? '/attendance/disputes' + qs({ status }) : '/attendance/disputes?status=';
    void version; // refetch on parent refresh
    return () => ApiClient.get<AttendanceDispute[]>(url);
  }, [status, version]);
  const { data: items, loading, error, reload: load } = useApi(fetchDisputes);

  const correctFor = async (d: AttendanceDispute) => {
    setOpeningRecord(d.id);
    try {
      const res = await ApiClient.get<{ record: AttendanceRecord }>(`/attendance/records/${d.record_id}`);
      onCorrect(res.record);
    } catch (e) {
      toast.error('Could not open the record', errorMessage(e));
    } finally {
      setOpeningRecord(null);
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-slate-100 md:flex-row md:items-end md:justify-between">
        <div>
          <CardTitle>Review requests</CardTitle>
          <CardDescription className="mt-1">
            Students' requests to re-check a class record. Resolving a request does not change the record — use “Correct record”
            first if the status should change.
          </CardDescription>
        </div>
        <div className="w-44">
          <Select
            id="disp-status"
            label="Show"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: 'OPEN', label: 'Open' },
              { value: 'RESOLVED', label: 'Resolved' },
              { value: 'REJECTED', label: 'Rejected' },
              { value: '', label: 'All requests' },
            ]}
          />
        </div>
      </div>
      {loading && !items ? (
        <TableSkeleton rows={4} cols={5} />
      ) : error ? (
        <div className="p-5">
          <ErrorState title="Could not load review requests" message={error} onRetry={load} />
        </div>
      ) : !items || items.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={<MessageSquareWarning className="w-6 h-6" />} title="No review requests" description={status === 'OPEN' ? 'There are no open requests for your classes.' : 'No requests match this filter.'} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Class</Th>
              <Th>Message</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id}>
                <Td className="whitespace-nowrap">
                  <div className="text-xs font-semibold text-slate-900">{d.student_name}</div>
                  <div className="font-mono text-[11px] text-slate-500">{d.student_usn}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(d.created_at)}</div>
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="font-mono text-xs font-semibold text-blue-700">{d.subject_code}</span>
                  <div className="text-[11px] text-slate-500">{prettyDate(d.date)}</div>
                  {d.final_status && (
                    <div className="mt-1">
                      <AttendanceStatusBadge status={d.final_status} />
                    </div>
                  )}
                </Td>
                <Td className="text-xs text-slate-600 max-w-md whitespace-pre-wrap break-words">
                  {d.message}
                  {d.resolution_note && <div className="mt-1.5 text-slate-500">Response: {d.resolution_note}</div>}
                </Td>
                <Td>
                  <Badge variant={d.status === 'OPEN' ? 'info' : d.status === 'RESOLVED' ? 'success' : 'danger'}>
                    {d.status === 'OPEN' ? 'Open' : d.status === 'RESOLVED' ? 'Resolved' : d.status === 'REJECTED' ? 'Rejected' : d.status}
                  </Badge>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => correctFor(d)} isLoading={openingRecord === d.id} leftIcon={<PencilLine className="w-3.5 h-3.5" />}>
                      Correct record
                    </Button>
                    {d.status === 'OPEN' && (
                      <Button size="sm" variant="outline" onClick={() => setResolving(d)}>
                        Resolve
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ResolveModal
        key={resolving?.id ?? 'none'}
        dispute={resolving}
        onClose={() => setResolving(null)}
        onDone={() => {
          setResolving(null);
          onChanged();
        }}
      />
    </Card>
  );
};

/* ------------------------------------------------------------------------------------------------
 * Modals
 * ---------------------------------------------------------------------------------------------- */

const textareaCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600';

const CorrectionModal: React.FC<{ record: AttendanceRecord | null; onClose: () => void; onSaved: () => void }> = ({
  record,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<{ title: string; message: string } | null>(null);

  const reasonOk = reason.trim().length >= 3;
  const valid = !!status && reasonOk;
  const isCancelled = record?.computed_status === 'CANCELLED';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record || !valid) return;
    setSaving(true);
    setErr(null);
    try {
      await ApiClient.post(`/attendance/records/${record.id}/correct`, {
        status: status === 'REMOVE' ? null : status,
        reason: reason.trim(),
      });
      toast.success(status === 'REMOVE' ? 'Correction removed' : 'Attendance corrected', `${record.student_name ?? 'Student'} · ${record.subject_code ?? ''} · ${prettyDate(record.date, false)}`);
      onSaved();
    } catch (e2) {
      if (e2 instanceof ApiError && e2.status === 403)
        setErr({ title: 'You are not allowed to correct this record', message: e2.message });
      else setErr({ title: 'Could not save the correction', message: errorMessage(e2) });
    } finally {
      setSaving(false);
    }
  };

  const options = [
    ...CORRECTABLE_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_STATUS_META[s].label })),
    ...(record?.is_overridden ? [{ value: 'REMOVE', label: `Remove correction (restore calculated: ${ATTENDANCE_STATUS_META[record.computed_status]?.label ?? record.computed_status})` }] : []),
  ];

  return (
    <Modal isOpen={!!record} onClose={onClose} title="Correct attendance" description="Corrections are audited and visible to the student." maxWidth="lg">
      {record && (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{record.student_name ?? `Student #${record.student_id}`}</p>
                <p className="font-mono text-slate-500">{record.student_usn}</p>
              </div>
              <AttendanceStatusBadge status={record.final_status} corrected={record.is_overridden} />
            </div>
            <p className="text-slate-600">
              <span className="font-mono font-semibold text-blue-700">{record.subject_code}</span> · {prettyDate(record.date)} ·{' '}
              <span className="font-mono">
                {hhmm(record.scheduled_start)}–{hhmm(record.scheduled_end)}
              </span>
            </p>
            <p className="text-slate-600">
              Calculated: <strong>{ATTENDANCE_STATUS_META[record.computed_status]?.label ?? record.computed_status}</strong> · attended{' '}
              {record.attended_minutes ?? 0}/{record.scheduled_minutes ?? 0} min
            </p>
            <div className="flex gap-2">
              <span className="text-slate-500">Scans:</span>
              <IntervalsCell record={record} />
            </div>
            {record.status_reason && <p className="text-slate-500">{record.status_reason}</p>}
            {record.is_overridden && record.override_reason && <p className="text-slate-600">Current correction: {record.override_reason}</p>}
          </div>

          {isCancelled ? (
            <ErrorState title="Cancelled class" message="This class was cancelled; attendance cannot be corrected. An administrator can restore the session instead." />
          ) : (
            <>
              <Select id="corr-status" label="New status" required value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Choose a status" options={options} />
              <div className="space-y-1">
                <label htmlFor="corr-reason" className="block text-xs font-medium text-slate-700">
                  Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="corr-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                  required
                  aria-invalid={reason.length > 0 && !reasonOk}
                  placeholder="e.g. Verified with the classroom reader log; student was present but the exit scan failed."
                  className={textareaCls}
                />
                <p className="text-[11px] text-slate-500">Required (at least 3 characters). Stored in the audit log.</p>
              </div>
            </>
          )}

          {err && <ErrorState title={err.title} message={err.message} />}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            {!isCancelled && (
              <Button type="submit" isLoading={saving} disabled={!valid}>
                Save correction
              </Button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
};

const ResolveModal: React.FC<{ dispute: AttendanceDispute | null; onClose: () => void; onDone: () => void }> = ({ dispute, onClose, onDone }) => {
  const toast = useToast();
  const [status, setStatus] = useState<'RESOLVED' | 'REJECTED'>('RESOLVED');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = note.trim().length >= 3;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispute || !valid) return;
    setSaving(true);
    setErr(null);
    try {
      await ApiClient.post(`/attendance/disputes/${dispute.id}/resolve`, { status, note: note.trim() });
      toast.success(status === 'RESOLVED' ? 'Request resolved' : 'Request rejected', 'The student has been notified.');
      onDone();
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.status === 403 ? `Not permitted: ${e2.message}` : errorMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!dispute} onClose={onClose} title="Respond to review request" maxWidth="lg">
      {dispute && (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
            <p className="font-semibold text-slate-900">
              {dispute.student_name} <span className="font-mono font-normal text-slate-500">{dispute.student_usn}</span>
            </p>
            <p className="text-slate-600">
              <span className="font-mono font-semibold text-blue-700">{dispute.subject_code}</span> · {prettyDate(dispute.date)}
              {dispute.final_status && ` · currently ${ATTENDANCE_STATUS_META[dispute.final_status]?.label ?? dispute.final_status}`}
            </p>
            <p className="text-slate-700 whitespace-pre-wrap pt-1">“{dispute.message}”</p>
          </div>
          <fieldset>
            <legend className="text-xs font-medium text-slate-700 mb-1.5">Outcome</legend>
            <div className="flex gap-2">
              {(['RESOLVED', 'REJECTED'] as const).map((s) => (
                <label
                  key={s}
                  className={cn(
                    'flex-1 cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium text-center focus-within:ring-2 focus-within:ring-blue-500',
                    status === s ? (s === 'RESOLVED' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-rose-300 bg-rose-50 text-rose-800') : 'border-slate-200 text-slate-600'
                  )}
                >
                  <input type="radio" name="resolve-status" value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" />
                  {s === 'RESOLVED' ? 'Resolve' : 'Reject'}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1">
            <label htmlFor="resolve-note" className="block text-xs font-medium text-slate-700">
              Note to the student <span className="text-rose-500">*</span>
            </label>
            <textarea id="resolve-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} required className={textareaCls} placeholder="Explain the outcome." />
            <p className="text-[11px] text-slate-500">This does not change the attendance record. Correct the record separately if needed.</p>
          </div>
          {err && <ErrorState title="Could not save the response" message={err} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant={status === 'REJECTED' ? 'danger' : 'primary'} isLoading={saving} disabled={!valid}>
              {status === 'RESOLVED' ? 'Mark resolved' : 'Reject request'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

const StudentSummaryModal: React.FC<{ studentId: number | null; onClose: () => void }> = ({ studentId, onClose }) => {
  const fetchSummary = useMemo(
    () => (studentId === null ? null : () => ApiClient.get<StudentAttendanceSummary>(`/attendance/students/${studentId}/summary`)),
    [studentId]
  );
  const api = useApi(fetchSummary);
  const data = api.fresh ? api.data : null;
  const loading = api.loading;
  const load = api.reload;
  const error = api.error;

  const threshold = data?.policy.minimum_percentage;
  const records = useMemo(
    () => [...(data?.records || [])].sort((a, b) => b.date.localeCompare(a.date) || (b.scheduled_start || '').localeCompare(a.scheduled_start || '')),
    [data]
  );

  return (
    <Modal
      isOpen={studentId !== null}
      onClose={onClose}
      title={data?.student?.student_name ? `${data.student.student_name}` : 'Student attendance'}
      description={data ? [data.student?.student_usn, data.student?.section, 'your classes only'].filter(Boolean).join(' · ') : undefined}
      maxWidth="2xl"
    >
      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <ErrorState title="Could not load this student's attendance" message={error} onRetry={load} />
      ) : data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniStat label="Attendance" value={<PercentValue value={data.overall.percentage} threshold={threshold} />} />
            <MiniStat label="Classes held" value={data.overall.classes_held} />
            <MiniStat label="Attended" value={data.overall.attended} />
            <MiniStat label="Late / pending" value={`${data.overall.late} / ${data.overall.pending}`} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-700 mb-2">By subject</h4>
            {data.subjects.length === 0 ? (
              <p className="text-xs text-slate-500">{EMPTY_MESSAGE}</p>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <thead>
                    <tr>
                      <Th>Subject</Th>
                      <Th className="text-right">Held</Th>
                      <Th className="text-right">Present</Th>
                      <Th className="text-right">Late</Th>
                      <Th className="text-right">Partial</Th>
                      <Th className="text-right">Absent</Th>
                      <Th className="text-right">%</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subjects.map((s) => (
                      <tr key={s.subject_id} className={cn(s.below_threshold && 'bg-rose-50/50')}>
                        <Td className="font-mono text-xs font-semibold text-blue-700">{s.subject_code}</Td>
                        <Td className="text-right tabular-nums">{s.classes_held}</Td>
                        <Td className="text-right tabular-nums">{s.present}</Td>
                        <Td className="text-right tabular-nums">{s.late}</Td>
                        <Td className="text-right tabular-nums">{s.partial}</Td>
                        <Td className="text-right tabular-nums">{s.absent}</Td>
                        <Td className="text-right">
                          <PercentValue value={s.percentage} threshold={s.threshold} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-700 mb-2">Class records ({records.length})</h4>
            {records.length === 0 ? (
              <p className="text-xs text-slate-500">No class records in your classes.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 max-h-72 overflow-y-auto">
                {records.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                    <span className="text-xs text-slate-700 w-32">{prettyDate(r.date)}</span>
                    <span className="font-mono text-xs font-semibold text-blue-700 w-16">{r.subject_code}</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {hhmm(r.scheduled_start)}–{hhmm(r.scheduled_end)}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {r.attended_minutes ?? 0}/{r.scheduled_minutes ?? 0} min
                    </span>
                    <span className="ml-auto">
                      <AttendanceStatusBadge status={r.final_status} corrected={r.is_overridden} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

const MiniStat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-[11px] text-slate-500">{label}</p>
    <p className="text-lg font-bold text-slate-900 tabular-nums">{value}</p>
  </div>
);

const ExportModal: React.FC<{ open: boolean; onClose: () => void; overview: LecturerOverview | null }> = ({ open, onClose, overview }) => {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cls, setCls] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const classOptions = (overview?.classes || []).map((c) => ({
    value: `${c.subject_id}:${c.section_id ?? ''}`,
    label: `${c.subject_code ?? ''} · ${c.section ?? 'Section'}`,
  }));
  const invalidRange = !!from && !!to && to < from;

  const download = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalidRange) return;
    const [subjectId, sectionId] = cls ? cls.split(':') : ['', ''];
    setBusy(true);
    setErr(null);
    try {
      await ApiClient.download(
        '/attendance/export' + qs({ date_from: from, date_to: to, subject_id: subjectId, section_id: sectionId, status }),
        'class_attendance.csv'
      );
      toast.success('Export ready', 'class_attendance.csv has been downloaded.');
      onClose();
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.status === 403 ? `Not permitted: ${e2.message}` : errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Export class attendance" description="CSV of attendance records for your classes. Leave filters empty to export everything." maxWidth="lg">
      <form onSubmit={download} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="exp-from" label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input id="exp-to" label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={invalidRange ? 'Must be on or after the start date' : undefined} />
          <Select id="exp-class" label="Class" value={cls} onChange={(e) => setCls(e.target.value)} placeholder="All my classes" options={classOptions} />
          <Select
            id="exp-status"
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="All statuses"
            options={STATUS_ORDER.map((s) => ({ value: s, label: ATTENDANCE_STATUS_META[s].label }))}
          />
        </div>
        {err && <ErrorState title="Export failed" message={err} />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" isLoading={busy} disabled={invalidRange} leftIcon={<Download className="w-3.5 h-3.5" />}>
            Download CSV
          </Button>
        </div>
      </form>
    </Modal>
  );
};
