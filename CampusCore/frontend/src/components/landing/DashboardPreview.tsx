import React from 'react';
import {
  Activity,
  BookOpen,
  Briefcase,
  CalendarCheck,
  CircleAlert,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Users,
} from 'lucide-react';
import { IllustrativeTag } from './Primitives';

// Sample values only. They are not real institutional data.
const KPIS = [
  { label: 'Total students', value: '2,450', hint: 'Sample figure', icon: Users, tint: 'text-blue-300 bg-blue-400/10' },
  { label: "Today's attendance", value: '91.4%', hint: 'Sample, per class', icon: CalendarCheck, tint: 'text-emerald-300 bg-emerald-400/10' },
  { label: 'Active courses', value: '36', hint: 'Sample figure', icon: BookOpen, tint: 'text-violet-300 bg-violet-400/10' },
  { label: 'Upcoming drives', value: '4', hint: 'Sample, next 30 days', icon: Briefcase, tint: 'text-amber-300 bg-amber-400/10' },
];

const WEEK = [
  { day: 'Mon', v: 88 },
  { day: 'Tue', v: 92 },
  { day: 'Wed', v: 85 },
  { day: 'Thu', v: 94 },
  { day: 'Fri', v: 81 },
  { day: 'Sat', v: 76 },
];

const ACTIVITY = [
  { icon: ClipboardCheck, text: 'Attendance calculated for Period 2', meta: 'Section A', tone: 'text-emerald-300' },
  { icon: CircleAlert, text: 'Missing exit scan flagged for review', meta: 'Student C', tone: 'text-amber-300' },
  { icon: FileText, text: 'Internal marks published', meta: 'Subject X', tone: 'text-blue-300' },
  { icon: Briefcase, text: 'Recruitment drive scheduled', meta: 'Company A', tone: 'text-violet-300' },
];

const DRIVES = [
  { company: 'Company A', role: 'Graduate Engineer', deadline: 'Apply by Day 5' },
  { company: 'Company B', role: 'Analyst Trainee', deadline: 'Apply by Day 12' },
];

/**
 * Static, HTML/CSS-only dashboard mock for the hero. Numbers are sample
 * placeholders and the panel is labelled as illustrative.
 */
export const DashboardPreview: React.FC = () => (
  <figure
    className="relative mx-auto w-full max-w-[640px] lg:max-w-none"
    aria-label="Illustrative preview of the Campus Core dashboard with sample data"
  >
    <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-blue-600/25 via-indigo-500/10 to-violet-500/25 blur-3xl" />
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0F172A]/90 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur">
      {/* Window chrome */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-center sm:flex">
          <span className="truncate rounded-md bg-white/5 px-3 py-0.5 text-[11px] text-slate-400">campus-core / admin overview</span>
        </div>
        <IllustrativeTag tone="dark" label="Illustrative preview" className="py-0.5 text-[10px]" />
      </div>

      <div className="flex">
        {/* Mini sidebar */}
        <div aria-hidden="true" className="hidden w-12 shrink-0 flex-col items-center gap-3 border-r border-white/10 py-4 sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-300">
            <LayoutDashboard className="h-3.5 w-3.5" />
          </span>
          {[Users, CalendarCheck, BookOpen, Briefcase, Activity].map((Icon, i) => (
            <span key={i} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500">
              <Icon className="h-3.5 w-3.5" />
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 space-y-3 p-3 sm:p-4">
          {/* KPI tiles */}
          <dl className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            {KPIS.map((k) => (
              <div key={k.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-2">
                  <dt className="truncate text-[11px] font-medium text-slate-400">{k.label}</dt>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${k.tint}`} aria-hidden="true">
                    <k.icon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <dd className="mt-1.5">
                  <span className="font-display block text-xl font-bold text-white tabular-nums">{k.value}</span>
                  <span className="block truncate text-[10px] text-slate-500">{k.hint}</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-2.5 md:grid-cols-5">
            {/* Attendance analytics */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 md:col-span-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-slate-200">Attendance analytics</p>
                <p className="text-[10px] text-slate-500">Weekly average, sample</p>
              </div>
              <div className="relative mt-3 h-28">
                <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="h-px w-full bg-white/5" />
                  ))}
                </div>
                <div aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-amber-300/40" style={{ bottom: '75%' }}>
                  <span className="absolute -top-3.5 right-0 text-[9px] text-amber-200/80">75% policy</span>
                </div>
                <ul className="relative flex h-full items-end gap-[2px]" aria-label="Sample weekly attendance">
                  {WEEK.map((d, i) => (
                    <li key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
                      <span
                        className="animate-landing-bar block w-full max-w-[22px] rounded-t-[4px] bg-gradient-to-t from-blue-600 to-blue-400 transition-opacity group-hover:opacity-80"
                        style={{ height: `${d.v}%`, animationDelay: `${0.3 + i * 0.06}s` }}
                      />
                      <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 shadow ring-1 ring-white/10 transition-opacity group-hover:opacity-100">
                        {d.day}: {d.v}%
                      </span>
                      <span className="sr-only">
                        {d.day}: {d.v}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div aria-hidden="true" className="mt-1.5 flex gap-[2px]">
                {WEEK.map((d) => (
                  <span key={d.day} className="flex-1 text-center text-[10px] text-slate-500">
                    {d.day}
                  </span>
                ))}
              </div>
            </div>

            {/* Upcoming drives */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 md:col-span-2">
              <p className="text-xs font-semibold text-slate-200">Upcoming placement drives</p>
              <ul className="mt-2.5 space-y-2">
                {DRIVES.map((d) => (
                  <li key={d.company} className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                    <p className="text-[11px] font-semibold text-white">{d.company}</p>
                    <p className="text-[10px] text-slate-400">{d.role}</p>
                    <p className="mt-1 inline-flex rounded bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-200">{d.deadline}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recent activity */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-200">Recent campus activity</p>
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                <span className="animate-landing-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                Sample feed
              </span>
            </div>
            <ul className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {ACTIVITY.map((a) => (
                <li key={a.text} className="flex min-w-0 items-center gap-2">
                  <a.icon className={`h-3.5 w-3.5 shrink-0 ${a.tone}`} aria-hidden="true" />
                  <span className="truncate text-[11px] text-slate-300">{a.text}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-slate-500">{a.meta}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
    <figcaption className="sr-only">
      Illustrative dashboard preview. All figures are sample placeholders, not real college data.
    </figcaption>
  </figure>
);
