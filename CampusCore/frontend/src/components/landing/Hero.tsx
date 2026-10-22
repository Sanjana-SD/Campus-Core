import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronDown } from 'lucide-react';
import { useAuth, ROLE_HOME } from '../../context/AuthContext';
import { Container } from './Primitives';
import { DashboardPreview } from './DashboardPreview';
import { scrollToSection } from './nav';

const POINTS = ['Works with your existing RFID readers', 'Attendance per scheduled class', 'Role-based access for every user'];

export const Hero: React.FC = () => {
  const { isAuthenticated, role } = useAuth();
  const primaryTo = isAuthenticated && role ? ROLE_HOME[role] : '/login';

  return (
    <section
      id="home"
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-[#0B1120] text-white"
    >
      <div aria-hidden="true" className="landing-grid-bg absolute inset-0 -z-10" />
      <div
        aria-hidden="true"
        className="absolute -top-40 left-1/2 -z-10 h-[520px] w-[900px] max-w-[160vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(79,70,229,0.35),rgba(37,99,235,0.12),transparent)]"
      />
      <Container className="grid items-center gap-12 pb-20 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-10 lg:pb-28 lg:pt-24">
        <div className="animate-landing-fade-up max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-blue-400 to-violet-400" aria-hidden="true" />
            Attendance · Academics · Placements
          </p>
          <h1
            id="hero-heading"
            className="font-display mt-6 text-[2.5rem] font-extrabold leading-[1.08] sm:text-5xl lg:text-[3.5rem]"
          >
            One Campus. One Core.{' '}
            <span className="bg-gradient-to-r from-blue-300 via-indigo-300 to-violet-300 bg-clip-text text-transparent">
              Everything Connected.
            </span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-300">
            Manage attendance, academics, student performance, and placement opportunities through one intelligent campus
            management platform.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to={primaryTo}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-[15px] font-semibold text-slate-900 shadow-lg shadow-blue-950/50 transition hover:-translate-y-0.5 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1120]"
            >
              {isAuthenticated ? 'Go to dashboard' : 'Get Started'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href="#features"
              onClick={(e) => {
                if (scrollToSection('features', { focus: true })) e.preventDefault();
              }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 text-[15px] font-semibold text-white transition hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1120]"
            >
              Explore Features
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <ul className="mt-8 grid gap-2.5 text-sm text-slate-300 sm:grid-cols-1">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-landing-fade-up min-w-0" style={{ animationDelay: '0.15s' }}>
          <DashboardPreview />
        </div>
      </Container>
      <div aria-hidden="true" className="h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
    </section>
  );
};
