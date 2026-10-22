import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { DashboardLayout } from './components/DashboardLayout';

// Public pages
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { PrivacyPolicy, TermsOfService } from './pages/public/LegalPages';

// Admin pages

// Lecturer pages

// Student pages

// Placement officer pages

// Shared
import { LoadingSpinner } from './components/ui/LoadingSpinner';

// Dashboard pages are loaded on demand so the public landing page stays light.
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview').then((m) => ({ default: m.AdminOverview })));
const StudentsManagement = lazy(() => import('./pages/admin/StudentsManagement').then((m) => ({ default: m.StudentsManagement })));
const LecturersManagement = lazy(() => import('./pages/admin/LecturersManagement').then((m) => ({ default: m.LecturersManagement })));
const AcademicManagement = lazy(() => import('./pages/admin/AcademicManagement').then((m) => ({ default: m.AcademicManagement })));
const TimetableManagement = lazy(() => import('./pages/admin/TimetableManagement').then((m) => ({ default: m.TimetableManagement })));
const AttendanceDashboard = lazy(() => import('./pages/admin/AttendanceDashboard').then((m) => ({ default: m.AttendanceDashboard })));
const AttendanceRecords = lazy(() => import('./pages/admin/AttendanceRecords').then((m) => ({ default: m.AttendanceRecords })));
const AttendanceManagement = lazy(() => import('./pages/admin/AttendanceManagement').then((m) => ({ default: m.AttendanceManagement })));
const AttendanceReviewQueue = lazy(() => import('./pages/admin/AttendanceReviewQueue').then((m) => ({ default: m.AttendanceReviewQueue })));
const AttendancePolicyPage = lazy(() => import('./pages/admin/AttendancePolicyPage').then((m) => ({ default: m.AttendancePolicyPage })));
const GoogleSheetsIntegration = lazy(() => import('./pages/admin/GoogleSheetsIntegration').then((m) => ({ default: m.GoogleSheetsIntegration })));
const ExaminationsManagement = lazy(() => import('./pages/admin/ExaminationsManagement').then((m) => ({ default: m.ExaminationsManagement })));
const ReportsPage = lazy(() => import('./pages/admin/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const AuditLogsPage = lazy(() => import('./pages/admin/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const UsersManagement = lazy(() => import('./pages/admin/UsersManagement').then((m) => ({ default: m.UsersManagement })));
const LecturerDashboard = lazy(() => import('./pages/lecturer/LecturerDashboard').then((m) => ({ default: m.LecturerDashboard })));
const LecturerTimetable = lazy(() => import('./pages/lecturer/LecturerTimetable').then((m) => ({ default: m.LecturerTimetable })));
const LecturerAttendance = lazy(() => import('./pages/lecturer/LecturerAttendance').then((m) => ({ default: m.LecturerAttendance })));
const LecturerAssignments = lazy(() => import('./pages/lecturer/LecturerAssignments').then((m) => ({ default: m.LecturerAssignments })));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard').then((m) => ({ default: m.StudentDashboard })));
const StudentAttendance = lazy(() => import('./pages/student/StudentAttendance').then((m) => ({ default: m.StudentAttendance })));
const StudentAssignments = lazy(() => import('./pages/student/StudentAssignments').then((m) => ({ default: m.StudentAssignments })));
const StudentResults = lazy(() => import('./pages/student/StudentResults').then((m) => ({ default: m.StudentResults })));
const StudentTimetable = lazy(() => import('./pages/student/StudentTimetable').then((m) => ({ default: m.StudentTimetable })));
const StudentPlacements = lazy(() => import('./pages/student/placements/StudentPlacements').then((m) => ({ default: m.StudentPlacements })));
const StudentDrives = lazy(() => import('./pages/student/placements/StudentDrives').then((m) => ({ default: m.StudentDrives })));
const StudentDriveDetail = lazy(() => import('./pages/student/placements/StudentDriveDetail').then((m) => ({ default: m.StudentDriveDetail })));
const StudentApplications = lazy(() => import('./pages/student/placements/StudentApplications').then((m) => ({ default: m.StudentApplications })));
const StudentPlacementHistory = lazy(() => import('./pages/student/placements/StudentPlacementHistory').then((m) => ({ default: m.StudentPlacementHistory })));
const PlacementDashboard = lazy(() => import('./pages/placement/PlacementDashboard').then((m) => ({ default: m.PlacementDashboard })));
const CompaniesPage = lazy(() => import('./pages/placement/CompaniesPage').then((m) => ({ default: m.CompaniesPage })));
const DrivesPage = lazy(() => import('./pages/placement/DrivesPage').then((m) => ({ default: m.DrivesPage })));
const DriveFormPage = lazy(() => import('./pages/placement/DriveFormPage').then((m) => ({ default: m.DriveFormPage })));
const DriveDetailPage = lazy(() => import('./pages/placement/DriveDetailPage').then((m) => ({ default: m.DriveDetailPage })));
const PlacementReportsPage = lazy(() => import('./pages/placement/PlacementReportsPage').then((m) => ({ default: m.PlacementReportsPage })));
const AnnouncementsPage = lazy(() => import('./pages/shared/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })));
const NotificationsPage = lazy(() => import('./pages/shared/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingSpinner message="Loading..." /></div>}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />

            {/* Administrator */}
            <Route path="/admin" element={<DashboardLayout allowedRoles={['ADMIN']} />}>
              <Route index element={<AdminOverview />} />
              <Route path="students" element={<StudentsManagement />} />
              <Route path="lecturers" element={<LecturersManagement />} />
              <Route path="academic" element={<AcademicManagement />} />
              <Route path="timetable" element={<TimetableManagement />} />
              <Route path="attendance" element={<AttendanceDashboard />} />
              <Route path="attendance/records" element={<AttendanceRecords />} />
              <Route path="attendance/source" element={<AttendanceManagement />} />
              <Route path="attendance/unmatched" element={<AttendanceReviewQueue />} />
              <Route path="attendance/policy" element={<AttendancePolicyPage />} />
              <Route path="google-sheets" element={<GoogleSheetsIntegration />} />
              <Route path="exams" element={<ExaminationsManagement />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="users" element={<UsersManagement />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            {/* Lecturer */}
            <Route path="/lecturer" element={<DashboardLayout allowedRoles={['LECTURER']} />}>
              <Route index element={<LecturerDashboard />} />
              <Route path="classes" element={<LecturerTimetable />} />
              <Route path="attendance" element={<LecturerAttendance />} />
              <Route path="assignments" element={<LecturerAssignments />} />
              <Route path="marks" element={<ExaminationsManagement />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            {/* Student */}
            <Route path="/student" element={<DashboardLayout allowedRoles={['STUDENT']} />}>
              <Route index element={<StudentDashboard />} />
              <Route path="attendance" element={<StudentAttendance />} />
              <Route path="timetable" element={<StudentTimetable />} />
              <Route path="assignments" element={<StudentAssignments />} />
              <Route path="results" element={<StudentResults />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="placements" element={<StudentPlacements />} />
              <Route path="placements/drives" element={<StudentDrives />} />
              <Route path="placements/drives/:driveId" element={<StudentDriveDetail />} />
              <Route path="placements/applications" element={<StudentApplications />} />
              <Route path="placements/history" element={<StudentPlacementHistory />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            {/* Placement officer (administrators have oversight access) */}
            <Route path="/placement" element={<DashboardLayout allowedRoles={['PLACEMENT_OFFICER', 'ADMIN']} />}>
              <Route index element={<PlacementDashboard />} />
              <Route path="companies" element={<CompaniesPage />} />
              <Route path="drives" element={<DrivesPage />} />
              <Route path="drives/new" element={<DriveFormPage />} />
              <Route path="drives/:driveId" element={<DriveDetailPage />} />
              <Route path="drives/:driveId/edit" element={<DriveFormPage />} />
              <Route path="reports" element={<PlacementReportsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
