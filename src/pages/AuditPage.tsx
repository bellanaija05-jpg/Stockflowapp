import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage } from '../db/storageEngine';
import { SupabaseBridge } from '../db/supabaseBridge';
import { AuditLog } from '../types';
import { AccessDenied } from '../components/common/AccessDenied';
import {
  FileClock,
  Search,
  ShieldCheck,
  User,
  Calendar,
  Filter,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

interface AuditPageProps {
  onNavigateHome: () => void;
}

export const AuditPage: React.FC<AuditPageProps> = ({ onNavigateHome }) => {
  const { isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [allLogs, setAllLogs] = useState<AuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(true);
  const [logsLoadError, setLogsLoadError] = useState<string | null>(null);

  // Milestone 5C: authoritative Supabase reads for the audit trail
  const loadLogs = async () => {
    setIsLoadingLogs(true);
    setLogsLoadError(null);

    if (SupabaseBridge.isConnected()) {
      const result = await SupabaseBridge.fetchAuditLogs();
      if (!result.success) {
        setLogsLoadError(result.error || 'Failed to load audit logs.');
        setIsLoadingLogs(false);
        return;
      }
      setAllLogs(result.logs || []);
    } else {
      // Fallback for offline demo mode
      setAllLogs(storage.getAuditLogs());
    }

    setIsLoadingLogs(false);
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAdmin) {
    return <AccessDenied requiredRole="Super Admin" onGoBack={onNavigateHome} />;
  }

  // Milestone 5C: loading / error gates (strict Supabase mode, no seed fallback)
  if (isLoadingLogs) {
    return (
      <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading audit trail from Supabase...</p>
      </div>
    );
  }

  if (logsLoadError) {
    return (
      <div className="p-8 max-w-2xl mx-auto my-12 bg-slate-900 border border-rose-800/50 rounded-2xl text-center space-y-4 shadow-2xl">
        <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
        <h2 className="text-xl font-black text-white">Could not load audit trail</h2>
        <p className="text-xs text-slate-400">{logsLoadError}</p>
        <div className="pt-2">
          <button
            onClick={loadLogs}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-indigo-900/30"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const filteredLogs = allLogs.filter((log) => {
    const matchesSearch =
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const uniqueActions = Array.from(new Set(allLogs.map((l) => l.action)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">System Audit Trail</h2>
          <p className="text-xs text-slate-400">
            Immutable log of system actions, store modifications, stock changes, and security events
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Tamper-evident system activity</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search audit trail by user, action, details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
          >
            <option value="ALL">All Event Types</option>
            {uniqueActions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">Initiator / User</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Entity</th>
                <th className="px-4 py-3 font-semibold">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-white font-sans font-medium">{log.userName}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded-sm bg-slate-800 text-slate-400">
                        {log.userRole}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 font-semibold text-[10px] border border-indigo-500/20">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap font-sans">
                    {log.entity}
                  </td>
                  <td className="px-4 py-3 text-slate-200 font-sans max-w-md">
                    {log.details}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 font-sans text-xs">
                    <FileClock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    No audit records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
