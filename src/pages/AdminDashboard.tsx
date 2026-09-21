import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatNaira } from '../utils/currency';
import { storage } from '../db/storageEngine';
import {
  DateRangePreset,
  DateRangeFilter,
  Sale,
  StoreDetailAnalytics,
} from '../types';
import { SalesTrendChart } from '../components/dashboard/SalesTrendChart';
import { PaymentBreakdownCard } from '../components/dashboard/PaymentBreakdownCard';
import { TopProductsTable } from '../components/dashboard/TopProductsTable';
import { CategorySalesTable } from '../components/dashboard/CategorySalesTable';
import { InventoryValuationPanel } from '../components/dashboard/InventoryValuationPanel';
import { StockAlertsPanel } from '../components/dashboard/StockAlertsPanel';
import { RecentTransactionsTable } from '../components/dashboard/RecentTransactionsTable';
import { StoreDetailModal } from '../components/dashboard/StoreDetailModal';
import { ReceiptModal } from '../components/pos/ReceiptModal';
import { StockAdjustmentModal } from '../components/inventory/StockAdjustmentModal';
import {
  TrendingUp,
  Receipt,
  Store as StoreIcon,
  Boxes,
  AlertTriangle,
  AlertCircle,
  Building2,
  Calendar,
  Filter,
  RefreshCw,
  ShoppingBag,
  ShieldAlert,
  ArrowRight,
  CreditCard,
  Search,
  Lock,
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigatePage: (page: any) => void;
  selectedStoreFilter: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onNavigatePage,
  selectedStoreFilter: initialStoreFilter,
}) => {
  const { currentUser, isAdmin, stores } = useAuth();

  // Date Range state
  const [selectedPreset, setSelectedPreset] = useState<DateRangePreset>('THIS_MONTH');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [appliedCustomDates, setAppliedCustomDates] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);

  // Store filter state (supports 'ALL' or individual store IDs)
  const [storeFilter, setStoreFilter] = useState<string>(initialStoreFilter || 'ALL');

  // Refresh counter to re-fetch live storage queries
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Modal states
  const [selectedStoreDetail, setSelectedStoreDetail] = useState<StoreDetailAnalytics | null>(null);
  const [viewingReceiptSale, setViewingReceiptSale] = useState<Sale | null>(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<string>('');
  const [adjustStoreId, setAdjustStoreId] = useState<string>('');

  // Enforce Super Admin authorization (Requirement 15 & 19)
  if (!isAdmin || currentUser?.role !== 'ADMIN') {
    return (
      <div className="p-8 max-w-2xl mx-auto my-12 bg-slate-900 border border-rose-800/50 rounded-2xl text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-white">Access Denied: Super Admin Restricted</h2>
        <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
          The Executive Analytics Dashboard, multi-store financial intelligence, and capital inventory valuations are strictly restricted to Super Administrators. Store attendants may only access their assigned branch Point-of-Sale terminal.
        </p>
        <div className="pt-2">
          <button
            onClick={() => onNavigatePage('pos')}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-indigo-900/30"
          >
            Go to Point of Sale
          </button>
        </div>
      </div>
    );
  }

  // Construct current date range filter
  const currentFilter: DateRangeFilter = useMemo(() => {
    if (selectedPreset === 'CUSTOM' && appliedCustomDates) {
      return {
        preset: 'CUSTOM',
        startDate: appliedCustomDates.startDate,
        endDate: appliedCustomDates.endDate,
      };
    }
    return { preset: selectedPreset };
  }, [selectedPreset, appliedCustomDates]);

  // Execute live analytics query through StorageEngine
  const analyticsData = useMemo(() => {
    try {
      return storage.getAdminDashboardAnalytics(currentUser, currentFilter, storeFilter);
    } catch (err) {
      console.error('Failed to calculate analytics:', err);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, currentFilter, storeFilter, refreshKey]);

  const handleApplyCustomDates = () => {
    if (customStartDate && customEndDate) {
      setAppliedCustomDates({ startDate: customStartDate, endDate: customEndDate });
    }
  };

  const handleOpenStoreDetail = (storeId: string) => {
    try {
      const detail = storage.getStoreDetailAnalytics(currentUser, storeId);
      setSelectedStoreDetail(detail);
    } catch (err) {
      console.error('Error loading store detail:', err);
    }
  };

  const handleOpenAdjustmentModal = (productId: string, storeId: string) => {
    setAdjustProductId(productId);
    setAdjustStoreId(storeId);
    setIsAdjustModalOpen(true);
  };

  const handleAdjustmentSuccess = () => {
    setIsAdjustModalOpen(false);
    setRefreshKey((prev) => prev + 1);
    // If a store detail modal is currently open, refresh it as well
    if (selectedStoreDetail) {
      handleOpenStoreDetail(selectedStoreDetail.store.id);
    }
  };

  if (!analyticsData) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900 rounded-2xl border border-slate-800">
        Loading executive business analytics...
      </div>
    );
  }

  const { kpis, salesByStore, paymentBreakdown, salesTrend, topProducts, salesByCategory, inventoryOverview, lowStockAlerts, outOfStockAlerts, recentTransactions } = analyticsData;

  const datePresets: { id: DateRangePreset; label: string }[] = [
    { id: 'TODAY', label: 'Today' },
    { id: 'YESTERDAY', label: 'Yesterday' },
    { id: 'LAST_7_DAYS', label: 'Last 7 Days' },
    { id: 'LAST_30_DAYS', label: 'Last 30 Days' },
    { id: 'THIS_MONTH', label: 'This Month' },
    { id: 'CUSTOM', label: 'Custom Range' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Controls Bar */}
      <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-slate-900 border border-indigo-500/20 p-6 rounded-2xl shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">
              <Building2 className="w-4 h-4" />
              <span>Multi-Store Corporate Intelligence • Super Admin</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Executive Sales &amp; Business Analytics
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Real-time multi-branch retail metrics across Nigeria • Only completed sales contribute to revenue
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onNavigatePage('pos')}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/40 transition-all cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Launch POS</span>
            </button>
            <button
              onClick={() => onNavigatePage('inventory')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
            >
              <Boxes className="w-4 h-4" />
              <span>Stock Matrix</span>
            </button>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-all cursor-pointer"
              title="Refresh Analytics"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {datePresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedPreset(preset.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedPreset === preset.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                    : 'bg-slate-800/70 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Store Filter Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap font-medium flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              Store Filter:
            </span>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-xs text-white px-3 py-1.5 rounded-xl focus:outline-none focus:border-indigo-500 cursor-pointer min-w-[180px]"
            >
              <option value="ALL">All 11 Retail Stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.location.split(',')[0]})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Date Pickers Drawer (when selectedPreset === 'CUSTOM') */}
        {selectedPreset === 'CUSTOM' && (
          <div className="mt-4 p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30 flex flex-wrap items-center gap-3 animate-in fade-in">
            <span className="text-xs text-indigo-300 font-semibold flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Select Date Range:
            </span>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-400">Start:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-xs text-white px-2.5 py-1 rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-400">End:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-xs text-white px-2.5 py-1 rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleApplyCustomDates}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              Apply Filter
            </button>
          </div>
        )}
      </div>

      {/* 2. Seven Required KPI Cards (Requirement 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: TOTAL SALES TODAY */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>TOTAL SALES TODAY</span>
            <div className="p-2 bg-emerald-500/15 text-emerald-400 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-2 tracking-tight">
            {formatNaira(kpis.totalSalesToday)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {kpis.totalTransactionsToday} completed sales recorded today
          </p>
        </div>

        {/* KPI 2: TOTAL TRANSACTIONS TODAY */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>TRANSACTIONS TODAY</span>
            <div className="p-2 bg-sky-500/15 text-sky-400 rounded-lg">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-sky-400 mt-2 tracking-tight">
            {kpis.totalTransactionsToday} <span className="text-sm font-semibold text-slate-400">orders</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Total receipts settled by attendants today
          </p>
        </div>

        {/* KPI 3: TOTAL SALES THIS WEEK */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>TOTAL SALES THIS WEEK</span>
            <div className="p-2 bg-indigo-500/15 text-indigo-400 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-indigo-300 mt-2 tracking-tight">
            {formatNaira(kpis.totalSalesThisWeek)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Current calendar week cumulative revenue
          </p>
        </div>

        {/* KPI 4: TOTAL SALES THIS MONTH */}
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>TOTAL SALES THIS MONTH</span>
            <div className="p-2 bg-purple-500/15 text-purple-400 rounded-lg">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-300 mt-2 tracking-tight">
            {formatNaira(kpis.totalSalesThisMonth)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Month-to-date total retail sales
          </p>
        </div>
      </div>

      {/* KPI Cards (Row 2: Low-Stock, Out-of-Stock, Active Stores) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 5: LOW-STOCK PRODUCTS */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">LOW-STOCK PRODUCTS</div>
              <div className="text-xl font-black text-amber-400 mt-0.5">
                {kpis.lowStockProductsCount} Products
              </div>
              <div className="text-[11px] text-slate-500">At or below reorder threshold</div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold">
            {lowStockAlerts.length} lines
          </span>
        </div>

        {/* KPI 6: OUT-OF-STOCK PRODUCTS */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">OUT-OF-STOCK PRODUCTS</div>
              <div className="text-xl font-black text-rose-400 mt-0.5">
                {kpis.outOfStockProductsCount} Products
              </div>
              <div className="text-[11px] text-slate-500">Zero inventory in at least 1 store</div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-bold">
            {outOfStockAlerts.length} stores
          </span>
        </div>

        {/* KPI 7: ACTIVE STORES */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">ACTIVE STORES</div>
              <div className="text-xl font-black text-white mt-0.5">
                {kpis.activeStoresCount} / {stores.length}
              </div>
              <div className="text-[11px] text-slate-500">Retail retail locations online</div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
            100% Operational
          </span>
        </div>
      </div>

      {/* 3. Sales Trend Chart (Requirement 5) */}
      <SalesTrendChart data={salesTrend} periodLabel={analyticsData.periodLabel} />

      {/* 4. Two-Column Row: Sales by Store & Payment Method Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales by Store (Requirement 3) */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-400">
                <StoreIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Sales by Retail Branch
                </h3>
                <p className="text-xs text-slate-400">
                  Factual performance metrics across all 11 active stores (Click store to inspect)
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {salesByStore.length} Active Branches
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/50 text-slate-400 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-4 rounded-l-xl font-semibold">Store</th>
                  <th className="py-2.5 px-4 font-semibold">Location</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Transactions</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Units Sold</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Total Revenue</th>
                  <th className="py-2.5 px-4 rounded-r-xl font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {salesByStore.map((storeMetric) => (
                  <tr
                    key={storeMetric.storeId}
                    onClick={() => handleOpenStoreDetail(storeMetric.storeId)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-bold text-white group-hover:text-indigo-300">
                      {storeMetric.storeName}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {storeMetric.location}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-300">
                      {storeMetric.transactions}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-sky-400">
                      {storeMetric.unitsSold.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-emerald-400 text-sm">
                      {formatNaira(storeMetric.revenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenStoreDetail(storeMetric.storeId);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                      >
                        <span>Drill-down</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Breakdown Card (Requirement 4 & 13) */}
        <div className="lg:col-span-1">
          <PaymentBreakdownCard
            data={paymentBreakdown}
            totalRevenue={analyticsData.periodRevenue}
          />
        </div>
      </div>

      {/* 5. Top-Selling Products (Requirement 6) */}
      <TopProductsTable products={topProducts} />

      {/* 6. Sales by Category (Requirement 7) */}
      <CategorySalesTable
        categories={salesByCategory}
        totalPeriodRevenue={analyticsData.periodRevenue}
      />

      {/* 7. Enterprise Inventory Valuation Panel (Requirement 8) */}
      <InventoryValuationPanel
        overview={inventoryOverview}
        onNavigateToInventory={() => onNavigatePage('inventory')}
      />

      {/* 8. Stock Alerts Panel (Requirement 9 & 10) */}
      <StockAlertsPanel
        lowStockAlerts={lowStockAlerts}
        outOfStockAlerts={outOfStockAlerts}
        onOpenAdjustmentModal={handleOpenAdjustmentModal}
        onOpenStoreDetail={handleOpenStoreDetail}
      />

      {/* 9. Recent Transactions Table (Requirement 11) */}
      <RecentTransactionsTable
        sales={recentTransactions}
        stores={stores}
        onViewReceipt={(sale) => setViewingReceiptSale(sale)}
        onNavigateToSales={() => onNavigatePage('sales')}
      />

      {/* MODAL 1: Store Detail Modal (Requirement 12) */}
      {selectedStoreDetail && (
        <StoreDetailModal
          analytics={selectedStoreDetail}
          onClose={() => setSelectedStoreDetail(null)}
          onViewReceipt={(sale) => setViewingReceiptSale(sale)}
          onAdjustStock={(prodId, storeId) => handleOpenAdjustmentModal(prodId, storeId)}
        />
      )}

      {/* MODAL 2: Receipt Viewer Modal */}
      {viewingReceiptSale && (
        <ReceiptModal
          sale={viewingReceiptSale}
          store={stores.find((s) => s.id === viewingReceiptSale.storeId)}
          onClose={() => setViewingReceiptSale(null)}
        />
      )}

      {/* MODAL 3: Stock Adjustment Modal */}
      <StockAdjustmentModal
        isOpen={isAdjustModalOpen}
        initialProductId={adjustProductId}
        initialStoreId={adjustStoreId}
        onClose={() => setIsAdjustModalOpen(false)}
        onSuccess={handleAdjustmentSuccess}
      />
    </div>
  );
};

