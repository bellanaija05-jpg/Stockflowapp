import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Store,
  Boxes,
  ShoppingCart,
  Receipt,
  Users,
  Building2,
  FileSpreadsheet,
  ArrowLeftRight,
  ShieldCheck,
  Radio,
  ChevronRight,
  X,
  PackageCheck,
  Store as StoreIcon,
  LogOut,
} from 'lucide-react';

export type PageView =
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'sales'
  | 'products'
  | 'stores'
  | 'users'
  | 'transfers'
  | 'reports'
  | 'audit';

export interface SidebarProps {
  currentPage: PageView;
  onSelectPage: (page: PageView) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { currentUser, currentStore, isAdmin, signOut } = useAuth();

  // Navigation Items defined with RBAC permissions
  const navItems = [
    {
      id: 'dashboard' as PageView,
      label: isAdmin ? 'Executive Overview' : 'Store Dashboard',
      icon: Building2,
      adminOnly: false,
    },
    {
      id: 'pos' as PageView,
      label: 'Point of Sale (POS)',
      icon: ShoppingCart,
      adminOnly: false,
    },
    {
      id: 'inventory' as PageView,
      label: 'Inventory & Stock',
      icon: Boxes,
      adminOnly: false,
    },
    {
      id: 'sales' as PageView,
      label: 'Sales & Receipts',
      icon: Receipt,
      adminOnly: false,
    },
    {
      id: 'products' as PageView,
      label: 'Products Catalog',
      icon: PackageCheck,
      adminOnly: false,
    },
    {
      id: 'stores' as PageView,
      label: 'Physical Stores (11)',
      icon: Store,
      adminOnly: true,
    },
    {
      id: 'users' as PageView,
      label: 'Staff & Roles',
      icon: Users,
      adminOnly: true,
    },
    {
      id: 'transfers' as PageView,
      label: 'Inter-Store Transfers',
      icon: ArrowLeftRight,
      adminOnly: true,
    },
    {
      id: 'reports' as PageView,
      label: 'Reports & Analytics',
      icon: FileSpreadsheet,
      adminOnly: true,
    },
    {
      id: 'audit' as PageView,
      label: 'Audit Trail',
      icon: ShieldCheck,
      adminOnly: true,
    },
  ].filter((item) => (isAdmin ? true : !item.adminOnly));

  const handleNavClick = (page: PageView) => {
    onSelectPage(page);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* App Logo & Branding */}
        <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Store className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-base font-bold text-white tracking-tight">StockFlow</span>
              <span className="text-[10px] text-emerald-400 block font-mono -mt-1 font-semibold">
                Multi-Store POS
              </span>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="p-1 text-slate-400 hover:text-white rounded-lg lg:hidden cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Scope Banner */}
        <div className="p-3 mx-3 my-3 rounded-xl bg-slate-950/80 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              Active Scope
            </span>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <Radio className="w-3 h-3 animate-pulse" />
              <span>Online</span>
            </div>
          </div>

          <div className="mt-1.5 flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
            {isAdmin ? (
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
            ) : (
              <StoreIcon className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">
                {isAdmin ? 'All 11 Physical Stores' : currentStore?.name ?? 'Assigned Store'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {isAdmin ? 'Enterprise Global View' : currentStore?.location ?? 'Store Terminal'}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Navigation Menu
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
            );
          })}
        </div>

        {/* User Role Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40 border border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                  isAdmin
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {currentUser?.name ? currentUser.name.charAt(0) : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{currentUser?.name || 'Staff'}</p>
                <span
                  className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded-sm ${
                    isAdmin
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {isAdmin ? 'SUPER ADMIN' : 'STORE ATTENDANT'}
                </span>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors ml-1 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
