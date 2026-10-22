/**
 * Small presentational components shared by the admin attendance, Google Sheets and timetable pages.
 * (Components only — types/helpers live in attendanceShared.ts.)
 */
import React, { useId, useMemo, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, Info, XCircle } from 'lucide-react';
import { Badge, ATTENDANCE_STATUS_META } from '../../components/ui/Badge';
import { cn, hhmm } from '../../lib/utils';
import { STATUS_DEFINITIONS, type Interval, type SyncRun } from './attendanceShared';

export const StatusLegend: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <dl className={cn('grid gap-3', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
    {Object.entries(STATUS_DEFINITIONS).map(([k, v]) => {
      const meta = ATTENDANCE_STATUS_META[k];
      return (
        <div key={k} className="flex gap-2.5 items-start">
          <span className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', meta?.dot || 'bg-slate-400')} aria-hidden />
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-slate-800">{meta?.label || k}</dt>
            <dd className="text-[11px] leading-relaxed text-slate-500">{v}</dd>
          </div>
        </div>
      );
    })}
  </dl>
);

export const SyncRunStatusBadge: React.FC<{ status: string | null | undefined }> = ({ status }) => {
  const map: Record<string, [string, 'success' | 'warning' | 'danger' | 'info' | 'neutral']> = {
    SUCCESS: ['Success', 'success'],
    PARTIAL: ['Partial (some rows rejected)', 'warning'],
    FAILED: ['Failed', 'danger'],
    RUNNING: ['Running', 'info'],
  };
  const [label, v] = map[status || ''] || [status || 'Unknown', 'neutral'];
  return <Badge variant={v}>{label}</Badge>;
};

export const ConnectionBadge: React.FC<{ status: string | null | undefined }> = ({ status }) => {
  if (status === 'CONNECTED') return <Badge variant="success">Connected</Badge>;
  if (status === 'ERROR') return <Badge variant="danger">Connection error</Badge>;
  return <Badge variant="neutral">Not tested yet</Badge>;
};

export const ValidityBadge: React.FC<{ validity: string }> = ({ validity }) => {
  if (validity === 'VALID') return <Badge variant="success">Valid</Badge>;
  if (validity === 'INCOMPLETE') return <Badge variant="warning">Incomplete</Badge>;
  if (validity === 'INVALID') return <Badge variant="danger">Invalid</Badge>;
  return <Badge variant="neutral">{validity}</Badge>;
};

/** Renders the presence intervals of a class record; open-ended scans show "?" and are never filled in. */
export const IntervalsList: React.FC<{ intervals: Interval[]; emptyText?: string }> = ({ intervals, emptyText = 'No scans' }) => {
  if (!intervals?.length) return <span className="text-xs text-slate-400">{emptyText}</span>;
  return (
    <ul className="space-y-0.5">
      {intervals.map((iv, i) => (
        <li key={i} className="font-mono text-xs whitespace-nowrap">
          <span className={iv.entry ? 'text-slate-700' : 'text-amber-600'}>{iv.entry ? hhmm(iv.entry) : 'no entry'}</span>
          <span className="text-slate-400"> → </span>
          <span className={iv.exit ? 'text-slate-700' : 'text-amber-600'}>{iv.exit ? hhmm(iv.exit) : 'no exit'}</span>
        </li>
      ))}
    </ul>
  );
};

export const KeyValue: React.FC<{ label: React.ReactNode; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className={cn('text-sm text-slate-800 break-words', mono && 'font-mono text-xs')}>{children}</dd>
  </div>
);

export const Checkbox: React.FC<{
  label: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: React.ReactNode;
  disabled?: boolean;
}> = ({ label, checked, onChange, hint, disabled }) => {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="text-sm text-slate-700 cursor-pointer select-none">
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </label>
    </div>
  );
};

