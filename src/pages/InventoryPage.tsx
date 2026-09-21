import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Product, Store, StoreInventory, Category, InventoryMovement } from '../types';
import { storage } from '../db/storageEngine';
import { formatNaira } from '../utils/currency';
import { StockAdjustmentModal } from '../components/inventory/StockAdjustmentModal';
import {
  Boxes,
  Search,
  Filter,
  Building2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  History,
  Grid,
  ListFilter,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Printer,
  PackageCheck,
  Layers,
} from 'lucide-react';

export const InventoryPage: React.FC = () => {
  const { currentUser, currentStore, isAdmin, stores } = useAuth();

  // Storage data
  const [products, setProducts] = useState<Product[]>(() => storage.getProducts());
  const [categories] = useState<Category[]>(() => storage.getCategories());
  const [inventory, setInventory] = useState<StoreInventory[]>(() => storage.getInventory());
  const [movements, setMovements] = useState<InventoryMovement[]>(() => storage.getMovements());

  // Navigation tab: 'MATRIX' (Admin only) | 'BRANCH_LIST' | 'MOVEMENTS'
  const [activeTab, setActiveTab] = useState<'MATRIX' | 'BRANCH_LIST' | 'MOVEMENTS'>(
    isAdmin ? 'MATRIX' : 'BRANCH_LIST'
  );

  // Selected store for BRANCH_LIST view
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    isAdmin ? stores[0]?.id || 'store-1' : currentStore?.id || 'store-1'
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [stockStatusFilter, setStockStatusFilter] = useState<
    'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
  >('ALL');

  // Stock Adjustment Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [modalInitialProduct, setModalInitialProduct] = useState<string>('');
  const [modalInitialStore, setModalInitialStore] = useState<string>('');

  // Refresh data
  const refreshData = () => {
    setProducts(storage.getProducts());
    setInventory(storage.getInventory());
    setMovements(storage.getMovements());
  };

  // Build quick map: `${productId}_${storeId}` -> quantity
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      map.set(`${inv.productId}_${inv.storeId}`, inv.quantity);
    }
    return map;
  }, [inventory]);

  // Total stock across chain per product
  const chainTotalMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      const current = map.get(inv.productId) || 0;
      map.set(inv.productId, current + inv.quantity);
    }
    return map;
  }, [inventory]);

  // Low stock and out of stock counts (contextual)
  const inventoryStats = useMemo(() => {
    let totalItems = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalStockUnits = 0;
    let totalStockValuation = 0;

    if (isAdmin && activeTab === 'MATRIX') {
      // Enterprise wide
      for (const p of products) {
        const totalStock = chainTotalMap.get(p.id) || 0;
        totalStockUnits += totalStock;
        totalStockValuation += totalStock * p.sellingPrice;
        if (totalStock === 0) outOfStockCount++;
        else if (totalStock <= p.reorderLevel * 2) lowStockCount++;
      }
      totalItems = products.length;
    } else {
      // Single store scoped
      const targetStoreId = isAdmin ? selectedStoreId : currentStore?.id || 'store-1';
      for (const p of products) {
        const qty = stockMap.get(`${p.id}_${targetStoreId}`) || 0;
        totalStockUnits += qty;
        totalStockValuation += qty * p.sellingPrice;
        if (qty === 0) outOfStockCount++;
        else if (qty <= p.reorderLevel) lowStockCount++;
      }
      totalItems = products.length;
    }

    return {
      totalItems,
      lowStockCount,
      outOfStockCount,
      totalStockUnits,
      totalStockValuation,
    };
  }, [products, stockMap, chainTotalMap, isAdmin, activeTab, selectedStoreId, currentStore]);

  // Filtered Products for Matrix or Branch View
  const filteredProducts = useMemo(() => {
    const targetStoreId = isAdmin && activeTab === 'BRANCH_LIST' ? selectedStoreId : currentStore?.id;

    return products.filter((product) => {
      const matchesSearch =
        !searchQuery ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.brand.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat =
        categoryFilter === 'ALL' || product.categoryId === categoryFilter;

      if (!matchesSearch || !matchesCat) return false;

      // Filter by stock status
      if (stockStatusFilter === 'ALL') return true;

      const qty =
        activeTab === 'MATRIX' && isAdmin
          ? chainTotalMap.get(product.id) || 0
          : stockMap.get(`${product.id}_${targetStoreId}`) || 0;

      if (stockStatusFilter === 'OUT_OF_STOCK') {
        return qty === 0;
      }
      if (stockStatusFilter === 'LOW_STOCK') {
        return qty > 0 && qty <= product.reorderLevel;
      }
      if (stockStatusFilter === 'IN_STOCK') {
        return qty > product.reorderLevel;
      }

      return true;
    });
  }, [
    products,
    searchQuery,
    categoryFilter,
    stockStatusFilter,
    activeTab,
    isAdmin,
    selectedStoreId,
    currentStore,
    stockMap,
    chainTotalMap,
  ]);

  // Open adjustment modal
  const handleOpenAdjust = (productId: string, storeId?: string) => {
    setModalInitialProduct(productId);
    setModalInitialStore(storeId || (isAdmin ? selectedStoreId : currentStore?.id || 'store-1'));
    setIsAdjustModalOpen(true);
  };

  const categoryMap = useMemo(() => {
    return new Map(categories.map((c) => [c.id, c.name]));
  }, [categories]);

  const storeMap = useMemo(() => {
    return new Map(stores.map((s) => [s.id, s.name]));
  }, [stores]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {isAdmin ? 'Multi-Store Inventory Matrix' : 'Branch Store Inventory'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAdmin
                  ? 'Real-time stock balance & replenishment across all 11 retail branches'
                  : `Real-time physical stock and low-stock alerts for ${currentStore?.name ?? 'Branch'}`}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => handleOpenAdjust(products[0]?.id || '')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Stock In / Adjust</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Banners */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Physical Units</span>
            <span className="p-1.5 bg-sky-500/10 text-sky-400 rounded-lg text-xs">
              <Boxes className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight font-mono">
            {inventoryStats.totalStockUnits.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {isAdmin && activeTab === 'MATRIX'
              ? 'Sum across 11 retail stores'
              : `Stock in ${isAdmin ? stores.find((s) => s.id === selectedStoreId)?.name : currentStore?.name}`}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Low Stock Warnings</span>
            <span className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400 tracking-tight font-mono">
            {inventoryStats.lowStockCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">At or below reorder threshold</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Out of Stock (0 Units)</span>
            <span className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg text-xs">
              <XCircle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-400 tracking-tight font-mono">
            {inventoryStats.outOfStockCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Replenishment required</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Current Stock Value</span>
            <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400 tracking-tight font-mono">
            {formatNaira(inventoryStats.totalStockValuation)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Estimated retail stock value</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setActiveTab('MATRIX')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'MATRIX'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>11-Store Matrix View</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('BRANCH_LIST')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'BRANCH_LIST'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>
              {isAdmin
                ? `Branch Inventory (${stores.find((s) => s.id === selectedStoreId)?.name || 'Store 1'})`
                : `Branch Inventory (${currentStore?.name || 'Assigned Store'})`}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('MOVEMENTS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'MOVEMENTS'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Movement Audit History ({movements.length})</span>
          </button>
        </div>

        {/* Print / Stocktake Action */}
        <button
          onClick={() => window.print()}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 flex items-center gap-1.5 cursor-pointer hidden sm:flex"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print Stocktake Sheet</span>
        </button>
      </div>

      {/* Filter Bar (Search + Categories + Status) - shown on MATRIX and BRANCH_LIST */}
      {activeTab !== 'MOVEMENTS' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search products by title, SKU, brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Store Picker when on BRANCH_LIST for Admin */}
            {isAdmin && activeTab === 'BRANCH_LIST' && (
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-hidden focus:border-indigo-500"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} - {s.location.split(',')[0]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-emerald-500"
            >
              <option value="ALL">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Stock Health Status Filter */}
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value as any)}
              className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-emerald-500"
            >
              <option value="ALL">All Stock Levels</option>
              <option value="LOW_STOCK">⚠️ Low Stock Alerts</option>
              <option value="OUT_OF_STOCK">❌ Out of Stock (0)</option>
              <option value="IN_STOCK">✅ Healthy Stock</option>
            </select>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 1: 11-STORE CROSS-BRANCH MATRIX VIEW (ADMIN ONLY)
      ========================================================================= */}
      {isAdmin && activeTab === 'MATRIX' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">
              Displaying {filteredProducts.length} products across all 11 retail store branches
            </span>
            <span className="text-[11px] text-slate-400">
              💡 Click on any store number cell to quickly adjust or restock that branch
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 sticky left-0 z-20 bg-slate-950 min-w-[240px] shadow-sm">
                    Product &amp; SKU
                  </th>
                  <th className="py-3 px-3 text-right">Price</th>
                  <th className="py-3 px-3 text-center bg-emerald-950/30 text-emerald-300 font-bold border-x border-slate-800/80">
                    Chain Total
                  </th>
                  {stores.map((store) => (
                    <th key={store.id} className="py-3 px-3 text-center min-w-[85px]">
                      <div className="font-bold text-slate-200">{store.name}</div>
                      <div className="text-[9px] text-slate-500 lowercase truncate max-w-[80px]">
                        {store.location.split(',')[0]}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={3 + stores.length} className="py-12 text-center text-slate-400">
                      <Boxes className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                      <p className="text-sm font-semibold text-slate-300">No matching products</p>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const chainTotal = chainTotalMap.get(p.id) || 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                        {/* Sticky Product Column */}
                        <td className="py-3 px-4 sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-800/60 border-r border-slate-800/60 shadow-sm">
                          <div className="font-semibold text-white truncate max-w-[220px]">
                            {p.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span className="text-emerald-400 font-bold">{p.sku}</span>
                            <span>•</span>
                            <span className="text-slate-500">Min {p.reorderLevel}</span>
                          </div>
                        </td>

                        {/* Price */}
                        <td className="py-3 px-3 text-right font-mono font-medium text-slate-300 whitespace-nowrap">
                          {formatNaira(p.sellingPrice)}
                        </td>

                        {/* Chain Total Column */}
                        <td className="py-3 px-3 text-center bg-emerald-950/20 border-x border-slate-800/80 font-mono font-bold">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                              chainTotal === 0
                                ? 'bg-rose-500/20 text-rose-400'
                                : chainTotal <= p.reorderLevel * 2
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {chainTotal}
                          </span>
                        </td>

                        {/* 11 Stores Individual Columns */}
                        {stores.map((s) => {
                          const qty = stockMap.get(`${p.id}_${s.id}`) || 0;
                          const isLow = qty > 0 && qty <= p.reorderLevel;
                          const isZero = qty === 0;

                          return (
                            <td
                              key={s.id}
                              onClick={() => handleOpenAdjust(p.id, s.id)}
                              className="py-2.5 px-2 text-center font-mono cursor-pointer hover:bg-slate-700/50 transition-colors"
                              title={`Click to adjust stock for ${p.name} at ${s.name}`}
                            >
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold transition-transform hover:scale-105 ${
                                  isZero
                                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                    : isLow
                                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                    : 'bg-slate-800/80 text-slate-200 border border-slate-700/60'
                                }`}
                              >
                                {qty}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: SINGLE BRANCH LIST INVENTORY VIEW
      ========================================================================= */}
      {activeTab === 'BRANCH_LIST' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Product Specs</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Selling Price</th>
                  <th className="py-3 px-4 text-center">In-Store Stock</th>
                  <th className="py-3 px-4 text-center">Reorder Min</th>
                  <th className="py-3 px-4 text-center">Inventory Health</th>
                  <th className="py-3 px-4 text-right">Estimated Value</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Boxes className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                      <p className="text-sm font-semibold text-slate-300">No products found</p>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => {
                    const targetStoreId = isAdmin ? selectedStoreId : currentStore?.id || 'store-1';
                    const qty = stockMap.get(`${product.id}_${targetStoreId}`) || 0;
                    const isLow = qty > 0 && qty <= product.reorderLevel;
                    const isZero = qty === 0;
                    const estimatedVal = qty * product.sellingPrice;

                    return (
                      <tr key={product.id} className="hover:bg-slate-800/40 transition-colors">
                        {/* Product Title */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{product.name}</div>
                          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="text-emerald-400 font-semibold">{product.sku}</span>
                            <span>•</span>
                            <span className="text-slate-300">{product.brand}</span>
                            {product.variant && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500">{product.variant}</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-800 text-slate-300 border border-slate-700/60">
                            {categoryMap.get(product.categoryId) || 'Accessories'}
                          </span>
                        </td>

                        {/* Price */}
                        <td className="py-3.5 px-4 text-right font-mono font-semibold text-white">
                          {formatNaira(product.sellingPrice)}
                        </td>

                        {/* Quantity in Store */}
                        <td className="py-3.5 px-4 text-center font-mono">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                              isZero
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : isLow
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {qty} units
                          </span>
                        </td>

                        {/* Reorder Min */}
                        <td className="py-3.5 px-4 text-center font-mono text-slate-400">
                          {product.reorderLevel}
                        </td>

                        {/* Health Badge */}
                        <td className="py-3.5 px-4 text-center">
                          {isZero ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Out of Stock</span>
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Low Stock Alert</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>In Stock</span>
                            </span>
                          )}
                        </td>

                        {/* Estimated Value */}
                        <td className="py-3.5 px-4 text-right font-mono text-slate-300">
                          {formatNaira(estimatedVal)}
                        </td>

                        {/* Quick Adjust Button */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleOpenAdjust(product.id, targetStoreId)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-emerald-600/30 hover:text-emerald-300 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1.5 ml-auto cursor-pointer"
                          >
                            <Boxes className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Adjust</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: MOVEMENT AUDIT HISTORY LOG
      ========================================================================= */}
      {activeTab === 'MOVEMENTS' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Stock Movement Audit Trail</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every sale, restock, transfer, and manual adjustment with user stamp
              </p>
            </div>
            <button
              onClick={refreshData}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Log</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Branch Store</th>
                  <th className="py-3 px-4">Product Item</th>
                  <th className="py-3 px-4 text-center">Movement Type</th>
                  <th className="py-3 px-4 text-center">Qty Change</th>
                  <th className="py-3 px-4 text-center">Before → After</th>
                  <th className="py-3 px-4">Authorized User</th>
                  <th className="py-3 px-4">Notes &amp; Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <History className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                      <p className="text-sm font-semibold text-slate-300">No inventory movements recorded yet</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Perform a stock adjustment or make a sale at the POS to see logs here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const product = products.find((p) => p.id === m.productId);
                    const store = stores.find((s) => s.id === m.storeId);
                    const isPositive = m.quantity > 0;

                    return (
                      <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                        {/* Timestamp */}
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(m.createdAt).toLocaleString('en-NG', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>

                        {/* Store */}
                        <td className="py-3 px-4 font-medium text-white">
                          {store?.name || m.storeId}
                        </td>

                        {/* Product */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{product?.name || m.productId}</div>
                          <div className="text-[10px] font-mono text-slate-400">{product?.sku}</div>
                        </td>

                        {/* Type */}
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.movementType === 'STOCK_IN'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : m.movementType === 'SALE'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : m.movementType === 'TRANSFER_IN' || m.movementType === 'TRANSFER_OUT'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {m.movementType.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Quantity change */}
                        <td className="py-3 px-4 text-center font-mono font-bold">
                          <span
                            className={`inline-flex items-center gap-0.5 ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isPositive ? (
                              <TrendingUp className="w-3.5 h-3.5" />
                            ) : (
                              <TrendingDown className="w-3.5 h-3.5" />
                            )}
                            {isPositive ? `+${m.quantity}` : m.quantity}
                          </span>
                        </td>

                        {/* Before -> After */}
                        <td className="py-3 px-4 text-center font-mono text-xs text-slate-300">
                          <span className="text-slate-500">{m.previousQuantity}</span>
                          <span className="mx-1.5 text-slate-600">→</span>
                          <span className="text-emerald-300 font-bold">{m.newQuantity}</span>
                        </td>

                        {/* User */}
                        <td className="py-3 px-4 text-slate-300 font-medium">
                          {m.userName}
                        </td>

                        {/* Reason / Notes */}
                        <td className="py-3 px-4 text-slate-400 text-[11px] max-w-xs truncate">
                          {m.notes || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {isAdjustModalOpen && (
        <StockAdjustmentModal
          isOpen={isAdjustModalOpen}
          onClose={() => setIsAdjustModalOpen(false)}
          onSuccess={() => {
            refreshData();
            setIsAdjustModalOpen(false);
          }}
          initialProductId={modalInitialProduct}
          initialStoreId={modalInitialStore}
        />
      )}
    </div>
  );
};
