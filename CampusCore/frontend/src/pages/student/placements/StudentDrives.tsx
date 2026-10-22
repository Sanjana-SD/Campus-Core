import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, FilterX, Search } from 'lucide-react';
import { qs } from '../../../lib/api';
import { useApiQuery } from './useApiQuery';
import { ErrorState, PageHeader, Tabs } from '../../../components/ui/Kit';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/LoadingSpinner';
import { DriveCard, DriveCardSkeleton } from './DriveCard';
import { PlacementNav } from './PlacementUi';
import { type StudentDrive } from './placementTypes';

interface DrivesResponse {
  total: number;
  items: StudentDrive[];
  companies: { id: number; name: string }[];
}
interface Department {
  id: number;
  code: string;
  name: string;
}

type Timeframe = 'upcoming' | 'completed' | 'all';
const TIMEFRAMES: Timeframe[] = ['upcoming', 'completed', 'all'];

const EMPTY_FILTERS = {
  company_id: '',
  location: '',
  work_mode: '',
  department_id: '',
  min_ctc: '',
  application_status: '',
  sort: 'relevance',
};

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const StudentDrives: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tfParam = params.get('timeframe') as Timeframe | null;
  const timeframe: Timeframe = tfParam && TIMEFRAMES.includes(tfParam) ? tfParam : 'upcoming';

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const debouncedSearch = useDebounced(search);
  const debouncedLocation = useDebounced(filters.location);
  const debouncedCtc = useDebounced(filters.min_ctc);

  const departments = useApiQuery<Department[]>('/academic/departments').data || [];

  const query = useMemo(
    () =>
      qs({
        search: debouncedSearch.trim(),
        company_id: filters.company_id,
        location: debouncedLocation.trim(),
        work_mode: filters.work_mode,
        department_id: filters.department_id,
        min_ctc: debouncedCtc !== '' && !isNaN(Number(debouncedCtc)) ? Number(debouncedCtc) : undefined,
        application_status: filters.application_status,
        timeframe,
        sort: filters.sort,
      }),
    [debouncedSearch, debouncedLocation, debouncedCtc, filters.company_id, filters.work_mode, filters.department_id, filters.application_status, filters.sort, timeframe]
  );

  const { data, loading, error, reload: load } = useApiQuery<DrivesResponse>(`/placements/student/drives${query}`);
  // the backend lists every company with a visible drive, independent of the filters
  const companies = data?.companies || [];

  const set = (k: keyof typeof EMPTY_FILTERS) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }));

  const hasFilters = search !== '' || Object.entries(filters).some(([k, v]) => v !== EMPTY_FILTERS[k as keyof typeof EMPTY_FILTERS]);
  const clear = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
  };

  const setTimeframe = (t: string) => {
    const next = new URLSearchParams(params);
    if (t === 'upcoming') next.delete('timeframe');
    else next.set('timeframe', t);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Placements"
        title="Placement drives"
        description="Drives published by the placement office. Eligibility is checked against your academic profile."
      />
      <PlacementNav />

      <section aria-label="Filters" className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="drive-search" className="sr-only">
            Search drives
          </label>
          <input
            id="drive-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by job title, company or skill"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Select
            id="f-company"
            label="Company"
            value={filters.company_id}
            onChange={set('company_id')}
            placeholder="All companies"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Input id="f-location" label="Location" value={filters.location} onChange={set('location')} placeholder="Any" />
          <Select
            id="f-mode"
            label="Work mode"
            value={filters.work_mode}
            onChange={set('work_mode')}
            placeholder="Any"
            options={[
              { value: 'ONSITE', label: 'On-site' },
              { value: 'HYBRID', label: 'Hybrid' },
              { value: 'REMOTE', label: 'Remote' },
            ]}
          />
          <Select
            id="f-dept"
            label="Department"
            value={filters.department_id}
            onChange={set('department_id')}
            placeholder="Any"
            options={departments.map((d) => ({ value: d.id, label: d.code }))}
          />
          <Input
            id="f-ctc"
            label="Min CTC (LPA)"
            type="number"
            min={0}
            step="0.5"
            inputMode="decimal"
            value={filters.min_ctc}
            onChange={set('min_ctc')}
            placeholder="Any"
          />
          <Select
            id="f-app"
            label="Application"
            value={filters.application_status}
            onChange={set('application_status')}
            placeholder="Any"
            options={[
              { value: 'APPLIED', label: 'Applied' },
              { value: 'NOT_APPLIED', label: 'Not applied' },
              { value: 'ELIGIBLE', label: 'Eligible for me' },
            ]}
          />
          <Select
            id="f-sort"
            label="Sort by"
            value={filters.sort}
            onChange={set('sort')}
            options={[
              { value: 'relevance', label: 'Most relevant' },
              { value: 'deadline', label: 'Deadline (soonest)' },
              { value: 'drive_date', label: 'Drive date' },
              { value: 'ctc', label: 'CTC (highest)' },
              { value: 'company', label: 'Company (A–Z)' },
            ]}
          />
        </div>
        {hasFilters && (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" leftIcon={<FilterX className="w-3.5 h-3.5" />} onClick={clear}>
              Clear filters
            </Button>
          </div>
        )}
      </section>

      <div>
        <Tabs
          tabs={[
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'completed', label: 'Completed' },
            { id: 'all', label: 'All' },
          ]}
          active={timeframe}
          onChange={setTimeframe}
        />
        <p className="text-xs text-slate-500 mb-3" aria-live="polite">
          {loading ? 'Loading drives…' : data ? `${data.total} drive${data.total === 1 ? '' : 's'}` : ''}
        </p>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading && !data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <DriveCardSkeleton key={i} />
            ))}
          </div>
        ) : data && data.items.length ? (
          <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {data.items.map((d) => (
              <DriveCard key={d.id} drive={d} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Briefcase className="w-6 h-6" />}
            title={hasFilters ? 'No drives match your filters' : timeframe === 'completed' ? 'No completed drives yet' : 'No drives published yet'}
            description={
              hasFilters
                ? 'Try removing a filter or searching for something broader.'
                : 'Drives appear here once the placement office publishes them. You will be notified when new drives open.'
            }
            action={
              hasFilters ? (
                <Button size="sm" variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
};
