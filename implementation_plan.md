# Milestone 5C: Supabase Sales History, Dashboards & Audit Read Migration

This plan migrates the remaining read paths — sales history, executive/attendant dashboards, POS recent-sales, and the audit trail — from the local `StorageEngine` (localStorage) to authoritative Supabase reads, following the exact patterns established in Milestone 5B (typed fetchers on `SupabaseBridge`, async loading, explicit error states with no silent fallback to seed data).

## Code Audit Findings

1. **Remaining localStorage read paths (Supabase-connected mode):**
   - `src/pages/POSPage.tsx:91` — `storage.getSalesByStore(selectedStoreId)` still feeds the "Recent Sales" side panel from localStorage, while the catalog above it is now served from Supabase (split-brain introduced by 5B).
   - `src/pages/SalesPage.tsx:29-30` — `storage.getStores()` and `storage.getSales()` power the entire sales-history page (filters, table, receipts).
   - `src/pages/AdminDashboard.tsx:117,133` — `src/db/storageEngine.ts` analytics methods (`getAdminDashboardAnalytics`, `getStoreDetailAnalytics`) compute all executive analytics from localStorage sales/inventory/products.
   - `src/pages/AttendantDashboard.tsx:38,44` — `storage.getSalesByStore()` and `storage.getStoreStockList()` power the attendant's KPIs, stock alerts, and recent transactions.
   - `src/pages/AuditPage.tsx:27` — `storage.getAuditLogs()` powers the Super Admin audit trail.
2. **Out of scope for 5C (deferred to 5D — write/CRUD pages):** `InventoryPage.tsx`, `ProductsPage`, `StoresPage`, `UsersPage`, `StockAdjustmentModal`, `Header`, `AuthContext`. These are product/inventory/user CRUD surfaces that also need *write* migration, not just reads.
3. **Schema facts (from `src/db/supabase_schema.sql`):**
   - `sales`: `id, transaction_number, store_id, attendant_id (UUID, nullable), attendant_name, subtotal, discount, total, payment_method (enum CASH|TRANSFER|POS), status ('COMPLETED'|'VOIDED'|'REFUNDED'), created_at`.
   - `sale_items`: `id, sale_id, product_id, product_name, sku, quantity, unit_price, line_total` — items must be joined via `sales(...).select('*, sale_items(*)')`.
   - `audit_logs`: `id, user_id, user_name, user_role, action, entity, entity_id, details (JSONB), created_at`.
   - **RLS:** `sales` and `sale_items` have SELECT policies (`get_auth_role() = 'ADMIN' OR store_id = get_auth_store()`), so the authenticated client transparently scopes Attendants to their branch and lets Admins read everything — matching the UI's existing RBAC filtering.
4. **⚠️ RLS GAP (requires a SQL migration):** RLS is **enabled** on `audit_logs`, but **no SELECT policy exists for it** in the schema file. Any authenticated read returns an empty set. To migrate `AuditPage` to Supabase, this policy must be added to `supabase_schema.sql` **and applied in the Supabase SQL editor**:
   ```sql
   CREATE POLICY "Super Admins can read audit logs"
       ON audit_logs FOR SELECT
       TO authenticated
       USING (get_auth_role() = 'ADMIN');
   ```
5. **Type mismatches to reconcile during mapping:**
   - DB sale `status` uses `'VOIDED'`; UI `TransactionStatus` uses `'CANCELLED'` → map `VOIDED → CANCELLED` on read.
   - DB audit `action` values (e.g., `'SALE_COMPLETED'` written by the checkout RPC) are not all members of the UI `AuditAction` union → widen the type.
   - DB `details` is JSONB; UI `AuditLog.details` is `string` → `JSON.stringify` on read.
   - `attendant_id` is nullable UUID; UI `Sale.attendantId` is `string` → coerce `null → ''`.


## Open Questions

> [!WARNING]
> 1. **Historical data split-brain:** The Supabase `sales` table only contains transactions created through the `process_pos_checkout` RPC (i.e., real checkouts since Milestone 5A). The demo sales currently visible in Sales Page / Dashboards come from `seedData.ts` via localStorage. After 5C, reports will show **only real Supabase transactions** (possibly zero on a fresh project). Is this acceptable?
> 2. **Audit-log RLS migration:** Migrating `AuditPage` requires adding the SELECT policy in finding #4 directly in the Supabase SQL editor. 5B avoided DB changes; 5C cannot for audit logs. Proceed?
> 3. **Scope guard:** `AuthContext` (users/stores for login & branch switching) remains on localStorage in 5C and moves to 5D. Confirm this split is acceptable.

## Proposed Changes

### 1. `src/db/supabaseBridge.ts` — new read fetchers
- `fetchSales(opts?: { storeId?: string; limit?: number })`: queries `sales` with nested `sale_items(*)`, ordered `created_at` desc (default limit 500), maps to the UI `Sale[]` interface including the mappings from finding #5.
- `fetchStores()`: queries `stores` (SELECT policy already allows all authenticated users), maps to UI `Store[]`.
- `fetchAuditLogs(limit = 500)`: queries `audit_logs` ordered desc, maps to `AuditLog[]` (JSONB details → string, `user_role` → `Role`).

