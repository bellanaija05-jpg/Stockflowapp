import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserSwitcherModal } from '../common/UserSwitcherModal';
import {
  Menu,
  UserCheck,
  ShieldCheck,
  Store,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import { storage } from '../../db/storageEngine';

interface HeaderProps {
  pageTitle: string;
  pageSubtitle?: string;
  onOpenMobileMenu: () => void;
  selectedStoreFilter?: string;
  onSelectStoreFilter?: (storeId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  pageTitle,
  pageSubtitle,
  onOpenMobileMenu,
  selectedStoreFilter,
  onSelectStoreFilter,
}) => {
  const { currentUser, currentStore, isAdmin, stores, refreshUserData, signOut, isSupabaseActive } = useAuth();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleResetData = () => {
    if (window.confirm('Reset all demo data back to default initial seed? (All new sales will be cleared, and stock restored)')) {
      setIsResetting(true);
      storage.resetToDefaults();
      refreshUserData();
      setTimeout(() => {
        setIsResetting(false);
        window.location.reload();
      }, 300);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <>
      <header className="sticky top-0 z-30 h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Left Side: Mobile Menu Button & Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobileMenu}
            className="p-2 -ml-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 lg:hidden cursor-pointer"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
              {pageTitle}
            </h1>
            {pageSubtitle && (
              <p className="text-[11px] text-slate-400 hidden sm:block truncate">
                {pageSubtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right Side: Store Filter (for Admin), Reset Demo, User Switcher & Sign Out */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Admin Global Store Filter dropdown */}
          {isAdmin && onSelectStoreFilter && (
            <div className="hidden md:flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
              <Store className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedStoreFilter || 'ALL'}
                onChange={(e) => onSelectStoreFilter(e.target.value)}
                className="bg-transparent border-none text-white focus:outline-hidden text-xs cursor-pointer"
              >
                <option value="ALL" className="bg-slate-800 text-white">
                  All 11 Stores (Aggregate)
                </option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-800 text-white">
                    {s.name} ({s.location.split(',')[0]})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Attendant Store Badge */}
          {!isAdmin && currentStore && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <Store className="w-3.5 h-3.5 text-emerald-400" />
              <span className="truncate max-w-[120px] sm:max-w-none">{currentStore.name}</span>
            </div>
          )}

          {/* Reset Demo Data Button */}
          <button
            onClick={handleResetData}
            title="Reset demo data to default stock levels"
            disabled={isResetting}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors hidden sm:flex items-center gap-1 text-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden lg:inline text-[11px]">Reset Demo</span>
          </button>

          {/* Demo User Switcher Trigger (Development Inspector) */}
          <button
            onClick={() => setIsSwitcherOpen(true)}
            title="Inspect permissions as Admin or Attendant"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium cursor-pointer ${
              isAdmin
                ? 'bg-indigo-600/15 border-indigo-500/40 text-indigo-200 hover:bg-indigo-600/25'
                : 'bg-emerald-600/15 border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/25'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Role:</span>
            <span className="font-bold text-white max-w-[100px] truncate">
              {currentUser?.name || 'User'}
            </span>
          </button>

          {/* Sign Out Action */}
          <button
            onClick={handleSignOut}
            title="Sign out from StockFlow Terminal"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-800/60 hover:bg-rose-500/20 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 transition-all text-xs cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* User Switcher Modal */}
      <UserSwitcherModal
        isOpen={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
      />
    </>
  );
};
