import {
  AdminDashboardAnalytics,
  AuditLog,
  Category,
  CategorySalesMetric,
  DailyTrendPoint,
  DateRangeFilter,
  InventoryMovement,
  LowStockAlertItem,
  OutOfStockAlertItem,
  PaymentMethod,
  PaymentMethodMetric,
  Product,
  Role,
  Sale,
  SaleItem,
  StockTransfer,
  Store,
  StoreDetailAnalytics,
  StoreInventory,
  StoreSalesMetric,
  TopSellingProductMetric,
  User,
} from '../types';
import {
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  SEED_STORES,
  SEED_USERS,
  generateInitialInventory,
  generateInitialSales,
  INITIAL_AUDIT_LOGS,
  INITIAL_SALES,
} from './seedData';

const STORAGE_KEYS = {
  STORES: 'stockflow_stores',
  USERS: 'stockflow_users',
  CATEGORIES: 'stockflow_categories',
  PRODUCTS: 'stockflow_products',
  INVENTORY: 'stockflow_inventory',
  SALES: 'stockflow_sales',
  MOVEMENTS: 'stockflow_movements',
  TRANSFERS: 'stockflow_transfers',
  AUDIT_LOGS: 'stockflow_audit_logs',
  CURRENT_USER_ID: 'stockflow_current_user_id',
  INITIALIZED: 'stockflow_initialized_v2',
};

// Safe memory fallback if localStorage is unavailable
const memoryStorage: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // fallback
  }
  return memoryStorage[key] ?? null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch {
    // fallback
  }
  memoryStorage[key] = value;
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
  } catch {
    // fallback
  }
  delete memoryStorage[key];
}

export class StorageEngine {
  private static instance: StorageEngine;

  private constructor() {
    this.initializeIfFirstRun();
  }

  public static getInstance(): StorageEngine {
    if (!StorageEngine.instance) {
      StorageEngine.instance = new StorageEngine();
    }
    return StorageEngine.instance;
  }

