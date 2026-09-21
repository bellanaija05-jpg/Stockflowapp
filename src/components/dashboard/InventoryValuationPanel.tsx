import React from 'react';
import { formatNaira } from '../../utils/currency';
import { Boxes, ShieldCheck, TrendingUp, AlertTriangle, ArrowRight, Package } from 'lucide-react';

interface InventoryValuationPanelProps {
  overview: {
    totalProducts: number;
    totalUnitsAcrossStores: number;
    totalInventoryCostValue: number;
    totalInventoryRetailValue: number;
    lowStockItemsCount: number;
    outOfStockItemsCount: number;
  };
  onNavigateToInventory: () => void;
}

export const InventoryValuationPanel: React.FC<InventoryValuationPanelProps> = ({
  overview,
  onNavigateToInventory,
}) => {
  const potentialGrossMargin =
    overview.totalInventoryRetailValue - overview.totalInventoryCostValue;
  const marginPercentage =
    overview.totalInventoryRetailValue > 0
      ? ((potentialGrossMargin / overview.totalInventoryRetailValue) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-400">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Enterprise Inventory Valuation
              </h3>
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <ShieldCheck className="w-3 h-3" />
                ADMIN CONFIDENTIAL
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Aggregated capital investment and retail asset appraisal across all 11 retail stores
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateToInventory}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer self-start sm:self-auto"
        >
          <span>Multi-Store Stock Matrix</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Grid of Valuation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cost Valuation (Confidential) */}
        <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/40">
          <div className="flex items-center justify-between text-xs text-purple-300 font-semibold mb-2">
            <span>Total Inventory Cost Value</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-200 tracking-tight">
            {formatNaira(overview.totalInventoryCostValue)}
          </div>
          <p className="text-[11px] text-purple-400/80 mt-1">
            Cost basis investment across {overview.totalUnitsAcrossStores.toLocaleString()} physical units
          </p>
        </div>

        {/* Total Retail Valuation */}
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80">
          <div className="flex items-center justify-between text-xs text-slate-300 font-semibold mb-2">
            <span>Total Inventory Retail Value</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 tracking-tight">
            {formatNaira(overview.totalInventoryRetailValue)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Expected gross revenue upon 100% store inventory sell-through
          </p>
        </div>

        {/* Potential Gross Margin */}
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80">
          <div className="flex items-center justify-between text-xs text-slate-300 font-semibold mb-2">
            <span>Potential Gross Profit Margin</span>
            <span className="text-xs font-bold text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
              {marginPercentage}%
            </span>
          </div>
          <div className="text-2xl font-black text-sky-400 tracking-tight">
            {formatNaira(potentialGrossMargin)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Net projected markup value (Retail Appraisal - Cost Basis)
          </p>
        </div>

        {/* Physical Stock Volume */}
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80">
          <div className="flex items-center justify-between text-xs text-slate-300 font-semibold mb-2">
            <span>Catalog &amp; Physical Volume</span>
            <Package className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {overview.totalUnitsAcrossStores.toLocaleString()} <span className="text-sm font-semibold text-slate-400">units</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Across {overview.totalProducts} registered master catalog products
          </p>
        </div>
      </div>
    </div>
  );
};
