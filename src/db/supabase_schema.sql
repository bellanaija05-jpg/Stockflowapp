-- ==============================================================================
-- StockFlow PostgreSQL / Supabase Complete Schema
-- Milestones 5A.2, 5A.3, 5A.6, 5A.8
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Custom ENUM Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'ATTENDANT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('CASH', 'TRANSFER', 'POS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE movement_type AS ENUM ('SALE', 'PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'DAMAGE', 'RECONCILIATION', 'RETURN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transfer_status AS ENUM ('PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Stores Table
CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. User Profiles Table
-- profiles.id is a UUID that references auth.users(id). New Supabase Auth users
-- are bootstrapped into public.profiles by the on_auth_user_created trigger, which
-- calls public.handle_new_user(); the live trigger and function definitions are
-- recorded in the Milestone 5G parity block below.
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'ATTENDANT',
    assigned_store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Products Table
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT,
    -- Milestone 5D-C: product metadata (NULL = "not recorded yet")
    brand TEXT,
    model TEXT,
    variant TEXT,
    description TEXT,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    cost_price NUMERIC(12, 2) NOT NULL CHECK (cost_price >= 0),
    selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Inventory Table (Per-Store stock level)
CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_product_store UNIQUE (product_id, store_id)
);

-- 8. Sales Table
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    transaction_number TEXT NOT NULL UNIQUE,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    attendant_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    attendant_name TEXT NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
    payment_method payment_method NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'VOIDED', 'REFUNDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Sale Items Table (Normalized line items)
CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

-- 10. Inventory Movements (Stock Ledger)
CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL, -- Negative for deductions, positive for restock
    movement_type movement_type NOT NULL,
    reference_id TEXT, -- e.g. sale ID or transfer ID
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Stock Transfers Table
CREATE TABLE IF NOT EXISTS stock_transfers (
    id TEXT PRIMARY KEY,
    transfer_number TEXT NOT NULL UNIQUE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    source_store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    destination_store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status transfer_status NOT NULL DEFAULT 'PENDING',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    user_role user_role NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_store ON inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_store ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_movements_store ON inventory_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(product_id);

-- ==============================================================================
-- 5A.6 ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to inspect caller's role
CREATE OR REPLACE FUNCTION get_auth_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to inspect caller's assigned store
CREATE OR REPLACE FUNCTION get_auth_store()
RETURNS TEXT AS $$
  SELECT assigned_store_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES Policies
CREATE POLICY "Super Admins can view all profiles"
    ON profiles FOR SELECT
    USING (get_auth_role() = 'ADMIN' OR id = auth.uid());

CREATE POLICY "Super Admins can manage all profiles"
    ON profiles FOR ALL
    USING (get_auth_role() = 'ADMIN');

-- STORES Policies
CREATE POLICY "Anyone authenticated can view active stores"
    ON stores FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Super Admins can modify stores"
    ON stores FOR ALL
    USING (get_auth_role() = 'ADMIN');

-- CATEGORIES & PRODUCTS Policies
CREATE POLICY "Authenticated users can read categories and products"
    ON categories FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Super Admins can manage categories"
    ON categories FOR ALL
    USING (get_auth_role() = 'ADMIN');

CREATE POLICY "Authenticated users can read products"
    ON products FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Super Admins can manage products"
    ON products FOR ALL
    USING (get_auth_role() = 'ADMIN');

-- INVENTORY Policies
-- Attendants can only read their assigned store; Admins can read all stores
CREATE POLICY "Read inventory restricted by store"
    ON inventory FOR SELECT
    TO authenticated
    USING (
        get_auth_role() = 'ADMIN' OR
        store_id = get_auth_store()
    );

CREATE POLICY "Admins can manage inventory"
    ON inventory FOR ALL
    USING (get_auth_role() = 'ADMIN');

-- SALES Policies
CREATE POLICY "Read sales restricted by store"
    ON sales FOR SELECT
    TO authenticated
    USING (
        get_auth_role() = 'ADMIN' OR
        store_id = get_auth_store()
    );

CREATE POLICY "Attendants can insert sales for assigned store"
    ON sales FOR INSERT
    TO authenticated
    WITH CHECK (
        get_auth_role() = 'ADMIN' OR
        store_id = get_auth_store()
    );

-- SALE ITEMS Policies
CREATE POLICY "Read sale items restricted by parent sale store"
    ON sale_items FOR SELECT
    TO authenticated
    USING (
        get_auth_role() = 'ADMIN' OR
        EXISTS (
            SELECT 1 FROM sales 
            WHERE sales.id = sale_items.sale_id 
            AND sales.store_id = get_auth_store()
        )
    );

CREATE POLICY "Insert sale items"
    ON sale_items FOR INSERT
    TO authenticated
    WITH CHECK (
        get_auth_role() = 'ADMIN' OR
        EXISTS (
            SELECT 1 FROM sales 
            WHERE sales.id = sale_items.sale_id 
            AND sales.store_id = get_auth_store()
        )
    );

-- INVENTORY MOVEMENTS Policies
CREATE POLICY "Read inventory movements restricted by store"
    ON inventory_movements FOR SELECT
    TO authenticated
    USING (
        get_auth_role() = 'ADMIN' OR
        store_id = get_auth_store()
    );

-- AUDIT LOGS Policies (Milestone 5C)
-- The checkout RPC writes audit rows via SECURITY DEFINER (bypassing RLS), but
-- reads require an explicit SELECT policy; without one, RLS returns an empty
-- set to every authenticated user.
CREATE POLICY "Super Admins can read audit logs"
    ON audit_logs FOR SELECT
    TO authenticated
    USING (get_auth_role() = 'ADMIN');

-- AUDIT LOGS Policies (Milestone 5D-B)
-- The management pages (Products, Stores, Users) append their audit rows with the
-- authenticated client, so an INSERT policy is required; without one, RLS
-- (enabled above with default-deny) rejects every client insert. Rows stay
-- append-only: no UPDATE/DELETE policies exist, and the two SECURITY DEFINER
-- RPCs (process_pos_checkout, adjust_inventory_stock) keep bypassing RLS.
CREATE POLICY "Super Admins can insert own audit logs"
    ON audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (get_auth_role() = 'ADMIN' AND user_id = auth.uid());

-- ==============================================================================
-- 5A.8 ATOMIC POS CHECKOUT STORED PROCEDURE (RPC)
-- ==============================================================================
-- Guarantees atomicity: locks inventory rows (FOR UPDATE), checks stock availability,
-- verifies pricing against product catalog, deducts inventory, creates sale, creates sale items,
-- creates movement ledger records, and writes audit log in a single transaction.

CREATE OR REPLACE FUNCTION process_pos_checkout(
    p_store_id TEXT,
    p_attendant_id UUID,
    p_attendant_name TEXT,
    p_payment_method payment_method,
    p_discount NUMERIC(12, 2),
    p_items JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_sale_id TEXT;
    v_tx_number TEXT;
    v_item JSONB;
    v_prod_id TEXT;
    v_qty INTEGER;
    v_curr_qty INTEGER;
    v_unit_price NUMERIC(12, 2);
    v_prod_name TEXT;
    v_sku TEXT;
    v_subtotal NUMERIC(12, 2) := 0;
    v_total NUMERIC(12, 2) := 0;
    v_item_total NUMERIC(12, 2);
BEGIN
    -- 1. Generate unique identifiers
    v_sale_id := 'sale-' || uuid_generate_v4()::TEXT;
    v_tx_number := 'TX-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(uuid_generate_v4()::TEXT FROM 1 FOR 6));

    -- 2. Validate and pre-calculate totals by locking inventory rows
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'productId';
        v_qty := (v_item->>'quantity')::INTEGER;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity for item %', v_prod_id;
        END IF;

        -- Get product catalog details and verify selling price
        SELECT name, sku, selling_price INTO v_prod_name, v_sku, v_unit_price
        FROM products
        WHERE id = v_prod_id AND status = 'ACTIVE';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % is not found or inactive', v_prod_id;
        END IF;

        -- Lock inventory row for this product in target store
        SELECT quantity INTO v_curr_qty
        FROM inventory
        WHERE product_id = v_prod_id AND store_id = p_store_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No inventory entry for product % in store %', v_prod_id, p_store_id;
        END IF;

        IF v_curr_qty < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock for product % (Current: %, Requested: %)', v_prod_name, v_curr_qty, v_qty;
        END IF;

        v_item_total := v_qty * v_unit_price;
        v_subtotal := v_subtotal + v_item_total;
    END LOOP;

    v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

    -- 3. Create Sale Header
    INSERT INTO sales (
        id, transaction_number, store_id, attendant_id, attendant_name,
        subtotal, discount, total, payment_method, status, created_at
    ) VALUES (
        v_sale_id, v_tx_number, p_store_id, p_attendant_id, p_attendant_name,
        v_subtotal, COALESCE(p_discount, 0), v_total, p_payment_method, 'COMPLETED', NOW()
    );

    -- 4. Process each item: insert sale_item, deduct inventory, record inventory_movement
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'productId';
        v_qty := (v_item->>'quantity')::INTEGER;

        SELECT name, sku, selling_price INTO v_prod_name, v_sku, v_unit_price
        FROM products WHERE id = v_prod_id;

        SELECT quantity INTO v_curr_qty
        FROM inventory WHERE product_id = v_prod_id AND store_id = p_store_id;

        v_item_total := v_qty * v_unit_price;

        -- Insert Sale Item
        INSERT INTO sale_items (
            sale_id, product_id, product_name, sku, quantity, unit_price, line_total
        ) VALUES (
            v_sale_id, v_prod_id, v_prod_name, v_sku, v_qty, v_unit_price, v_item_total
        );

        -- Deduct stock
        UPDATE inventory
        SET quantity = quantity - v_qty,
            updated_at = NOW()
        WHERE product_id = v_prod_id AND store_id = p_store_id;

        -- Record Inventory Movement Ledger
        INSERT INTO inventory_movements (
            product_id, store_id, quantity, movement_type, reference_id,
            user_id, notes, previous_quantity, new_quantity, created_at
        ) VALUES (
            v_prod_id, p_store_id, -v_qty, 'SALE', v_sale_id,
            p_attendant_id, 'POS checkout #' || v_tx_number, v_curr_qty, v_curr_qty - v_qty, NOW()
        );
    END LOOP;

    -- 5. Record Audit Log
    INSERT INTO audit_logs (
        user_id, user_name, user_role, action, entity, entity_id, details
    ) VALUES (
        p_attendant_id, p_attendant_name, 'ATTENDANT', 'SALE_COMPLETED', 'SALES', v_sale_id,
        jsonb_build_object(
            'transactionNumber', v_tx_number,
            'total', v_total,
            'storeId', p_store_id,
            'paymentMethod', p_payment_method
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'saleId', v_sale_id,
        'transactionNumber', v_tx_number,
        'total', v_total,
        'subtotal', v_subtotal,
        'discount', COALESCE(p_discount, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 5D ATOMIC INVENTORY ADJUSTMENT STORED PROCEDURE (RPC)
-- ==============================================================================
-- Guarantees atomicity: locks inventory row, updates stock, creates movement record,
-- and creates an audit log entry in a single transaction.

CREATE OR REPLACE FUNCTION adjust_inventory_stock(
    p_product_id TEXT,
    p_store_id TEXT,
    p_new_quantity INTEGER,
    p_user_id UUID,
    p_user_name TEXT,
    p_user_role TEXT,
    p_movement_type movement_type,
    p_notes TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_curr_qty INTEGER;
    v_diff INTEGER;
    v_prod_name TEXT;
    v_store_name TEXT;
    v_movement_id TEXT;
    v_audit_id TEXT;
BEGIN
    IF p_new_quantity < 0 THEN
        RAISE EXCEPTION 'Stock quantity cannot be negative';
    END IF;

    -- Lock inventory row for this product in target store
    SELECT quantity INTO v_curr_qty
    FROM inventory
    WHERE product_id = p_product_id AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- If inventory record doesn't exist, we will create it (quantity 0 originally)
        v_curr_qty := 0;
        INSERT INTO inventory (product_id, store_id, quantity, updated_at)
        VALUES (p_product_id, p_store_id, p_new_quantity, NOW());
    ELSE
        UPDATE inventory
        SET quantity = p_new_quantity,
            updated_at = NOW()
        WHERE product_id = p_product_id AND store_id = p_store_id;
    END IF;

    v_diff := p_new_quantity - v_curr_qty;

    -- Get product and store names for audit log
    SELECT name INTO v_prod_name FROM products WHERE id = p_product_id;
    SELECT name INTO v_store_name FROM stores WHERE id = p_store_id;

    -- Record Inventory Movement Ledger
    v_movement_id := 'mvm-' || uuid_generate_v4()::TEXT;
    INSERT INTO inventory_movements (
        id, product_id, store_id, quantity, movement_type,
        user_id, notes, previous_quantity, new_quantity, created_at
    ) VALUES (
        v_movement_id, p_product_id, p_store_id, v_diff, p_movement_type,
        p_user_id, p_notes, v_curr_qty, p_new_quantity, NOW()
    );

    -- Record Audit Log
    v_audit_id := 'aud-' || uuid_generate_v4()::TEXT;
    INSERT INTO audit_logs (
        id, user_id, user_name, user_role, action, entity, entity_id, details, created_at
    ) VALUES (
        v_audit_id, p_user_id, p_user_name, p_user_role::user_role, 'INVENTORY_ADJUSTED', 'Inventory', v_movement_id,
        jsonb_build_object(
            'message', 'Stock for ' || COALESCE(v_prod_name, p_product_id) || ' at ' || COALESCE(v_store_name, p_store_id) || ' adjusted from ' || v_curr_qty || ' to ' || p_new_quantity || '. Note: ' || COALESCE(p_notes, '')
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'newQuantity', p_new_quantity,
        'previousQuantity', v_curr_qty
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- MILESTONE 5D-C MIGRATION — PRODUCT METADATA + STATUS LIFECYCLE
-- ==============================================================================
-- Review before running. Idempotent and safe to re-run.
-- These statements never seed, merge, reconcile, or overwrite catalog data.

-- 1. Product metadata columns. Nullable on purpose: every existing row predates
--    these columns, and NULL means "not recorded yet" (never a fabricated value).
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS brand       TEXT,
    ADD COLUMN IF NOT EXISTS model       TEXT,
    ADD COLUMN IF NOT EXISTS variant     TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Allow the third lifecycle state (DISCONTINUED). No existing row is affected:
--    the value was previously unrepresentable, so nothing needs migrating.
--    Confirm the auto-generated constraint name first:
--      SELECT conname, pg_get_constraintdef(oid)
--      FROM pg_constraint WHERE conrelid = 'public.products'::regclass;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD  CONSTRAINT products_status_check
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED'));

-- 3. OPTIONAL, approval-gated metadata backfill — brand/model ONLY, listed SKUs ONLY.
--    Never touches name, price, status, category, sku or any other table.
--    Leave commented out until the SKU mapping has been reviewed and approved.
-- UPDATE public.products AS p
-- SET brand = v.brand, model = v.model
-- FROM (VALUES
--     ('ORA-FP4-BLK', 'Oraimo', 'FreePods 4')
-- ) AS v(sku, brand, model)
-- WHERE p.sku = v.sku
--   AND (p.brand IS DISTINCT FROM v.brand OR p.model IS DISTINCT FROM v.model);

-- ==============================================================================
-- MILESTONE 5G PARITY RECORD — AUTH → PROFILES BOOTSTRAP TRIGGER
-- ==============================================================================
-- Documentation/parity record only. These two objects are ALREADY APPLIED in the
-- verified live Supabase project; this block records that live Auth architecture
-- in the repository. Nothing above depends on it, and nothing here changes any
-- existing table, policy, RPC, enum, constraint, index or helper function.
--
-- Live behaviour: every INSERT into auth.users (user created from the Supabase
-- Dashboard, an invite, or sign-up) fires public.handle_new_user(), which inserts
-- the matching public.profiles row with role ATTENDANT and status ACTIVE. The
-- Users page therefore manages role, store assignment and status only; it cannot
-- create profiles client-side, because profiles.id is a UUID owned by Auth.
--
-- WARNING: creating a trigger on auth.users requires ownership of the auth.users
-- table (or equivalent privileges). In a managed Supabase project that normally
-- means running it as the project owner / postgres role from the SQL editor. A
-- role without those privileges fails with a permission error and leaves the
-- database unchanged. Review before running; do not re-run against the live
-- project without re-checking that these definitions still match.

-- Live function definition (verbatim from the verified live project).
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, status)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', 'New Staff'),
    'ATTENDANT',
    'ACTIVE'
  );
  RETURN new;
END;
$function$;

-- Live trigger (verbatim from the verified live project). CREATE OR REPLACE keeps
-- this idempotent and re-runnable; the trigger is never dropped and recreated.
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- MILESTONE 6 — INTER-STORE STOCK TRANSFERS (NEW OBJECTS ONLY)
-- =============================================================================
-- These are NEW Milestone 6 objects for the Admin-only, immediate-execution
-- (V1) inter-store transfer flow: a successful transfer is always recorded
-- with status COMPLETED. There is no PENDING / IN_TRANSIT / receiving /
-- approval workflow in V1.
--
-- IMPORTANT — NOT YET APPLIED TO THE LIVE PROJECT: unlike the Milestone 5G
-- parity block above (already applied in the verified live project), this
-- block has NOT been executed anywhere. The operator must run this block in
-- the Supabase SQL Editor before connected Stock Transfers work. Nothing in
-- this repository executes it.
--
-- This block adds ONLY new objects:
--   1. a new index on stock_transfers(created_at)
--   2. two new RLS policies on stock_transfers (SELECT + INSERT, Admin only)
--   3. a new SECURITY DEFINER function public.execute_stock_transfer(...)
-- Existing tables, enums, indexes, policies, triggers, helper functions and
-- the existing RPCs (process_pos_checkout, adjust_inventory_stock) are NOT
-- modified, and the 5G parity block above is untouched. CREATE POLICY has no
-- IF NOT EXISTS, so — like every other policy section in this file — this
-- block is a run-once script.
--
-- SECURITY NOTES (Milestone 6):
--   * execute_stock_transfer accepts NO client-supplied identity: there is no
--     p_user_id / p_user_name / p_user_role parameter. The actor is always
--     auth.uid(), the actor name is read server-side from public.profiles
--     (audit_logs.user_name is NOT NULL), and the ADMIN requirement is
--     verified INSIDE the function via public.get_auth_role() BEFORE any
--     mutation — a SECURITY DEFINER function must not rely on RLS for its
--     authorization.
--   * This NEW function pins its search path (SET search_path = '') and
--     schema-qualifies every object it touches. The older RPCs keep their own
--     definitions untouched. All identifiers and transfer numbers come from
--     pg_catalog's gen_random_uuid(), so the function does not depend on which
--     schema the uuid-ossp extension was installed into (no sequence, table or
--     tracking object is introduced).
--   * V1 writes the stock_transfers row, exactly two inventory_movements rows
--     and exactly one STOCK_TRANSFERRED audit_logs row inside this ONE
--     function. React must never insert them and must never write a second
--     transfer audit row; a failure anywhere rolls the whole transaction back.
--
-- LOCKING: source/destination store rows are locked FOR UPDATE first in
-- deterministic LEAST(store_id), GREATEST(store_id) order. This closes the
-- missing-destination-row concurrency gap: a destination inventory row that
-- does not exist cannot be locked, so the parent store rows serialize
-- opposite-direction transfers before any inventory row is touched.
-- Inventory rows are then locked in the same store order. Sufficiency is
-- checked against the LOCKED source quantity. A missing source row counts
-- as 0 and fails (it is never created); a missing destination row is still
-- created, with unique_product_store arbitrating concurrent creators
-- through ON CONFLICT. The transfer remains atomic: any failure rolls back
-- the whole transaction.
--
-- TRANSFER NUMBER: TRF-YYYYMMDD-<12 HEX CHARACTERS>, generated in PostgreSQL
-- from gen_random_uuid(). stock_transfers.transfer_number UNIQUE remains the
-- collision backstop (a collision aborts the whole transaction).

-- 1. Listing index (NEW object only).
CREATE INDEX IF NOT EXISTS idx_transfers_created_at ON stock_transfers(created_at);

-- 2. stock_transfers RLS (the table already has RLS enabled above; V1 has no
--    edit/delete workflow, so deliberately NO UPDATE and NO DELETE policy).
CREATE POLICY "Super Admins can read stock transfers"
    ON stock_transfers FOR SELECT
    TO authenticated
    USING (public.get_auth_role() = 'ADMIN');

CREATE POLICY "Super Admins can insert own stock transfers"
    ON stock_transfers FOR INSERT
    TO authenticated
    WITH CHECK (public.get_auth_role() = 'ADMIN' AND created_by = auth.uid());

-- 3. Atomic immediate-execution transfer RPC (V1 success => status COMPLETED).
--    SECURITY DEFINER with a pinned search path; no client actor parameters.
CREATE OR REPLACE FUNCTION public.execute_stock_transfer(
    p_product_id TEXT,
    p_source_store_id TEXT,
    p_destination_store_id TEXT,
    p_quantity INTEGER,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id        UUID := auth.uid();
    v_actor_role      TEXT;
    v_actor_name      TEXT;
    v_prod_name       TEXT;
    v_source_name     TEXT;
    v_dest_name       TEXT;
    v_store_a         TEXT;
    v_store_b         TEXT;
    v_a_found         BOOLEAN := FALSE;
    v_b_found         BOOLEAN := FALSE;
    v_a_qty           INTEGER := 0;
    v_b_qty           INTEGER := 0;
    v_src_prev        INTEGER := 0;
    v_dest_prev       INTEGER := 0;
    v_src_new         INTEGER;
    v_dest_new        INTEGER;
    v_uuid            UUID;
    v_transfer_id     TEXT;
    v_transfer_number TEXT;
    v_created_at      TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Authenticate the caller (never client-supplied).
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- 2. Verify ADMIN inside the function (not via RLS) before any mutation.
    v_actor_role := public.get_auth_role();
    IF v_actor_role IS DISTINCT FROM 'ADMIN' THEN
        RAISE EXCEPTION 'Only Super Admins can execute stock transfers.';
    END IF;

    -- Actor name read server-side from public.profiles for the audit row.
    SELECT COALESCE(NULLIF(pf.name, ''), pf.email)
      INTO v_actor_name
      FROM public.profiles pf
     WHERE pf.id = v_actor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Authenticated profile not found in public.profiles.';
    END IF;

    -- 3-7. Parameter and reference validation (no locks held yet).
    IF p_source_store_id = p_destination_store_id THEN
        RAISE EXCEPTION 'Source and destination store cannot be the same.';
    END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Transfer quantity must be a positive integer.';
    END IF;
    SELECT pr.name INTO v_prod_name FROM public.products pr WHERE pr.id = p_product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found.';
    END IF;
    SELECT ss.name INTO v_source_name FROM public.stores ss WHERE ss.id = p_source_store_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source store not found.';
    END IF;
    SELECT ds.name INTO v_dest_name FROM public.stores ds WHERE ds.id = p_destination_store_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Destination store not found.';
    END IF;

    -- 8. Deterministic lock order: LEAST store id first, then GREATEST.
    --    The EXISTING source/destination store rows are locked first so that
    --    opposite-direction transfers serialize even when a destination
    --    inventory row does not exist yet (an absent inventory row cannot be
    --    locked by FOR UPDATE). Inventory rows are then locked in the same
    --    store order. A missing inventory row just yields NOT FOUND here.
    v_store_a := LEAST(p_source_store_id, p_destination_store_id);
    v_store_b := GREATEST(p_source_store_id, p_destination_store_id);

    PERFORM id
      FROM public.stores
     WHERE id = v_store_a
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found.';
    END IF;

    PERFORM id
      FROM public.stores
     WHERE id = v_store_b
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found.';
    END IF;

    SELECT inv.quantity INTO v_a_qty
      FROM public.inventory inv
     WHERE inv.product_id = p_product_id AND inv.store_id = v_store_a
       FOR UPDATE;
    v_a_found := FOUND;

    SELECT inv.quantity INTO v_b_qty
      FROM public.inventory inv
     WHERE inv.product_id = p_product_id AND inv.store_id = v_store_b
       FOR UPDATE;
    v_b_found := FOUND;

    IF p_source_store_id = v_store_a THEN
        IF v_a_found THEN v_src_prev := v_a_qty; END IF;
        IF v_b_found THEN v_dest_prev := v_b_qty; END IF;
    ELSE
        IF v_b_found THEN v_src_prev := v_b_qty; END IF;
        IF v_a_found THEN v_dest_prev := v_a_qty; END IF;
    END IF;

    -- 9. Sufficiency is checked against the LOCKED source quantity (a missing
    --    source row counts as 0). The source row is never created here.
    IF v_src_prev < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock at source store. Available: %, Requested: %',
            v_src_prev, p_quantity;
    END IF;

    -- 10. Decrement the locked source row.
    UPDATE public.inventory inv
       SET quantity = v_src_prev - p_quantity,
           updated_at = v_created_at
     WHERE inv.product_id = p_product_id
       AND inv.store_id = p_source_store_id
    RETURNING inv.quantity INTO v_src_new;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient stock at source store. Available: 0, Requested: %',
            p_quantity;
    END IF;

    -- 11. Increment (or create) the destination row. ON CONFLICT targets the
    --     existing unique_product_store constraint so concurrent creators are
    --     arbitrated safely; RETURNING yields the exact post-write quantity so
    --     the movement's previous/new values are never guessed.
    INSERT INTO public.inventory AS inv (id, product_id, store_id, quantity, updated_at)
    VALUES (gen_random_uuid()::TEXT, p_product_id, p_destination_store_id, p_quantity, v_created_at)
    ON CONFLICT (product_id, store_id)
    DO UPDATE SET quantity = inv.quantity + p_quantity,
                  updated_at = v_created_at
    RETURNING inv.quantity INTO v_dest_new;

    v_dest_prev := v_dest_new - p_quantity;

    -- 12. Transfer row (V1: immediate execution => always COMPLETED).
    --     transfer_number is generated here in PostgreSQL:
    --     TRF-YYYYMMDD-<12 HEX CHARACTERS> (never in React).
    v_uuid := gen_random_uuid();
    v_transfer_id := 'trf-' || v_uuid::TEXT;
    v_transfer_number := 'TRF-' || TO_CHAR(v_created_at, 'YYYYMMDD') || '-'
                         || UPPER(SUBSTRING(REPLACE(v_uuid::TEXT, '-', '') FROM 1 FOR 12));

    INSERT INTO public.stock_transfers (
        id, transfer_number, product_id, source_store_id, destination_store_id,
        quantity, status, created_by, notes, created_at, updated_at
    ) VALUES (
        v_transfer_id, v_transfer_number, p_product_id, p_source_store_id, p_destination_store_id,
        p_quantity, 'COMPLETED', v_actor_id, p_notes, v_created_at, v_created_at
    );

    -- 13-14. Exactly two movement ledger rows sharing reference_id = transfer id.
    INSERT INTO public.inventory_movements (
        id, product_id, store_id, quantity, movement_type, reference_id,
        user_id, notes, previous_quantity, new_quantity, created_at
    ) VALUES (
        'mvm-' || gen_random_uuid()::TEXT, p_product_id, p_source_store_id,
        -p_quantity, 'TRANSFER_OUT', v_transfer_id, v_actor_id,
        'Transfer to ' || v_dest_name || COALESCE(': ' || p_notes, ''),
        v_src_prev, v_src_new, v_created_at
    );

    INSERT INTO public.inventory_movements (
        id, product_id, store_id, quantity, movement_type, reference_id,
        user_id, notes, previous_quantity, new_quantity, created_at
    ) VALUES (
        'mvm-' || gen_random_uuid()::TEXT, p_product_id, p_destination_store_id,
        p_quantity, 'TRANSFER_IN', v_transfer_id, v_actor_id,
        'Transfer from ' || v_source_name || COALESCE(': ' || p_notes, ''),
        v_dest_prev, v_dest_new, v_created_at
    );

    -- 15. Exactly one audit row, written atomically with everything above.
    INSERT INTO public.audit_logs (
        id, user_id, user_name, user_role, action, entity, entity_id, details, created_at
    ) VALUES (
        'aud-' || gen_random_uuid()::TEXT, v_actor_id, v_actor_name,
        CAST(v_actor_role AS public.user_role), 'STOCK_TRANSFERRED', 'StockTransfer',
        v_transfer_id,
        jsonb_build_object(
            'message',
            'Transferred ' || p_quantity || 'x ' || v_prod_name ||
            ' from ' || v_source_name || ' to ' || v_dest_name ||
            ' (' || v_src_prev || ' -> ' || v_src_new || ' / ' ||
                    v_dest_prev || ' -> ' || v_dest_new || ').' ||
            COALESCE(' Note: ' || p_notes, '')
        ),
        v_created_at
    );

    -- 16. JSON summary for the caller (any failure above rolls it all back).
    RETURN jsonb_build_object(
        'success', true,
        'transferId', v_transfer_id,
        'transferNumber', v_transfer_number,
        'status', 'COMPLETED',
        'createdBy', v_actor_id,
        'createdByName', v_actor_name,
        'createdAt', v_created_at,
        'sourcePrevious', v_src_prev,
        'sourceNew', v_src_new,
        'destinationPrevious', v_dest_prev,
        'destinationNew', v_dest_new
    );
END;
$function$;

-- Milestone 6 privilege hardening: PostgreSQL functions are executable by
-- PUBLIC by default, so restrict this RPC to authenticated clients and revoke
-- anonymous execution. The function itself still performs the ADMIN
-- authorization check internally.
REVOKE EXECUTE
ON FUNCTION public.execute_stock_transfer(text, text, text, integer, text)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.execute_stock_transfer(text, text, text, integer, text)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.execute_stock_transfer(text, text, text, integer, text)
TO authenticated;
