-- A cart may span faculties and years.
--
-- Scope lived on the order, which is why an order could only ever describe one faculty and
-- why the cart had to be emptied when the student changed faculty. A student taking a
-- language at the Centar za strane jezike alongside their own programme, or retaking a
-- subject from an earlier year, genuinely needs one order across two scopes — otherwise the
-- copy shop prepares two orders, sends two ready-for-pickup e-mails and hands over twice.
--
-- Scope therefore moves to the line, and an order's scope becomes derived from its lines.
-- One source of truth: no order-level copy that can disagree with the items.

/* ------------------------------------------------------- scope on the line ---- */

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS programme_id INTEGER
  REFERENCES study_programmes (id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS study_year_id INTEGER
  REFERENCES study_years (id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS subject_id INTEGER
  REFERENCES subjects (id) ON DELETE SET NULL;

-- Snapshots, for the same reason the line already snapshots title and unit_price: renaming
-- a faculty must not rewrite what a past order says was ordered. These are what the operator
-- and the e-mails display; the ids above are for filtering and reporting.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS faculty_name TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS year_code TEXT;

/* ----------------------------------------------------------------- backfill ---- */

-- Every existing line inherits its parent order's scope, which is correct: those orders
-- could only ever have had one.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'faculty'
  ) THEN
    UPDATE order_items oi
       SET faculty_name  = COALESCE(oi.faculty_name, o.faculty),
           year_code     = COALESCE(oi.year_code, o.year),
           programme_id  = COALESCE(oi.programme_id, o.programme_id),
           study_year_id = COALESCE(oi.study_year_id, o.study_year_id),
           subject_id    = COALESCE(oi.subject_id, o.subject_id)
      FROM orders o
     WHERE o.id = oi.order_id;
  END IF;
END $$;

-- Recover anything the parent could not supply (a legacy order with a null snapshot) from
-- the material's own placement, so no line is left without a scope to display.
UPDATE order_items oi
   SET faculty_name = f.name,
       year_code    = y.code,
       programme_id = COALESCE(oi.programme_id, p.id),
       study_year_id = COALESCE(oi.study_year_id, y.id)
  FROM material_placements pl
  JOIN study_programmes p ON p.id = pl.programme_id
  JOIN faculties f        ON f.id = p.faculty_id
  JOIN study_years y      ON y.id = pl.study_year_id
 WHERE pl.material_id = oi.material_id
   AND (oi.faculty_name IS NULL OR oi.year_code IS NULL);

/* -------------------------------------------------- retire the order columns ---- */

-- Dropped rather than kept in sync. A denormalised order-level scope would be wrong the
-- moment an order spans two faculties, and "wrong only sometimes" is worse than absent.
ALTER TABLE orders DROP COLUMN IF EXISTS faculty;
ALTER TABLE orders DROP COLUMN IF EXISTS year;
ALTER TABLE orders DROP COLUMN IF EXISTS programme_id;
ALTER TABLE orders DROP COLUMN IF EXISTS study_year_id;
ALTER TABLE orders DROP COLUMN IF EXISTS subject_id;

DROP INDEX IF EXISTS idx_orders_programme;
DROP INDEX IF EXISTS idx_orders_study_year;

/* ------------------------------------------------------------------ indexes ---- */

-- The operator's faculty and year filters become EXISTS lookups over the lines.
CREATE INDEX IF NOT EXISTS idx_order_items_faculty ON order_items (LOWER(faculty_name));
CREATE INDEX IF NOT EXISTS idx_order_items_year ON order_items (year_code);
CREATE INDEX IF NOT EXISTS idx_order_items_programme ON order_items (programme_id);
CREATE INDEX IF NOT EXISTS idx_order_items_study_year ON order_items (study_year_id);
