import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export const LoadingSpinner: React.FC<{ message?: string; className?: string }> = ({
  message = 'Loading...',
  className,
}) => (
  <div className={cn('flex flex-col items-center justify-center p-12 text-center space-y-3', className)}>
    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
    <p className="text-sm text-slate-500 font-medium">{message}</p>
  </div>
);

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, action, className }) => (
  <div className={cn('flex flex-col items-center justify-center p-10 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50', className)}>
    {icon && <div className="p-3 bg-white rounded-full shadow-2xs border border-slate-100 mb-3 text-slate-400">{icon}</div>}
    <h4 className="text-sm font-semibold text-slate-800 mb-1">{title}</h4>
    <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">{description}</p>
    {action && <div>{action}</div>}
  </div>
);