### 2. `src/db/analyticsEngine.ts` — NEW pure computation module
- Port `getDateRangeBounds`, `getAdminDashboardAnalytics`, and `getStoreDetailAnalytics` out of `storageEngine.ts` into pure functions that accept injected data (`sales`, `products`, `categories`, `stores`, `inventory`) instead of touching localStorage.
- `AdminDashboard.tsx` will: fetch raw data via the bridge → feed the pure engine → render. The local `StorageEngine` methods will be re-pointed to call the same pure module (single source of truth, no duplicated math).

## Code Audit Findings

1. **Current product loading path:**
   `POSPage.tsx` currently calls `storage.getProducts()` synchronously. This reads from the `StorageEngine`, which returns a cached list from `localStorage` (originally seeded from `src/db/seedData.ts`).
2. **Current inventory loading path:**
   `POSPage.tsx` calls `storage.getInventory()`, then filters the array by `selectedStoreId` locally.
3. **Current POS product object/type:**
   Defined in `src/types/index.ts` as the `Product` interface: contains `id`, `name`, `sku`, `barcode`, `categoryId`, `brand`, `model`, `variant`, `costPrice`, `sellingPrice`, `reorderLevel`, `status`, etc.
4. **Current checkout item payload:**
   `POSPage.tsx` maps the cart to `[{ productId, quantity, unitPrice }]` and sends it to `SupabaseBridge.executeAtomicCheckout()`, which passes it directly as `p_items` to the `process_pos_checkout` RPC.
5. **Exact files that would need modification:**
   - `src/db/supabaseBridge.ts` (to add robust, typed fetch methods for products and inventory).
   - `src/pages/POSPage.tsx` (to implement asynchronous data fetching, loading states, and error handling, completely replacing synchronous `storage.*` calls when authenticated).
6. **RLS issues:**
   **None.** The schema defines `CREATE POLICY "Authenticated users can read products" ON products FOR SELECT TO authenticated USING (true);`, which allows unrestricted catalog reads. For inventory, the policy is `get_auth_role() = 'ADMIN' OR store_id = get_auth_store()`, which perfectly aligns with the `POSPage.tsx` requirement that Attendants can only view their locked branch while Admins can view all branches. The authenticated Supabase client will naturally pass these RLS checks.

## Open Questions

> [!WARNING]
> Because the local `seedData.ts` catalog has 42 products, but Supabase also has 42 products with **only 8 overlapping SKUs**, this change means the POS UI will immediately drop 34 items currently visible, and display 34 *different* items retrieved from the database. Furthermore, the prices will be the older prices stored in Supabase. Is this visual shift acceptable for this milestone?

### 3. `src/pages/SalesPage.tsx`
- Replace the synchronous `useMemo(storage.getSales())` with an async load effect + `isLoadingSales` / `salesLoadError` states (spinner over the table, error panel with retry), reusing the 5B UI pattern.
- Store list for the filter dropdown fetched via `SupabaseBridge.fetchStores()`.
- Keep all client-side filtering logic (search, payment, date range, Attendant RBAC scoping) untouched.

### 4. `src/pages/AdminDashboard.tsx`
- Convert analytics from synchronous `useMemo(storage.getAdminDashboardAnalytics(...))` to an async load keyed on `[currentFilter, storeFilter, refreshKey]`, using bridge fetches + `analyticsEngine`.
- Add loading/error states consistent with 5B.

### 5. `src/pages/AttendantDashboard.tsx`
- Fetch store sales via `SupabaseBridge.fetchSales({ storeId: currentStore.id })` (RLS also enforces scoping) and store stock by combining `fetchInventory(currentStore.id)` + `fetchProducts()` (rebuilding the `{ product, quantity }` list `getStoreStockList()` provided).
- Add loading/error states.

### 6. `src/pages/POSPage.tsx`
- In `loadData()`, replace `storage.getSalesByStore(selectedStoreId)` with `SupabaseBridge.fetchSales({ storeId: selectedStoreId, limit: 8 })` (non-blocking for the catalog; recent-sales panel gets its own lightweight loading state). Local fallback retained only for offline demo mode.

### 7. `src/pages/AuditPage.tsx`
- Replace `storage.getAuditLogs()` with `SupabaseBridge.fetchAuditLogs()` + loading/error states (Admin-gated; the new RLS policy enforces this server-side too).

### 8. `src/types/index.ts`
- Widen `AuditAction` to include DB-emitted actions (at minimum `'SALE_COMPLETED'`).

## Verification Plan

### Automated / TypeScript
- `npm run lint` (tsc --noEmit) and `npm run build` must pass with zero errors after all mappings.

### Manual Verification
1. Log in as **Admin** → Sales Page shows only Supabase transactions (see Open Question 1); store filter and receipt viewing work against fetched data.
2. Admin Dashboard: KPIs, trend chart, top products, category sales, inventory valuation, stock alerts, and store drill-down all compute from Supabase data; changing date preset / store filter re-fetches.
3. Log in as **Attendant** → dashboard shows only their branch's sales and stock; Sales Page locked to their store.
4. POS: after a successful checkout, the Recent Sales panel updates from Supabase without a page reload.
5. Audit Page: after applying the RLS policy, logs (including RPC-written `SALE_COMPLETED` entries) render; verify an Attendant account cannot read audit logs (RLS).
6. Simulate failure (offline / revoked session) → every migrated page shows its error state with retry, never seed data.
