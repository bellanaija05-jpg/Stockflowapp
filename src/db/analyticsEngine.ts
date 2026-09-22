import {
  AdminDashboardAnalytics,
  Category,
  CategorySalesMetric,
  DailyTrendPoint,
  DateRangeFilter,
  LowStockAlertItem,
  OutOfStockAlertItem,
  PaymentMethod,
  PaymentMethodMetric,
  Product,
  Sale,
  Store,
  StoreDetailAnalytics,
  StoreInventory,
  StoreSalesMetric,
  TopSellingProductMetric,
} from '../types';

/**
 * Milestone 5C — Pure Analytics Engine
 *
 * Side-effect-free port of the analytics computations that previously lived on
 * StorageEngine. Accepts an injected AnalyticsDataset so the exact same math
 * can run against Supabase-fetched data (AdminDashboard) or the local offline
 * fallback dataset.
 */

export interface AnalyticsDataset {
  sales: Sale[];
  products: Product[];
  categories: Category[];
  stores: Store[];
  inventory: StoreInventory[];
}

/** Calculate precise Date objects and human label for a given date range filter */
export function getDateRangeBounds(filter: DateRangeFilter): { startDate: Date; endDate: Date; label: string } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (filter.preset) {
    case 'TODAY':
      return { startDate: todayStart, endDate: todayEnd, label: 'Today' };

    case 'YESTERDAY': {
      const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return { startDate: yStart, endDate: yEnd, label: 'Yesterday' };
    }

    case 'LAST_7_DAYS': {
      const s7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      return { startDate: s7, endDate: todayEnd, label: 'Last 7 Days' };
    }

    case 'LAST_30_DAYS': {
      const s30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      return { startDate: s30, endDate: todayEnd, label: 'Last 30 Days' };
    }

    case 'THIS_MONTH': {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { startDate: mStart, endDate: todayEnd, label: 'This Month' };
    }

    case 'CUSTOM': {
      if (filter.startDate && filter.endDate) {
        const [sy, sm, sd] = filter.startDate.split('-').map(Number);
        const [ey, em, ed] = filter.endDate.split('-').map(Number);
        const cStart = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
        const cEnd = new Date(ey, em - 1, ed, 23, 59, 59, 999);
        return { startDate: cStart, endDate: cEnd, label: `${filter.startDate} to ${filter.endDate}` };
      }
      return { startDate: todayStart, endDate: todayEnd, label: 'Today' };
    }

    default:
      return { startDate: todayStart, endDate: todayEnd, label: 'Today' };
  }
}

/**
 * Super Admin Dashboard Analytics — verbatim port of StorageEngine.
 * getAdminDashboardAnalytics() with data injected instead of read from localStorage.
 */
