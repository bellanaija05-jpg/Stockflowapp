import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuditAction, Product, Category, ProductStatus, StoreInventory } from '../types';
import { SupabaseBridge } from '../db/supabaseBridge';
import { formatNaira } from '../utils/currency';
import { StockAdjustmentModal } from '../components/inventory/StockAdjustmentModal';
import { AuditWriteWarning } from '../components/common/AuditWriteWarning';
import {
  Package,
  Search,
  Plus,
  Filter,
  Layers,
  Barcode,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Boxes,
  Tag,
  Hash,
  Sparkles,
  ArrowUpDown,
  X,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

/* =========================================================================
   MILESTONE 5D-C: PRODUCT CHANGE CLASSIFICATION
   Single source of truth for audit semantics, shared by the Edit modal and
   the quick status toggle so the two UI paths cannot diverge.
========================================================================= */

/** Persisted product fields compared to detect a "details" change. */
const PRODUCT_FIELD_LABELS: Array<{ key: keyof Product; label: string }> = [
  { key: 'name', label: 'name' },
  { key: 'sku', label: 'SKU' },
  { key: 'barcode', label: 'barcode' },
  { key: 'categoryId', label: 'category' },
  { key: 'costPrice', label: 'cost price' },
  { key: 'sellingPrice', label: 'selling price' },
  { key: 'reorderLevel', label: 'reorder level' },
  { key: 'brand', label: 'brand' },
  { key: 'model', label: 'model' },
  { key: 'variant', label: 'variant' },
  { key: 'description', label: 'description' },
];

const normalizeFieldValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

type ProductChangeKind = 'NONE' | 'STATUS' | 'DETAILS' | 'STATUS_AND_DETAILS';

interface ProductChange {
  kind: ProductChangeKind;
  action: AuditAction | null;
  details: string;
}

const changedFieldLabels = (original: Product, next: Product): string[] =>
  PRODUCT_FIELD_LABELS.filter(
    (field) => normalizeFieldValue(original[field.key]) !== normalizeFieldValue(next[field.key])
  ).map((field) => field.label);

const statusChangeAction = (status: ProductStatus): AuditAction =>
  status === 'ACTIVE'
    ? 'PRODUCT_ACTIVATED'
    : status === 'DISCONTINUED'
    ? 'PRODUCT_DISCONTINUED'
    : 'PRODUCT_DEACTIVATED';

const statusChangeVerb = (status: ProductStatus): string =>
  status === 'ACTIVE' ? 'Activated' : status === 'DISCONTINUED' ? 'Discontinued' : 'Deactivated';

/**
 * Decide the audit action + message for a product save:
 * - status only            -> PRODUCT_ACTIVATED / PRODUCT_DEACTIVATED / PRODUCT_DISCONTINUED
 * - details only           -> PRODUCT_EDITED
 * - status + details       -> ONE entry keyed to the status transition (lists the other changes)
 * - no meaningful change   -> no audit entry at all
 */
const describeProductChange = (original: Product, next: Product): ProductChange => {
  const statusChanged = original.status !== next.status;
  const fields = changedFieldLabels(original, next);
  const detailsChanged = fields.length > 0;

  if (!statusChanged && !detailsChanged) {
    return { kind: 'NONE', action: null, details: '' };
  }

  const identifier = `"${next.name}" (${next.sku})`;

  if (statusChanged && detailsChanged) {
    return {
      kind: 'STATUS_AND_DETAILS',
      action: statusChangeAction(next.status),
      details: `${statusChangeVerb(next.status)} product ${identifier} - also changed: ${fields.join(', ')}`,
    };
  }

  if (statusChanged) {
    return {
      kind: 'STATUS',
      action: statusChangeAction(next.status),
      details: `${statusChangeVerb(next.status)} product ${identifier}`,
    };
  }

  return {
    kind: 'DETAILS',
    action: 'PRODUCT_EDITED',
    details: `Updated product ${identifier} - changed: ${fields.join(', ')}`,
  };
};

export const ProductsPage: React.FC = () => {
  const { currentUser, currentStore, isAdmin, stores } = useAuth();

  // Storage data state
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inventory, setInventory] = useState<StoreInventory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showCostPrices, setShowCostPrices] = useState<boolean>(isAdmin);
  const [viewMode, setViewMode] = useState<'TABLE' | 'GRID'>('TABLE');

  // Modals state
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);

  // Stock Adjustment Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<string>('');

  // Milestone 5D-B: audit-trail write failures (surfaced, never silently swallowed)
  const [auditWarning, setAuditWarning] = useState<string | null>(null);

  // Milestone 5D-C: save failures (surfaced, never silently swallowed)
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  // Milestone 5D-C: re-entrancy guard for the quick status toggle (no duplicate saves/audit rows).
  const statusToggleBusy = React.useRef(false);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [prodRes, catRes, invRes] = await Promise.all([
        SupabaseBridge.fetchProducts({ includeInactive: true }),
        SupabaseBridge.fetchCategories(),
        SupabaseBridge.fetchInventory()
      ]);

      if (!prodRes.success) throw new Error(prodRes.error);
      if (!catRes.success) throw new Error(catRes.error);
      if (!invRes.success) throw new Error(invRes.error);

      setProducts(prodRes.products || []);
      setCategories(catRes.categories as Category[] || []);
      setInventory(invRes.inventory || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load catalog data');
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadData();
  }, []);

  // Refresh handler
  const refreshData = () => {
    loadData();
  };

  // Distinct Brands
  const uniqueBrands = useMemo(() => {
    const brands = Array.from(new Set(products.map((p) => p.brand))).filter(Boolean);
    return brands.sort();
  }, [products]);

  // Aggregate stock counts per product
  const productStockMap = useMemo(() => {
    const map = new Map<string, { total: number; storeStock: number }>();

    for (const p of products) {
      let total = 0;
      let storeStock = 0;
      for (const item of inventory) {
        if (item.productId === p.id) {
          total += item.quantity;
          if (currentStore && item.storeId === currentStore.id) {
            storeStock += item.quantity;
          }
        }
      }
      map.set(p.id, { total, storeStock });
    }
    return map;
  }, [products, currentStore, inventory]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Search term
      const term = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !term ||
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.barcode.toLowerCase().includes(term) ||
        product.brand.toLowerCase().includes(term) ||
        product.model.toLowerCase().includes(term) ||
        (product.variant && product.variant.toLowerCase().includes(term));

      // Category
      const matchesCategory =
        selectedCategoryId === 'ALL' || product.categoryId === selectedCategoryId;

      // Brand
      const matchesBrand = selectedBrand === 'ALL' || product.brand === selectedBrand;

      // Status
      const matchesStatus = statusFilter === 'ALL' || product.status === statusFilter;

      return matchesSearch && matchesCategory && matchesBrand && matchesStatus;
    });
  }, [products, searchQuery, selectedCategoryId, selectedBrand, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const totalCount = products.length;
    const activeCount = products.filter((p) => p.status === 'ACTIVE').length;
    const totalInventoryUnits = Array.from(productStockMap.values()).reduce(
      (acc, s) => acc + s.total,
      0
    );
    const totalCatalogValue = products.reduce((acc, p) => {
      const stock = productStockMap.get(p.id)?.total || 0;
      return acc + stock * p.sellingPrice;
    }, 0);

    return {
      totalCount,
      activeCount,
      totalInventoryUnits,
      totalCatalogValue,
    };
  }, [products, productStockMap]);

  // Category map for quick lookup
  const categoryMap = useMemo(() => {
    return new Map(categories.map((c) => [c.id, c.name]));
  }, [categories]);

  // Handle open add modal
  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setIsAddEditModalOpen(true);
  };

  // Handle open edit modal
  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setIsAddEditModalOpen(true);
  };

  // Handle quick adjust stock (Milestone 7: ADMIN-only).
  const handleQuickAdjustStock = (productId: string) => {
    if (!isAdmin) return;
    setAdjustProductId(productId);
    setIsAdjustModalOpen(true);
  };

  // Handle deactivate/toggle status
  const handleToggleProductStatus = async (product: Product) => {
    if (!isAdmin || statusToggleBusy.current) return;
    statusToggleBusy.current = true;
    const nextStatus: ProductStatus = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated: Product = {
      ...product,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    // Milestone 5D-C: never claim success (or log an audit entry) when the save failed.
    const saveRes = await SupabaseBridge.saveProduct(updated);
    if (!saveRes.success) {
      console.error('[product] status change not saved:', saveRes.error);
      setSaveWarning(saveRes.error || 'Unknown error.');
      statusToggleBusy.current = false;
      return;
    }

    // Milestone 5D-C: audit semantics come from the shared change classifier.
    const change = describeProductChange(product, updated);
    if (change.action) {
      // Milestone 5D-B: Supabase when connected, localStorage when offline.
      const audit = await SupabaseBridge.writeAuditLog({
        action: change.action,
        entity: 'Product',
        entityId: product.id,
        details: change.details,
        userName: currentUser?.name || 'Staff',
        userRole: currentUser?.role || 'ADMIN',
        userId: currentUser?.id,
      });
      if (!audit.success) {
        console.error('[audit] PRODUCT status change not recorded:', audit.error);
        setAuditWarning(audit.error || 'Unknown error.');
      }
    }

    refreshData();
    statusToggleBusy.current = false;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm font-medium">Loading catalog data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="p-3 bg-rose-500/10 rounded-full">
          <AlertCircle className="w-8 h-8 text-rose-500" />
        </div>
        <p className="text-rose-400 text-sm font-medium">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AuditWriteWarning reason={auditWarning} onDismiss={() => setAuditWarning(null)} />
      <AuditWriteWarning
        reason={saveWarning}
        title="Product was not saved"
        body="Supabase rejected the change. Nothing was written:"
        onDismiss={() => setSaveWarning(null)}
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Master Product Catalog</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Centralized mobile and laptop accessory inventory catalog across all 11 retail branches
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700/80 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Categories ({categories.length})</span>
          </button>

          {isAdmin && (
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Metric Banners */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Products</span>
            <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs">
              <Package className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">{stats.totalCount}</div>
          <div className="mt-1 text-[11px] text-slate-400">
            <span className="text-emerald-400 font-semibold">{stats.activeCount} active</span> in sales catalog
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Accessory Categories</span>
            <span className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg text-xs">
              <Layers className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">{categories.length}</div>
          <div className="mt-1 text-[11px] text-slate-400">Earbuds, Cables, Cases &amp; More</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Chain Physical Stock</span>
            <span className="p-1.5 bg-sky-500/10 text-sky-400 rounded-lg text-xs">
              <Boxes className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight font-mono">
            {stats.totalInventoryUnits.toLocaleString()}{' '}
            <span className="text-xs text-slate-400 font-sans font-normal">units</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Across 11 physical stores</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Catalog Stock Value</span>
            {isAdmin && (
              <button
                onClick={() => setShowCostPrices(!showCostPrices)}
                className="text-[10px] text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
                title="Toggle Cost vs Selling Value"
              >
                {showCostPrices ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            )}
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400 tracking-tight font-mono">
            {formatNaira(stats.totalCatalogValue)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Gross retail valuation</div>
        </div>
      </div>

      {/* Category Filter Pills (All 15 Accessory Categories) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedCategoryId('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategoryId === 'ALL'
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            All Categories ({products.length})
          </button>
          {categories.map((cat) => {
            const count = products.filter((p) => p.categoryId === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedCategoryId === cat.id
                    ? 'bg-emerald-500 text-slate-950 shadow-xs'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <span>{cat.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    selectedCategoryId === cat.id
                      ? 'bg-slate-950/20 text-slate-950 font-bold'
                      : 'bg-slate-700/60 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by product name, SKU, barcode, brand, or model..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Brand Filter */}
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-emerald-500"
          >
            <option value="ALL">All Brands ({uniqueBrands.length})</option>
            {uniqueBrands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-emerald-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
            <option value="DISCONTINUED">Discontinued</option>
          </select>

          {/* Admin toggle for cost prices */}
          {isAdmin && (
            <button
              onClick={() => setShowCostPrices(!showCostPrices)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer ${
                showCostPrices
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:text-slate-300'
              }`}
              title="Show / Hide Cost Prices & Margin Columns"
            >
              {showCostPrices ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showCostPrices ? 'Cost & Margins' : 'Prices Only'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Product Details</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">SKU / Barcode</th>
                {showCostPrices && isAdmin && <th className="py-3 px-4 text-right">Cost Price</th>}
                <th className="py-3 px-4 text-right">Selling Price</th>
                {showCostPrices && isAdmin && <th className="py-3 px-4 text-right">Margin %</th>}
                <th className="py-3 px-4 text-center">
                  {isAdmin ? 'Chain Stock (11 Stores)' : `Store Stock (${currentStore?.name ?? 'Branch'})`}
                </th>
                <th className="py-3 px-4 text-center">Reorder Min</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={showCostPrices && isAdmin ? 10 : 8}
                    className="py-12 text-center text-slate-400"
                  >
                    <Package className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-slate-300">No products found</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Try adjusting your search criteria or category filter.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const stockInfo = productStockMap.get(product.id) || { total: 0, storeStock: 0 };
                  const relevantStock = isAdmin ? stockInfo.total : stockInfo.storeStock;
                  const isLowStock = relevantStock > 0 && relevantStock <= product.reorderLevel;
                  const isOutOfStock = relevantStock === 0;
                  const marginPercent = Math.round(
                    ((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100
                  );

                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Product Name & Brand */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center shrink-0 text-emerald-400 font-bold text-xs">
                            {product.brand.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white group-hover:text-emerald-300 transition-colors">
                              {product.name}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="text-emerald-400 font-medium">{product.brand}</span>
                              <span>•</span>
                              <span>{product.model}</span>
                              {product.variant && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-500">{product.variant}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
                          {categoryMap.get(product.categoryId) || 'Accessories'}
                        </span>
                      </td>

                      {/* SKU & Barcode */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="text-xs text-slate-200 font-semibold">{product.sku}</div>
                        <button
                          onClick={() => {
                            setBarcodeProduct(product);
                            setIsBarcodeModalOpen(true);
                          }}
                          className="text-[10px] text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1 mt-0.5 cursor-pointer"
                        >
                          <Barcode className="w-3 h-3 text-emerald-500/80" />
                          <span>{product.barcode}</span>
                        </button>
                      </td>

                      {/* Cost Price (Admin Only) */}
                      {showCostPrices && isAdmin && (
                        <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                          {formatNaira(product.costPrice)}
                        </td>
                      )}

                      {/* Selling Price */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {formatNaira(product.sellingPrice)}
                      </td>

                      {/* Margin % */}
                      {showCostPrices && isAdmin && (
                        <td className="py-3.5 px-4 text-right font-mono">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded-sm text-[11px] font-semibold ${
                              marginPercent >= 30
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : marginPercent >= 15
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            +{marginPercent}%
                          </span>
                        </td>
                      )}

                      {/* Current Stock */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                              isOutOfStock
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : isLowStock
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                            }`}
                          >
                            {relevantStock} units
                          </span>
                          {isAdmin && (
                            <span className="text-[10px] text-slate-500 mt-0.5">
                              Across 11 branches
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Reorder Min */}
                      <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-400">
                        {product.reorderLevel}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            product.status === 'ACTIVE'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : product.status === 'INACTIVE'
                              ? 'bg-slate-700/40 text-slate-400 border border-slate-700'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {product.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => handleQuickAdjustStock(product.id)}
                                className="p-1.5 bg-slate-800 hover:bg-emerald-600/30 hover:text-emerald-300 text-slate-300 rounded-lg transition-colors cursor-pointer"
                                title="Adjust Stock"
                              >
                                <Boxes className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleOpenEditModal(product)}
                                className="p-1.5 bg-slate-800 hover:bg-indigo-600/30 hover:text-indigo-300 text-slate-300 rounded-lg transition-colors cursor-pointer"
                                title="Edit Product Specs & Pricing"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleToggleProductStatus(product)}
                                className={`p-1.5 bg-slate-800 rounded-lg transition-colors cursor-pointer ${
                                  product.status === 'ACTIVE'
                                    ? 'hover:bg-rose-600/30 hover:text-rose-300 text-slate-300'
                                    : 'hover:bg-emerald-600/30 hover:text-emerald-300 text-slate-300'
                                }`}
                                title={
                                  product.status === 'ACTIVE'
                                    ? 'Deactivate Product'
                                    : 'Activate Product'
                                }
                              >
                                {product.status === 'ACTIVE' ? (
                                  <AlertCircle className="w-3.5 h-3.5" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isAddEditModalOpen && (
        <AddEditProductModal
          isOpen={isAddEditModalOpen}
          onClose={() => setIsAddEditModalOpen(false)}
          onSuccess={() => {
            refreshData();
            setIsAddEditModalOpen(false);
          }}
          productToEdit={editingProduct}
          categories={categories}
          onAuditWarning={setAuditWarning}
        />
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <CategoryManagerModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          onSuccess={() => {
            refreshData();
          }}
          categories={categories}
          products={products}
          onAuditWarning={setAuditWarning}
        />
      )}

      {/* Barcode Preview Modal */}
      {isBarcodeModalOpen && barcodeProduct && (
        <BarcodeModal
          product={barcodeProduct}
          onClose={() => {
            setIsBarcodeModalOpen(false);
            setBarcodeProduct(null);
          }}
        />
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
          initialProductId={adjustProductId}
        />
      )}
    </div>
  );
};

/* =========================================================================
   ADD / EDIT PRODUCT MODAL
========================================================================= */

interface AddEditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  productToEdit: Product | null;
  categories: Category[];
  onAuditWarning?: (reason: string) => void;
}

const AddEditProductModal: React.FC<AddEditProductModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  productToEdit,
  categories,
  onAuditWarning,
}) => {
  const { currentUser } = useAuth();
  const isEditing = !!productToEdit;

  const [name, setName] = useState(productToEdit?.name || '');
  const [sku, setSku] = useState(productToEdit?.sku || '');
  const [barcode, setBarcode] = useState(productToEdit?.barcode || '');
  const [categoryId, setCategoryId] = useState(
    productToEdit?.categoryId || categories[0]?.id || 'cat-1'
  );
  const [brand, setBrand] = useState(productToEdit?.brand || '');
  const [model, setModel] = useState(productToEdit?.model || '');
  const [variant, setVariant] = useState(productToEdit?.variant || '');
  const [costPrice, setCostPrice] = useState(productToEdit?.costPrice || 0);
  const [sellingPrice, setSellingPrice] = useState(productToEdit?.sellingPrice || 0);
  const [reorderLevel, setReorderLevel] = useState(productToEdit?.reorderLevel || 5);
  const [status, setStatus] = useState<ProductStatus>(productToEdit?.status || 'ACTIVE');
  const [description, setDescription] = useState(productToEdit?.description || '');
  const [error, setError] = useState('');
  // Milestone 5D-C: guard against double submits (which would duplicate audit entries).
  const [isSaving, setIsSaving] = useState(false);

  // Auto-generate SKU
  const handleAutoGenerateSku = () => {
    const brandPrefix = (brand.trim() || 'GEN').substring(0, 3).toUpperCase();
    const namePart = (model.trim() || name.trim() || 'PROD')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 6)
      .toUpperCase();
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    setSku(`${brandPrefix}-${namePart}-${randomSuffix}`);
  };

  // Auto-generate Barcode
  const handleAutoGenerateBarcode = () => {
    // Generate a 12-digit standard EAN/UPC style number
    const randomBarcode = '69' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
    setBarcode(randomBarcode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setError('');

    if (!name.trim()) {
      setError('Product Name is required.');
      return;
    }
    if (!sku.trim()) {
      setError('Product SKU is required.');
      return;
    }
    if (!barcode.trim()) {
      setError('Barcode is required.');
      return;
    }
    if (sellingPrice < costPrice) {
      setError('Warning: Selling price cannot be lower than cost price.');
      return;
    }

    const now = new Date().toISOString();

    if (isEditing && productToEdit) {
      const updatedProduct: Product = {
        ...productToEdit,
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        barcode: barcode.trim(),
        categoryId,
        brand: brand.trim(),
        model: model.trim(),
        variant: variant.trim(),
        costPrice: Number(costPrice),
        sellingPrice: Number(sellingPrice),
        reorderLevel: Number(reorderLevel),
        status,
        description: description.trim(),
        updatedAt: now,
      };

      setIsSaving(true);
      // Milestone 5D-C: never claim success when the database rejected the change.
      const saveRes = await SupabaseBridge.saveProduct(updatedProduct);
      if (!saveRes.success) {
        setIsSaving(false);
        setError(saveRes.error || 'The product could not be saved. No changes were made.');
        return;
      }

      // Milestone 5D-C: audit action derived from the actual before/after change.
      const change = describeProductChange(productToEdit, updatedProduct);
      if (change.action) {
        // Milestone 5D-B: Supabase when connected, localStorage when offline.
        const audit = await SupabaseBridge.writeAuditLog({
          action: change.action,
          entity: 'Product',
          entityId: updatedProduct.id,
          details: change.details,
          userName: currentUser?.name || 'Staff',
          userRole: currentUser?.role || 'ADMIN',
          userId: currentUser?.id,
        });
        if (!audit.success) {
          console.error('[audit] PRODUCT change not recorded:', audit.error);
          onAuditWarning?.(audit.error || 'Unknown error.');
        }
      }
      setIsSaving(false);
    } else {
      const newProduct: Product = {
        id: `prod-${Date.now()}`,
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        barcode: barcode.trim(),
        categoryId,
        brand: brand.trim(),
        model: model.trim(),
        variant: variant.trim(),
        costPrice: Number(costPrice),
        sellingPrice: Number(sellingPrice),
        reorderLevel: Number(reorderLevel),
        status,
        description: description.trim(),
        createdAt: now,
        updatedAt: now,
      };

      setIsSaving(true);
      const saveRes = await SupabaseBridge.saveProduct(newProduct);
      if (!saveRes.success) {
        setIsSaving(false);
        setError(saveRes.error || 'The product could not be created. Nothing was saved.');
        return;
      }

      // Milestone 5D-B: Supabase when connected, localStorage when offline.
      const audit = await SupabaseBridge.writeAuditLog({
        action: 'PRODUCT_CREATED',
        entity: 'Product',
        entityId: newProduct.id,
        details: `Created new product ${newProduct.name} (${newProduct.sku}) in category ${categoryId}`,
        userName: currentUser?.name || 'Staff',
        userRole: currentUser?.role || 'ADMIN',
        userId: currentUser?.id,
      });
      if (!audit.success) {
        console.error('[audit] PRODUCT_CREATED not recorded:', audit.error);
        onAuditWarning?.(audit.error || 'Unknown error.');
      }
      setIsSaving(false);
    }

    onSuccess();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEditing ? 'Edit Product Specifications' : 'Add New Retail Product'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEditing
                  ? 'Update pricing, barcode, or metadata'
                  : 'New item will automatically link to all 11 retail branches'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Product Name */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Product Title / Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Oraimo FreePods 4 ANC Earbuds"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Accessory Category *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id} className="bg-slate-800 text-white">
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Brand */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Brand *</label>
              <input
                type="text"
                placeholder="e.g. Apple, Oraimo, Anker, Baseus"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Model *</label>
              <input
                type="text"
                placeholder="e.g. FreePods 4, A20i, MagSafe 20W"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Variant / Color */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Variant / Color / Spec
              </label>
              <input
                type="text"
                placeholder="e.g. Nebula Black / 20,000mAh"
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* SKU with Auto-generate */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">SKU Code *</label>
                <button
                  type="button"
                  onClick={handleAutoGenerateSku}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Generate SKU</span>
                </button>
              </div>
              <input
                type="text"
                placeholder="e.g. ORA-FP4-BLK"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                required
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Barcode with Auto-generate */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">Barcode (UPC/EAN) *</label>
                <button
                  type="button"
                  onClick={handleAutoGenerateBarcode}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <Barcode className="w-3 h-3" />
                  <span>Generate Barcode</span>
                </button>
              </div>
              <input
                type="text"
                placeholder="e.g. 693635800412"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                required
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Cost Price */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Cost Price (₦) *
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value))}
                required
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Selling Price */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Retail Selling Price (₦) *
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                required
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs font-mono text-emerald-400 font-bold focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Reorder Level */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Reorder Threshold (Low Stock Alert)
              </label>
              <input
                type="number"
                min="1"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(Number(e.target.value))}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Catalog Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus)}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="DISCONTINUED">DISCONTINUED</option>
              </select>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Product Description &amp; Warranty Notes
              </label>
              <textarea
                rows={2}
                placeholder="Key selling points, warranty period (e.g. 1 Year Oraimo Nigeria Warranty)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <Package className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Product'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* =========================================================================
   CATEGORY MANAGER MODAL
