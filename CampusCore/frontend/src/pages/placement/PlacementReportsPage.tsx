import React, { useState } from 'react';
import { Download, FileBarChart, Printer } from 'lucide-react';
import { ApiClient, qs } from '../../lib/api';
import { errorMessage, pct } from '../../lib/utils';
import { ErrorState, PageHeader, Table, TableSkeleton, Td, Th } from '../../components/ui/Kit';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { InfoTip } from './placementShared';
import { fmtUtc, n, useApi } from './placementUtils';

type ReportKey = 'summary' | 'company' | 'drive' | 'department' | 'graduation-year' | 'student';

const REPORTS: { value: ReportKey; label: string; group: string }[] = [
  { value: 'summary', label: 'Overall summary', group: 'Scope' },
  { value: 'company', label: 'By company', group: 'Company' },
  { value: 'drive', label: 'By drive', group: 'Drive' },
  { value: 'department', label: 'By department', group: 'Department' },
  { value: 'graduation-year', label: 'By graduation year', group: 'Graduation year' },
  { value: 'student', label: 'By student', group: 'Student' },
];

interface Metrics {
  applications: number;
  students: number;
  registered: number;
  attended: number;
  shortlisted: number;
  selected: number;
  rejected: number;
  offers: number;
  offers_accepted: number;
  offers_declined: number;
  placements: number;
  unique_students_placed: number;
  selection_rate: number | null;
}
interface ReportData {
  report: string;
  rows: ({ group: string } & Metrics)[];
  totals: Metrics;
  definitions: Record<string, string> | null;
  generated_at: string;
}

/** Column meanings follow the aggregation in the reports endpoint. */
const COLUMNS: { key: keyof Metrics; label: string; hint: string }[] = [
  { key: 'applications', label: 'Applications', hint: 'Active applications (withdrawn excluded).' },
  { key: 'students', label: 'Students', hint: 'Distinct students who applied.' },
  { key: 'registered', label: 'Registered', hint: 'Applications with drive registration confirmed.' },
  { key: 'attended', label: 'Attended', hint: 'Applications where the student actually attended the drive.' },
  { key: 'shortlisted', label: 'Shortlisted', hint: 'Applications shortlisted or selected.' },
  { key: 'selected', label: 'Selected', hint: 'Applications with official result Selected.' },
  { key: 'rejected', label: 'Rejected', hint: 'Applications with result Rejected.' },
  { key: 'offers', label: 'Offers', hint: 'Recorded offers, revoked excluded.' },
  { key: 'offers_accepted', label: 'Accepted', hint: 'Offers accepted by the student.' },
  { key: 'offers_declined', label: 'Declined', hint: 'Offers declined by the student.' },
  { key: 'placements', label: 'Placements', hint: 'Accepted offers confirmed as final placement.' },
  { key: 'unique_students_placed', label: 'Students placed', hint: 'Distinct students with at least one confirmed placement.' },
  { key: 'selection_rate', label: 'Selection rate', hint: 'Selected ÷ attended (blank when nobody has attended).' },
];

const fmt = (k: keyof Metrics, v: number | null) => (k === 'selection_rate' ? pct(v) : n(v));

