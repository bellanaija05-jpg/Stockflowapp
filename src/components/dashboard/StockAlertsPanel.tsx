import React, { useState } from 'react';
import { LowStockAlertItem, OutOfStockAlertItem } from '../../types';
import { AlertTriangle, AlertCircle, ArrowUpRight, Search, Building2, Sliders } from 'lucide-react';

interface StockAlertsPanelProps {
  lowStockAlerts: LowStockAlertItem[];
  outOfStockAlerts: OutOfStockAlertItem[];
  onOpenAdjustmentModal: (productId: string, storeId: string) => void;
  onOpenStoreDetail: (storeId: string) => void;
}

export const StockAlertsPanel: React.FC<StockAlertsPanelProps> = ({
  lowStockAlerts,
  outOfStockAlerts,
  onOpenAdjustmentModal,
  onOpenStoreDetail,
}) => {
  const [activeTab, setActiveTab] = useState<'LOW' | 'OUT'>('LOW');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLowStock = lowStockAlerts.filter(
    (item) =>
      item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.storeName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredOutOfStock = outOfStockAlerts.filter(
    (item) =>
      item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.storeName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      {/* Header with Tabs and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Inventory Exception Alerts
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Store-specific replenishment alerts requiring manager stock-in or transfer
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tab Selector */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveTab('LOW')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'LOW'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Low-Stock</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-950 text-amber-300 text-[10px] font-bold">
                {lowStockAlerts.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('OUT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'OUT'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Out-of-Stock</span>
              <span className="px-1.5 py-0.2 rounded-full bg-rose-950 text-rose-300 text-[10px] font-bold">
                {outOfStockAlerts.length}
              </span>
            </button>
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter alerts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 text-xs text-white pl-8 pr-3 py-1.5 rounded-xl placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-40"
            />
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-800/50 text-slate-400 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4 rounded-l-xl font-semibold">Product</th>
              <th className="py-3 px-4 font-semibold">SKU</th>
              <th className="py-3 px-4 font-semibold">Store Location</th>
              {activeTab === 'LOW' ? (
                <>
                  <th className="py-3 px-4 font-semibold text-right">Current Stock</th>
                  <th className="py-3 px-4 font-semibold text-right">Reorder Level</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                </>
              ) : (
                <>
                  <th className="py-3 px-4 font-semibold text-right">Stock Level</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                </>
              )}
              <th className="py-3 px-4 rounded-r-xl font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {activeTab === 'LOW' ? (
              filteredLowStock.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No low-stock alerts recorded for this selection.
                  </td>
                </tr>
              ) : (
                filteredLowStock.map((item) => (
                  <tr key={item.inventoryId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">
                      {item.productName}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                      {item.sku}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => onOpenStoreDetail(item.storeId)}
                        className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 hover:underline font-medium text-xs cursor-pointer"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{item.storeName}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right font-black text-amber-400 text-sm">
                      {item.currentStock} units
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400 font-medium">
                      {item.reorderLevel} units
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                        LOW STOCK
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onOpenAdjustmentModal(item.productId, item.storeId)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Sliders className="w-3 h-3" />
                        <span>Adjust Stock</span>
                      </button>
                    </td>
                  </tr>
                ))
              )
            ) : filteredOutOfStock.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No out-of-stock items recorded! All branches have inventory.
                </td>
              </tr>
            ) : (
              filteredOutOfStock.map((item) => (
                <tr key={item.inventoryId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-white">
                    {item.productName}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                    {item.sku}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => onOpenStoreDetail(item.storeId)}
                      className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 hover:underline font-medium text-xs cursor-pointer"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{item.storeName}</span>
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right font-black text-rose-400 text-sm">
                    0 units
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-bold uppercase tracking-wider">
                      OUT OF STOCK
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => onOpenAdjustmentModal(item.productId, item.storeId)}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Restock In</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
