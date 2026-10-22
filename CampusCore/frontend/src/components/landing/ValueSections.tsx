import React from 'react';
import {
  Briefcase,
  Check,
  Database,
  Eye,
  GraduationCap,
  Plug,
  Presentation,
  ShieldCheck,
  Gauge,
  UserCog,
} from 'lucide-react';
import { Container, LogoMark, SectionHeader } from './Primitives';

const BENEFITS = [
  { icon: Database, title: 'One source of truth', body: 'Students, timetables, attendance, marks and placements share the same records, so nothing has to be reconciled by hand.' },
  { icon: Gauge, title: 'Accurate by design', body: 'Attendance is based on time actually spent in each scheduled class, with clear rules set by your attendance policy.' },
  { icon: Plug, title: 'Fits existing hardware', body: 'Connect the RFID data source you already have. There are no readers to replace and no firmware to change.' },
  { icon: ShieldCheck, title: 'Access by role', body: 'Every user sees only what their role allows, enforced on the server for each request.' },
  { icon: Eye, title: 'Transparent to students', body: 'Students can see their own attendance, results and applications, which reduces disputes and follow-ups.' },
  { icon: Presentation, title: 'Ready for review', body: 'Reports for attendance, academics and placements are available without exporting spreadsheets first.' },
];

export const BenefitsSection: React.FC = () => (
  <section id="why" aria-labelledby="why-heading" className="scroll-mt-[72px] bg-white py-20 sm:py-24">
    <Container>
      <SectionHeader
        id="why-heading"
        eyebrow="Why Campus Core"
        align="center"
        title="Built for how colleges actually operate"
        description="Fewer disconnected spreadsheets, fewer manual corrections, and one platform everyone on campus can rely on."
      />
      <ul className="mt-14 grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 gap-px sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((b) => (
          <li key={b.title} data-reveal className="group bg-white p-6 transition-colors hover:bg-slate-50 sm:p-7">
            <b.icon className="h-6 w-6 text-blue-600 transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
            <h3 className="font-display mt-4 text-base font-bold text-slate-900">{b.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{b.body}</p>
          </li>
        ))}
      </ul>
    </Container>
  </section>
);

const ROLES = [
  {
    icon: UserCog,
    role: 'Admin',
    summary: 'Configures the institution and keeps data trustworthy.',
    points: ['Manage students, lecturers and users', 'Set up courses, sections and timetables', 'Connect RFID data and review flagged records', 'Define attendance policy and view reports'],
    accent: 'from-blue-500 to-blue-600',
  },
  {
    icon: Presentation,
    role: 'Lecturer',
    summary: 'Runs classes and coursework for assigned subjects.',
    points: ['View assigned classes and timetable', 'Review class attendance records', 'Create assignments and announcements', 'Enter and manage marks'],
    accent: 'from-indigo-500 to-indigo-600',
  },
  {
    icon: GraduationCap,
    role: 'Student',
    summary: 'Sees their own academic and placement progress.',
    points: ['Check attendance for each subject', 'View timetable and assignments', 'See published results', 'Browse and apply to placement drives'],
    accent: 'from-sky-500 to-blue-600',
  },
  {
    icon: Briefcase,
    role: 'Placement Officer',
    summary: 'Coordinates recruitment from drive to offer.',
    points: ['Manage companies and drives', 'Set eligibility and deadlines', 'Track applications and rounds', 'Report on placement outcomes'],
    accent: 'from-violet-500 to-violet-600',
  },
];

export const RolesSection: React.FC = () => (
  <section id="roles" aria-labelledby="roles-heading" className="scroll-mt-[72px] border-y border-slate-200 bg-slate-50 py-20 sm:py-24">
    <Container>
      <SectionHeader
        id="roles-heading"
        eyebrow="Role-based workspaces"
        title="A dedicated workspace for every role"
        description="Each person signs in to a workspace designed around their responsibilities, with access limited to what they need."
      />
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => (
          <li key={r.role} data-reveal>
            <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/[0.07]">
              <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${r.accent}`} />
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${r.accent} text-white shadow-sm`}>
                <r.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="font-display mt-5 text-lg font-bold text-slate-900">{r.role}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{r.summary}</p>
              <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
                {r.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-sm text-slate-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ul>
    </Container>
  </section>
);

const PILLARS = [
  ['Connected', 'Attendance, academics and placements share one data model.'],
  ['Accurate', 'Rules are explicit, and uncertain records are flagged, not guessed.'],
  ['Respectful of privacy', 'Personal data is visible only to the roles that need it.'],
];

export const AboutSection: React.FC = () => (
  <section id="about" aria-labelledby="about-heading" className="scroll-mt-[72px] bg-white py-20 sm:py-24">
    <Container className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
      <div>
        <SectionHeader
          id="about-heading"
          eyebrow="About"
          title="A single core for the whole campus"
          description="Campus Core is a college management platform that brings the everyday work of administrators, lecturers, students and placement officers into one system."
        />
        <p className="mt-4 text-base leading-relaxed text-slate-600" data-reveal>
          It addresses a common problem: RFID readers record when students arrive and leave, but turning those scans into fair,
          per-class attendance usually takes hours of spreadsheet work. Campus Core connects that data to the timetable, and then
          extends the same foundation to coursework, results and placements.
        </p>
      </div>
      <div data-reveal className="relative overflow-hidden rounded-2xl bg-[#0B1120] p-7 text-white sm:p-9">
        <div aria-hidden="true" className="landing-grid-bg absolute inset-0" />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.45),transparent)]"
        />
        <div className="relative">
          <LogoMark className="h-11 w-11" />
          <p className="font-display mt-6 text-2xl font-bold leading-snug">One Campus. One Core. Everything Connected.</p>
          <dl className="mt-8 space-y-5">
            {PILLARS.map(([k, v]) => (
              <div key={k} className="border-l-2 border-blue-400/60 pl-4">
                <dt className="text-sm font-semibold text-white">{k}</dt>
                <dd className="mt-1 text-sm text-slate-300">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Container>
  </section>
);
