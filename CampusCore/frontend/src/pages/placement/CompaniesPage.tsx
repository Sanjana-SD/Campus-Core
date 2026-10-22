import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Building2, ExternalLink, Eye, Mail, MapPin, Pencil, Phone, Plus, User } from 'lucide-react';
import { ApiClient, ApiError, qs } from '../../lib/api';
import { errorMessage, formatCtc } from '../../lib/utils';
import { ConfirmDialog, ErrorState, PageHeader, Pagination, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { Badge, DriveStatusBadge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { CompanyLogo, Drawer, Field, SearchInput, TextArea } from './placementShared';
import { Company, Drive, fmtDay, isEmail, n, URL_RE, useApi, useDebounced } from './placementUtils';

const PAGE_SIZE = 20;

type CompanyForm = {
  name: string;
  logo_url: string;
  industry: string;
  description: string;
  website: string;
  location: string;
  recruiter_name: string;
  recruiter_email: string;
  recruiter_phone: string;
  notes: string;
};
const EMPTY: CompanyForm = {
  name: '',
  logo_url: '',
  industry: '',
  description: '',
  website: '',
  location: '',
  recruiter_name: '',
  recruiter_email: '',
  recruiter_phone: '',
  notes: '',
};

export const CompaniesPage: React.FC = () => {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearchRaw] = useState('');
  const debounced = useDebounced(search);
  const [status, setStatusRaw] = useState('ACTIVE');
  const [industry, setIndustryRaw] = useState('');
  const [page, setPage] = useState(1);
  // filter changes always go back to the first page
  const setSearch = (v: string) => {
    setSearchRaw(v);
    setPage(1);
  };
  const setStatus = (v: string) => {
    setStatusRaw(v);
    setPage(1);
  };
  const setIndustry = (v: string) => {
    setIndustryRaw(v);
    setPage(1);
  };

  const list = useApi<{ total: number; items: Company[]; industries: string[] }>(
    '/placements/companies' + qs({ search: debounced.trim(), status, industry, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE })
  );
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const industries = list.data?.industries ?? [];
  const { loading, error, reload: load } = list;

  // ?new=1 (from dashboard / drives empty states) opens the create modal
  const [editing, setEditing] = useState<Company | null | 'new'>(() => (params.get('new') === '1' ? 'new' : null));
  const [viewId, setViewId] = useState<number | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Company | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (params.get('new') === '1') {
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const doArchive = async () => {
    if (!archiveTarget) return;
    const archived = archiveTarget.status !== 'ARCHIVED';
    setArchiving(true);
    try {
      await ApiClient.post(`/placements/companies/${archiveTarget.id}/archive${qs({ archived })}`);
      toast.success(archived ? 'Company archived' : 'Company restored', archiveTarget.name);
      setArchiveTarget(null);
      load();
    } catch (e) {
      toast.error('Could not update company', errorMessage(e));
    } finally {
      setArchiving(false);
    }
  };

  const filtered = !!(debounced || industry || status !== 'ACTIVE');

  return (
    <div>
      <PageHeader
        eyebrow="Placement office"
        title="Companies"
        description="Recruiters that visit your campus. Archived companies keep their history but cannot be used for new drives."
        actions={
          <Button onClick={() => setEditing('new')} leftIcon={<Plus className="w-4 h-4" />}>
            Add company
          </Button>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="flex flex-col md:flex-row gap-3 p-4 border-b border-slate-100">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, industry or location"
            label="Search companies"
            className="flex-1"
          />
          <div className="grid grid-cols-2 gap-3 md:w-96">
            <Select
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
              placeholder="All statuses"
            />
            <Select
              aria-label="Industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              options={industries.map((i) => ({ value: i, label: i }))}
              placeholder="All industries"
            />
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : loading && items.length === 0 ? (
          <TableSkeleton cols={6} />
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Building2 className="w-6 h-6" />}
              title={filtered ? 'No companies match these filters' : 'No companies yet'}
              description={
                filtered
                  ? 'Try clearing the search or switching the status filter.'
                  : 'Add the first recruiter so you can create placement drives for it.'
              }
              action={
                filtered ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setIndustry('');
                      setStatus('ACTIVE');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => setEditing('new')} leftIcon={<Plus className="w-4 h-4" />}>
                    Add your first company
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Company</Th>
                  <Th>Industry</Th>
                  <Th>Location</Th>
                  <Th>Recruiter</Th>
                  <Th className="text-right">Drives</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className={loading ? 'opacity-60' : ''}>
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <Td>
                      <button
                        className="flex items-center gap-3 text-left group focus:outline-none"
                        onClick={() => setViewId(c.id)}
                      >
                        <CompanyLogo name={c.name} url={c.logo_url} />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900 group-hover:text-blue-700 group-focus:text-blue-700">
                            {c.name}
                          </span>
                          {c.website && <span className="block text-[11px] text-slate-500 truncate max-w-[14rem]">{c.website}</span>}
                        </span>
                      </button>
                    </Td>
                    <Td>{c.industry || '—'}</Td>
                    <Td>{c.location || '—'}</Td>
                    <Td>
                      {c.recruiter_name || c.recruiter_email ? (
                        <>
                          <span className="block">{c.recruiter_name || '—'}</span>
                          {c.recruiter_email && <span className="block text-[11px] text-slate-500">{c.recruiter_email}</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{n(c.drive_count ?? 0)}</Td>
                    <Td>
                      <Badge variant={c.status === 'ARCHIVED' ? 'neutral' : 'success'}>
                        {c.status === 'ARCHIVED' ? 'Archived' : 'Active'}
                      </Badge>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewId(c.id)} aria-label={`View ${c.name}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setArchiveTarget(c)}
                          aria-label={c.status === 'ARCHIVED' ? `Restore ${c.name}` : `Archive ${c.name}`}
                        >
                          {c.status === 'ARCHIVED' ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={total} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </Card>

      {editing && (
        <CompanyFormModal
          company={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(c, created) => {
            setEditing(null);
            toast.success(created ? 'Company added' : 'Company updated', c.name);
            load();
          }}
        />
      )}

      <CompanyDrawer
        id={viewId}
        onClose={() => setViewId(null)}
        onEdit={(c) => {
          setViewId(null);
          setEditing(c);
        }}
      />

      <ConfirmDialog
        isOpen={!!archiveTarget}
        title={archiveTarget?.status === 'ARCHIVED' ? 'Restore company?' : 'Archive company?'}
        message={
          archiveTarget?.status === 'ARCHIVED' ? (
            <>
              <strong>{archiveTarget?.name}</strong> will become active again and can be used for new drives.
            </>
          ) : (
            <>
              <strong>{archiveTarget?.name}</strong> will be hidden from new drive creation. Existing drives, applications and
              offers are kept unchanged.
            </>
          )
        }
        confirmLabel={archiveTarget?.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
        danger={archiveTarget?.status !== 'ARCHIVED'}
        isLoading={archiving}
        onConfirm={doArchive}
        onClose={() => setArchiveTarget(null)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

const CompanyFormModal: React.FC<{
  company: Company | null;
  onClose: () => void;
  onSaved: (c: Company, created: boolean) => void;
}> = ({ company, onClose, onSaved }) => {
  const [form, setForm] = useState<CompanyForm>(() =>
    company
      ? (Object.fromEntries(
          Object.keys(EMPTY).map((k) => [k, (company as unknown as Record<string, string | null>)[k] ?? ''])
        ) as CompanyForm)
      : EMPTY
  );
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyForm, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const er: typeof errors = {};
    if (form.name.trim().length < 2) er.name = 'Company name must be at least 2 characters.';
    if (form.name.trim().length > 200) er.name = 'Company name must be at most 200 characters.';
    if (form.website.trim() && !URL_RE.test(form.website.trim())) er.website = 'Must start with http:// or https://';
    if (form.logo_url.trim() && !URL_RE.test(form.logo_url.trim())) er.logo_url = 'Must start with http:// or https://';
    if (form.recruiter_email.trim() && !isEmail(form.recruiter_email.trim()))
      er.recruiter_email = 'Enter a valid e-mail address.';
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()])
    ) as Record<string, string | null>;
    setSaving(true);
    try {
      const saved = company
        ? await ApiClient.put<Company>(`/placements/companies/${company.id}`, payload)
        : await ApiClient.post<Company>('/placements/companies', payload);
      onSaved(saved, !company);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors((x) => ({ ...x, name: err.message }));
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={company ? `Edit ${company.name}` : 'Add company'}
      description="Recruiter contact details are visible only to placement staff."
      maxWidth="2xl"
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {serverError && <ErrorState title="Could not save company" message={serverError} />}
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Company name" name="name" required value={form.name} onChange={set('name')} error={errors.name} maxLength={200} />
          <Input label="Industry" name="industry" value={form.industry} onChange={set('industry')} placeholder="e.g. IT services" />
          <Input
            label="Website"
            name="website"
            type="url"
            value={form.website}
            onChange={set('website')}
            error={errors.website}
            placeholder="https://"
          />
          <Input
            label="Logo URL"
            name="logo_url"
            type="url"
            value={form.logo_url}
            onChange={set('logo_url')}
            error={errors.logo_url}
            placeholder="https://"
          />
          <Input label="Location" name="location" value={form.location} onChange={set('location')} className="sm:col-span-2" />
        </div>
        <TextArea label="Description" name="description" value={form.description} onChange={set('description')} />
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-xs font-semibold text-slate-600">Recruiter contact</legend>
          <div className="grid sm:grid-cols-3 gap-4">
            <Input label="Name" name="recruiter_name" value={form.recruiter_name} onChange={set('recruiter_name')} />
            <Input
              label="E-mail"
              name="recruiter_email"
              type="email"
              value={form.recruiter_email}
              onChange={set('recruiter_email')}
              error={errors.recruiter_email}
            />
            <Input label="Phone" name="recruiter_phone" type="tel" value={form.recruiter_phone} onChange={set('recruiter_phone')} />
          </div>
        </fieldset>
        <TextArea label="Internal notes" name="notes" value={form.notes} onChange={set('notes')} helperText="Only placement staff can see these notes." />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={saving}>
            {company ? 'Save changes' : 'Add company'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------

const CompanyDrawer: React.FC<{ id: number | null; onClose: () => void; onEdit: (c: Company) => void }> = ({
  id,
  onClose,
  onEdit,
}) => {
  const navigate = useNavigate();
  const res = useApi<Company & { drives: Drive[] }>(id === null ? null : `/placements/companies/${id}`);
  const data = res.fresh ? res.data : undefined;
  const error = res.error;
  const load = res.reload;

  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      title={data?.name ?? 'Company'}
      subtitle={data ? [data.industry, data.location].filter(Boolean).join(' · ') || undefined : undefined}
    >
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <TableSkeleton rows={5} cols={2} />
      ) : (
        <>
          <Card>
            <div className="flex items-start gap-4">
              <CompanyLogo name={data.name} url={data.logo_url} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{data.name}</h3>
                  <Badge variant={data.status === 'ARCHIVED' ? 'neutral' : 'success'}>
                    {data.status === 'ARCHIVED' ? 'Archived' : 'Active'}
                  </Badge>
                </div>
                {data.website && (
                  <a
                    href={data.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    {data.website} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {data.description && <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{data.description}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => onEdit(data)} leftIcon={<Pencil className="w-3.5 h-3.5" />}>
                Edit
              </Button>
            </div>
            <dl className="mt-4 grid sm:grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <Field label="Recruiter">
                <span className="inline-flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {data.recruiter_name || '—'}
                </span>
              </Field>
              <Field label="E-mail">
                {data.recruiter_email ? (
                  <a href={`mailto:${data.recruiter_email}`} className="inline-flex items-center gap-1.5 text-blue-600 hover:underline">
                    <Mail className="w-3.5 h-3.5" />
                    {data.recruiter_email}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="Phone">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {data.recruiter_phone || '—'}
                </span>
              </Field>
              <Field label="Location">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {data.location || '—'}
                </span>
              </Field>
              {data.notes && (
                <div className="sm:col-span-2">
                  <Field label="Internal notes">
                    <span className="whitespace-pre-line">{data.notes}</span>
                  </Field>
                </div>
              )}
            </dl>
          </Card>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-800">Drives ({data.drives.length})</h3>
              {data.status !== 'ARCHIVED' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/placement/drives/new?company_id=${data.id}`)}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  New drive
                </Button>
              )}
            </div>
            {data.drives.length === 0 ? (
              <p className="text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
                No drives created for this company yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.drives.map((d) => (
                  <li key={d.id}>
                    <Link
                      to={`/placement/drives/${d.id}`}
                      className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{d.job_title}</p>
                          <p className="text-xs text-slate-500">
                            Drive {fmtDay(d.drive_date)}
                            {formatCtc(d.ctc_min, d.ctc_max, d.ctc_text) ? ` · ${formatCtc(d.ctc_min, d.ctc_max, d.ctc_text)}` : ''}
                          </p>
                        </div>
                        <DriveStatusBadge status={d.effective_status} />
                      </div>
                      {d.counts && (
                        <p className="mt-2 text-[11px] text-slate-500 tabular-nums">
                          {d.counts.applications} applications · {d.counts.attended} attended · {d.counts.selected} selected ·{' '}
                          {d.counts.placed} placed
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
};
