-- Order lifecycle: nova -> u_pripremi -> spremno -> preuzeto, plus otkazano from any state.
-- Replaces the old ('pending','completed') pair and adds the audit trail the spec requires
-- ("evidentiranje svih promjena narudžbine").

-- 1. Ownership. Nullable because orders placed before authentication existed have no account.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;

-- 2. Pickup tracking + reminder bookkeeping.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_deadline TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;
-- Maintained explicitly by the application on every status write, not by a trigger,
-- so the value always changes in the same transaction as the history row.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Swap the status value set. Drop first so the remap cannot violate the old constraint.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'nova';

-- Legacy 'completed' maps to 'preuzeto' rather than 'spremno' deliberately: 'preuzeto' is
-- terminal, so migrating an old database cannot start sending reminder e-mails about orders
-- that were already dealt with months ago.
UPDATE orders SET status = 'nova'     WHERE status = 'pending';
UPDATE orders SET status = 'preuzeto' WHERE status = 'completed';

ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('nova', 'u_pripremi', 'spremno', 'preuzeto', 'otkazano'));

-- 4. Best-effort ownership backfill for legacy rows: match on the address the student typed.
UPDATE orders o
   SET user_id = u.id
  FROM users u
 WHERE o.user_id IS NULL
   AND LOWER(o.email) = LOWER(u.email)
   AND u.role = 'student';

-- 5. The audit trail. One row per transition; changed_by NULL means the system acted
-- (order creation, automatic expiry) rather than a named operator.
CREATE TABLE IF NOT EXISTS order_status_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  changed_by_role TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order
  ON order_status_history (order_id, created_at);

-- 6. Backfill history for orders that predate this table, so every order has an origin row.
INSERT INTO order_status_history (order_id, from_status, to_status, note, created_at)
SELECT o.id, NULL, 'nova', 'Backfilled: order predates status history', o.created_at
  FROM orders o
 WHERE NOT EXISTS (
       SELECT 1 FROM order_status_history h WHERE h.order_id = o.id
 );

-- Orders whose legacy status was already terminal get a second, clearly-labelled row so the
-- trail ends where the order actually is. The timestamp is the creation time because the real
-- transition time was never recorded.
INSERT INTO order_status_history (order_id, from_status, to_status, note, created_at)
SELECT o.id, 'nova', o.status,
       'Backfilled from legacy status; original transition time unknown',
       o.created_at
  FROM orders o
 WHERE o.status <> 'nova'
   AND NOT EXISTS (
       SELECT 1 FROM order_status_history h
        WHERE h.order_id = o.id AND h.to_status = o.status
 );

-- 7. Indexes for the operator dashboard and the reminder job.
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_awaiting_pickup
  ON orders (pickup_deadline, last_reminder_at)
  WHERE status = 'spremno';
