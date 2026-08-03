-- Korpa: an order holds many materials, not one.
-- Implements "Dodavanje željenih materijala u korpu" from the student module.
--
-- orders.price stays as the order TOTAL. Per-line money lives on the item, so a price
-- change in the catalogue never rewrites what a student was charged.

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  -- RESTRICT, so a material that has been ordered cannot be deleted out from under the
  -- order. This replaces the same guarantee that orders.material_id used to provide.
  material_id INTEGER NOT NULL REFERENCES materials (id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  -- Title snapshot, for the same reason orders keeps its own faculty and year: renaming a
  -- material later must not change what a past order says was ordered.
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One line per material; quantity carries the count rather than duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_unique
  ON order_items (order_id, material_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_material ON order_items (material_id);
-- Supports the operator search, which matches item titles.
CREATE INDEX IF NOT EXISTS idx_order_items_title ON order_items (LOWER(title));

/* ------------------------------------------- migrate single-material orders ---- */

-- Every existing order becomes a one-line order. Guarded so a re-run is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'material_id'
  ) THEN
    INSERT INTO order_items (order_id, material_id, quantity, unit_price, title, created_at)
    SELECT o.id, o.material_id, 1, o.price, m.title, o.created_at
      FROM orders o
      JOIN materials m ON m.id = o.material_id
     WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
    ON CONFLICT DO NOTHING;

    -- order_items is authoritative from here; the single-material column would only
    -- drift out of step with it.
    ALTER TABLE orders DROP COLUMN material_id;
  END IF;
END $$;

-- Recompute totals from the lines so the two can never disagree. For migrated orders this
-- is a no-op (one line at the old price), but it makes the invariant explicit.
UPDATE orders o
   SET price = COALESCE(
         (SELECT SUM(oi.unit_price * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id),
         o.price
       )
 WHERE EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id);
