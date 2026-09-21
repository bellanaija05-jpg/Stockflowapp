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

-- 4. User Profiles Table (Linked to auth.users if Supabase Auth is active)
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
