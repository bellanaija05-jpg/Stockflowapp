import { supabase, isSupabaseConfigured } from './supabase';
import { storage } from './storageEngine';
import {
  StoreInventory,
  PaymentMethod,
  Product,
  Sale,
  Store,
  AuditAction,
  AuditLog,
  Role,
  User,
  Category,
  InventoryMovement,
  StockTransfer,
  TransferStatus,
} from '../types';

/**
 * Milestone 5D-C: product metadata normalisation.
 * Empty/whitespace-only text is stored as NULL so that "not recorded" is
 * distinguishable from a deliberate value and round-trips losslessly.
 */
const toNullableText = (value?: string | null): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Supabase Data Sync & Migration Helper
 * Handles seeding data from local seed to Supabase,
 * and dual-mode syncing for seamless online/offline fallback.
 */
export class SupabaseBridge {
  public static isConnected(): boolean {
    return isSupabaseConfigured && supabase !== null;
  }

  /**
   * Migrate and seed all existing stores, categories, products,
   * and inventory levels into Supabase PostgreSQL tables.
   */
  public static async seedSupabaseFromLocal(): Promise<{ success: boolean; message: string; details?: any }> {
    if (!this.isConnected() || !supabase) {
      return { success: false, message: 'Supabase credentials not configured in environment.' };
    }

    try {
      const stores = storage.getStores();
      const categories = storage.getCategories();
      const products = storage.getProducts();
      const allInventory: StoreInventory[] = storage.getInventory();

      // 1. Seed Stores
      const storesPayload = stores.map((s) => ({
        id: s.id,
        name: s.name,
        location: s.location,
        phone: s.phone,
        status: s.status,
      }));
      const { error: storeErr } = await supabase.from('stores').upsert(storesPayload, { onConflict: 'id' });
      if (storeErr) throw new Error(`Stores seed failed: ${storeErr.message}`);

      // 2. Seed Categories
      const categoriesPayload = categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
      }));
      const { error: catErr } = await supabase.from('categories').upsert(categoriesPayload, { onConflict: 'id' });
      if (catErr) throw new Error(`Categories seed failed: ${catErr.message}`);

      // 3. Seed Products
      const productsPayload = products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode || null,
        category_id: p.categoryId,
        cost_price: p.costPrice,
        selling_price: p.sellingPrice,
        reorder_level: p.reorderLevel,
        // Milestone 5D-C: metadata parity — payload only, never executed here.
        brand: toNullableText(p.brand),
        model: toNullableText(p.model),
        variant: toNullableText(p.variant),
        description: toNullableText(p.description),
        status: p.status,
      }));
      const { error: prodErr } = await supabase.from('products').upsert(productsPayload, { onConflict: 'id' });
      if (prodErr) throw new Error(`Products seed failed: ${prodErr.message}`);

      // 4. Seed Inventory (in chunks of 100 to respect request limits)
      const inventoryPayload = allInventory.map((inv: StoreInventory) => ({
        id: inv.id,
        product_id: inv.productId,
        store_id: inv.storeId,
        quantity: inv.quantity,
      }));

      const CHUNK_SIZE = 100;
      for (let i = 0; i < inventoryPayload.length; i += CHUNK_SIZE) {
        const chunk = inventoryPayload.slice(i, i + CHUNK_SIZE);
        const { error: invErr } = await supabase.from('inventory').upsert(chunk, { onConflict: 'product_id,store_id' });
        if (invErr) throw new Error(`Inventory chunk ${i} failed: ${invErr.message}`);
      }

      return {
        success: true,
        message: `Successfully seeded ${stores.length} stores, ${categories.length} categories, ${products.length} products, and ${allInventory.length} inventory records to Supabase.`,
      };
    } catch (err: any) {
      console.error('Supabase seed error:', err);
      return { success: false, message: err.message || 'Error seeding Supabase' };
    }
  }

  /**
   * Execute atomic POS checkout via Supabase RPC function (process_pos_checkout)
   * Falls back to localStorage storageEngine if offline or Supabase isn't configured.
   */
  public static async executeAtomicCheckout(params: {
    userId: string;
    storeId: string;
    attendantId?: string;
    attendantName?: string;
    paymentMethod: PaymentMethod;
    discount?: number;
    items: Array<{ productId: string; quantity: number; unitPrice?: number }>;
  }): Promise<{ success: boolean; sale?: any; error?: string }> {
    if (this.isConnected() && supabase) {
      try {
        const { data, error } = await supabase.rpc('process_pos_checkout', {
          p_store_id: params.storeId,
          p_attendant_id: params.attendantId || params.userId,
          p_attendant_name: params.attendantName || 'Cashier',
          p_payment_method: params.paymentMethod,
          p_discount: params.discount || 0,
          p_items: params.items,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true, sale: data };
      } catch (err: any) {
        return { success: false, error: err.message || 'RPC Checkout failed' };
      }
    }

    // Local execution fallback
    return storage.processSale({
      userId: params.userId,
      storeId: params.storeId,
      items: params.items,
      paymentMethod: params.paymentMethod,
      discount: params.discount,
    });
  }

  /**
   * Fetch all active products from Supabase
   */
  public static async fetchProducts(opts?: { includeInactive?: boolean }): Promise<{ success: boolean; products?: Product[]; error?: string }> {
    if (!this.isConnected() || !supabase) {
      return { success: false, error: 'Supabase is not configured or not connected.' };
    }

    try {
      let query = supabase.from('products').select('*');
      if (!opts?.includeInactive) {
        query = query.eq('status', 'ACTIVE');
      }
      const { data, error } = await query;

      if (error) {
        return { success: false, error: error.message };
      }

      const products: Product[] = data.map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode || '',
        categoryId: p.category_id,
        brand: p.brand ?? '',
        // Milestone 5D-C: real persisted metadata (no name-derived synthesis).
        model: p.model ?? '',
        variant: p.variant ?? undefined,
        description: p.description ?? undefined,
        costPrice: p.cost_price,
        sellingPrice: p.selling_price,
        reorderLevel: p.reorder_level,
        status: p.status,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));

      return { success: true, products };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch products' };
    }
  }

  /**
   * Fetch inventory for a specific store from Supabase
   */
  public static async fetchInventory(storeId?: string): Promise<{ success: boolean; inventory?: StoreInventory[]; error?: string }> {
    if (!this.isConnected() || !supabase) {
      return { success: false, error: 'Supabase is not configured or not connected.' };
    }

    try {
      let query = supabase.from('inventory').select('*');
      if (storeId) {
        query = query.eq('store_id', storeId);
      }
      const { data, error } = await query;

      if (error) {
        return { success: false, error: error.message };
      }

      const inventory: StoreInventory[] = data.map((inv: any) => ({
        id: inv.id,
        productId: inv.product_id,
        storeId: inv.store_id,
        quantity: inv.quantity,
        updatedAt: inv.updated_at,
      }));

      return { success: true, inventory };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch inventory' };
    }
  }

  /**
   * Fetch categories readable by the authenticated user.
   */
  public static async fetchCategories(): Promise<{ success: boolean; categories?: { id: string; name: string; description?: string; createdAt: string }[]; error?: string }> {
    if (!this.isConnected() || !supabase) {
      return { success: false, error: 'Supabase is not configured or not connected.' };
    }

    try {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) {
        return { success: false, error: error.message };
      }

      const categories = data.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description || undefined,
        createdAt: c.created_at,
      }));

      return { success: true, categories };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch categories' };
    }
  }

  /**
   * Fetch stores visible to the authenticated user.
   * RLS: "Anyone authenticated can view active stores" — all authenticated users.
   */
  public static async fetchStores(): Promise<{ success: boolean; stores?: Store[]; error?: string }> {
    if (!this.isConnected() || !supabase) {
      return { success: false, error: 'Supabase is not configured or not connected.' };
    }

    try {
      const { data, error } = await supabase.from('stores').select('*').order('name');
      if (error) {
        return { success: false, error: error.message };
      }

      const stores: Store[] = data.map((s: any) => ({
        id: s.id,
        name: s.name,
        location: s.location,
        phone: s.phone,
        status: s.status,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }));

      return { success: true, stores };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch stores' };
    }
  }

  /**
   * Fetch sales (with nested sale_items) readable by the current user.
   * RLS "Read sales restricted by store" transparently scopes Attendants to
   * their assigned branch while Admins can read across all stores.
   */
  public static async fetchSales(opts?: { storeId?: string; limit?: number }): Promise<{ success: boolean; sales?: Sale[]; error?: string }> {
    if (!this.isConnected() || !supabase) {
      return { success: false, error: 'Supabase is not configured or not connected.' };
    }

    try {
      let query = supabase
        .from('sales')
        .select('*, sale_items(*)')
        .order('created_at', { ascending: false })
        .limit(opts?.limit ?? 500);

      if (opts?.storeId) {
        query = query.eq('store_id', opts.storeId);
      }

      const { data, error } = await query;
      if (error) {
        return { success: false, error: error.message };
      }

      const sales: Sale[] = data.map((s: any) => ({
        id: s.id,
        transactionNumber: s.transaction_number,
        storeId: s.store_id,
        attendantId: s.attendant_id || '',
        attendantName: s.attendant_name,
        items: (s.sale_items || []).map((it: any) => ({
          id: it.id,
          productId: it.product_id,
          productName: it.product_name,
          sku: it.sku,
          quantity: it.quantity,
          unitPrice: Number(it.unit_price),
          lineTotal: Number(it.line_total),
        })),
        subtotal: Number(s.subtotal),
        discount: Number(s.discount),
        total: Number(s.total),
        paymentMethod: s.payment_method as PaymentMethod,
        // DB uses 'VOIDED'; the UI TransactionStatus union uses 'CANCELLED'.
        status: (s.status === 'VOIDED' ? 'CANCELLED' : s.status) as Sale['status'],
        createdAt: s.created_at,
      }));

      return { success: true, sales };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch sales' };
    }
  }

  /**
   * Fetch audit logs readable by the current user.
   * Requires the "Super Admins can read audit logs" SELECT policy (Milestone 5C).
   */
  public static async fetchAuditLogs(limit: number = 500): Promise<{ success: boolean; logs?: AuditLog[]; error?: string }> {
    if (!this.isConnected() || !supabase) {
      return { success: false, error: 'Supabase is not configured or not connected.' };
    }

    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return { success: false, error: error.message };
      }

      const logs: AuditLog[] = data.map((l: any) => ({
        id: l.id,
        userId: l.user_id || '',
        userName: l.user_name,
        userRole: l.user_role,
        action: l.action as AuditAction,
        entity: l.entity,
        entityId: l.entity_id,
        // DB stores JSONB; the UI AuditLog.details is a display string.
        // Milestone 5D-B: management log entries (and both RPCs) write
        // { message: "..." }, so unwrap it; any other shape falls back to JSON.
        details:
          typeof l.details === 'string'
            ? l.details
            : typeof l.details?.message === 'string'
              ? l.details.message
              : JSON.stringify(l.details ?? ''),
        createdAt: l.created_at,
      }));

      return { success: true, logs };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch audit logs' };
    }
  }

  /**
   * Milestone 5D-B: append a management audit entry.
   *
   * Connected + authenticated session -> writes to Supabase `audit_logs` and
   * NEVER falls back to localStorage on failure; the error is returned so the
   * caller can surface it to the operator.
   * Connected without an authenticated session (Milestone 5F) -> returns a
   * failure and persists nothing: the audit trail stays authoritative and no
   * browser-local entry is created.
   * Not connected (Supabase unconfigured) -> writes through the StorageEngine,
   * preserving the pre-5D-B behaviour.
   *
   * The row `id` is deliberately omitted so the database default
   * (uuid_generate_v4()) generates it — a client-side `aud-${Date.now()}` can
   * collide when two actions land in the same millisecond.
   */
  public static async writeAuditLog(entry: {
    action: AuditAction;
    entity: string;
    entityId: string;
    details: string;
    userName: string;
    userRole: Role;
    userId?: string;
  }): Promise<{ success: boolean; persistedTo: 'supabase' | 'local'; error?: string }> {
    const writeLocal = (): { success: boolean; persistedTo: 'local' } => {
      storage.addAuditLog({
        id: `aud-${Date.now()}`,
        userId: entry.userId || 'system',
        userName: entry.userName,
        userRole: entry.userRole,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        details: entry.details,
        createdAt: new Date().toISOString(),
      });
      return { success: true, persistedTo: 'local' };
    };

    if (!this.isConnected() || !supabase) {
      return writeLocal();
    }

    try {
      // Identity must come from the auth session: audit_logs.user_id is a UUID FK
      // to auth.users, while local demo user ids (e.g. 'user-0001') are not UUIDs.
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData?.session?.user?.id;

      if (!authUserId) {
        // Milestone 5F: connected mode is authoritative for the audit trail.
        // Without a session the row cannot be attributed, so fail loudly
        // (surfaced by <AuditWriteWarning/>) instead of writing localStorage.
        return {
          success: false,
          persistedTo: 'supabase',
          error: 'No authenticated session available to record the audit entry.',
        };
      }

      const { error } = await supabase.from('audit_logs').insert({
        user_id: authUserId,
        user_name: entry.userName,
        user_role: entry.userRole,
        action: entry.action,
        entity: entry.entity,
        entity_id: entry.entityId,
        // Same JSONB shape as process_pos_checkout / adjust_inventory_stock.
        details: { message: entry.details },
      });

      if (error) {
        return { success: false, persistedTo: 'supabase', error: error.message };
      }

      return { success: true, persistedTo: 'supabase' };
    } catch (err: any) {
      return {
        success: false,
        persistedTo: 'supabase',
        error: err?.message || 'Failed to write audit log',
      };
    }
  }

  /**
   * Fetch all user profiles from Supabase.
   */
  public static async fetchUsers(): Promise<{ success: boolean; users?: User[]; error?: string }> {
    if (!this.isConnected() || !supabase) {
      return { success: false, error: 'Supabase is not configured or not connected.' };
    }

    try {
      const { data, error } = await supabase.from('profiles').select('*').order('name');
      if (error) {
        return { success: false, error: error.message };
      }

      const users: User[] = data.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        assignedStoreId: u.assigned_store_id || undefined,
        status: u.status,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      }));

      return { success: true, users };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch users' };
    }
  }

  /**
   * Fetch inventory movements (ledger) from Supabase.
   */
  public static async fetchMovements(limit: number = 500): Promise<{ success: boolean; movements?: InventoryMovement[]; error?: string }> {
    if (!this.isConnected() || !supabase) {
      return { success: false, error: 'Supabase is not configured or not connected.' };
    }

    try {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return { success: false, error: error.message };
      }

      // Milestone 5D-A: map only the movement types produced by the
      // adjust_inventory_stock RPC into the application vocabulary.
      // Historical/other DB enums (SALE, TRANSFER_IN, TRANSFER_OUT, DAMAGE,
      // RETURN) pass through unchanged.
      const mapDbMovementType = (dbType: string): InventoryMovement['movementType'] => {
        if (dbType === 'PURCHASE') return 'STOCK_IN';
        if (dbType === 'RECONCILIATION') return 'ADJUSTMENT';
        return dbType as InventoryMovement['movementType'];
      };

      const movements: InventoryMovement[] = data.map((m: any) => ({
        id: m.id,
        productId: m.product_id,
        storeId: m.store_id,
        quantity: m.quantity,
        movementType: mapDbMovementType(m.movement_type),
        referenceId: m.reference_id,
        userId: m.user_id,
        userName: m.user_name || 'System', // Supabase currently doesn't store user_name in movements by default, but wait, schema does not have user_name in movements table! Let's check schema. Schema doesn't have it.
        previousQuantity: m.previous_quantity,
        newQuantity: m.new_quantity,
        notes: m.notes,
        createdAt: m.created_at,
      }));

      return { success: true, movements };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch movements' };
    }
  }

  /**
   * Save a product to Supabase.
   */
  public static async saveProduct(product: Product): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected() || !supabase) {
      storage.saveProduct(product);
      return { success: true };
    }

    try {
      const { error } = await supabase.from('products').upsert({
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode || null,
        category_id: product.categoryId,
        cost_price: product.costPrice,
        selling_price: product.sellingPrice,
        reorder_level: product.reorderLevel,
        // Milestone 5D-C: persisted product metadata (empty -> NULL).
        brand: toNullableText(product.brand),
        model: toNullableText(product.model),
        variant: toNullableText(product.variant),
        description: toNullableText(product.description),
        status: product.status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save product' };
    }
  }

  /**
   * Save a category to Supabase.
   */
  public static async saveCategory(category: Category): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected() || !supabase) {
      storage.saveCategory(category);
      return { success: true };
    }

    try {
      const { error } = await supabase.from('categories').upsert({
        id: category.id,
        name: category.name,
        description: category.description,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save category' };
    }
  }

  /**
   * Save a store to Supabase.
   */
  public static async saveStore(store: Store): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected() || !supabase) {
      storage.saveStore(store);
      return { success: true };
    }

    try {
      const { error } = await supabase.from('stores').upsert({
        id: store.id,
        name: store.name,
        location: store.location,
        phone: store.phone,
        status: store.status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save store' };
    }
  }

  /**
   * Save a user profile to Supabase. Note: Does not create the actual Auth user.
   */
  public static async saveProfile(profile: User): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected() || !supabase) {
      storage.saveUser(profile);
      return { success: true };
    }

    try {
      const { error } = await supabase.from('profiles').upsert({
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        assigned_store_id: profile.assignedStoreId || null,
        status: profile.status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save profile' };
    }
  }

  /**
   * Execute atomic stock adjustment via RPC.
   *
   * Milestone 5D-A: `movementType` uses the application vocabulary
   * ('STOCK_IN' | 'ADJUSTMENT') and is mapped to the database `movement_type`
   * enum immediately before the RPC call, because the Postgres enum only
   * contains ('SALE','PURCHASE','TRANSFER_IN','TRANSFER_OUT','DAMAGE',
   * 'RECONCILIATION','RETURN') — not STOCK_IN/ADJUSTMENT.
   */
  public static async executeAtomicAdjustment(params: {
    productId: string;
    storeId: string;
    newQuantity: number;
    userId: string;
    userName: string;
    userRole: 'ADMIN' | 'ATTENDANT';
    movementType: 'STOCK_IN' | 'ADJUSTMENT';
    notes: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected() || !supabase) {
      // Offline demo mode only — never reachable once connected to Supabase.
      return storage.adjustStock(params);
    }

    // Milestone 7: cheap client-side defense-in-depth only (the database is
    // authoritative). Attendants never reach the adjustment RPC.
    if (params.userRole !== 'ADMIN') {
      return { success: false, error: 'Manual stock adjustment is restricted to Super Admins.' };
    }

    // Milestone 5D-A: application movement vocabulary → DB movement_type enum.
    const dbMovementType = params.movementType === 'STOCK_IN' ? 'PURCHASE' : 'RECONCILIATION';

    try {
      // Milestone 7: connected adjustments go through the ADMIN-only
      // execute_inventory_adjustment wrapper. It derives the actor from
      // auth.uid() — no p_user_id / p_user_name / p_user_role is transmitted.
      const { error } = await supabase.rpc('execute_inventory_adjustment', {
        p_product_id: params.productId,
        p_store_id: params.storeId,
        p_new_quantity: params.newQuantity,
        p_movement_type: dbMovementType,
        p_notes: params.notes,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'RPC Adjustment failed' };
    }
  }

  /**
   * Fetch inter-store stock transfers (Milestone 6).
   * Connected: `stock_transfers` (Admin-only SELECT policy). Offline: the
   * existing StorageEngine transfer store — untouched, and the only offline
   * implementation (no second one is created here).
   */
  public static async fetchTransfers(limit: number = 500): Promise<{ success: boolean; transfers?: StockTransfer[]; error?: string }> {
    if (!this.isConnected() || !supabase) {
      // Offline demo mode — existing StorageEngine behaviour, preserved.
      return { success: true, transfers: storage.getTransfers() };
    }

    try {
      const { data, error } = await supabase
        .from('stock_transfers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return { success: false, error: error.message };
      }

      const transfers: StockTransfer[] = (data || []).map((t: any) => ({
        id: t.id,
        transferNumber: t.transfer_number,
        productId: t.product_id,
        sourceStoreId: t.source_store_id,
        destinationStoreId: t.destination_store_id,
        quantity: t.quantity,
        status: t.status as TransferStatus,
        // stock_transfers stores the UUID only (created_by → auth.users.id);
        // the display name is resolved from public.profiles at render time.
        initiatedByUserId: t.created_by || '',
        initiatedByUserName: '',
        notes: t.notes || undefined,
        createdAt: t.created_at,
      }));

      return { success: true, transfers };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to load stock transfers' };
    }
  }

  /**
   * Execute an immediate inter-store stock transfer (Milestone 6, V1).
   *
   * Connected: `public.execute_stock_transfer` RPC. The actor identity is
   * derived INSIDE PostgreSQL from auth.uid(), so no identity is ever sent —
   * the RPC accepts only p_product_id / p_source_store_id /
   * p_destination_store_id / p_quantity / p_notes. userId/userName are used
   * exclusively by the offline StorageEngine path below.
   *
   * Offline: the existing StorageEngine transfer implementation, untouched.
   */
  public static async executeTransfer(params: {
    productId: string;
    sourceStoreId: string;
    destinationStoreId: string;
    quantity: number;
    userId: string;
    userName: string;
    notes?: string;
  }): Promise<{ success: boolean; transfer?: StockTransfer; error?: string }> {
    if (!this.isConnected() || !supabase) {
      // Offline demo mode only — existing localStorage transfer behaviour,
      // preserved byte-for-byte (StorageEngine.executeTransfer).
      return storage.executeTransfer(params);
    }

    try {
      // Milestone 6: no actor parameters — the server uses auth.uid().
      const { data, error } = await supabase.rpc('execute_stock_transfer', {
        p_product_id: params.productId,
        p_source_store_id: params.sourceStoreId,
        p_destination_store_id: params.destinationStoreId,
        p_quantity: params.quantity,
        p_notes: params.notes ?? null,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        transfer: {
          id: data.transferId,
          transferNumber: data.transferNumber,
          productId: params.productId,
          sourceStoreId: params.sourceStoreId,
          destinationStoreId: params.destinationStoreId,
          quantity: params.quantity,
          status: 'COMPLETED',
          initiatedByUserId: data.createdBy,
          initiatedByUserName: data.createdByName,
          notes: params.notes,
          createdAt: data.createdAt,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Stock transfer failed' };
    }
  }
}
