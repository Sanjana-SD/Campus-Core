import React, { useCallback, useMemo } from 'react';
import { CalendarDays, Lock, RefreshCw } from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { Card, CardDescription, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { ErrorState, PageHeader, Skeleton, StatCard } from '../../components/ui/Kit';
import { WeekSessionsCard, WeeklyTimetableGrid } from '../../components/attendance/AttendanceShared';
import type { MyTimetable } from '../../components/attendance/types';
import { useApi } from '../../components/attendance/useApi';

export const LecturerTimetable: React.FC = () => {
  const fetchTimetable = useCallback(() => ApiClient.get<MyTimetable>('/timetable/my'), []);
  const { data, loading, error, reload: load } = useApi(fetchTimetable);

  const entries = useMemo(() => data?.entries || [], [data]);
  const stats = useMemo(() => {
    const minutes = entries.reduce((sum, e) => {
      const [sh, sm] = e.start_time.split(':').map(Number);
      const [eh, em] = e.end_time.split(':').map(Number);
      return sum + Math.max(0, eh * 60 + em - (sh * 60 + sm));
    }, 0);
    return {
      periods: entries.length,
      subjects: new Set(entries.map((e) => e.subject_id)).size,
      sections: new Set(entries.map((e) => e.section_id)).size,
      hours: minutes / 60,
    };
  }, [entries]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teaching"
        title="My Classes"
        description="Your assigned weekly teaching timetable and this week's concrete sessions, including cancellations."
        actions={
          <Button variant="outline" size="sm" onClick={load} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        }
      />

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          The timetable is read-only for lecturers. Changes to periods, rooms or cancellations are made by the administration.
        </p>
      </div>

      {!loading && !error && entries.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Weekly periods" value={stats.periods} />
          <StatCard label="Subjects" value={stats.subjects} />
          <StatCard label="Sections" value={stats.sections} />
          <StatCard label="Teaching hours / week" value={stats.hours.toFixed(1)} />
        </div>
      )}

      <Card>
        <div className="mb-4">
          <CardTitle>Weekly teaching schedule</CardTitle>
          <CardDescription>Recurring periods assigned to you. Today is highlighted.</CardDescription>
        </div>
        {loading && !data ? (
          <div className="grid gap-3 md:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : error ? (
          <ErrorState title="Could not load your timetable" message={error} onRetry={load} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="w-6 h-6" />}
            title="No classes assigned"
            description="You have no timetable periods assigned yet. Contact the administration if this is unexpected."
          />
        ) : (
          <WeeklyTimetableGrid entries={entries} breaks={data?.breaks || []} perspective="lecturer" />
        )}
      </Card>

      <WeekSessionsCard perspective="lecturer" />
    </div>
  );
};
