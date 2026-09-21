import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Store, UserCheck, X, Check, AlertTriangle } from 'lucide-react';

interface UserSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserSwitcherModal: React.FC<UserSwitcherModalProps> = ({ isOpen, onClose }) => {
  const { users, currentUser, switchUser, stores, isSupabaseActive } = useAuth();

  if (!isOpen) return null;

  const adminUsers = users.filter((u) => u.role === 'ADMIN');
  const attendantUsers = users.filter((u) => u.role === 'ATTENDANT');

  const getStoreName = (storeId?: string) => {
    if (!storeId) return 'All Stores (Global)';
    const store = stores.find((s) => s.id === storeId);
    return store ? store.name : storeId;
  };

  const handleSelectUser = (id: string) => {
    switchUser(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-2.5">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-white">Switch Role / Demo Inspector</h2>
              <p className="text-xs text-slate-400">Test Super Admin vs. Store Attendant UI permissions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSupabaseActive && (
          <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Development Inspector Mode:</strong> Supabase Auth is enabled. This role switcher inspects interface behavior without altering backend credentials.
            </span>
          </div>
        )}

        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {/* Admin Role Section */}
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Super Admin (Full Access to All 11 Stores)</span>
            </div>
            <div className="space-y-2">
              {adminUsers.map((user) => {
                const isCurrent = currentUser ? user.id === currentUser.id : false;
                return (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user.id)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl text-left border transition-all ${
                      isCurrent
                        ? 'bg-indigo-950/40 border-indigo-500/50 shadow-xs'
                        : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-300 text-sm">
                        SA
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white flex items-center gap-2">
                          {user.name}
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                            SUPER ADMIN
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">{user.email} • Global Access</div>
                      </div>
                    </div>
                    {isCurrent && <Check className="w-5 h-5 text-indigo-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Store Attendants Section */}
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2.5">
              <Store className="w-4 h-4" />
              <span>Store Attendants (Store-Locked Access)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attendantUsers.map((user) => {
                const isCurrent = currentUser ? user.id === currentUser.id : false;
                return (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user.id)}
                    className={`p-3 rounded-xl text-left border transition-all ${
                      isCurrent
                        ? 'bg-emerald-950/40 border-emerald-500/50 shadow-xs'
                        : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-bold text-emerald-300 uppercase tracking-wide">
                          {getStoreName(user.assignedStoreId)}
                        </div>
                        <div className="text-sm font-medium text-white mt-0.5 truncate">{user.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
                      </div>
                      {isCurrent && <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-950 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span>Click any user to test their permissions and view state immediately.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium text-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