  public resetToDefaults(): void {
    safeSetItem(STORAGE_KEYS.STORES, JSON.stringify(SEED_STORES));
    safeSetItem(STORAGE_KEYS.USERS, JSON.stringify(SEED_USERS));
    safeSetItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(SEED_CATEGORIES));
    safeSetItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(SEED_PRODUCTS));
    safeSetItem(STORAGE_KEYS.INVENTORY, JSON.stringify(generateInitialInventory()));
    safeSetItem(STORAGE_KEYS.SALES, JSON.stringify(generateInitialSales()));
    safeSetItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify([]));
    safeSetItem(STORAGE_KEYS.TRANSFERS, JSON.stringify([]));
    safeSetItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(INITIAL_AUDIT_LOGS));
    safeRemoveItem(STORAGE_KEYS.CURRENT_USER_ID);
    safeSetItem(STORAGE_KEYS.INITIALIZED, 'true_v2');
  }

  private initializeIfFirstRun(): void {
    const isInit = safeGetItem(STORAGE_KEYS.INITIALIZED);
    if (isInit !== 'true_v2') {
      this.resetToDefaults();
    } else {
      // Ensure sales are populated if empty
      const existingSales = safeGetItem(STORAGE_KEYS.SALES);
      if (!existingSales || existingSales === '[]') {
        safeSetItem(STORAGE_KEYS.SALES, JSON.stringify(generateInitialSales()));
      }
    }
  }

  // Current Session User
  public getCurrentUser(): User | null {
    const currentId = safeGetItem(STORAGE_KEYS.CURRENT_USER_ID);
    if (!currentId) return null;
    const users = this.getUsers();
    return users.find((u) => u.id === currentId) || null;
  }

  public setCurrentUser(userId: string | null): void {
    if (userId) {
      safeSetItem(STORAGE_KEYS.CURRENT_USER_ID, userId);
    } else {
      safeRemoveItem(STORAGE_KEYS.CURRENT_USER_ID);
    }
  }

  // STORES
  public getStores(): Store[] {
    const data = safeGetItem(STORAGE_KEYS.STORES);
    return data ? JSON.parse(data) : SEED_STORES;
  }

  public getStoreById(id: string): Store | undefined {
    return this.getStores().find((s) => s.id === id);
  }

  public saveStore(store: Store): void {
    const stores = this.getStores();
    const index = stores.findIndex((s) => s.id === store.id);
    if (index >= 0) {
      stores[index] = store;
    } else {
      stores.push(store);
      // Auto-initialize 0-stock inventory records for this new store for all products
      const products = this.getProducts();
      const inventory = this.getInventory();
      for (const p of products) {
        inventory.push({
          id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          productId: p.id,
          storeId: store.id,
          quantity: 0,
          updatedAt: new Date().toISOString(),
        });
      }
      this.saveInventoryList(inventory);
    }
    safeSetItem(STORAGE_KEYS.STORES, JSON.stringify(stores));
  }

  // USERS
  public getUsers(): User[] {
    const data = safeGetItem(STORAGE_KEYS.USERS);
    return data ? JSON.parse(data) : SEED_USERS;
  }

  public getUserById(id: string): User | undefined {
    return this.getUsers().find((u) => u.id === id);
  }

  public saveUser(user: User): void {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === user.id);
    if (index >= 0) {
      users[index] = user;
    } else {
      users.push(user);
    }
    safeSetItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }

  // CATEGORIES
  public getCategories(): Category[] {
    const data = safeGetItem(STORAGE_KEYS.CATEGORIES);
    return data ? JSON.parse(data) : SEED_CATEGORIES;
  }

  public saveCategory(category: Category): void {
    const categories = this.getCategories();
    const index = categories.findIndex((c) => c.id === category.id);
    if (index >= 0) {
      categories[index] = category;
    } else {
      categories.push(category);
    }
    safeSetItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  }

  // PRODUCTS
  public getProducts(): Product[] {
    const data = safeGetItem(STORAGE_KEYS.PRODUCTS);
    return data ? JSON.parse(data) : SEED_PRODUCTS;
  }

  public getProductById(id: string): Product | undefined {
    return this.getProducts().find((p) => p.id === id);
  }

  public getProductBySkuOrBarcode(code: string): Product | undefined {
    const normalized = code.trim().toLowerCase();
    return this.getProducts().find(
      (p) =>
        p.sku.toLowerCase() === normalized ||
        p.barcode.toLowerCase() === normalized
    );
  }

  public saveProduct(product: Product): void {
    const products = this.getProducts();
    const index = products.findIndex((p) => p.id === product.id);
    if (index >= 0) {
      products[index] = product;
    } else {
      products.push(product);
      // Auto-initialize inventory for all stores with quantity 0
      const stores = this.getStores();
      const inventory = this.getInventory();
      for (const s of stores) {
        inventory.push({
          id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          productId: product.id,
          storeId: s.id,
          quantity: 0,
          updatedAt: new Date().toISOString(),
        });
      }
      this.saveInventoryList(inventory);
    }
    safeSetItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  }

  // INVENTORY
  public getInventory(): StoreInventory[] {
    const data = safeGetItem(STORAGE_KEYS.INVENTORY);
    return data ? JSON.parse(data) : [];
  }

  private saveInventoryList(inventory: StoreInventory[]): void {
    safeSetItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
  }

  public getStock(productId: string, storeId: string): number {
    const inventory = this.getInventory();
    const item = inventory.find(
      (inv) => inv.productId === productId && inv.storeId === storeId
    );
    return item ? item.quantity : 0;
  }

  public getStoreStockList(storeId: string): (StoreInventory & { product?: Product })[] {
    const inventory = this.getInventory().filter((inv) => inv.storeId === storeId);
    const products = this.getProducts();
    const productMap = new Map(products.map((p) => [p.id, p]));
    return inventory.map((inv) => ({
      ...inv,
      product: productMap.get(inv.productId),
    }));
  }

  // Atomic stock adjustment with movement log & audit
  public adjustStock(params: {
    productId: string;
    storeId: string;
    newQuantity: number;
    userId: string;
    userName: string;
    userRole: 'ADMIN' | 'ATTENDANT';
    movementType: 'STOCK_IN' | 'ADJUSTMENT';
    notes: string;
  }): { success: boolean; error?: string } {
    if (params.newQuantity < 0) {
      return { success: false, error: 'Stock quantity cannot be negative.' };
    }

    const inventory = this.getInventory();
    let record = inventory.find(
      (i) => i.productId === params.productId && i.storeId === params.storeId
    );

    const prevQty = record ? record.quantity : 0;
    const diff = params.newQuantity - prevQty;

    if (!record) {
      record = {
        id: `inv-${Date.now()}`,
        productId: params.productId,
        storeId: params.storeId,
        quantity: params.newQuantity,
        updatedAt: new Date().toISOString(),
      };
      inventory.push(record);
    } else {
      record.quantity = params.newQuantity;
      record.updatedAt = new Date().toISOString();
    }

    this.saveInventoryList(inventory);

    // Record movement
    this.addMovement({
      id: `mvm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId: params.productId,
      storeId: params.storeId,
      quantity: diff,
      movementType: params.movementType,
      userId: params.userId,
      userName: params.userName,
      previousQuantity: prevQty,
      newQuantity: params.newQuantity,
      notes: params.notes,
      createdAt: new Date().toISOString(),
    });

    // Record audit log
    const product = this.getProductById(params.productId);
    const store = this.getStoreById(params.storeId);
    this.addAuditLog({
      id: `aud-${Date.now()}`,
      userId: params.userId,
      userName: params.userName,
      userRole: params.userRole,
      action: 'INVENTORY_ADJUSTED',
      entity: 'Inventory',
      entityId: record.id,
      details: `Stock for ${product?.name ?? params.productId} at ${store?.name ?? params.storeId} adjusted from ${prevQty} to ${params.newQuantity}. Note: ${params.notes}`,
      createdAt: new Date().toISOString(),
    });

    return { success: true };
  }

  // Unique human-readable transaction number generator (e.g. SALE-20260921-0001)
  public generateTransactionNumber(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    const prefix = `SALE-${dateStr}-`;

    const sales = this.getSales();
    const todaySales = sales.filter((s) => s.transactionNumber && s.transactionNumber.startsWith(prefix));
    let nextSeq = todaySales.length + 1;
    let candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    while (sales.some((s) => s.transactionNumber === candidate)) {
      nextSeq++;
      candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
    }
    return candidate;
  }

  // Atomic POS Sale Creation + Stock Deduction & Movement Generation
  public processSale(params: {
    userId: string;
    storeId: string;
    items: { productId: string; quantity: number; unitPrice?: number }[];
    paymentMethod: PaymentMethod;
    discount?: number;
    notes?: string;
    transactionNumber?: string;
  }): {
    success: boolean;
    sale?: Sale;
    error?: string;
  } {
    // 1. Session & Role Authentication Check
    const user = this.getUserById(params.userId);
    if (!user) {
      return { success: false, error: 'Session validation failed: User not found in system.' };
    }
    if (user.status !== 'ACTIVE') {
      return { success: false, error: 'User account is deactivated. Please contact the administrator.' };
    }

    // Role-based branch isolation: Attendants can only sell from their assigned store
    if (user.role === 'ATTENDANT') {
      if (!user.assignedStoreId || user.assignedStoreId !== params.storeId) {
        return {
          success: false,
          error: 'Access denied: Attendants are only authorized to sell from their assigned store branch.',
        };
      }
    }

    // 2. Validate Target Store
    const store = this.getStoreById(params.storeId);
    if (!store || store.status !== 'ACTIVE') {
      return { success: false, error: 'Selected retail branch is inactive or does not exist.' };
    }

    // 3. Validate Cart Content
    if (!params.items || params.items.length === 0) {
      return { success: false, error: 'Cart is empty. Please add at least one product to checkout.' };
    }

    // 4. Validate Payment Method
    const validPayments: PaymentMethod[] = ['CASH', 'TRANSFER', 'POS'];
    if (!validPayments.includes(params.paymentMethod)) {
      return { success: false, error: 'Please select a valid payment method (CASH, TRANSFER, or POS).' };
    }

    // 5. Fresh Database Inventory & Product Price Verification
    const inventory = this.getInventory();
    const products = this.getProducts();
    const productMap = new Map(products.map((p) => [p.id, p]));

    const verifiedSaleItems: SaleItem[] = [];
    let calculatedSubtotal = 0;

    for (const item of params.items) {
      if (!item.quantity || item.quantity <= 0) {
        return { success: false, error: 'Invalid product quantity: must be at least 1 unit.' };
      }

      const product = productMap.get(item.productId);
      if (!product) {
        return { success: false, error: 'A product in the cart is no longer in the catalog.' };
      }

      if (product.status !== 'ACTIVE') {
        return {
          success: false,
          error: `Product "${product.name}" is ${product.status.toLowerCase()} and cannot be sold.`,
        };
      }

      // Check current available stock at this store
      const stockRecord = inventory.find(
        (inv) => inv.productId === product.id && inv.storeId === params.storeId
      );
      const available = stockRecord ? stockRecord.quantity : 0;

      if (item.quantity > available) {
        return {
          success: false,
          error: `Insufficient stock for "${product.name}". Only ${available} unit(s) available at ${store.name}.`,
        };
      }

      // Secure price integrity: Use database selling price, not client-supplied price
      const unitPrice = product.sellingPrice;
      const lineTotal = unitPrice * item.quantity;
      calculatedSubtotal += lineTotal;

      verifiedSaleItems.push({
        id: `sitem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      });
    }

    // 6. Safe Monetary Totals
    const discount = Math.max(0, params.discount ?? 0);
    const total = Math.max(0, calculatedSubtotal - discount);
    const now = new Date().toISOString();
    const transactionNumber = params.transactionNumber || this.generateTransactionNumber();
    const saleId = `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 7. Atomic Inventory Deduction & Movement Record Creation
    const movements: InventoryMovement[] = [];

    for (const verifiedItem of verifiedSaleItems) {
      const stockRecord = inventory.find(
        (inv) => inv.productId === verifiedItem.productId && inv.storeId === params.storeId
      )!;

      const prevQty = stockRecord.quantity;
      const newQty = prevQty - verifiedItem.quantity;

      if (newQty < 0) {
        return {
          success: false,
          error: `Atomic check failed: stock for "${verifiedItem.productName}" cannot be negative.`,
        };
      }

      stockRecord.quantity = newQty;
      stockRecord.updatedAt = now;

      movements.push({
        id: `mvm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: verifiedItem.productId,
        storeId: params.storeId,
        quantity: -verifiedItem.quantity,
        movementType: 'SALE',
        referenceId: saleId,
        userId: user.id,
        userName: user.name,
        previousQuantity: prevQty,
        newQuantity: newQty,
        notes: `POS Sale ${transactionNumber}`,
        createdAt: now,
      });
    }

    // 8. Commit Atomic Changes to Storage
    this.saveInventoryList(inventory);

    for (const m of movements) {
      this.addMovement(m);
    }

    // 9. Save Sale Transaction
    const completedSale: Sale = {
      id: saleId,
      transactionNumber,
      storeId: params.storeId,
      attendantId: user.id,
      attendantName: user.name,
      items: verifiedSaleItems,
      subtotal: calculatedSubtotal,
      discount,
      total,
      paymentMethod: params.paymentMethod,
      status: 'COMPLETED',
      createdAt: now,
      notes: params.notes,
    };

    const sales = this.getSales();
    sales.unshift(completedSale);
    safeSetItem(STORAGE_KEYS.SALES, JSON.stringify(sales));

    // 10. Audit Log Entry
    this.addAuditLog({
      id: `aud-${Date.now()}`,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SALE_CREATED',
      entity: 'Sale',
      entityId: completedSale.id,
      details: `Completed sale ${completedSale.transactionNumber} for ₦${completedSale.total.toLocaleString()} (${completedSale.paymentMethod}) at ${store.name}`,
      createdAt: now,
    });

    return { success: true, sale: completedSale };
  }

  // SALES
  public getSales(): Sale[] {
    const data = safeGetItem(STORAGE_KEYS.SALES);
    if (!data) return INITIAL_SALES;
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length === 0) {
        return INITIAL_SALES;
      }
      return parsed;
    } catch {
      return INITIAL_SALES;
    }
  }

  public getSalesByStore(storeId: string): Sale[] {
    return this.getSales().filter((s) => s.storeId === storeId);
  }

  // MOVEMENTS
  public getMovements(): InventoryMovement[] {
    const data = safeGetItem(STORAGE_KEYS.MOVEMENTS);
    return data ? JSON.parse(data) : [];
  }

  public addMovement(movement: InventoryMovement): void {
    const movements = this.getMovements();
    movements.unshift(movement);
    safeSetItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(movements));
  }

  // STOCK TRANSFERS
  public getTransfers(): StockTransfer[] {
    const data = safeGetItem(STORAGE_KEYS.TRANSFERS);
    return data ? JSON.parse(data) : [];
  }

  public executeTransfer(params: {
    productId: string;
    sourceStoreId: string;
    destinationStoreId: string;
    quantity: number;
    userId: string;
    userName: string;
    notes?: string;
  }): { success: boolean; error?: string; transfer?: StockTransfer } {
    if (params.sourceStoreId === params.destinationStoreId) {
      return { success: false, error: 'Source and destination store cannot be the same.' };
    }
    if (params.quantity <= 0) {
      return { success: false, error: 'Transfer quantity must be greater than 0.' };
    }

    const inventory = this.getInventory();
    const sourceRecord = inventory.find(
      (i) => i.productId === params.productId && i.storeId === params.sourceStoreId
    );
    const sourceStock = sourceRecord ? sourceRecord.quantity : 0;

    if (sourceStock < params.quantity) {
      return {
        success: false,
        error: `Insufficient stock at source store. Available: ${sourceStock}, Requested: ${params.quantity}.`,
      };
    }

    let destRecord = inventory.find(
      (i) => i.productId === params.productId && i.storeId === params.destinationStoreId
    );

    const now = new Date().toISOString();
    const transferId = `trf-${Date.now()}`;
    const transferNumber = `TRF-${Date.now().toString().slice(-6)}`;

    // Deduct source
    const prevSource = sourceRecord!.quantity;
    sourceRecord!.quantity -= params.quantity;
    sourceRecord!.updatedAt = now;

    // Add to dest
    const prevDest = destRecord ? destRecord.quantity : 0;
    if (!destRecord) {
      destRecord = {
        id: `inv-${Date.now()}-dest`,
        productId: params.productId,
        storeId: params.destinationStoreId,
        quantity: params.quantity,
        updatedAt: now,
      };
      inventory.push(destRecord);
    } else {
      destRecord.quantity += params.quantity;
      destRecord.updatedAt = now;
    }

    this.saveInventoryList(inventory);

    // Record source movement (TRANSFER_OUT)
    this.addMovement({
      id: `mvm-${Date.now()}-out`,
      productId: params.productId,
      storeId: params.sourceStoreId,
      quantity: -params.quantity,
      movementType: 'TRANSFER_OUT',
      referenceId: transferId,
      userId: params.userId,
      userName: params.userName,
      previousQuantity: prevSource,
      newQuantity: sourceRecord!.quantity,
      notes: `Transfer to ${params.destinationStoreId}: ${params.notes || ''}`,
      createdAt: now,
    });

    // Record dest movement (TRANSFER_IN)
    this.addMovement({
      id: `mvm-${Date.now()}-in`,
      productId: params.productId,
      storeId: params.destinationStoreId,
      quantity: params.quantity,
      movementType: 'TRANSFER_IN',
      referenceId: transferId,
      userId: params.userId,
      userName: params.userName,
      previousQuantity: prevDest,
      newQuantity: destRecord.quantity,
      notes: `Transfer from ${params.sourceStoreId}: ${params.notes || ''}`,
      createdAt: now,
    });

    // Save transfer record
    const transferRecord: StockTransfer = {
      id: transferId,
      transferNumber,
      productId: params.productId,
      sourceStoreId: params.sourceStoreId,
      destinationStoreId: params.destinationStoreId,
      quantity: params.quantity,
      status: 'COMPLETED',
      initiatedByUserId: params.userId,
      initiatedByUserName: params.userName,
      notes: params.notes,
      createdAt: now,
    };

    const transfers = this.getTransfers();
    transfers.unshift(transferRecord);
    safeSetItem(STORAGE_KEYS.TRANSFERS, JSON.stringify(transfers));

    // Audit log
    const product = this.getProductById(params.productId);
    const sourceStore = this.getStoreById(params.sourceStoreId);
    const destStore = this.getStoreById(params.destinationStoreId);

    this.addAuditLog({
      id: `aud-${Date.now()}`,
      userId: params.userId,
      userName: params.userName,
      userRole: 'ADMIN',
      action: 'STOCK_TRANSFERRED',
      entity: 'StockTransfer',
      entityId: transferId,
      details: `Transferred ${params.quantity}x ${product?.name} from ${sourceStore?.name} to ${destStore?.name}`,
      createdAt: now,
    });

    return { success: true, transfer: transferRecord };
  }

  // AUDIT LOGS
  public getAuditLogs(): AuditLog[] {
    const data = safeGetItem(STORAGE_KEYS.AUDIT_LOGS);
    return data ? JSON.parse(data) : INITIAL_AUDIT_LOGS;
  }

  public addAuditLog(log: AuditLog): void {
    const logs = this.getAuditLogs();
    logs.unshift(log);
    safeSetItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs));
  }

  // ==========================================
  // MILESTONE 4: ADMIN DASHBOARD & ANALYTICS
  // ==========================================

  /**
   * Calculate precise Date objects and human label for a given date range filter
   */
  public getDateRangeBounds(filter: DateRangeFilter): { startDate: Date; endDate: Date; label: string } {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (filter.preset) {
      case 'TODAY':
        return {
          startDate: todayStart,
          endDate: todayEnd,
          label: 'Today',
        };

      case 'YESTERDAY': {
        const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
        const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        return {
          startDate: yStart,
          endDate: yEnd,
          label: 'Yesterday',
        };
      }

      case 'LAST_7_DAYS': {
        const s7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
        return {
          startDate: s7,
          endDate: todayEnd,
          label: 'Last 7 Days',
        };
      }

      case 'LAST_30_DAYS': {
        const s30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
        return {
          startDate: s30,
          endDate: todayEnd,
          label: 'Last 30 Days',
        };
      }

      case 'THIS_MONTH': {
        const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        return {
          startDate: mStart,
          endDate: todayEnd,
          label: 'This Month',
        };
      }

      case 'CUSTOM': {
        if (filter.startDate && filter.endDate) {
          const [sy, sm, sd] = filter.startDate.split('-').map(Number);
          const [ey, em, ed] = filter.endDate.split('-').map(Number);
          const cStart = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
          const cEnd = new Date(ey, em - 1, ed, 23, 59, 59, 999);
          return {
            startDate: cStart,
            endDate: cEnd,
            label: `${filter.startDate} to ${filter.endDate}`,
          };
        }
        return {
          startDate: todayStart,
          endDate: todayEnd,
          label: 'Today',
        };
      }

      default:
        return {
          startDate: todayStart,
          endDate: todayEnd,
          label: 'Today',
        };
    }
  }

  /**
   * Super Admin Dashboard Analytics Query.
   * Enforces server-side ADMIN authorization and computes business intelligence.
   */
  public getAdminDashboardAnalytics(
    requestingUser: User,
    filter: DateRangeFilter,
    storeFilter: string = 'ALL'
  ): AdminDashboardAnalytics {
    // Security check: Only Super Admin can access multi-store intelligence & cost valuations
    if (requestingUser.role !== 'ADMIN') {
      throw new Error('Access Denied: Analytics and business intelligence are restricted to Super Admin.');
    }

    // Only COMPLETED sales contribute to business metrics (Requirement 14)
    const allSales = this.getSales().filter((s) => s.status === 'COMPLETED');
    const bounds = this.getDateRangeBounds(filter);
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

    // Inventory & Products Data
    const inventory = this.getInventory();
    const products = this.getProducts();
    const categories = this.getCategories();
    const stores = this.getStores();

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
   * Super Admin Store Detail Analytics.
   * Drill-down analytics for a specific store.
   */
  public getStoreDetailAnalytics(requestingUser: User, storeId: string): StoreDetailAnalytics {
    if (requestingUser.role !== 'ADMIN') {
      throw new Error('Access Denied: Store intelligence is restricted to Super Admin.');
    }

    const stores = this.getStores();
    const store = stores.find((s) => s.id === storeId);
    if (!store) {
      throw new Error(`Store with ID "${storeId}" not found.`);
    }

    const allSales = this.getSales().filter((s) => s.status === 'COMPLETED' && s.storeId === storeId);
    const inventory = this.getInventory().filter((i) => i.storeId === storeId);
    const products = this.getProducts();
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
}

export const storage = StorageEngine.getInstance();