========================================================================= */

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: Category[];
  products: Product[];
  onAuditWarning?: (reason: string) => void;
}

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  categories,
  products,
  onAuditWarning,
}) => {
  const { currentUser, isAdmin } = useAuth();
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [error, setError] = useState('');

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!newCatName.trim()) {
      setError('Category name is required.');
      return;
    }

    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: newCatName.trim(),
      description: newCatDesc.trim(),
      createdAt: new Date().toISOString(),
    };

    // Milestone 5F: never claim success (or write an audit row) when the
    // database rejected the category (categories.name is UNIQUE in Postgres).
    const saveRes = await SupabaseBridge.saveCategory(newCat);
    if (!saveRes.success) {
      setError(saveRes.error || 'The category could not be saved. No changes were made.');
      return;
    }

    // Milestone 5D-B: Supabase when connected, localStorage when offline.
    const audit = await SupabaseBridge.writeAuditLog({
      action: 'CATEGORY_CREATED',
      entity: 'Category',
      entityId: newCat.id,
      details: `Created new accessory category "${newCat.name}"`,
      userName: currentUser?.name || 'Staff',
      userRole: currentUser?.role || 'ADMIN',
      userId: currentUser?.id,
    });
    if (!audit.success) {
      console.error('[audit] CATEGORY_CREATED not recorded:', audit.error);
      onAuditWarning?.(audit.error || 'Unknown error.');
    }

    setNewCatName('');
    setNewCatDesc('');
    setError('');
    onSuccess();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Accessory Categories ({categories.length})</h3>
              <p className="text-xs text-slate-400">15 Standard Product Departments</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Add Category Form (Admin Only) */}
          {isAdmin && (
            <form
              onSubmit={handleAddCategory}
              className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2.5"
            >
              <span className="text-xs font-bold text-white block">Add Custom Category</span>
              {error && <div className="text-xs text-rose-400">{error}</div>}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Category Name (e.g. Smart Watches)"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Add
                </button>
              </div>
              <input
                type="text"
                placeholder="Optional description..."
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
            </form>
          )}

          {/* Categories List */}
          <div className="space-y-1.5">
            {categories.map((cat, idx) => {
              const count = products.filter((p) => p.categoryId === cat.id).length;
              return (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-mono text-slate-500 w-5">
                      {idx + 1}.
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-white">{cat.name}</div>
                      {cat.description && (
                        <div className="text-[10px] text-slate-400">{cat.description}</div>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 bg-slate-900 text-emerald-400 rounded-md border border-slate-700/60">
                    {count} products
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   BARCODE DISPLAY MODAL
========================================================================= */

interface BarcodeModalProps {
  product: Product;
  onClose: () => void;
}

const BarcodeModal: React.FC<BarcodeModalProps> = ({ product, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center animate-in fade-in zoom-in-95">
        <div className="flex justify-between items-start mb-3">
          <div className="text-left">
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
              Retail Barcode Label
            </span>
            <h4 className="text-sm font-bold text-slate-900">{product.brand} {product.model}</h4>
            <p className="text-xs text-slate-600 font-mono">{product.sku}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-900 rounded-md hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barcode Graphic Simulation */}
        <div className="my-6 p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center">
          <div className="h-16 flex items-center justify-center gap-[3px]">
            {/* Generate barcode line pattern from barcode string */}
            {product.barcode.split('').map((char, index) => {
              const code = parseInt(char, 10) || 1;
              const width = (code % 3) + 1;
              const isBlack = (index + code) % 2 === 0;
              return (
                <div
                  key={index}
                  className={`h-full ${isBlack ? 'bg-black' : 'bg-transparent'}`}
                  style={{ width: `${width * 2}px` }}
                />
              );
            })}
            <div className="h-full bg-black w-1" />
            <div className="h-full bg-black w-2 ml-1" />
            <div className="h-full bg-black w-1 ml-0.5" />
          </div>
          <div className="font-mono text-sm tracking-widest font-bold mt-2 text-black">
            {product.barcode}
          </div>
        </div>

        <div className="text-xs font-bold text-slate-800">
          Selling Price: <span className="text-emerald-700 text-sm">{formatNaira(product.sellingPrice)}</span>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-200 flex justify-center gap-2">
          <button
            onClick={() => {
              window.print();
            }}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            Print Barcode Label
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
