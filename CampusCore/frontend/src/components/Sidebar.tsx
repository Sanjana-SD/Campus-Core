import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, CalendarDays, Clock, AlertCircle, FileSpreadsheet, Award,
  BarChart3, History, Settings, ClipboardList, Bell, LogOut, FolderTree, Briefcase, Building2,
  ListChecks, SlidersHorizontal, ShieldCheck, FileSearch, UserCog, Send, Inbox,
} from 'lucide-react';
import { useAuth, UserRole, ROLE_HOME, ROLE_LABEL } from '../context/AuthContext';
import { cn } from '../lib/utils';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  badge?: number;
}

export const Sidebar: React.FC<{ isCollapsed?: boolean; onCloseMobile?: () => void }> = ({
  isCollapsed = false,
  onCloseMobile,
}) => {
  const { role, logout, user } = useAuth();

  const getNavItems = (currentRole: UserRole | null): { group: string; items: NavItem[] }[] => {
    if (currentRole === 'ADMIN') {
      return [
        {
          group: 'Core Administration',
          items: [
            { label: 'Overview', to: '/admin', icon: <LayoutDashboard className="w-4 h-4" /> },
            { label: 'Students', to: '/admin/students', icon: <Users className="w-4 h-4" /> },
            { label: 'Lecturers', to: '/admin/lecturers', icon: <GraduationCap className="w-4 h-4" /> },
            { label: 'Academic Hierarchy', to: '/admin/academic', icon: <FolderTree className="w-4 h-4" /> },
            { label: 'Timetable', to: '/admin/timetable', icon: <CalendarDays className="w-4 h-4" /> },
            { label: 'Users & Roles', to: '/admin/users', icon: <UserCog className="w-4 h-4" /> },
          ],
        },
        {
          group: 'RFID & Attendance',
          items: [
            { label: 'Attendance Dashboard', to: '/admin/attendance', icon: <Clock className="w-4 h-4" /> },
            { label: 'Class Attendance', to: '/admin/attendance/records', icon: <ListChecks className="w-4 h-4" /> },
            { label: 'RFID Source Data', to: '/admin/attendance/source', icon: <FileSearch className="w-4 h-4" /> },
            { label: 'Unmatched UIDs', to: '/admin/attendance/unmatched', icon: <AlertCircle className="w-4 h-4" /> },
            { label: 'Attendance Policy', to: '/admin/attendance/policy', icon: <SlidersHorizontal className="w-4 h-4" /> },
            { label: 'Google Sheets', to: '/admin/google-sheets', icon: <FileSpreadsheet className="w-4 h-4" /> },
          ],
        },
        {
          group: 'Academics & Oversight',
          items: [
            { label: 'Examinations & Marks', to: '/admin/exams', icon: <Award className="w-4 h-4" /> },
            { label: 'Placements', to: '/placement', icon: <Briefcase className="w-4 h-4" /> },
            { label: 'Reports & Exports', to: '/admin/reports', icon: <BarChart3 className="w-4 h-4" /> },
            { label: 'Audit Logs', to: '/admin/audit-logs', icon: <History className="w-4 h-4" /> },
            { label: 'Settings', to: '/admin/settings', icon: <Settings className="w-4 h-4" /> },
          ],
        },
      ];
    }

    if (currentRole === 'LECTURER') {
      return [
        {
          group: 'Lecturer Workspace',
          items: [
            { label: 'Overview', to: '/lecturer', icon: <LayoutDashboard className="w-4 h-4" /> },
            { label: 'My Timetable', to: '/lecturer/classes', icon: <CalendarDays className="w-4 h-4" /> },
            { label: 'Class Attendance', to: '/lecturer/attendance', icon: <Clock className="w-4 h-4" /> },
            { label: 'Assignments & Grading', to: '/lecturer/assignments', icon: <ClipboardList className="w-4 h-4" /> },
            { label: 'Internal Assessment Marks', to: '/lecturer/marks', icon: <Award className="w-4 h-4" /> },
            { label: 'Announcements', to: '/lecturer/announcements', icon: <Bell className="w-4 h-4" /> },
          ],
        },
      ];
    }

    if (currentRole === 'PLACEMENT_OFFICER') {
      return [
        {
          group: 'Placement Office',
          items: [
            { label: 'Dashboard', to: '/placement', icon: <LayoutDashboard className="w-4 h-4" /> },
            { label: 'Companies', to: '/placement/companies', icon: <Building2 className="w-4 h-4" /> },
            { label: 'Placement Drives', to: '/placement/drives', icon: <Briefcase className="w-4 h-4" /> },
            { label: 'Reports', to: '/placement/reports', icon: <BarChart3 className="w-4 h-4" /> },
            { label: 'Notifications', to: '/placement/notifications', icon: <Inbox className="w-4 h-4" /> },
          ],
        },
      ];
    }

    // STUDENT
    return [
      {
        group: 'Student Workspace',
        items: [
          { label: 'Overview', to: '/student', icon: <LayoutDashboard className="w-4 h-4" /> },
          { label: 'My Attendance', to: '/student/attendance', icon: <Clock className="w-4 h-4" /> },
          { label: 'My Timetable', to: '/student/timetable', icon: <CalendarDays className="w-4 h-4" /> },
          { label: 'Assignments', to: '/student/assignments', icon: <ClipboardList className="w-4 h-4" /> },
          { label: 'Marks & Results', to: '/student/results', icon: <Award className="w-4 h-4" /> },
          { label: 'Announcements', to: '/student/announcements', icon: <Bell className="w-4 h-4" /> },
        ],
      },
      {
        group: 'Placements',
        items: [
          { label: 'Placement Overview', to: '/student/placements', icon: <Briefcase className="w-4 h-4" /> },
          { label: 'Placement Drives', to: '/student/placements/drives', icon: <Building2 className="w-4 h-4" /> },
          { label: 'My Applications', to: '/student/placements/applications', icon: <Send className="w-4 h-4" /> },
          { label: 'Placement History', to: '/student/placements/history', icon: <ShieldCheck className="w-4 h-4" /> },
          { label: 'Notifications', to: '/student/notifications', icon: <Inbox className="w-4 h-4" /> },
        ],
      },
    ];
  };

  const navGroups = getNavItems(role);

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 h-screen sticky top-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800 bg-slate-950/40">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/20">
          <GraduationCap className="w-5 h-5" />
        </div>
        <div className="overflow-hidden">
          <div className="text-sm font-bold text-white tracking-tight truncate">Campus Core</div>
          <div className="text-[10px] text-blue-400 font-medium tracking-wide uppercase truncate">
            {role ? ROLE_LABEL[role] : 'Portal'}
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navGroups.map((group, idx) => (
          <div key={idx} className="space-y-1">
            <h4 className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-2">
              {group.group}
            </h4>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={Object.values(ROLE_HOME).includes(item.to) || item.to === '/student/placements' || item.to === '/admin/attendance'}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  )
                }
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      {/* Footer Profile & Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/30">
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 mb-2">
          <div className="truncate mr-2">
            <div className="text-xs font-semibold text-white truncate">{user?.full_name}</div>
            <div className="text-[10px] text-slate-300 truncate">@{user?.username}</div>
          </div>
          <button
            onClick={logout}
            title="Log Out"
            className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-slate-800 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
