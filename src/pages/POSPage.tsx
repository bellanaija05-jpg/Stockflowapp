import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { StorageEngine } from '../db/storageEngine';
import { SupabaseBridge } from '../db/supabaseBridge';
import { Category, PaymentMethod, Product, Sale, Store } from '../types';
import { formatNaira } from '../../src/utils/currency';
import { POSCart, CartItem } from '../components/pos/POSCart';
import { ReceiptModal } from '../components/pos/ReceiptModal';
import { RecentSalesList } from '../components/pos/RecentSalesList';
import {
  Barcode,
  Search,
  Store as StoreIcon,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  Tag,
  Sparkles,
  RefreshCw,
  Plus,
  Layers,
  Filter,
  X,
} from 'lucide-react';

export const POSPage: React.FC = () => {
  const { currentUser } = useAuth();
  const storage = StorageEngine.getInstance();

  // Stores
  const stores = useMemo(() => storage.getStores(), []);
  
  // Attendant store branch locking vs Admin branch switching
  const initialStoreId = useMemo(() => {
    if (currentUser?.role === 'ATTENDANT' && currentUser.assignedStoreId) {
      return currentUser.assignedStoreId;
    }
    return stores[0]?.id || 'store-1';
  }, [currentUser, stores]);

  const [selectedStoreId, setSelectedStoreId] = useState<string>(initialStoreId);

  // Sync selectedStoreId if currentUser changes
  useEffect(() => {
    if (currentUser?.role === 'ATTENDANT' && currentUser.assignedStoreId) {
      setSelectedStoreId(currentUser.assignedStoreId);
    }
  }, [currentUser]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) || stores[0],
    [stores, selectedStoreId]
  );

  // Data
  const categories = useMemo(() => storage.getCategories(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [discount, setDiscount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [scanNotification, setScanNotification] = useState<{
    message: string;
    type: 'success' | 'warning' | 'error';
  } | null>(null);

  // Receipt Modal
  const [activeReceipt, setActiveReceipt] = useState<Sale | null>(null);

  // Scanner input ref for quick keyboard focus
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load data for active store
  const refreshData = () => {
    const allProducts = storage.getProducts().filter((p) => p.status === 'ACTIVE');
    const storeStock = storage.getInventory().filter((inv) => inv.storeId === selectedStoreId);
    const storeSales = storage.getSalesByStore(selectedStoreId);

    setProducts(allProducts);
    setInventoryList(storeStock);
    setRecentSales(storeSales.slice(0, 8)); // Top 8 recent sales
  };

  useEffect(() => {
    refreshData();
    // Whenever store changes, clear or adjust cart
    setCart([]);
    setCheckoutError(null);
  }, [selectedStoreId]);

  // Map product stock for current store
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventoryList) {
      map.set(inv.productId, inv.quantity);
    }
    return map;
  }, [inventoryList]);

  // Keep cart item's available stock updated
  useEffect(() => {
    setCart((prevCart) =>
      prevCart.map((item) => ({
        ...item,
        availableStock: stockMap.get(item.product.id) ?? 0,
      }))
    );
  }, [stockMap]);

  // Add Product to Cart
  const handleAddToCart = (product: Product) => {
    const available = stockMap.get(product.id) ?? 0;
    if (available <= 0) {
      setScanNotification({
        message: `"${product.name}" is currently out of stock at this store branch.`,
        type: 'error',
      });
      return;
    }

    setCheckoutError(null);

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= available) {
          setScanNotification({
            message: `Maximum available quantity (${available}) reached for ${product.name}.`,
            type: 'warning',
          });
          return prevCart;
        }
        setScanNotification({
          message: `Added another unit of ${product.name} (Qty: ${existing.quantity + 1})`,
          type: 'success',
        });
        return prevCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, availableStock: available }
            : item
        );
      }

      setScanNotification({
        message: `Added ${product.name} to cart.`,
        type: 'success',
      });
      return [...prevCart, { product, quantity: 1, availableStock: available }];
    });
  };

  // Update Cart Quantity
  const handleUpdateQuantity = (productId: string, newQuantity: number) => {
    setCheckoutError(null);
    if (newQuantity <= 0) {
      handleRemoveItem(productId);
      return;
    }

    const available = stockMap.get(productId) ?? 0;
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.product.id === productId) {
          // Cap at available stock
          const qty = Math.min(newQuantity, available);
          if (newQuantity > available) {
            setScanNotification({
              message: `Only ${available} unit(s) available in stock.`,
              type: 'warning',
            });
          }
          return { ...item, quantity: qty, availableStock: available };
        }
        return item;
      })
    );
  };

  // Remove Item from Cart
  const handleRemoveItem = (productId: string) => {
    setCheckoutError(null);
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));
  };

  // Clear Cart
  const handleClearCart = () => {
    setCart([]);
    setCheckoutError(null);
    setNotes('');
    setDiscount(0);
  };

  // Barcode / Fast SKU Search & Scan Handler
  const handleBarcodeOrSkuSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    // Prioritize exact match on SKU or Barcode
    const exactMatch = products.find(
      (p) =>
        p.sku.toLowerCase() === query ||
        p.barcode.toLowerCase() === query ||
        p.sku.toLowerCase().replace(/[^a-z0-9]/g, '') === query.replace(/[^a-z0-9]/g, '')
    );

    if (exactMatch) {
      handleAddToCart(exactMatch);
      setSearchQuery('');
      return;
    }

    // Secondary prefix match on SKU
    const skuPrefixMatch = products.find((p) =>
      p.sku.toLowerCase().startsWith(query)
    );

    if (skuPrefixMatch) {
      handleAddToCart(skuPrefixMatch);
      setSearchQuery('');
      return;
    }

    // Name or model match
    const matchingProducts = products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query) ||
        p.model.toLowerCase().includes(query)
    );

    if (matchingProducts.length === 1) {
      handleAddToCart(matchingProducts[0]);
      setSearchQuery('');
    } else if (matchingProducts.length === 0) {
      setScanNotification({
        message: `No product found matching "${searchQuery}". Check barcode or SKU.`,
        type: 'error',
      });
    } else {
      setScanNotification({
        message: `Found ${matchingProducts.length} matching products. Select from list below.`,
        type: 'warning',
      });
    }
  };

  // Auto-dismiss scan notification
  useEffect(() => {
    if (!scanNotification) return;
    const timer = setTimeout(() => {
      setScanNotification(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [scanNotification]);

  // Filter products for browsing grid
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCategory =
        selectedCategory === 'ALL' || p.categoryId === selectedCategory;

      if (!matchesCategory) return false;

      if (!query) return true;

      return (
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        p.barcode.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query) ||
        p.model.toLowerCase().includes(query)
      );
    });
  }, [products, selectedCategory, searchQuery]);

  // Complete Checkout
  const handleCheckout = async () => {
    if (!currentUser) {
      setCheckoutError('User session is invalid. Please log in.');
      return;
    }

    if (cart.length === 0) {
      setCheckoutError('Cart is empty. Add items to checkout.');
      return;
    }

    setIsProcessing(true);
    setCheckoutError(null);

    // Call atomic checkout engine
    const result = await SupabaseBridge.executeAtomicCheckout({
      userId: currentUser.id,
      storeId: selectedStoreId,
      attendantId: currentUser.id,
      attendantName: currentUser.name,
      items: cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.product.sellingPrice,
      })),
      paymentMethod,
      discount,
    });

    setIsProcessing(false);

    if (result.success && result.sale) {
      // Clear cart
      setCart([]);
      setNotes('');
      setDiscount(0);

      // Refresh store inventory & recent sales
      refreshData();

      // Show receipt modal
      setActiveReceipt(result.sale);
    } else {
      setCheckoutError(result.error || 'Checkout failed. Please try again.');
    }
  };

  return (
    <div id="pos-page-wrapper" className="space-y-6">
      {/* Top POS Header & Branch Indicator */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <StoreIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                POS Sales Terminal
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                LIVE
              </span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Branch:</span>
              <span className="font-semibold text-slate-200">{activeStore?.name}</span>
              <span>•</span>
              <span className="text-slate-500 truncate max-w-[200px] sm:max-w-xs">
                {activeStore?.location}
              </span>
            </div>
          </div>
        </div>

        {/* Store Selection (Super Admin Only) vs Locked Branch Display (Attendant) */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {currentUser?.role === 'ADMIN' ? (
            <div className="flex items-center gap-2">
              <label htmlFor="admin-store-switcher" className="text-xs text-slate-400 font-medium">
                Switch Store:
              </label>
              <select
                id="admin-store-switcher"
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-xs font-semibold text-white rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name} ({store.location.split(',')[0]})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Branch Locked:</span>
              <span className="font-bold text-white">{activeStore?.name}</span>
            </div>
          )}

          <button
            id="refresh-stock-btn"
            onClick={refreshData}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
            title="Refresh stock and inventory"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {scanNotification && (
        <div
          id="pos-scan-notification"
          className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 shadow-md transition-all ${
            scanNotification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : scanNotification.type === 'warning'
              ? 'bg-amber-950/80 border-amber-500/40 text-amber-200'
              : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {scanNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : scanNotification.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{scanNotification.message}</span>
          </div>
          <button
            onClick={() => setScanNotification(null)}
            className="text-slate-400 hover:text-white p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main POS Split Layout: Products Left, Cart Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Product Search, Category Tabs & Catalog Grid (7 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Barcode & Search Input */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
            <form onSubmit={handleBarcodeOrSkuSubmit} className="relative">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Barcode className="w-5 h-5 text-emerald-400" />
                  </div>
                  <input
                    ref={searchInputRef}
                    id="barcode-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Scan barcode or type SKU / product name (e.g. AIRPODS-PRO2)..."
                    className="w-full pl-11 pr-24 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 font-medium"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-14 pr-2 flex items-center text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  id="scan-enter-btn"
                  type="submit"
                  className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 shrink-0"
                >
                  <Search className="w-4 h-4" />
                  <span>Search / Add</span>
                </button>
              </div>
            </form>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-3 mt-3 border-t border-slate-800/80 pb-1 scrollbar-thin">
              <button
                type="button"
                id="filter-category-all"
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === 'ALL'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                All Categories
              </button>

              {categories.map((cat) => (
                <button
                  key={cat.id}
                  id={`filter-category-${cat.id}`}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">
                Products Catalog ({filteredProducts.length})
              </span>
              <span className="text-[11px] text-slate-500">
                Click any product to add to cart
              </span>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <p className="text-sm font-medium text-slate-400">No products found</p>
                <p className="text-xs text-slate-600 mt-1">
                  Try adjusting your search keyword or selected category filter.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[560px] overflow-y-auto pr-1">
                {filteredProducts.map((product) => {
                  const available = stockMap.get(product.id) ?? 0;
                  const cartItem = cart.find((i) => i.product.id === product.id);
                  const inCartQty = cartItem ? cartItem.quantity : 0;
                  const isOutOfStock = available <= 0;
                  const isMaxInCart = inCartQty >= available;

                  return (
                    <div
                      key={product.id}
                      id={`pos-product-card-${product.id}`}
                      onClick={() => !isOutOfStock && !isMaxInCart && handleAddToCart(product)}
                      className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                        isOutOfStock
                          ? 'bg-slate-950/40 border-slate-800/50 opacity-60 cursor-not-allowed'
                          : isMaxInCart
                          ? 'bg-slate-950/80 border-amber-800/40 cursor-default'
                          : 'bg-slate-950/80 border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/40 cursor-pointer group'
                      }`}
                    >
                      <div>
                        {/* Top Meta: Brand & SKU */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                          <span className="font-semibold uppercase tracking-wider text-slate-400">
                            {product.brand}
                          </span>
                          <span className="font-mono text-slate-500">{product.sku}</span>
                        </div>

                        {/* Product Title */}
                        <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 line-clamp-2 leading-snug">
                          {product.name}
                        </h4>

                        {/* Model / Variant */}
                        {product.variant && (
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {product.variant}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                        {/* Price & Stock status */}
                        <div>
                          <div className="text-sm font-black text-emerald-400 font-mono">
                            {formatNaira(product.sellingPrice)}
                          </div>
                          <div className="text-[10px] mt-0.5">
                            {isOutOfStock ? (
                              <span className="text-rose-400 font-medium">Out of stock</span>
                            ) : available <= 3 ? (
                              <span className="text-amber-400 font-medium">
                                Low stock: {available} left
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                Stock: <strong className="text-slate-200">{available}</strong>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* In Cart Indicator / Add button */}
                        <div>
                          {inCartQty > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950/60 px-2 py-1 rounded-lg border border-emerald-800/40">
                              <CheckCircle2 className="w-3 h-3" />
                              {inCartQty} in cart
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 group-hover:bg-emerald-600 group-hover:text-white transition-colors disabled:opacity-40"
                              title="Add to cart"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Sales for this branch */}
          <RecentSalesList
            sales={recentSales}
            onViewReceipt={(sale) => setActiveReceipt(sale)}
            branchName={activeStore?.name ?? 'Branch'}
          />
        </div>

        {/* Right Column: POS Cart & Checkout (5 cols) */}
        <div className="lg:col-span-5 xl:col-span-4 sticky top-6">
          <POSCart
            items={cart}
            paymentMethod={paymentMethod}
            onSelectPaymentMethod={setPaymentMethod}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onCheckout={handleCheckout}
            isProcessing={isProcessing}
            errorMessage={checkoutError}
            discount={discount}
            onUpdateDiscount={setDiscount}
            notes={notes}
            onUpdateNotes={setNotes}
          />
        </div>
      </div>

      {/* Customer Receipt Modal */}
      {activeReceipt && (
        <ReceiptModal
          sale={activeReceipt}
          store={stores.find((s) => s.id === activeReceipt.storeId)}
          onClose={() => setActiveReceipt(null)}
          onNewSale={() => {
            setActiveReceipt(null);
            handleClearCart();
            if (searchInputRef.current) {
              searchInputRef.current.focus();
            }
          }}
        />
      )}
    </div>
  );
};
