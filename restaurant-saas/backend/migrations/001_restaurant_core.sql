-- Revoltz Restaurant OS initial schema. Apply only to a dedicated database.
-- Authenticated server code must SET LOCAL app.user_id/app.tenant_id after membership checks.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  country_code char(2) NOT NULL DEFAULT 'IN',
  currency_code char(3) NOT NULL DEFAULT 'INR',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  code text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code),
  UNIQUE (restaurant_id, id)
);
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS restaurant_memberships (
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','manager','cashier','waiter','kitchen','inventory')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, user_id)
);
CREATE TABLE IF NOT EXISTS menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, id),
  UNIQUE (restaurant_id, name)
);
CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  tax_code text,
  is_vegetarian boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, id),
  FOREIGN KEY (restaurant_id, category_id) REFERENCES menu_categories(restaurant_id, id)
);
CREATE TABLE IF NOT EXISTS restaurant_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  order_number bigint GENERATED ALWAYS AS IDENTITY,
  order_type text NOT NULL CHECK (order_type IN ('dine_in','takeaway','delivery')),
  table_label text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','preparing','ready','served','cancelled','paid')),
  currency_code char(3) NOT NULL DEFAULT 'INR',
  subtotal_paise integer NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
  tax_paise integer NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  discount_paise integer NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  total_paise integer NOT NULL DEFAULT 0 CHECK (total_paise >= 0),
  idempotency_key text NOT NULL,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, id),
  UNIQUE (restaurant_id, idempotency_key),
  FOREIGN KEY (restaurant_id, outlet_id) REFERENCES outlets(restaurant_id, id)
);
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  menu_item_id uuid,
  item_name_snapshot text NOT NULL,
  unit_price_paise integer NOT NULL CHECK (unit_price_paise >= 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  line_total_paise integer NOT NULL CHECK (line_total_paise >= 0),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id, order_id) REFERENCES restaurant_orders(restaurant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id, menu_item_id) REFERENCES menu_items(restaurant_id, id)
);
CREATE TABLE IF NOT EXISTS kitchen_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','preparing','ready','cancelled')),
  station text NOT NULL DEFAULT 'kitchen',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id, order_id) REFERENCES restaurant_orders(restaurant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('cash','upi','card','online','other')),
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('pending','recorded','refunded','failed')),
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id, order_id) REFERENCES restaurant_orders(restaurant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS inventory_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  unit text NOT NULL CHECK (unit IN ('g','kg','ml','l','piece')),
  quantity_milli bigint NOT NULL DEFAULT 0 CHECK (quantity_milli >= 0),
  reorder_level_milli bigint NOT NULL DEFAULT 0 CHECK (reorder_level_milli >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, id),
  UNIQUE (restaurant_id, name)
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('purchase','waste','adjustment','sale','return')),
  quantity_delta_milli bigint NOT NULL CHECK (quantity_delta_milli <> 0),
  reason text NOT NULL DEFAULT '',
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (restaurant_id, ingredient_id) REFERENCES inventory_ingredients(restaurant_id, id)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outlets_restaurant ON outlets(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_active ON menu_items(restaurant_id, is_available);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_outlet_created ON restaurant_orders(restaurant_id, outlet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON restaurant_orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_restaurant_order ON order_items(restaurant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_restaurant_status ON kitchen_tickets(restaurant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_restaurant_order ON payments(restaurant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_stock_restaurant_ingredient ON stock_movements(restaurant_id, ingredient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_restaurant_created ON audit_events(restaurant_id, created_at DESC);

-- Defense-in-depth tenant policies. App routes must authenticate and set both
-- context values transaction-locally; never trust a client-supplied tenant id.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'outlets','restaurant_memberships','menu_categories','menu_items',
    'restaurant_orders','order_items','kitchen_tickets','payments',
    'inventory_ingredients','stock_movements','audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (restaurant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (restaurant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS restaurant_member_access ON restaurants;
CREATE POLICY restaurant_member_access ON restaurants
  USING (
    id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM restaurant_memberships m
      WHERE m.restaurant_id = restaurants.id
        AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  )
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
-- app_users is not exposed through generic tenant-scoped queries. Auth bootstrap
-- requires narrowly scoped server-side SQL and must be added before public launch.
