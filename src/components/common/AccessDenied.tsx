import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AccessDeniedProps {
  requiredRole?: string;
  onGoBack: () => void;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({
  requiredRole = 'Super Admin',
  onGoBack,
}) => {
  const { currentUser } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 bg-slate-900/50 border border-slate-800 rounded-2xl">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Restricted Access</h2>
      <p className="text-slate-400 text-sm max-w-md mb-4">
        You are currently signed in as{' '}
        <span className="text-white font-medium">{currentUser?.name || 'Staff'}</span> with role{' '}
        <span className="text-emerald-400 font-semibold">{currentUser?.role || 'ATTENDANT'}</span>. This module requires {requiredRole} privileges.
      </p>
      <div className="p-3 bg-slate-800/80 rounded-xl text-xs text-slate-300 border border-slate-700 max-w-md mb-6">
        Store attendants cannot access global administration, multi-store settings, or other stores&apos; confidential records.
      </div>
      <button
        onClick={onGoBack}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Dashboard</span>
      </button>
    </div>
  );
};
