import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarClock, Briefcase, GraduationCap, ShieldCheck, UserCog, Presentation } from 'lucide-react';
import { useAuth, ROLE_HOME, type UserRole } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Logo, LogoMark } from '../../components/landing/Primitives';
import { errorMessage } from '../../lib/utils';

const DEMO_ACCOUNTS = [
  { label: 'Admin', username: 'admin', password: 'admin123', icon: UserCog },
  { label: 'Lecturer', username: 'turing', password: 'lecturer123', icon: Presentation },
  { label: 'Student', username: 'rahul', password: 'student123', icon: GraduationCap },
  { label: 'Placement Officer', username: 'placement', password: 'placement123', icon: Briefcase },
];

const HIGHLIGHTS = [
  { icon: CalendarClock, text: 'Attendance calculated per scheduled class' },
  { icon: GraduationCap, text: 'Courses, assignments, exams and results' },
  { icon: Briefcase, text: 'Placement drives from application to offer' },
  { icon: ShieldCheck, text: 'Role-based access for every account' },
];

/** Only return to the originally requested page when it belongs to the signed-in role's workspace. */
function resolveRedirect(from: unknown, role: UserRole): string {
  const home = ROLE_HOME[role];
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/login')) return home;
  const allowed = role === 'ADMIN' ? [home, ROLE_HOME.PLACEMENT_OFFICER] : [home];
  return allowed.some((p) => from === p || from.startsWith(`${p}/`)) ? from : home;
}

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isExpired = new URLSearchParams(location.search).get('expired') === 'true';
  const from = (location.state as { from?: unknown } | null)?.from;

  useEffect(() => {
    document.title = 'Sign in · Campus Core';
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const profile = await login(username, password);
      navigate(resolveRedirect(from, profile.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err) || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (userVal: string, passVal: string) => {
    setUsername(userVal);
    setPassword(passVal);
    setError(null);
  };

  return (
    <div className="font-landing flex min-h-screen bg-white selection:bg-blue-600 selection:text-white">
      {/* Brand panel */}
      <aside className="relative isolate hidden w-[44%] max-w-[640px] flex-col justify-between overflow-hidden bg-[#0B1120] p-10 text-white lg:flex xl:p-14">
        <div aria-hidden="true" className="landing-grid-bg absolute inset-0 -z-10" />
        <div
          aria-hidden="true"
          className="absolute -left-32 -top-32 -z-10 h-[460px] w-[460px] rounded-full bg-[radial-gradient(closest-side,rgba(79,70,229,0.4),transparent)]"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-40 -right-24 -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(124,58,237,0.3),transparent)]"
        />
        <Logo />
        <div className="max-w-md">
          <p className="font-display text-4xl font-extrabold leading-tight">
            One Campus. One Core.{' '}
            <span className="bg-gradient-to-r from-blue-300 via-indigo-300 to-violet-300 bg-clip-text text-transparent">
              Everything Connected.
            </span>
          </p>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            Sign in to your workspace to manage attendance, academics, student performance and placement opportunities.
          </p>
          <ul className="mt-8 space-y-3.5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-blue-300 ring-1 ring-white/10">
                  <h.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {h.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-500">Accounts are issued by your college administration.</p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 flex-col px-4 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="lg:hidden">
            <LogoMark className="h-11 w-11" />
          </div>
          <h1 className="font-display mt-6 text-3xl font-bold text-slate-900 lg:mt-0">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-600">Sign in with your Campus Core username or official email.</p>

          <div className="mt-8 space-y-3" aria-live="polite">
            {isExpired && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                <span>Your session has expired. Please sign in again.</span>
              </div>
            )}
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleLogin} className="mt-4 space-y-5">
            <Input
              id="login-username"
              label="Username or official email"
              type="text"
              autoComplete="username"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin or rahul"
              className="h-11 rounded-xl"
            />
            <Input
              id="login-password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 rounded-xl"
            />
            <Button
              type="submit"
              variant="secondary"
              size="lg"
              isLoading={loading}
              className="h-12 w-full rounded-xl text-sm font-semibold"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Sign in
            </Button>
          </form>

          {/* Quick demo logins for evaluation */}
          <section aria-labelledby="demo-heading" className="mt-10 border-t border-slate-200 pt-6">
            <h2 id="demo-heading" className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Quick demo accounts
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {DEMO_ACCOUNTS.map((d) => (
                <button
                  key={d.username}
                  type="button"
                  onClick={() => handleQuickDemo(d.username, d.password)}
                  aria-pressed={username === d.username && password === d.password}
                  className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 aria-pressed:border-blue-400 aria-pressed:bg-blue-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition group-hover:bg-blue-600 group-hover:text-white">
                    <d.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-900">{d.label}</span>
                    <span className="block truncate font-mono text-[11px] text-slate-500">
                      {d.username} / {d.password}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <p className="mt-8 text-center text-xs text-slate-500">
            By signing in you agree to the{' '}
            <Link to="/terms" className="font-medium text-blue-700 hover:underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="font-medium text-blue-700 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
};
