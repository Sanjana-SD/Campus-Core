import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, KeyRound, Minus, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { ApiClient, ApiError, qs } from '../../lib/api';
import { useApiQuery } from '../student/placements/useApiQuery';
import { cn, errorMessage, formatDate } from '../../lib/utils';
import { ConfirmDialog, ErrorState, PageHeader, Pagination, Table, TableSkeleton, Tabs, Td, Th } from '../../components/ui/Kit';
import { Badge, type BadgeProps } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { ROLE_LABEL, type UserRole, useAuth } from '../../context/AuthContext';

interface UserRow {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  phone: string | null;
  created_at: string | null;
}
interface UsersResponse {
  total: number;
  counts: Record<UserRole, number>;
  items: UserRow[];
}

const PAGE_SIZE = 20;
const ROLES: UserRole[] = ['ADMIN', 'LECTURER', 'STUDENT', 'PLACEMENT_OFFICER'];
const ROLE_VARIANT: Record<UserRole, BadgeProps['variant']> = {
  ADMIN: 'danger',
  LECTURER: 'info',
  STUDENT: 'neutral',
  PLACEMENT_OFFICER: 'default',
};

type Access = 'full' | 'partial' | 'none';
const MATRIX: { area: string; access: Record<UserRole, Access>; note?: string }[] = [
  { area: 'User & role management', access: { ADMIN: 'full', LECTURER: 'none', STUDENT: 'none', PLACEMENT_OFFICER: 'none' } },
  { area: 'Academic setup & timetable', access: { ADMIN: 'full', LECTURER: 'partial', STUDENT: 'partial', PLACEMENT_OFFICER: 'none' }, note: 'Lecturers and students see their own timetable' },
  { area: 'Attendance administration', access: { ADMIN: 'full', LECTURER: 'partial', STUDENT: 'none', PLACEMENT_OFFICER: 'none' }, note: 'Lecturers mark their own classes' },
  { area: 'Own attendance & results', access: { ADMIN: 'none', LECTURER: 'none', STUDENT: 'full', PLACEMENT_OFFICER: 'none' } },
  { area: 'Student records', access: { ADMIN: 'full', LECTURER: 'partial', STUDENT: 'partial', PLACEMENT_OFFICER: 'partial' }, note: 'Officers see placement-relevant fields of applicants only; students see their own' },
  { area: 'Exams & marks', access: { ADMIN: 'full', LECTURER: 'partial', STUDENT: 'partial', PLACEMENT_OFFICER: 'none' } },
  { area: 'Companies & drives', access: { ADMIN: 'full', LECTURER: 'none', STUDENT: 'partial', PLACEMENT_OFFICER: 'full' }, note: 'Students browse published drives and apply' },
  { area: 'Placement results & offers', access: { ADMIN: 'full', LECTURER: 'none', STUDENT: 'partial', PLACEMENT_OFFICER: 'full' }, note: 'Students view their own, read-only' },
  { area: 'Reports & audit logs', access: { ADMIN: 'full', LECTURER: 'none', STUDENT: 'none', PLACEMENT_OFFICER: 'partial' }, note: 'Officers get placement reports only' },
];

const AccessCell: React.FC<{ a: Access }> = ({ a }) =>
  a === 'full' ? (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 text-emerald-600" title="Full access">
      <Check className="w-3.5 h-3.5" />
      <span className="sr-only">Full access</span>
    </span>
  ) : a === 'partial' ? (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold" title="Limited / own records">
      ½<span className="sr-only">Limited access</span>
    </span>
  ) : (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400" title="No access">
      <Minus className="w-3.5 h-3.5" />
      <span className="sr-only">No access</span>
    </span>
  );

const EMPTY_FORM = { username: '', email: '', full_name: '', password: '', confirm: '', role: 'PLACEMENT_OFFICER', phone: '' };

