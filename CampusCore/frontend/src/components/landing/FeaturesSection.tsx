import React from 'react';
import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  CalendarClock,
  ChartLine,
  ClipboardList,
  Layers,
  Nfc,
  PieChart,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Container, SectionHeader } from './Primitives';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  group: 'Attendance' | 'Academics' | 'People' | 'Placements';
}

const FEATURES: Feature[] = [
  { icon: Nfc, title: 'RFID Attendance Management', description: 'Ingest entry and exit scans from your existing RFID readers and match them to students automatically.', group: 'Attendance' },
  { icon: CalendarClock, title: 'Timetable-Based Attendance', description: 'Attendance is calculated per scheduled class, using actual time present against the timetable.', group: 'Attendance' },
  { icon: Users, title: 'Student Management', description: 'Maintain student profiles, sections, enrolment and RFID card mapping in one directory.', group: 'People' },
  { icon: UserCog, title: 'Lecturer Management', description: 'Manage faculty records, designations, departments and subject assignments.', group: 'People' },
  { icon: Layers, title: 'Academic Management', description: 'Structure departments, programmes, semesters and sections that the rest of the system builds on.', group: 'Academics' },
  { icon: BookOpen, title: 'Course and Subject Management', description: 'Define courses and subjects, map them to lecturers and publish the weekly timetable.', group: 'Academics' },
  { icon: ClipboardList, title: 'Assignments and Examinations', description: 'Create assignments with deadlines and schedule internal and semester examinations.', group: 'Academics' },
  { icon: Award, title: 'Marks and Results', description: 'Record marks, review them, and publish results to students when they are ready.', group: 'Academics' },
  { icon: ChartLine, title: 'Student Performance Analytics', description: 'Spot attendance shortfalls and academic trends early with per-student and per-class views.', group: 'Academics' },
  { icon: Briefcase, title: 'Placement Management', description: 'Track eligibility, applications and outcomes for every student in one placement workspace.', group: 'Placements' },
  { icon: Building2, title: 'Company Recruitment Drives', description: 'Publish drives with eligibility criteria, rounds and application deadlines.', group: 'Placements' },
  { icon: PieChart, title: 'Placement Reports and Analytics', description: 'Summarise participation, selection progress and confirmed outcomes by department or batch.', group: 'Placements' },
];

const GROUP_STYLE: Record<Feature['group'], string> = {
  Attendance: 'bg-blue-50 text-blue-700 ring-blue-100',
  People: 'bg-sky-50 text-sky-700 ring-sky-100',
  Academics: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  Placements: 'bg-violet-50 text-violet-700 ring-violet-100',
};

export const FeaturesSection: React.FC = () => (
  <section id="features" aria-labelledby="features-heading" className="scroll-mt-[72px] bg-white py-20 sm:py-24">
    <Container>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeader
          id="features-heading"
          eyebrow="Features"
          title="Everything your campus runs on, in one connected core"
          description="Twelve modules that share one source of truth, so attendance, academics and placements never drift apart."
        />
      </div>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {FEATURES.map((f) => (
          <li key={f.title} data-reveal>
            <article className="group relative h-full rounded-2xl border border-slate-200 bg-white p-5 transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/[0.06]">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm transition-colors duration-300 group-hover:bg-gradient-to-br group-hover:from-blue-600 group-hover:to-violet-600">
                  <f.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${GROUP_STYLE[f.group]}`}>{f.group}</span>
              </div>
              <h3 className="font-display mt-5 text-base font-bold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.description}</p>
            </article>
          </li>
        ))}
      </ul>
    </Container>
  </section>
);

const STEPS = [
  { title: 'Register and configure', body: 'Register students and configure academic information: departments, courses, sections and subjects.' },
  { title: 'Connect RFID data', body: 'Connect the existing RFID attendance data source. No new hardware or firmware is required.' },
  { title: 'Calculate attendance', body: 'Calculate attendance against the college timetable using actual entry and exit times for each class.' },
  { title: 'Manage and track', body: 'Manage academics and track placement opportunities from the same connected platform.' },
];

export const HowItWorksSection: React.FC = () => (
  <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-[72px] border-y border-slate-200 bg-slate-50 py-20 sm:py-24">
    <Container>
      <SectionHeader
        id="how-heading"
        eyebrow="How it works"
        align="center"
        title="Up and running in four steps"
        description="Campus Core fits around the systems you already have instead of replacing them."
      />
      <ol className="relative mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <span
          aria-hidden="true"
          className="absolute left-[12.5%] right-[12.5%] top-6 hidden h-px bg-gradient-to-r from-blue-300 via-indigo-300 to-violet-300 lg:block"
        />
        {STEPS.map((s, i) => (
          <li key={s.title} data-reveal className="relative flex flex-col items-start lg:items-center lg:text-center">
            <span className="font-display relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-bold text-slate-900 shadow-sm ring-4 ring-slate-50">
              <span className="bg-gradient-to-br from-blue-600 to-violet-600 bg-clip-text text-transparent">{i + 1}</span>
            </span>
            <h3 className="font-display mt-5 text-lg font-bold text-slate-900">{s.title}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-600">{s.body}</p>
          </li>
        ))}
      </ol>
    </Container>
  </section>
);
