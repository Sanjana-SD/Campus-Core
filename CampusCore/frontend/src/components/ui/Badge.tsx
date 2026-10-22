import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default' | 'neutral';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className }) => {
  const variantStyles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    warning: 'bg-amber-50 text-amber-700 border-amber-200/60',
    danger: 'bg-rose-50 text-rose-700 border-rose-200/60',
    info: 'bg-blue-50 text-blue-700 border-blue-200/60',
    default: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border shadow-xs transition-colors',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const norm = (status || '').toUpperCase();
  if (norm === 'PRESENT') return <Badge variant="success">Present</Badge>;
  if (norm === 'LATE') return <Badge variant="warning">Late Arrival</Badge>;
  if (norm === 'INCOMPLETE') return <Badge variant="warning">Missing Exit</Badge>;
  if (norm === 'ABSENT') return <Badge variant="danger">Absent</Badge>;
  if (norm === 'UNMATCHED_UID') return <Badge variant="danger">Unregistered Card</Badge>;
  if (norm === 'PENDING_REVIEW') return <Badge variant="info">Under Review</Badge>;
  return <Badge variant="neutral">{status || 'Unknown'}</Badge>;
};

/** Per-class attendance statuses produced by the timetable-based engine. */
export const ATTENDANCE_STATUS_META: Record<string, { label: string; variant: BadgeProps['variant']; dot: string }> = {
  PRESENT: { label: 'Present', variant: 'success', dot: 'bg-emerald-500' },
  LATE: { label: 'Late', variant: 'warning', dot: 'bg-amber-500' },
  PARTIAL: { label: 'Partial', variant: 'default', dot: 'bg-indigo-500' },
  ABSENT: { label: 'Absent', variant: 'danger', dot: 'bg-rose-500' },
  PENDING_VERIFICATION: { label: 'Pending verification', variant: 'info', dot: 'bg-sky-500' },
  EXCUSED: { label: 'Excused', variant: 'neutral', dot: 'bg-slate-400' },
  CANCELLED: { label: 'Class cancelled', variant: 'neutral', dot: 'bg-slate-300' },
};

export const AttendanceStatusBadge: React.FC<{ status: string; corrected?: boolean }> = ({ status, corrected }) => {
  const meta = ATTENDANCE_STATUS_META[(status || '').toUpperCase()];
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={meta?.variant || 'neutral'}>{meta?.label || status || 'Unknown'}</Badge>
      {corrected && (
        <span className="text-[10px] font-medium text-slate-500" title="Manually corrected">
          (corrected)
        </span>
      )}
    </span>
  );
};

/** RFID source-row identity matching outcome. */
export const MatchStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, [string, BadgeProps['variant']]> = {
    MATCHED: ['Matched', 'success'],
    UNMATCHED: ['Unmatched UID', 'danger'],
    CONFLICT: ['Conflict', 'warning'],
    STAFF: ['Staff', 'neutral'],
    IGNORED: ['Ignored', 'neutral'],
  };
  const [label, variant] = map[status] || [status, 'neutral'];
  return <Badge variant={variant}>{label}</Badge>;
};

/** Placement drive effective status. */
export const DriveStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, [string, BadgeProps['variant']]> = {
    DRAFT: ['Draft', 'neutral'],
    UPCOMING: ['Upcoming', 'info'],
    APPLICATIONS_OPEN: ['Applications open', 'success'],
    APPLICATIONS_CLOSED: ['Applications closed', 'warning'],
    IN_PROGRESS: ['In progress', 'default'],
    COMPLETED: ['Completed', 'neutral'],
    CANCELLED: ['Cancelled', 'danger'],
  };
  const [label, variant] = map[status] || [status, 'neutral'];
  return <Badge variant={variant}>{label}</Badge>;
};

/** Overall position of a placement application in the pipeline (from the backend's overall_status). */
export const ApplicationStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const variant: BadgeProps['variant'] =
    status === 'Placed' || status === 'Offer Accepted' || status === 'Selected'
      ? 'success'
      : status === 'Offer Received' || status === 'Shortlisted'
        ? 'info'
        : status === 'Rejected' || status === 'Did Not Attend' || status === 'Offer Declined' || status === 'Registration Rejected'
          ? 'danger'
          : status === 'Withdrawn'
            ? 'neutral'
            : 'default';
  return <Badge variant={variant}>{status}</Badge>;
};