export function computeAdminDashboardAnalytics(
  data: AnalyticsDataset,
  filter: DateRangeFilter,
  storeFilter: string = 'ALL'
): AdminDashboardAnalytics {
  const { sales, products, categories, stores, inventory } = data;

  // Only COMPLETED sales contribute to business metrics (Requirement 14)
  const allSales = sales.filter((s) => s.status === 'COMPLETED');
  const bounds = getDateRangeBounds(filter);
  const startTime = bounds.startDate.getTime();
  const endTime = bounds.endDate.getTime();

  // Filter sales for the selected date range and optional store filter
  const periodSales = allSales.filter((sale) => {
    const t = new Date(sale.createdAt).getTime();
    if (t < startTime || t > endTime) return false;
    if (storeFilter !== 'ALL' && sale.storeId !== storeFilter) return false;
    return true;
  });

  const periodRevenue = periodSales.reduce((acc, s) => acc + s.total, 0);
  const periodTransactions = periodSales.length;
  const periodUnitsSold = periodSales.reduce(
    (acc, s) => acc + s.items.reduce((iSum, item) => iSum + item.quantity, 0),
    0
  );

  // KPI Cards: Today, This Week, This Month (scoped to storeFilter if selected)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  // Week start (Monday of current week)
  const currentDayOfWeek = now.getDay();
  const distanceToMonday = (currentDayOfWeek + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday, 0, 0, 0, 0).getTime();

  // Month start
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

  const kpiSalesScope = storeFilter === 'ALL' ? allSales : allSales.filter((s) => s.storeId === storeFilter);

  const salesTodayList = kpiSalesScope.filter((s) => {
    const t = new Date(s.createdAt).getTime();
    return t >= todayStart && t <= todayEnd;
  });
  const totalSalesToday = salesTodayList.reduce((acc, s) => acc + s.total, 0);
  const totalTransactionsToday = salesTodayList.length;

  const totalSalesThisWeek = kpiSalesScope
    .filter((s) => {
      const t = new Date(s.createdAt).getTime();
      return t >= weekStart && t <= todayEnd;
    })
    .reduce((acc, s) => acc + s.total, 0);

  const totalSalesThisMonth = kpiSalesScope
    .filter((s) => {
      const t = new Date(s.createdAt).getTime();
      return t >= monthStart && t <= todayEnd;
    })
    .reduce((acc, s) => acc + s.total, 0);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  const scopedInventory = storeFilter === 'ALL' ? inventory : inventory.filter((i) => i.storeId === storeFilter);

  let totalUnitsAcrossStores = 0;
  let totalInventoryCostValue = 0;
  let totalInventoryRetailValue = 0;
  let lowStockItemsCount = 0;
  let outOfStockItemsCount = 0;

  const lowStockAlerts: LowStockAlertItem[] = [];
  const outOfStockAlerts: OutOfStockAlertItem[] = [];
  const productsWithLowStock = new Set<string>();
  const productsWithOutOfStock = new Set<string>();

  for (const inv of scopedInventory) {
    const prod = productMap.get(inv.productId);
    if (!prod) continue;

    totalUnitsAcrossStores += inv.quantity;
    totalInventoryCostValue += inv.quantity * prod.costPrice;
    totalInventoryRetailValue += inv.quantity * prod.sellingPrice;

    const store = storeMap.get(inv.storeId);
    const storeName = store ? store.name : inv.storeId;

    if (inv.quantity === 0) {
      outOfStockItemsCount++;
      productsWithOutOfStock.add(prod.id);
      outOfStockAlerts.push({
        inventoryId: inv.id,
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        storeId: inv.storeId,
        storeName,
        currentStock: 0,
        status: 'OUT_OF_STOCK',
      });
    } else if (inv.quantity <= prod.reorderLevel) {
      lowStockItemsCount++;
      productsWithLowStock.add(prod.id);
      lowStockAlerts.push({
        inventoryId: inv.id,
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        storeId: inv.storeId,
        storeName,
        currentStock: inv.quantity,
        reorderLevel: prod.reorderLevel,
        status: 'LOW_STOCK',
      });
    }
  }

  const activeStores = stores.filter((s) => s.status === 'ACTIVE');
  const activeStoresCount = activeStores.length;

  // Sales by Store (Requirement 3)
  const salesByStore: StoreSalesMetric[] = activeStores.map((store) => {
    const storeSales = periodSales.filter((s) => s.storeId === store.id);
    const transactions = storeSales.length;
    const unitsSold = storeSales.reduce(
      (acc, s) => acc + s.items.reduce((iSum, item) => iSum + item.quantity, 0),
      0
    );
    const revenue = storeSales.reduce((acc, s) => acc + s.total, 0);

    return {
      storeId: store.id,
      storeName: store.name,
      location: store.location,
      transactions,
      unitsSold,
      revenue,
    };
  });

  // Sales by Payment Method (Requirement 4 & 13)
  const methods: PaymentMethod[] = ['CASH', 'TRANSFER', 'POS'];
  const paymentBreakdown: Record<PaymentMethod, PaymentMethodMetric> = {
    CASH: { count: 0, revenue: 0, percentage: 0 },
    TRANSFER: { count: 0, revenue: 0, percentage: 0 },
    POS: { count: 0, revenue: 0, percentage: 0 },
  };

  for (const sale of periodSales) {
    const m = sale.paymentMethod;
    if (paymentBreakdown[m]) {
      paymentBreakdown[m].count += 1;
      paymentBreakdown[m].revenue += sale.total;
    }
  }

  for (const m of methods) {
    paymentBreakdown[m].percentage =
      periodRevenue > 0 ? Number(((paymentBreakdown[m].revenue / periodRevenue) * 100).toFixed(1)) : 0;
  }

  // Sales Trend (Requirement 5): Day-by-day in selected range with zero-fill
  const salesTrend: DailyTrendPoint[] = [];
  const cur = new Date(bounds.startDate);
  let guardCounter = 0;
  while (cur.getTime() <= bounds.endDate.getTime() && guardCounter < 120) {
    guardCounter++;
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;
    const displayDate = cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const daySales = periodSales.filter((s) => s.createdAt.startsWith(dateKey));
    const dayRevenue = daySales.reduce((acc, s) => acc + s.total, 0);
    const dayTransactions = daySales.length;

    salesTrend.push({
      date: dateKey,
      displayDate,
      revenue: dayRevenue,
      transactions: dayTransactions,
    });

    cur.setDate(cur.getDate() + 1);
  }

  // Top-Selling Products (Requirement 6)
  const productStats = new Map<
    string,
    {
      productId: string;
      productName: string;
      sku: string;
      categoryName: string;
      unitsSold: number;
      revenue: number;
      transactions: Set<string>;
    }
  >();

  for (const sale of periodSales) {
    for (const item of sale.items) {
      let stat = productStats.get(item.productId);
      if (!stat) {
        const prod = productMap.get(item.productId);
        const catName = prod ? categoryMap.get(prod.categoryId) || 'Accessories' : 'Accessories';
        stat = {
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          categoryName: catName,
          unitsSold: 0,
          revenue: 0,
          transactions: new Set(),
        };
        productStats.set(item.productId, stat);
      }
      stat.unitsSold += item.quantity;
      stat.revenue += item.lineTotal;
      stat.transactions.add(sale.id);
    }
  }

  const topProducts: TopSellingProductMetric[] = Array.from(productStats.values()).map((p) => ({
    productId: p.productId,
    productName: p.productName,
    sku: p.sku,
    categoryName: p.categoryName,
    unitsSold: p.unitsSold,
    revenue: p.revenue,
    transactionsCount: p.transactions.size,
  }));

  // Sales by Category (Requirement 7)
  const categoryStats = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      unitsSold: number;
      revenue: number;
      transactions: Set<string>;
    }
  >();

  for (const sale of periodSales) {
    for (const item of sale.items) {
      const prod = productMap.get(item.productId);
      const catId = prod ? prod.categoryId : 'other';
      const catName = categoryMap.get(catId) || 'Uncategorized';

      let cStat = categoryStats.get(catId);
      if (!cStat) {
        cStat = {
          categoryId: catId,
          categoryName: catName,
          unitsSold: 0,
          revenue: 0,
          transactions: new Set(),
        };
        categoryStats.set(catId, cStat);
      }
      cStat.unitsSold += item.quantity;
      cStat.revenue += item.lineTotal;
      cStat.transactions.add(sale.id);
    }
  }

  const salesByCategory: CategorySalesMetric[] = Array.from(categoryStats.values())
    .map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      unitsSold: c.unitsSold,
      revenue: c.revenue,
      transactions: c.transactions.size,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Recent completed transactions (Requirement 11)
  const recentTransactions = [...(storeFilter === 'ALL' ? allSales : allSales.filter((s) => s.storeId === storeFilter))]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return {
    periodLabel: bounds.label,
    dateBounds: {
      startDate: bounds.startDate.toISOString(),
      endDate: bounds.endDate.toISOString(),
    },
    periodRevenue,
    periodTransactions,
    periodUnitsSold,
    kpis: {
      totalSalesToday,
      totalTransactionsToday,
      totalSalesThisWeek,
      totalSalesThisMonth,
      lowStockProductsCount: productsWithLowStock.size,
      outOfStockProductsCount: productsWithOutOfStock.size,
      activeStoresCount,
    },
    salesByStore,
    paymentBreakdown,
    salesTrend,
    topProducts,
    salesByCategory,
    inventoryOverview: {
      totalProducts: products.length,
      totalUnitsAcrossStores,
      totalInventoryCostValue,
      totalInventoryRetailValue,
      lowStockItemsCount,
      outOfStockItemsCount,
    },
    lowStockAlerts,
    outOfStockAlerts,
    recentTransactions,
  };
}

