import React from 'react';
import { CalendarClock, CircleAlert, LogIn, LogOut, Timer } from 'lucide-react';
import { Container, IllustrativeTag, SectionHeader } from './Primitives';

type Status = 'Present / Late' | 'Present' | 'Partial' | 'Pending verification' | 'Absent';

interface Row {
  student: string;
  subject: string;
  start: string;
  end: string;
  entry: string;
  exit: string;
  duration: string;
  status: Status;
}

// Fictional example rows used purely to explain the calculation.
const ROWS: Row[] = [
  { student: 'Student A', subject: 'Subject X', start: '09:00', end: '10:00', entry: '09:10', exit: '10:00', duration: '50 / 60 min · 83.33%', status: 'Present / Late' },
  { student: 'Student B', subject: 'Subject X', start: '09:00', end: '10:00', entry: '09:01', exit: '10:00', duration: '59 / 60 min · 98.33%', status: 'Present' },
  { student: 'Student C', subject: 'Subject X', start: '09:00', end: '10:00', entry: '09:25', exit: '09:55', duration: '30 / 60 min · 50.00%', status: 'Partial' },
  { student: 'Student D', subject: 'Subject X', start: '09:00', end: '10:00', entry: '09:04', exit: '—', duration: 'Not calculated', status: 'Pending verification' },
  { student: 'Student E', subject: 'Subject X', start: '09:00', end: '10:00', entry: '—', exit: '—', duration: '0 / 60 min · 0%', status: 'Absent' },
];

const STATUS_STYLE: Record<Status, string> = {
  'Present / Late': 'bg-sky-50 text-sky-800 ring-sky-200',
  Present: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  Partial: 'bg-amber-50 text-amber-800 ring-amber-200',
  'Pending verification': 'bg-violet-50 text-violet-800 ring-violet-200',
  Absent: 'bg-rose-50 text-rose-800 ring-rose-200',
};

const PRINCIPLES = [
  { icon: CalendarClock, title: 'Per scheduled class', body: 'Every timetable slot is evaluated on its own, with its own start and end time.' },
  { icon: Timer, title: 'Actual time present', body: 'Duration comes from recorded entry and exit times, not from how many times a card was scanned.' },
  { icon: CircleAlert, title: 'Gaps are flagged', body: 'A missing exit scan is sent for verification. It is never silently assumed to be present.' },
];

export const AttendanceSection: React.FC = () => (
  <section id="attendance" aria-labelledby="attendance-heading" className="scroll-mt-[72px] bg-white py-20 sm:py-24">
    <Container>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <SectionHeader
            id="attendance-heading"
            eyebrow="Attendance"
            title="Attendance that reflects time in class, not card taps"
            description="Campus Core calculates attendance for each scheduled class from the college timetable and each student's actual recorded entry and exit times. Counting RFID scans alone cannot tell you who stayed for the lecture; duration can."
          />
          <ul className="mt-8 space-y-4">
            {PRINCIPLES.map((p) => (
              <li key={p.title} data-reveal className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <p.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Worked example */}
        <div data-reveal className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold text-slate-900">Worked example</h3>
            <IllustrativeTag label="Example" />
          </div>
          <p className="mt-2 text-sm text-slate-600">One student, one class scheduled from 09:00 to 10:00.</p>

          <div className="mt-6" aria-hidden="true">
            <div className="flex justify-between text-[11px] font-medium text-slate-500">
              <span>09:00</span>
              <span>09:30</span>
              <span>10:00</span>
            </div>
            <div className="relative mt-1.5 h-9 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-inset ring-slate-200">
              <div className="absolute inset-y-0 left-0 w-[16.67%] bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(148,163,184,0.35)_6px_8px)]" />
              <div className="absolute inset-y-1 left-[16.67%] right-1 flex items-center justify-center rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-semibold text-white shadow-sm">
                50 min present
              </div>
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1 pl-[12%]">
                <LogIn className="h-3 w-3 text-blue-600" /> Entry 09:10
              </span>
              <span className="inline-flex items-center gap-1">
                Exit 10:00 <LogOut className="h-3 w-3 text-indigo-600" />
              </span>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
            {[
              ['Scheduled', '60 min'],
              ['Present', '50 min'],
              ['Attendance', '83.33%'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-white px-2 py-3">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</dt>
                <dd className="font-display mt-1 text-lg font-bold text-slate-900 tabular-nums sm:text-xl">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 rounded-xl bg-slate-900 px-4 py-3 font-mono text-[13px] text-slate-100">
            (10:00 − 09:10) ÷ (10:00 − 09:00) = 50 ÷ 60 = <span className="font-semibold text-blue-300">83.33%</span>
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            The final status depends on your configured attendance policy. For example, with a grace period of 10 minutes or
            more this entry counts as <strong className="font-semibold text-slate-900">Present</strong>; with a shorter grace
            period it is marked <strong className="font-semibold text-slate-900">Late</strong>.
          </p>
        </div>
      </div>

      {/* Example record table */}
      <div data-reveal className="mt-14 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">Class attendance record</h3>
            <p className="text-xs text-slate-500">Fictional students. Statuses shown assume a sample policy.</p>
          </div>
          <IllustrativeTag label="Example" />
        </div>
        <div className="overflow-x-auto" role="region" aria-label="Example class attendance record" tabIndex={0}>
          <table className="w-full min-w-[860px] text-left text-sm">
            <caption className="sr-only">
              Example class attendance record with fictional students for a class scheduled from 09:00 to 10:00
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {['Student name', 'Subject', 'Scheduled start', 'Scheduled end', 'Actual entry', 'Actual exit', 'Duration', 'Status'].map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap px-5 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ROWS.map((r) => (
                <tr key={r.student} className="transition-colors hover:bg-slate-50/80">
                  <th scope="row" className="whitespace-nowrap px-5 py-3.5 font-semibold text-slate-900">
                    {r.student}
                  </th>
                  <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{r.subject}</td>
                  <td className="px-5 py-3.5 tabular-nums text-slate-600">{r.start}</td>
                  <td className="px-5 py-3.5 tabular-nums text-slate-600">{r.end}</td>
                  <td className="px-5 py-3.5 tabular-nums text-slate-900">{r.entry}</td>
                  <td className="px-5 py-3.5 tabular-nums text-slate-900">{r.exit}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-slate-600">{r.duration}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-200 bg-slate-50/70 px-5 py-3 text-xs text-slate-500">
          Student A resolves to Present or Late depending on the grace period. Student D has no exit scan, so the record is held
          for verification instead of being counted.
        </p>
      </div>
    </Container>
  </section>
);
