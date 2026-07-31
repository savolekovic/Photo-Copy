-- Legacy / incremental: guarantee `orders.status` exists before later migrations touch it.
-- Databases created by an older schema.sql may predate the column entirely.
-- The old ('pending','completed') value set is intentionally re-created here so that
-- migration 003 has a known starting point to remap from.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

UPDATE orders SET status = 'pending' WHERE status IS NULL OR TRIM(status) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('pending', 'completed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
