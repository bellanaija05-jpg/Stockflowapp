import React, { useState } from 'react';
import { StoreDetailAnalytics, Sale } from '../../types';
import { formatNaira } from '../../utils/currency';
import {
  Building2,
  X,
  TrendingUp,
  Boxes,
  AlertTriangle,
  Receipt,
  Phone,
  MapPin,
  Clock,
  Eye,
  Sliders,
  Package,
} from 'lucide-react';

interface StoreDetailModalProps {
  analytics: StoreDetailAnalytics;
  onClose: () => void;
  onViewReceipt: (sale: Sale) => void;
  onAdjustStock: (productId: string, storeId: string) => void;
}

export const StoreDetailModal: React.FC<StoreDetailModalProps> = ({
  analytics,
  onClose,
  onViewReceipt,
  onAdjustStock,
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SALES' | 'LOW_STOCK' | 'TOP_PRODUCTS'>(
    'OVERVIEW'
  );
  const { store } = analytics;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950/40 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-white tracking-tight">{store.name}</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    store.status === 'ACTIVE'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  }`}
                >
                  {store.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  {store.location}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  {store.phone}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-5 gap-4">
          {[
            { id: 'OVERVIEW' as const, label: 'Performance Summary' },
            { id: 'SALES' as const, label: `Completed Sales (${analytics.recentSales.length})` },
            { id: 'LOW_STOCK' as const, label: `Stock Alerts (${analytics.lowStockProducts.length})` },
            { id: 'TOP_PRODUCTS' as const, label: `Top Products (${analytics.topSellingProducts.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              {/* Metric Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80">
                  <div className="text-[11px] text-slate-400">Today's Revenue</div>
                  <div className="text-xl font-black text-emerald-400 mt-1">
                    {formatNaira(analytics.todayRevenue)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {analytics.todayTransactions} sales today
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80">
                  <div className="text-[11px] text-slate-400">Total Recorded Revenue</div>
                  <div className="text-xl font-black text-white mt-1">
                    {formatNaira(analytics.periodRevenue)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {analytics.periodTransactions} total sales
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80">
                  <div className="text-[11px] text-slate-400">Physical Stock in Store</div>
                  <div className="text-xl font-black text-sky-400 mt-1">
                    {analytics.inventoryUnits.toLocaleString()} units
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {analytics.periodUnitsSold} units sold
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80">
                  <div className="text-[11px] text-slate-400">Inventory Exceptions</div>
                  <div className="text-xl font-black text-amber-400 mt-1">
                    {analytics.lowStockCount + analytics.outOfStockCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {analytics.lowStockCount} low • {analytics.outOfStockCount} out of stock
                  </div>
                </div>
              </div>

              {/* Side-by-Side: Quick Top Products & Quick Low Stock */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top Selling snippet */}
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Top Selling at this Store</span>
                    </h4>
                    <button
                      onClick={() => setActiveTab('TOP_PRODUCTS')}
                      className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
                    >
                      View all &rarr;
                    </button>
                  </div>

                  <div className="space-y-2">
                    {analytics.topSellingProducts.slice(0, 4).map((prod, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-800/60"
                      >
                        <div className="truncate max-w-[200px]">
                          <span className="font-semibold text-white">{prod.productName}</span>
                          <div className="text-[10px] text-slate-400 font-mono">{prod.sku}</div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-emerald-400">{formatNaira(prod.revenue)}</span>
                          <div className="text-[10px] text-slate-400">{prod.unitsSold} units</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Low Stock snippet */}
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Critical Stock Reorder</span>
                    </h4>
                    <button
                      onClick={() => setActiveTab('LOW_STOCK')}
                      className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
                    >
                      View all &rarr;
                    </button>
                  </div>

                  <div className="space-y-2">
                    {analytics.lowStockProducts.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3 text-center">
                        All store products are above reorder thresholds.
                      </p>
                    ) : (
                      analytics.lowStockProducts.slice(0, 4).map((p, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-800/60"
                        >
                          <div className="truncate max-w-[180px]">
                            <span className="font-semibold text-white">{p.productName}</span>
                            <div className="text-[10px] text-slate-400 font-mono">{p.sku}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-black text-xs ${
                                p.currentStock === 0 ? 'text-rose-400' : 'text-amber-400'
                              }`}
                            >
                              {p.currentStock} / {p.reorderLevel}
                            </span>
                            <button
                              onClick={() => onAdjustStock(p.productId, store.id)}
                              className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                              title="Adjust Stock"
                            >
                              <Sliders className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RECENT SALES */}
          {activeTab === 'SALES' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Store Transaction Log
              </h4>
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Transaction #</th>
                      <th className="py-2.5 px-4 font-semibold">Attendant</th>
                      <th className="py-2.5 px-4 font-semibold text-center">Payment</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Amount</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Date / Time</th>
                      <th className="py-2.5 px-4 font-semibold text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {analytics.recentSales.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono font-bold text-indigo-400">
                          {s.transactionNumber}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">{s.attendantName}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold border border-slate-700">
                            {s.paymentMethod}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                          {formatNaira(s.total)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-400 font-mono text-[11px]">
                          {new Date(s.createdAt).toLocaleDateString('en-GB')}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            onClick={() => onViewReceipt(s)}
                            className="p-1 text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded cursor-pointer"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: LOW STOCK */}
          {activeTab === 'LOW_STOCK' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Store Reorder Requirements
              </h4>
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Product Name</th>
                      <th className="py-2.5 px-4 font-semibold">SKU</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Current Stock</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Reorder Threshold</th>
                      <th className="py-2.5 px-4 font-semibold text-center">Status</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Quick Restock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {analytics.lowStockProducts.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-bold text-white">{p.productName}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">{p.sku}</td>
                        <td className="py-2.5 px-4 text-right font-black text-amber-400">
                          {p.currentStock} units
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-400">
                          {p.reorderLevel} units
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              p.currentStock === 0
                                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            }`}
                          >
                            {p.currentStock === 0 ? 'OUT OF STOCK' : 'LOW STOCK'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => onAdjustStock(p.productId, store.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Adjust</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: TOP PRODUCTS */}
          {activeTab === 'TOP_PRODUCTS' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Store Best Sellers
              </h4>
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/60 text-slate-400 text-[11px] uppercase">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Product Name</th>
                      <th className="py-2.5 px-4 font-semibold">SKU</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Units Sold</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Total Revenue</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Transactions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {analytics.topSellingProducts.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-bold text-white">{p.productName}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">{p.sku}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-sky-400">
                          {p.unitsSold}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                          {formatNaira(p.revenue)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-400 font-medium">
                          {p.transactions}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Close Drill-down View
          </button>
        </div>
      </div>
    </div>
  );
};
