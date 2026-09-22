import { supabase, isSupabaseConfigured } from './supabase';
import { storage } from './storageEngine';
import {
  StoreInventory,
  PaymentMethod,
} from '../types';

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
}
