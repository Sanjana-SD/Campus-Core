import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, KeyRound, SlidersHorizontal } from 'lucide-react';
import { ApiClient } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ErrorState } from '../../components/ui/Kit';
import { useToast } from '../../components/ui/Toast';
import { errorMessage } from '../../lib/utils';
import { useApi } from './attendanceShared';

interface SystemSettings {
  institution_name: string;
  version?: string;
  timezone?: string;
  minimum_attendance_threshold?: number;
  late_arrival_grace_minutes?: number;
  total_departments: number;
  total_courses?: number;
  total_students: number;
  total_lecturers: number;
}

export const SettingsPage: React.FC = () => {
  const toast = useToast();
  const settingsQ = useApi<SystemSettings>('/settings');
  const settingsData = settingsQ.data;
  const loading = settingsQ.loading && !settingsData;
  const loadError = settingsQ.error;
  const fetchSettings = settingsQ.reload;

  // Password change state
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdMsg(null);

    if (pwdForm.new_password !== pwdForm.confirm) {
      setPwdError('New passwords do not match');
      return;
    }

    try {
      await ApiClient.post('/auth/change-password', {
        current_password: pwdForm.current_password,
        new_password: pwdForm.new_password,
      });
      setPwdMsg('Password updated successfully!');
      toast.success('Password updated');
      setPwdForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      setPwdError(errorMessage(err) || 'Failed to change password');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading institution settings and parameters..." />;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Institution overview and account security. Attendance rules are managed on the attendance policy page.
        </p>
      </div>

      {loadError && <ErrorState title="Could not load system settings" message={loadError} onRetry={fetchSettings} />}

      {/* College Info Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Institution Identity & Overview</CardTitle>
          <CardDescription>Core product branding and database status</CardDescription>
        </CardHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Product Name</span>
            <span className="font-bold text-slate-900">{settingsData?.institution_name}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Active Departments</span>
            <span className="font-bold text-slate-900">{settingsData?.total_departments}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Registered Students</span>
            <span className="font-bold text-slate-900">{settingsData?.total_students}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Faculty Staff</span>
            <span className="font-bold text-slate-900">{settingsData?.total_lecturers}</span>
          </div>
        </div>
      </Card>

      {/* Attendance policy now lives on its own page */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Attendance policy</h3>
              <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
                Thresholds, late-arrival grace, handling of incomplete RFID scans, tracking start date, timezone, subject overrides and
                enrollment exceptions.
                {settingsData?.minimum_attendance_threshold !== undefined && (
                  <> Currently: minimum {settingsData.minimum_attendance_threshold}% attendance, {settingsData.late_arrival_grace_minutes}-minute grace, timezone {settingsData.timezone}.</>
                )}
              </p>
            </div>
          </div>
          <Link to="/admin/attendance/policy" className="shrink-0">
            <Button variant="outline" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
              Open attendance policy
            </Button>
          </Link>
        </div>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Administrator Password Management</CardTitle>
          <CardDescription>Update your secure account password</CardDescription>
        </CardHeader>

        {pwdMsg && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            {pwdMsg}
          </div>
        )}
        {pwdError && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {pwdError}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-3 max-w-md">
          <Input
            label="Current Password"
            type="password"
            required
            value={pwdForm.current_password}
            onChange={(e) => setPwdForm({ ...pwdForm, current_password: e.target.value })}
          />
          <Input
            label="New Password"
            type="password"
            required
            value={pwdForm.new_password}
            onChange={(e) => setPwdForm({ ...pwdForm, new_password: e.target.value })}
          />
          <Input
            label="Confirm New Password"
            type="password"
            required
            value={pwdForm.confirm}
            onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })}
          />
          <Button type="submit" variant="outline" size="sm" leftIcon={<KeyRound className="w-3.5 h-3.5" />}>
            Update Password
          </Button>
        </form>
      </Card>
    </div>
  );
};
