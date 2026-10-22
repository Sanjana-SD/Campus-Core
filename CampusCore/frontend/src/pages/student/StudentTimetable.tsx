import React, { useCallback } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardDescription, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { ErrorState, PageHeader, Skeleton } from '../../components/ui/Kit';
import { WeekSessionsCard, WeeklyTimetableGrid } from '../../components/attendance/AttendanceShared';
import type { MyTimetable } from '../../components/attendance/types';
import { useApi } from '../../components/attendance/useApi';

export const StudentTimetable: React.FC = () => {
  const { user } = useAuth();
  const fetchTimetable = useCallback(() => ApiClient.get<MyTimetable>('/timetable/my'), []);
  const { data, loading, error, reload: load } = useApi(fetchTimetable);

  const entries = data?.entries || [];
  const section = entries[0]?.section_label || (user?.student_profile?.section_name ? `Section ${user.student_profile.section_name}` : null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academics"
        title="My Timetable"
        description={
          <>
            Your section's weekly class schedule{section ? ` (${section})` : ''}. Attendance for each class is calculated
            against these scheduled times.
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={load} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        }
      />

      <Card>
        <div className="mb-4">
          <CardTitle>Weekly schedule</CardTitle>
          <CardDescription>Recurring classes and breaks. Today is highlighted.</CardDescription>
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
            title="No timetable published yet"
            description="Your section does not have any scheduled classes yet. The timetable is managed by the administration."
          />
        ) : (
          <WeeklyTimetableGrid entries={entries} breaks={data?.breaks || []} perspective="student" />
        )}
      </Card>

      <WeekSessionsCard perspective="student" />
    </div>
  );
};