/**
 * Super Admin Store Detail Analytics — verbatim port of StorageEngine.
 * getStoreDetailAnalytics() with data injected instead of read from localStorage.
 */
export function computeStoreDetailAnalytics(data: AnalyticsDataset, storeId: string): StoreDetailAnalytics {
  const store = data.stores.find((s) => s.id === storeId);
  if (!store) {
    throw new Error(`Store "${storeId}" not found.`);
  }

  const allSales = data.sales.filter((s) => s.status === 'COMPLETED' && s.storeId === storeId);
  const inventory = data.inventory.filter((i) => i.storeId === storeId);
  const products = data.products;
  const productMap = new Map(products.map((p) => [p.id, p]));

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  const todaySales = allSales.filter((s) => {
    const t = new Date(s.createdAt).getTime();
    return t >= todayStart && t <= todayEnd;
  });

  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const todayTransactions = todaySales.length;

  const periodRevenue = allSales.reduce((sum, s) => sum + s.total, 0);
  const periodTransactions = allSales.length;
  const periodUnitsSold = allSales.reduce(
    (sum, s) => sum + s.items.reduce((iSum, it) => iSum + it.quantity, 0),
    0
  );

  let inventoryUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  const lowStockProducts: {
    productId: string;
    productName: string;
    sku: string;
    currentStock: number;
    reorderLevel: number;
  }[] = [];

  for (const inv of inventory) {
    inventoryUnits += inv.quantity;
    const prod = productMap.get(inv.productId);
    if (!prod) continue;

    if (inv.quantity === 0) {
      outOfStockCount++;
      lowStockProducts.push({
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        currentStock: 0,
        reorderLevel: prod.reorderLevel,
      });
    } else if (inv.quantity <= prod.reorderLevel) {
      lowStockCount++;
      lowStockProducts.push({
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        currentStock: inv.quantity,
        reorderLevel: prod.reorderLevel,
      });
    }
  }

  // Top selling products for this store
  const pMap = new Map<
    string,
    {
      productName: string;
      sku: string;
      unitsSold: number;
      revenue: number;
      transactions: Set<string>;
    }
  >();

  for (const s of allSales) {
    for (const item of s.items) {
      let entry = pMap.get(item.productId);
      if (!entry) {
        entry = {
          productName: item.productName,
          sku: item.sku,
          unitsSold: 0,
          revenue: 0,
          transactions: new Set(),
        };
        pMap.set(item.productId, entry);
      }
      entry.unitsSold += item.quantity;
      entry.revenue += item.lineTotal;
      entry.transactions.add(s.id);
    }
  }

  const topSellingProducts = Array.from(pMap.values())
    .map((p) => ({
      productName: p.productName,
      sku: p.sku,
      unitsSold: p.unitsSold,
      revenue: p.revenue,
      transactions: p.transactions.size,
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10);

  const recentSales = [...allSales]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return {
    store,
    todayRevenue,
    todayTransactions,
    periodRevenue,
    periodTransactions,
    periodUnitsSold,
    inventoryUnits,
    lowStockCount,
    outOfStockCount,
    recentSales,
    lowStockProducts,
    topSellingProducts,
  };
}