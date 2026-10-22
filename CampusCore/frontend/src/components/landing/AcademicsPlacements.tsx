import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileCheck,
  Hourglass,
  ListChecks,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Container, IllustrativeTag, SectionHeader } from './Primitives';
import { placementPathFor } from './nav';

const ACADEMIC_ITEMS = [
  { icon: BookOpen, title: 'Courses and subjects', body: 'Programmes, semesters, subjects and credits, mapped to the lecturers who teach them.' },
  { icon: CalendarDays, title: 'Timetable', body: 'A weekly schedule per section that drives attendance calculation for every class.' },
  { icon: ClipboardList, title: 'Assignments', body: 'Publish assignments with deadlines and track submissions per student.' },
  { icon: FileCheck, title: 'Examinations', body: 'Schedule internal assessments and semester exams with clear subject mapping.' },
  { icon: Award, title: 'Marks and results', body: 'Enter, review and publish marks so students see results only when they are final.' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const SLOTS = ['09:00', '10:00', '11:15', '12:15'];
const GRID: (string | null)[][] = [
  ['Subject X', 'Subject Y', 'Lab Z', 'Subject X', 'Subject W'],
  ['Subject Y', 'Subject X', 'Lab Z', 'Subject W', 'Subject Y'],
  ['Subject W', null, 'Subject Y', 'Subject X', 'Seminar'],
  ['Subject Z', 'Subject W', null, 'Subject Z', null],
];
const CELL_TONE: Record<string, string> = {
  'Subject X': 'bg-blue-50 text-blue-800 ring-blue-100',
  'Subject Y': 'bg-indigo-50 text-indigo-800 ring-indigo-100',
  'Subject W': 'bg-sky-50 text-sky-800 ring-sky-100',
  'Subject Z': 'bg-violet-50 text-violet-800 ring-violet-100',
  'Lab Z': 'bg-violet-100 text-violet-900 ring-violet-200',
  Seminar: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export const AcademicsSection: React.FC = () => (
  <section id="academics" aria-labelledby="academics-heading" className="scroll-mt-[72px] border-y border-slate-200 bg-slate-50 py-20 sm:py-24">
    <Container>
      <SectionHeader
        id="academics-heading"
        eyebrow="Academics"
        title="The full academic cycle, from timetable to results"
        description="Course structure, schedules, coursework and assessment live together, so every lecturer and student works from the same information."
      />
      <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div data-reveal className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">Weekly timetable</h3>
              <p className="text-xs text-slate-500">Sample section, Semester 5</p>
            </div>
            <IllustrativeTag />
          </div>
          <div className="mt-5 overflow-x-auto" role="region" aria-label="Sample weekly timetable" tabIndex={0}>
            <table className="w-full min-w-[520px] border-separate border-spacing-1.5 text-xs">
              <caption className="sr-only">Sample weekly timetable with placeholder subjects</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-14 text-left font-medium text-slate-400">
                    <span className="sr-only">Time</span>
                  </th>
                  {DAYS.map((d) => (
                    <th key={d} scope="col" className="pb-1 text-center font-semibold text-slate-600">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((t, r) => (
                  <tr key={t}>
                    <th scope="row" className="pr-1 text-left font-medium tabular-nums text-slate-500">
                      {t}
                    </th>
                    {GRID[r].map((cell, c) => (
                      <td key={c} className="h-11">
                        {cell ? (
                          <span className={`flex h-full items-center justify-center rounded-lg px-1 text-center font-medium ring-1 ring-inset ${CELL_TONE[cell]}`}>
                            {cell}
                          </span>
                        ) : (
                          <span className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-400">
                            Free
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ul className="grid gap-3">
          {ACADEMIC_ITEMS.map((a) => (
            <li
              key={a.title}
              data-reveal
              className="group flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-900/5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 transition group-hover:bg-indigo-600 group-hover:text-white">
                <a.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{a.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{a.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  </section>
);

const PLACEMENT_ITEMS = [
  { icon: CalendarRange, title: 'Upcoming drives', body: 'See every scheduled recruitment drive and its date at a glance.' },
  { icon: Hourglass, title: 'Open application deadlines', body: 'Students know exactly how long an application window stays open.' },
  { icon: Building2, title: 'Recruitment opportunities', body: 'Company roles, eligibility criteria and rounds in one place.' },
  { icon: Users, title: 'Student participation', body: 'Track who is eligible, who applied and who is still deciding.' },
  { icon: ListChecks, title: 'Selection progress', body: 'Follow candidates round by round through each drive.' },
  { icon: BadgeCheck, title: 'Confirmed outcomes', body: 'Record offers once they are confirmed, ready for reporting.' },
];

const PIPELINE = [
  { stage: 'Eligible', w: 100 },
  { stage: 'Applied', w: 72 },
  { stage: 'Shortlisted', w: 44 },
  { stage: 'Interviewed', w: 26 },
  { stage: 'Selected', w: 12 },
];

export const PlacementsSection: React.FC = () => {
  const { role } = useAuth();
  return (
    <section
      id="placements"
      aria-labelledby="placements-heading"
      className="relative isolate scroll-mt-[72px] overflow-hidden bg-[#0B1120] py-20 text-white sm:py-24"
    >
      <div
        aria-hidden="true"
        className="absolute -right-40 top-0 -z-10 h-[480px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(124,58,237,0.28),transparent)]"
      />
      <Container className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <SectionHeader
            id="placements-heading"
            tone="dark"
            eyebrow="Placements"
            title="Placement opportunities, tracked from drive to offer"
            description="Placement officers publish drives and manage every round, while students discover opportunities and follow their own progress."
          />
          <ul className="mt-8 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {PLACEMENT_ITEMS.map((p) => (
              <li key={p.title} data-reveal className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-violet-300 ring-1 ring-white/10">
                  <p.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-white">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link
            to={placementPathFor(role)}
            className="mt-10 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-6 text-[15px] font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:-translate-y-0.5 hover:from-blue-400 hover:to-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1120]"
          >
            Explore Placement Opportunities
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div data-reveal className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Recruitment drive</p>
              <h3 className="font-display mt-1 text-lg font-bold text-white">Company A · Graduate Engineer</h3>
            </div>
            <IllustrativeTag tone="dark" />
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-2.5">
            {[
              ['Drive date', 'Day 14'],
              ['Applications close', 'Day 7'],
              ['Rounds', '3'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <dt className="text-[11px] text-slate-400">{k}</dt>
                <dd className="mt-1 text-sm font-semibold text-white">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6">
            <p className="text-xs font-semibold text-slate-300">Selection progress</p>
            <ul className="mt-3 space-y-2.5">
              {PIPELINE.map((p) => (
                <li key={p.stage} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
                  <span className="text-xs text-slate-400">{p.stage}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-white/5">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                      style={{ width: `${p.w}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-500">Relative funnel shape only. No real candidates or companies are shown.</p>
          </div>
          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-xs font-semibold text-slate-300">Other open opportunities</p>
            <ul className="mt-3 space-y-2">
              {[
                ['Company B', 'Analyst Trainee', 'Closes Day 10'],
                ['Company C', 'Software Intern', 'Closes Day 18'],
              ].map(([c, r, d]) => (
                <li key={c} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">{c}</span>
                    <span className="block truncate text-xs text-slate-400">{r}</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-violet-400/10 px-2 py-1 text-[11px] font-medium text-violet-200">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
};