export const PlacementReportsPage: React.FC = () => {
  const toast = useToast();
  const [report, setReport] = useState<ReportKey>('summary');
  const [year, setYear] = useState('');
  // Graduation years come from the data itself; definitions are only returned with the summary report.
  const yearsRes = useApi<ReportData>('/placements/reports/graduation-year');
  const years = (yearsRes.data?.rows ?? []).map((x) => x.group).filter((g) => /^\d{4}$/.test(g));
  const summaryRes = useApi<ReportData>('/placements/reports/summary');
  const res = useApi<ReportData>(`/placements/reports/${report}` + qs({ format: 'json', graduation_year: year }));
  const data = res.data ?? null;
  const definitions = res.data?.definitions ?? summaryRes.data?.definitions ?? null;
  const { loading, error, reload: load } = res;
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await ApiClient.download(
        '/placements/reports/' + report + qs({ format: 'csv', graduation_year: year }),
        `placement_report_${report}.csv`
      );
    } catch (e) {
      toast.error('Export failed', errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const meta = REPORTS.find((r) => r.value === report)!;
  const empty = !!data && data.totals.applications === 0;

  return (
    <div className="print:text-[11px]">
      {/* Hide the app chrome (sidebar + top bar) when printing this page. */}
      <style>{'@media print { aside, header { display: none !important; } body { background: #fff !important; } }'}</style>

      <div className="print:hidden">
        <PageHeader
          eyebrow="Placement office"
          title="Placement reports"
          description="Aggregated outcomes from recorded applications, results and offers. Export to CSV or print for meetings."
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />} disabled={!data}>
                Print
              </Button>
              <Button onClick={exportCsv} isLoading={exporting} leftIcon={<Download className="w-4 h-4" />}>
                Export CSV
              </Button>
            </>
          }
        />
        <Card className="mb-4 p-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-[16rem_12rem] gap-3">
            <Select
              id="rep-kind"
              label="Report"
              value={report}
              onChange={(e) => setReport(e.target.value as ReportKey)}
              options={REPORTS.map((r) => ({ value: r.value, label: r.label }))}
            />
            <Select
              id="rep-year"
              label="Graduation year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              options={years.map((y) => ({ value: y, label: y }))}
              placeholder="All years"
            />
          </div>
        </Card>
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold">Placement report — {meta.label}</h1>
        <p className="text-xs text-slate-600">
          {year ? `Graduation year ${year}` : 'All graduation years'}
          {data ? ` · Generated ${fmtUtc(data.generated_at)}` : ''}
        </p>
      </div>

      <Card className="p-0 overflow-hidden print:shadow-none print:border-slate-300">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 print:hidden">
          <h2 className="text-sm font-semibold text-slate-800">
            {meta.label}
            {year ? ` · ${year}` : ''}
          </h2>
          {data && <span className="text-[11px] text-slate-500">Generated {fmtUtc(data.generated_at)}</span>}
        </div>
        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : loading && !data ? (
          <TableSkeleton cols={8} />
        ) : !data || data.rows.length === 0 || (empty && report !== 'summary') ? (
          <div className="p-6">
            <EmptyState
              icon={<FileBarChart className="w-6 h-6" />}
              title="Nothing to report yet"
              description={
                year
                  ? `No applications from students graduating in ${year}.`
                  : 'Rows appear once students apply to published drives.'
              }
            />
          </div>
        ) : (
          <Table className={loading ? 'opacity-60' : ''}>
            <thead>
              <tr>
                <Th className="sticky left-0 z-10 bg-slate-50">{meta.group}</Th>
                {COLUMNS.map((c) => (
                  <Th key={c.key} className="text-right">
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      <span className="print:hidden">
                        <InfoTip text={c.hint} />
                      </span>
                    </span>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.group} className="hover:bg-slate-50/60">
                  <Td className="sticky left-0 bg-white font-medium text-slate-900 whitespace-nowrap">{r.group}</Td>
                  {COLUMNS.map((c) => (
                    <Td key={c.key} className="text-right tabular-nums">
                      {fmt(c.key, r[c.key])}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
            {report !== 'summary' && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <Td className="sticky left-0 bg-slate-50 text-slate-900">Total</Td>
                  {COLUMNS.map((c) => (
                    <Td key={c.key} className="text-right tabular-nums text-slate-900">
                      {fmt(c.key, data.totals[c.key])}
                    </Td>
                  ))}
                </tr>
              </tfoot>
            )}
          </Table>
        )}
      </Card>
      {report !== 'summary' && data && data.rows.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          Totals count each student once, so the "Students" and "Students placed" totals can be lower than the sum of the rows.
        </p>
      )}

      <Card className="mt-4 bg-slate-50/60 print:break-inside-avoid">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Metric definitions</h2>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {COLUMNS.map((c) => (
            <div key={c.key} className="flex gap-2">
              <dt className="font-medium text-slate-700 shrink-0">{c.label}:</dt>
              <dd className="text-slate-600">{c.hint}</dd>
            </div>
          ))}
          {definitions &&
            Object.entries(definitions).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="font-medium text-slate-700 shrink-0 capitalize">{k.replace(/_/g, ' ')}:</dt>
                <dd className="text-slate-600">{v}</dd>
              </div>
            ))}
        </dl>
      </Card>
    </div>
  );
};