export const TextArea: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  helperText?: string;
}> = ({ label, value, onChange, required, placeholder, rows = 3, helperText }) => {
  const id = useId();
  return (
    <div className="w-full space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
      />
      {helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
};

/** Text filter + native select list: keyboard accessible and dependency free. */
export const SearchableSelect: React.FC<{
  label: string;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}> = ({ label, options, value, onChange, required, placeholder = 'Type to filter…' }) => {
  const [q, setQ] = useState('');
  const id = useId();
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? options.filter((o) => `${o.label} ${o.hint || ''}`.toLowerCase().includes(s)) : options;
    return list.slice(0, 300);
  }, [q, options]);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <input
        aria-label={`Filter ${label}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
      />
      <select
        id={id}
        size={Math.min(6, Math.max(3, filtered.length))}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white p-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
      >
        {filtered.map((o) => (
          <option key={o.value} value={o.value} className="px-2 py-1 rounded">
            {o.label}
            {o.hint ? ` — ${o.hint}` : ''}
          </option>
        ))}
      </select>
      {filtered.length === 0 && <p className="text-xs text-slate-500">No matches.</p>}
    </div>
  );
};

export const InlineAlert: React.FC<{
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ tone = 'info', title, children, action, className }) => {
  const tones = {
    info: 'bg-blue-50/70 border-blue-200 text-blue-900',
    warning: 'bg-amber-50/80 border-amber-200 text-amber-900',
    danger: 'bg-rose-50/70 border-rose-200 text-rose-900',
    success: 'bg-emerald-50/70 border-emerald-200 text-emerald-900',
  };
  const icon = {
    info: <Info className="w-4 h-4 text-blue-600" />,
    warning: <Info className="w-4 h-4 text-amber-600" />,
    danger: <XCircle className="w-4 h-4 text-rose-600" />,
    success: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  };
  return (
    <div className={cn('rounded-xl border p-3.5 flex items-start gap-3', tones[tone], className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="mt-0.5 shrink-0">{icon[tone]}</span>
      <div className="flex-1 min-w-0 text-xs leading-relaxed">
        {title && <p className="text-sm font-semibold mb-0.5">{title}</p>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

/** imported / updated / unchanged / rejected / removed counters for one sync run. */
export const SyncCounts: React.FC<{ run: Pick<SyncRun, 'rows_read' | 'imported' | 'updated' | 'unchanged' | 'rejected' | 'removed'> }> = ({ run }) => {
  const items: [string, number | null, string][] = [
    ['Read', run.rows_read, 'text-slate-700'],
    ['Imported', run.imported, 'text-emerald-700'],
    ['Updated', run.updated, 'text-blue-700'],
    ['Unchanged', run.unchanged, 'text-slate-600'],
    ['Rejected', run.rejected, 'text-rose-700'],
    ['Removed from sheet', run.removed, 'text-amber-700'],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map(([l, v, c]) => (
        <span key={l} className="whitespace-nowrap">
          <span className="text-slate-500">{l}: </span>
          <span className={cn('font-semibold tabular-nums', c)}>{v ?? 0}</span>
        </span>
      ))}
    </div>
  );
};

const STEP_DONE_HINT: Record<string, number> = {
  // Index of the first step that is likely still outstanding for each error code.
  NOT_CONFIGURED: 0,
  CREDENTIALS_FILE_MISSING: 2,
  CREDENTIALS_INVALID: 2,
  API_DISABLED: 1,
  PERMISSION_DENIED: 4,
  SHEET_PRIVATE: 0,
  SPREADSHEET_NOT_FOUND: 5,
  WORKSHEET_NOT_FOUND: 5,
  HEADERS_MISSING: 6,
};

/** Step-by-step service-account setup instructions tailored to the reported error code. */
export const SetupChecklist: React.FC<{
  errorCode: string | null | undefined;
  message?: string | null;
  serviceAccountEmail?: string | null;
  spreadsheetUrl?: string | null;
  spreadsheetId?: string | null;
  worksheetGid?: string | null;
}> = ({ errorCode, message, serviceAccountEmail, spreadsheetUrl, spreadsheetId, worksheetGid }) => {
  const focus = STEP_DONE_HINT[errorCode || ''] ?? (errorCode?.startsWith('CREDENTIALS_') ? 2 : 0);
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: 'Create a Google Cloud service account',
      body: (
        <>
          In the Google Cloud Console open <em>IAM &amp; Admin → Service Accounts</em> and create a service account for
          Campus Core (no project roles are required).
        </>
      ),
    },
    {
      title: 'Enable the Google Sheets API',
      body: (
        <>
          In the same Cloud project open <em>APIs &amp; Services → Library</em>, search for “Google Sheets API” and click
          <em> Enable</em>.{errorCode === 'API_DISABLED' && ' The last attempt reported that this API is disabled.'}
        </>
      ),
    },
    {
      title: 'Download a JSON key to the server',
      body: (
        <>
          On the service account choose <em>Keys → Add key → JSON</em> and save the file on the backend server as{' '}
          <code className="font-mono bg-slate-100 px-1 rounded">config/google-service-account.json</code>. Never commit it or paste it
          into this page.
        </>
      ),
    },
    {
      title: 'Point the backend at the key',
      body: (
        <>
          In the backend <code className="font-mono bg-slate-100 px-1 rounded">.env</code> set{' '}
          <code className="font-mono bg-slate-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON=config/google-service-account.json</code>.
        </>
      ),
    },
    {
      title: 'Share the spreadsheet with the service account (Viewer)',
      body: (
        <>
          Open the sheet, click <em>Share</em> and add{' '}
          {serviceAccountEmail ? (
            <code className="font-mono bg-slate-100 px-1 rounded select-all">{serviceAccountEmail}</code>
          ) : (
            'the service account’s e-mail address (shown in the JSON key as client_email)'
          )}{' '}
          with <strong>Viewer</strong> access.
          {spreadsheetUrl && (
            <a href={spreadsheetUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-blue-600 hover:underline">
              Open sheet <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </>
      ),
    },
    {
      title: 'Check the spreadsheet ID and worksheet GID',
      body: (
        <>
          GOOGLE_SHEET_ID must be{' '}
          <code className="font-mono bg-slate-100 px-1 rounded break-all">{spreadsheetId || '(not set)'}</code> and GOOGLE_SHEET_GID{' '}
          <code className="font-mono bg-slate-100 px-1 rounded">{worksheetGid ?? '(not set)'}</code> — the number after{' '}
          <code className="font-mono">#gid=</code> in the worksheet URL.
        </>
      ),
    },
    {
      title: 'Confirm the header row',
      body: <>The first row must contain the columns UID, Name, Role, Date, Entry Time, Exit Time and Status (as written by the existing Apps Script).</>,
    },
    {
      title: 'Restart the backend, then click “Test connection”',
      body: <>Environment changes are read at start-up. After restarting, test the connection and then synchronize.</>,
    },
  ];
  return (
    <div className="space-y-3">
      {(errorCode || message) && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-900">
          {errorCode && <span className="font-mono font-semibold mr-2">{errorCode}</span>}
          {message}
        </div>
      )}
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={s.title} className={cn('flex gap-3 rounded-lg p-2.5', i === focus && 'bg-amber-50 border border-amber-200')}>
            <span className="shrink-0 mt-0.5">
              {i < focus ? <CheckCircle2 className="w-4 h-4 text-slate-300" /> : <Circle className={cn('w-4 h-4', i === focus ? 'text-amber-500' : 'text-slate-300')} />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">
                {i + 1}. {s.title}
                {i === focus && <span className="ml-2 text-[11px] font-semibold text-amber-700">Most likely next step</span>}
              </p>
              <p className="text-xs text-slate-600 leading-relaxed mt-0.5">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

export const FilterGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 items-end', className)}>{children}</div>
);
