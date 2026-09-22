import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatNaira } from '../utils/currency';
import { storage } from '../db/storageEngine';
import { SupabaseBridge } from '../db/supabaseBridge';
import { Product, Sale, StoreInventory } from '../types';
import {
  Store,
  ShoppingCart,
  Receipt,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Package,
  Loader2,
} from 'lucide-react';

interface AttendantDashboardProps {
  onStartSale: (skuOrCode?: string) => void;
  onViewInventory: () => void;
  onViewSales: () => void;
}

export const AttendantDashboard: React.FC<AttendantDashboardProps> = ({
  onStartSale,
  onViewInventory,
  onViewSales,
}) => {
  const { currentUser, currentStore } = useAuth();
  const [quickSku, setQuickSku] = useState('');
  const [storeSales, setStoreSales] = useState<Sale[]>([]);
  const [storeStock, setStoreStock] = useState<(StoreInventory & { product?: Product })[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);

  // Milestone 5C: authoritative Supabase reads for this attendant's branch
  const loadData = async () => {
    if (!currentStore) return;

    setIsLoadingData(true);
    setDataLoadError(null);

    if (SupabaseBridge.isConnected()) {
      const [salesResult, inventoryResult, productsResult] = await Promise.all([
        SupabaseBridge.fetchSales({ storeId: currentStore.id, limit: 200 }),
        SupabaseBridge.fetchInventory(currentStore.id),
        SupabaseBridge.fetchProducts(),
      ]);

      if (!salesResult.success) {
        setDataLoadError(`Failed to load store sales: ${salesResult.error}`);
        setIsLoadingData(false);
        return;
      }
      if (!inventoryResult.success) {
        setDataLoadError(`Failed to load store inventory: ${inventoryResult.error}`);
        setIsLoadingData(false);
        return;
      }
      if (!productsResult.success) {
        setDataLoadError(`Failed to load products: ${productsResult.error}`);
        setIsLoadingData(false);
        return;
      }

      setStoreSales(salesResult.sales || []);

      // Rebuild the { product, quantity } list that getStoreStockList() provided
      const productMap = new Map((productsResult.products || []).map((p) => [p.id, p]));
      setStoreStock(
        (inventoryResult.inventory || []).map((inv) => ({
          ...inv,
          product: productMap.get(inv.productId),
        }))
      );
    } else {
      // Fallback for offline demo mode
      setStoreSales(storage.getSalesByStore(currentStore.id));
      setStoreStock(storage.getStoreStockList(currentStore.id));
    }

    setIsLoadingData(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore?.id]);

  if (!currentStore) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
        No store assigned to this attendant account. Please contact the Super Admin.
      </div>
    );
  }

  // Milestone 5C: loading / error gates (strict Supabase mode, no seed fallback)
  if (isLoadingData) {
    return (
      <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading your branch data from Supabase...</p>
      </div>
    );
  }

  if (dataLoadError) {
    return (
      <div className="p-8 max-w-2xl mx-auto my-12 bg-slate-900 border border-rose-800/50 rounded-2xl text-center space-y-4 shadow-2xl">
        <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
        <h2 className="text-xl font-black text-white">Could not load branch dashboard</h2>
        <p className="text-xs text-slate-400">{dataLoadError}</p>
        <div className="pt-2">
          <button
            onClick={loadData}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-emerald-900/40"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const now = new Date().toISOString().split('T')[0];
  const todaySales = storeSales.filter((s) => s.createdAt.startsWith(now));
  const todayRevenue = todaySales.reduce((acc, s) => acc + s.total, 0);
  const lowStockItems = storeStock.filter((item) => {
    if (!item.product) return false;
    return item.quantity > 0 && item.quantity <= item.product.reorderLevel;
  });
  const outOfStockItems = storeStock.filter((item) => item.quantity === 0);

  const handleQuickSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartSale(quickSku.trim());
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border border-emerald-500/20 p-6 rounded-2xl shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
              <Store className="w-4 h-4" />
              <span>{currentStore.name} Terminal</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Welcome back, {currentUser?.name || 'Attendant'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Physical branch: {currentStore.location} • {currentStore.phone}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onStartSale()}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/40 transition-all cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>OPEN POS / NEW SALE</span>
            </button>
          </div>
        </div>
      </div>

      {/* Attendant Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Today&apos;s Store Revenue</span>
            <div className="p-2 bg-emerald-500/15 text-emerald-400 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-2">
            {formatNaira(todayRevenue)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {todaySales.length} transaction{todaySales.length === 1 ? '' : 's'} recorded today
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Store Transactions</span>
            <div className="p-2 bg-indigo-500/15 text-indigo-400 rounded-lg">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-2">
            {storeSales.length} Sales
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Cumulative store transaction history
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Low / Out of Stock</span>
            <div className="p-2 bg-amber-500/15 text-amber-400 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-400 mt-2">
            {lowStockItems.length + outOfStockItems.length} Products
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {outOfStockItems.length} out of stock, {lowStockItems.length} below reorder level
          </p>
        </div>
      </div>

      {/* Fast POS SKU Entry Card */}
      <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <ShoppingCart className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold text-white">Quick Sale Entry</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Scan barcode or type product code / SKU to immediately open the POS terminal with the product selected.
        </p>

        <form onSubmit={handleQuickSaleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Enter Product Code / SKU (e.g. AIRPODS-PRO2-WHT, ORA-FP4-BLK)..."
              value={quickSku}
              onChange={(e) => setQuickSku(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 font-mono tracking-wide"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>START SALE</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Two Column Layout: Low Stock Warning & Recent Store Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Warnings for this store */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h4 className="text-sm font-bold text-white">Stock Warnings for {currentStore.name}</h4>
            </div>
            <button
              onClick={onViewInventory}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
            >
              View Full Stock
            </button>
          </div>

          <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto">
            {lowStockItems.concat(outOfStockItems).slice(0, 6).map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-white truncate max-w-[200px]">
                    {item.product?.name}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">{item.product?.sku}</div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      item.quantity === 0
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {item.quantity === 0 ? 'OUT OF STOCK' : `Only ${item.quantity} left`}
                  </span>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Reorder level: {item.product?.reorderLevel}
                  </div>
                </div>
              </div>
            ))}
            {lowStockItems.length === 0 && outOfStockItems.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                <Package className="w-6 h-6 text-emerald-400/60" />
                <span>All products in this branch have healthy inventory levels!</span>
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions for this store */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-white">Recent Store Transactions</h4>
            </div>
            <button
              onClick={onViewSales}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
            >
              View All Sales
            </button>
          </div>

          <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto">
            {storeSales.slice(0, 5).map((sale) => (
              <div key={sale.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-white">{sale.transactionNumber}</div>
                  <div className="text-[10px] text-slate-400">
                    {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {sale.items.length} items • {sale.paymentMethod}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-400">{formatNaira(sale.total)}</div>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-sm bg-emerald-500/10 text-emerald-300 font-semibold">
                    {sale.status}
                  </span>
                </div>
              </div>
            ))}
            {storeSales.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">
                No sales recorded for this store yet. Click &quot;OPEN POS&quot; to make the first transaction.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