export const UsersManagement: React.FC = () => {
  const toast = useToast();
  const { user: me } = useAuth();
  const [role, setRole] = useState<'' | UserRole>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof typeof EMPTY_FORM, string>>>({});
  const [saving, setSaving] = useState(false);

  const [toggleUser, setToggleUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data, loading, error, reload: load } = useApiQuery<UsersResponse>(
    `/users${qs({ role, search: debounced, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE })}`
  );

  const totalAll = data ? ROLES.reduce((s, r) => s + (data.counts[r] || 0), 0) : null;

  const setField = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFormErrors((fe) => ({ ...fe, [k]: undefined }));
  };

  const validate = () => {
    const errs: typeof formErrors = {};
    if (form.username.trim().length < 3) errs.username = 'At least 3 characters';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid e-mail address';
    if (form.full_name.trim().length < 2) errs.full_name = 'Enter the full name';
    if (form.password.length < 8) errs.password = 'At least 8 characters';
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const u = await ApiClient.post<UserRow>('/users', {
        username: form.username.trim(),
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        password: form.password,
        role: form.role,
        phone: form.phone.trim() || null,
      });
      toast.success('Account created', `${ROLE_LABEL[u.role]} account “${u.username}” is ready.`);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setFormErrors({ username: err.message });
      else toast.error('Could not create account', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const doToggle = async () => {
    if (!toggleUser) return;
    setSaving(true);
    try {
      await ApiClient.put(`/users/${toggleUser.id}`, { is_active: !toggleUser.is_active });
      toast.success(toggleUser.is_active ? 'Account deactivated' : 'Account activated', toggleUser.full_name);
      setToggleUser(null);
      load();
    } catch (err) {
      toast.error('Could not update account', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const doReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    if (pw.password.length < 8) return setPwError('Password must be at least 8 characters');
    if (pw.password !== pw.confirm) return setPwError('Passwords do not match');
    setSaving(true);
    try {
      await ApiClient.put(`/users/${resetUser.id}`, { new_password: pw.password });
      toast.success('Password reset', `Share the new password with ${resetUser.full_name} securely.`);
      setResetUser(null);
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openReset = (u: UserRow) => {
    setPw({ password: '', confirm: '' });
    setPwError(null);
    setResetUser(u);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Users & roles"
        description="Manage who can sign in to Campus Core and what they can access."
        actions={
          <Button
            leftIcon={<UserPlus className="w-4 h-4" />}
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormErrors({});
              setCreateOpen(true);
            }}
          >
            Create staff account
          </Button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-4 pt-3">
              <Tabs
                tabs={[
                  { id: '', label: `All${totalAll !== null ? ` (${totalAll})` : ''}` },
                  ...ROLES.map((r) => ({ id: r, label: `${ROLE_LABEL[r]}${data ? ` (${data.counts[r] ?? 0})` : ''}` })),
                ]}
                active={role}
                onChange={(id) => {
                  setRole(id as '' | UserRole);
                  setPage(1);
                }}
              />
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <label htmlFor="user-search" className="sr-only">
                  Search users
                </label>
                <input
                  id="user-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, username or e-mail"
                  className="h-9.5 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
            </div>

            {error ? (
              <ErrorState className="m-4" message={error} onRetry={load} />
            ) : loading && !data ? (
              <TableSkeleton rows={6} cols={5} />
            ) : data && data.items.length ? (
              <>
                <Table className={loading ? 'opacity-60' : undefined}>
                  <caption className="sr-only">Users</caption>
                  <thead>
                    <tr>
                      <Th scope="col">User</Th>
                      <Th scope="col">Role</Th>
                      <Th scope="col">Status</Th>
                      <Th scope="col">Created</Th>
                      <Th scope="col" className="text-right">
                        Actions
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((u) => {
                      const isMe = me?.id === u.id;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/60">
                          <Td>
                            <div className="min-w-[200px]">
                              <p className="font-medium text-slate-900">
                                {u.full_name}
                                {isMe && <span className="ml-1.5 text-[10px] font-semibold text-blue-600">(you)</span>}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                @{u.username} · {u.email}
                              </p>
                            </div>
                          </Td>
                          <Td>
                            <Badge variant={ROLE_VARIANT[u.role] || 'neutral'}>{ROLE_LABEL[u.role] || u.role}</Badge>
                          </Td>
                          <Td>
                            <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', u.is_active ? 'text-emerald-700' : 'text-slate-500')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', u.is_active ? 'bg-emerald-500' : 'bg-slate-400')} aria-hidden="true" />
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </Td>
                          <Td className="whitespace-nowrap text-xs">{u.created_at ? formatDate(u.created_at) : '—'}</Td>
                          <Td className="text-right whitespace-nowrap">
                            <div className="inline-flex gap-1">
                              <Button size="sm" variant="ghost" leftIcon={<KeyRound className="w-3.5 h-3.5" />} onClick={() => openReset(u)} aria-label={`Reset password for ${u.full_name}`}>
                                Reset
                              </Button>
                              <Button
                                size="sm"
                                variant={u.is_active ? 'ghost' : 'outline'}
                                className={u.is_active ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50' : undefined}
                                disabled={isMe && u.is_active}
                                title={isMe && u.is_active ? 'You cannot deactivate your own account' : undefined}
                                onClick={() => setToggleUser(u)}
                              >
                                {u.is_active ? 'Deactivate' : 'Activate'}
                              </Button>
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
                {data.total > PAGE_SIZE && <Pagination total={data.total} page={page} pageSize={PAGE_SIZE} onPage={setPage} />}
              </>
            ) : (
              <EmptyState
                className="m-4"
                icon={<Users className="w-6 h-6" />}
                title="No users found"
                description={debounced ? 'No account matches your search.' : 'There are no accounts with this role yet.'}
              />
            )}
          </div>
          <p className="text-xs text-slate-500">
            Students and lecturers are created from{' '}
            <Link to="/admin/students" className="text-blue-600 hover:underline">
              Students
            </Link>{' '}
            and{' '}
            <Link to="/admin/lecturers" className="text-blue-600 hover:underline">
              Lecturers
            </Link>{' '}
            so their academic profiles are set up at the same time.
          </p>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-violet-600" />
              <CardTitle>Permission matrix</CardTitle>
            </div>
            <CardDescription>What each role can access.</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto -mx-1">
            <table className="min-w-full text-xs">
              <caption className="sr-only">Role permissions</caption>
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="text-left font-semibold py-1.5 px-1">Area</th>
                  <th scope="col" className="font-semibold py-1.5 px-1" title="Administrator">Admin</th>
                  <th scope="col" className="font-semibold py-1.5 px-1" title="Lecturer">Lect.</th>
                  <th scope="col" className="font-semibold py-1.5 px-1" title="Student">Stud.</th>
                  <th scope="col" className="font-semibold py-1.5 px-1" title="Placement Officer">Place.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {MATRIX.map((m) => (
                  <tr key={m.area}>
                    <th scope="row" className="text-left font-medium text-slate-700 py-2 px-1">
                      {m.area}
                      {m.note && <span className="block text-[10px] font-normal text-slate-400">{m.note}</span>}
                    </th>
                    {ROLES.map((r) => (
                      <td key={r} className="text-center py-2 px-1">
                        <AccessCell a={m.access[r]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Placement Officers manage companies, drives, applications and offers. They do not get attendance administration or
            unrestricted access to student records.
          </p>
        </Card>
      </div>

      {/* Create staff account */}
      <Modal
        isOpen={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Create staff account"
        description="For Placement Officers and Administrators."
        maxWidth="lg"
      >
        <form onSubmit={create} className="space-y-4" noValidate>
          <Select
            id="nu-role"
            label="Role"
            value={form.role}
            onChange={setField('role')}
            options={[
              { value: 'PLACEMENT_OFFICER', label: ROLE_LABEL.PLACEMENT_OFFICER },
              { value: 'ADMIN', label: ROLE_LABEL.ADMIN },
            ]}
          />
          {form.role === 'ADMIN' && (
            <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
              Administrators have full access to every module, including user management.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input id="nu-name" label="Full name" required value={form.full_name} onChange={setField('full_name')} error={formErrors.full_name} autoComplete="name" />
            <Input id="nu-username" label="Username" required value={form.username} onChange={setField('username')} error={formErrors.username} autoComplete="off" />
            <Input id="nu-email" label="E-mail" type="email" required value={form.email} onChange={setField('email')} error={formErrors.email} autoComplete="email" />
            <Input id="nu-phone" label="Phone" type="tel" value={form.phone} onChange={setField('phone')} autoComplete="tel" />
            <Input id="nu-pw" label="Password" type="password" required value={form.password} onChange={setField('password')} error={formErrors.password} helperText="Minimum 8 characters" autoComplete="new-password" />
            <Input id="nu-pw2" label="Confirm password" type="password" required value={form.confirm} onChange={setField('confirm')} error={formErrors.confirm} autoComplete="new-password" />
          </div>
          <p className="text-xs text-slate-500">
            Students and lecturers cannot be created here &mdash; use the Students or Lecturers pages so their academic profiles are created too.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              Create account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset password */}
      <Modal isOpen={!!resetUser} onClose={() => !saving && setResetUser(null)} title="Reset password" description={resetUser ? `${resetUser.full_name} (@${resetUser.username})` : undefined}>
        <form onSubmit={doReset} className="space-y-4" noValidate>
          <Input
            id="rp-pw"
            label="New password"
            type="password"
            required
            value={pw.password}
            onChange={(e) => {
              setPw((p) => ({ ...p, password: e.target.value }));
              setPwError(null);
            }}
            helperText="Minimum 8 characters"
            autoComplete="new-password"
          />
          <Input
            id="rp-pw2"
            label="Confirm new password"
            type="password"
            required
            value={pw.confirm}
            onChange={(e) => {
              setPw((p) => ({ ...p, confirm: e.target.value }));
              setPwError(null);
            }}
            error={pwError || undefined}
            autoComplete="new-password"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setResetUser(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              Reset password
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!toggleUser}
        title={toggleUser?.is_active ? 'Deactivate account?' : 'Activate account?'}
        message={
          toggleUser?.is_active
            ? `${toggleUser.full_name} will no longer be able to sign in. You can reactivate the account later.`
            : `${toggleUser?.full_name} will be able to sign in again.`
        }
        confirmLabel={toggleUser?.is_active ? 'Deactivate' : 'Activate'}
        danger={toggleUser?.is_active}
        isLoading={saving}
        onConfirm={doToggle}
        onClose={() => !saving && setToggleUser(null)}
      />
    </div>
  );
};
