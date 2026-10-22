import React, { useCallback, useEffect, useState } from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { Menu, X, Bell, ChevronRight } from 'lucide-react';
import { useAuth, UserRole, ROLE_HOME, ROLE_LABEL } from '../context/AuthContext';
import { Sidebar } from './Sidebar';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { ApiClient } from '../lib/api';

export const DashboardLayout: React.FC<{ allowedRoles?: UserRole[] }> = ({ allowedRoles }) => {
  const { isAuthenticated, isLoading, role, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unread, setUnread] = useState<number | null>(null);
  const [todayStr] = useState(() =>
    new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  );
  const location = useLocation();

  const loadUnread = useCallback(() => {
    ApiClient.get<{ unread: number }>('/notifications/unread-count')
      .then((r) => setUnread(r.unread))
      .catch(() => setUnread(null));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadUnread();
    const t = window.setInterval(loadUnread, 60000);
    return () => window.clearInterval(t);
  }, [isAuthenticated, loadUnread, location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner message="Authenticating session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to={ROLE_HOME[role] || '/'} replace />;
  }

  // Notifications page lives under the area the user is currently in.
  const area = '/' + (location.pathname.split('/')[1] || '');
  const notificationsPath = `${area}/notifications`;


  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800">
      <div className="hidden lg:flex shrink-0">
        <Sidebar />
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden bg-slate-900/60 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-slate-900">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white z-10"
              aria-label="Close menu"
            >
              <X className="w-6 h-6" />
            </button>
            <Sidebar onCloseMobile={() => setMobileMenuOpen(false)} />
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white/90 backdrop-blur border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 min-w-0">
              <Link to="/" className="text-slate-900 font-semibold hover:text-blue-700">
                Campus Core
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{role ? ROLE_LABEL[role] : ''} Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <span className="hidden md:inline text-xs text-slate-500">{todayStr}</span>
            <Link
              to={notificationsPath}
              className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            >
              <Bell className="w-5 h-5" />
              {!!unread && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-900 leading-tight">{user?.full_name}</div>
                <div className="text-[10px] text-blue-600 font-medium tracking-wide uppercase">
                  {role ? ROLE_LABEL[role] : ''}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
