# Milestone 5C Complete: Supabase Sales, Dashboards & Audit Read Migration

The remaining read paths — sales history, executive/attendant dashboards, POS recent-sales, and the audit trail — now read authoritative data directly from Supabase, following the same strict-separation pattern established in Milestone 5B.

## ⚠️ Action required from you (one-time SQL)

The Supabase `audit_logs` table has RLS enabled but had **no SELECT policy**, so reads returned an empty set for everyone. A policy was added to `src/db/supabase_schema.sql` and **must be applied once** in the Supabase SQL Editor (Dashboard → SQL Editor):

```sql
CREATE POLICY "Super Admins can read audit logs"
    ON audit_logs FOR SELECT
    TO authenticated
    USING (get_auth_role() = 'ADMIN');
```

Until you run it, the Audit Page will load successfully but show zero rows when connected to Supabase.

## What changed

1. **`src/db/supabaseBridge.ts`** — new typed fetchers:
   - `fetchSales({ storeId?, limit? })`: reads `sales` joined with nested `sale_items(*)`, newest first (default limit 500). Maps `VOIDED → CANCELLED` (DB status enum vs UI union), coerces null `attendant_id → ''`, and converts `NUMERIC` columns to numbers.
   - `fetchStores()`, `fetchCategories()`: mapped catalog reads for filters and analytics.
   - `fetchAuditLogs(limit)`: maps JSONB `details` to a display string and widens `action` to the UI `AuditAction` type.
   - `fetchInventory(storeId?)` and `fetchProducts({ includeInactive? })` are now optional-parameter (existing 5B callers unchanged): Admin analytics fetch *all* stores' inventory and *all* products including inactive.

2. **`src/db/analyticsEngine.ts` (NEW)** — pure, side-effect-free port of `getDateRangeBounds`, `getAdminDashboardAnalytics`, and `getStoreDetailAnalytics`. It accepts an injected `AnalyticsDataset` (sales/products/categories/stores/inventory) so identical math runs on Supabase data. `StorageEngine`'s local-mode analytics were left untouched (zero regression risk for offline demo mode; consolidation can happen in 5D).

3. **`src/pages/SalesPage.tsx`** — sales history now loads via `fetchSales` + `fetchStores` in an async effect with `isLoadingSales` spinner and `salesLoadError` retry panels. All existing client-side filters (search/payment/date/Attendant RBAC scoping) unchanged.

4. **`src/pages/AdminDashboard.tsx`** — replaced the synchronous `useMemo(storage.getAdminDashboardAnalytics(...))` with an async loader (fetch raw data → `computeAdminDashboardAnalytics`). Re-runs on date preset / custom range / store filter / refresh changes. Store drill-down uses `computeStoreDetailAnalytics` on the cached dataset. Error gate with retry added; offline fallback retained.

5. **`src/pages/AttendantDashboard.tsx`** — today's revenue, stock alerts, and recent transactions now come from `fetchSales({ storeId })` + `fetchInventory` + `fetchProducts` (rebuilding the `{ product, quantity }` shape `getStoreStockList()` provided). Loading/error gates added; re-fetches when the store context changes.

6. **`src/pages/POSPage.tsx`** — the Recent Sales panel now reads the last 8 transactions from Supabase inside `loadData()` (non-blocking: catalog load still succeeds if the sales fetch fails). Offline mode keeps the localStorage path.

7. **`src/pages/AuditPage.tsx`** — reads `fetchAuditLogs()` with loading/error gates (Admin-only; enforced by the new RLS policy too).

8. **`src/types/index.ts`** — `AuditAction` union widened with `'SALE_COMPLETED'` (written by the checkout RPC).

## Verification Performed

- `npx tsc --noEmit`: **zero errors in `src/`** (all new mappings type-safe). The only remaining tsc errors come from pre-existing stray root files (`audit.ts`, `next.config.ts`, `eslint.config.ts`, `proxy.ts`) left over from an unrelated Next.js scaffold — untouched by this milestone and excluded from the Vite build.
- `npm run build`: **passes** (`✓ built in 2.01s`; only the pre-existing >500 kB chunk-size advisory).
- Note: `walkthrough.md`/`implementation_plan.md` now describe 5C; the 5B record remains in git history.

## Next Steps for You

1. **Run the audit-log SQL policy** (see top of this file) in the Supabase SQL Editor — required for the Audit Page to show rows.
2. Manually test at your dev URL:
   - **Admin**: Sales Page shows only real Supabase transactions (the localStorage demo sales are gone — expected split-brain resolution). Change date presets / store filter and confirm the dashboard KPIs, trend chart, top products, category table, inventory valuation, stock alerts, and store drill-down all re-compute from Supabase.
   - **Run a checkout** in the POS, then watch the Recent Sales panel, Sales Page, and dashboards reflect the new transaction without any manual DB edits.
   - **Attendant**: dashboard and Sales Page are locked to their branch (RLS + client filtering agree).
   - **Audit Page**: shows RPC-written `SALE_COMPLETED` entries; verify an Attendant session gets zero rows (RLS) while Admin sees all.
3. **Known follow-ups (proposed Milestone 5D)**: migrate `InventoryPage`/`ProductsPage`/`StoresPage`/`UsersPage`/`StockAdjustmentModal`/`AuthContext` reads+writes, consolidate the duplicated local analytics in `storageEngine.ts` onto `analyticsEngine.ts`, and add an `inventory_movements` SELECT RLS policy for the movements ledger tab.
