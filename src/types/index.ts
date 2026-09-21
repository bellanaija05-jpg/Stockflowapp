export type Role = 'ADMIN' | 'ATTENDANT';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  assignedStoreId?: string; // required if role === 'ATTENDANT'
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string; // matches auth.users(id)
  email: string;
  name: string;
  role: Role;
  assignedStoreId: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt?: string;
  updatedAt?: string;
}

export type StoreStatus = 'ACTIVE' | 'INACTIVE';

export interface Store {
  id: string;
  name: string;
  location: string;
  phone: string;
  status: StoreStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  brand: string;
  model: string;
  variant?: string;
  description?: string;
  costPrice: number; // in NGN
  sellingPrice: number; // in NGN
  reorderLevel: number;
  status: ProductStatus;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface StoreInventory {
  id: string;
  productId: string;
  storeId: string;
  quantity: number;
  updatedAt: string;
}

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'POS';

export type TransactionStatus = 'COMPLETED' | 'CANCELLED' | 'REFUNDED';

export interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number; // in NGN
  lineTotal: number; // unitPrice * quantity
}

export interface Sale {
  id: string;
  transactionNumber: string; // e.g., TRX-2026-0001
  storeId: string;
  attendantId: string;
  attendantName: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  createdAt: string;
  notes?: string;
}

export type MovementType =
  | 'SALE'
  | 'STOCK_IN'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT';

export interface InventoryMovement {
  id: string;
  productId: string;
  storeId: string;
  quantity: number; // positive or negative
  movementType: MovementType;
  referenceId?: string; // sale id or transfer id
  userId: string;
  userName: string;
  previousQuantity: number;
  newQuantity: number;
  notes?: string;
  createdAt: string;
}

export type TransferStatus = 'COMPLETED' | 'PENDING' | 'CANCELLED';

export interface StockTransfer {
  id: string;
  transferNumber: string; // e.g. TRF-2026-001
  productId: string;
  sourceStoreId: string;
  destinationStoreId: string;
  quantity: number;
  status: TransferStatus;
  initiatedByUserId: string;
  initiatedByUserName: string;
  notes?: string;
  createdAt: string;
}

export type AuditAction =
  | 'PRODUCT_CREATED'
  | 'PRODUCT_EDITED'
  | 'PRODUCT_DEACTIVATED'
  | 'PRODUCT_ACTIVATED'
  | 'SALE_CREATED'
  | 'INVENTORY_ADJUSTED'
  | 'STOCK_TRANSFERRED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'STORE_CREATED'
  | 'STORE_UPDATED'
  | 'CATEGORY_CREATED';

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: Role;
  action: AuditAction;
  entity: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface POSCartItem extends SaleItem {
  availableStock: number;
  reorderLevel: number;
}

export type DateRangePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'THIS_MONTH'
  | 'CUSTOM';

export interface DateRangeFilter {
  preset: DateRangePreset;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export interface DailyTrendPoint {
  date: string;       // YYYY-MM-DD
  displayDate: string; // e.g. "Sep 15"
  revenue: number;
  transactions: number;
}

export interface StoreSalesMetric {
  storeId: string;
  storeName: string;
  location: string;
  transactions: number;
  unitsSold: number;
  revenue: number;
}

export interface PaymentMethodMetric {
  count: number;
  revenue: number;
  percentage: number;
}

export interface TopSellingProductMetric {
  productId: string;
  productName: string;
  sku: string;
  categoryName: string;
  unitsSold: number;
  revenue: number;
  transactionsCount: number;
}

export interface CategorySalesMetric {
  categoryId: string;
  categoryName: string;
  unitsSold: number;
  revenue: number;
  transactions: number;
}

export interface LowStockAlertItem {
  inventoryId: string;
  productId: string;
  productName: string;
  sku: string;
  storeId: string;
  storeName: string;
  currentStock: number;
  reorderLevel: number;
  status: 'LOW_STOCK';
}

export interface OutOfStockAlertItem {
  inventoryId: string;
  productId: string;
  productName: string;
  sku: string;
  storeId: string;
  storeName: string;
  currentStock: 0;
  status: 'OUT_OF_STOCK';
}

export interface AdminDashboardAnalytics {
  periodLabel: string;
  dateBounds: {
    startDate: string;
    endDate: string;
  };
  periodRevenue: number;
  periodTransactions: number;
  periodUnitsSold: number;
  kpis: {
    totalSalesToday: number;
    totalTransactionsToday: number;
    totalSalesThisWeek: number;
    totalSalesThisMonth: number;
    lowStockProductsCount: number;
    outOfStockProductsCount: number;
    activeStoresCount: number;
  };
  salesByStore: StoreSalesMetric[];
  paymentBreakdown: {
    CASH: PaymentMethodMetric;
    TRANSFER: PaymentMethodMetric;
    POS: PaymentMethodMetric;
  };
  salesTrend: DailyTrendPoint[];
  topProducts: TopSellingProductMetric[];
  salesByCategory: CategorySalesMetric[];
  inventoryOverview: {
    totalProducts: number;
    totalUnitsAcrossStores: number;
    totalInventoryCostValue: number;
    totalInventoryRetailValue: number;
    lowStockItemsCount: number;
    outOfStockItemsCount: number;
  };
  lowStockAlerts: LowStockAlertItem[];
  outOfStockAlerts: OutOfStockAlertItem[];
  recentTransactions: Sale[];
}

export interface StoreDetailAnalytics {
  store: Store;
  todayRevenue: number;
  todayTransactions: number;
  periodRevenue: number;
  periodTransactions: number;
  periodUnitsSold: number;
  inventoryUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  recentSales: Sale[];
  lowStockProducts: {
    productId: string;
    productName: string;
    sku: string;
    currentStock: number;
    reorderLevel: number;
  }[];
  topSellingProducts: {
    productName: string;
    sku: string;
    unitsSold: number;
    revenue: number;
    transactions: number;
  }[];
}
