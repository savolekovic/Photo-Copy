-- Photocopy ordering schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS literature (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  faculty TEXT NOT NULL,
  year TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  faculty TEXT NOT NULL,
  year TEXT NOT NULL,
  literature_id INTEGER NOT NULL REFERENCES literature (id) ON DELETE RESTRICT,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'nova',
  CONSTRAINT orders_status_check
    CHECK (status IN ('nova', 'u_pripremi', 'spremno', 'preuzeto', 'otkazano')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_literature_faculty_year ON literature (faculty, year);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
-- idx_orders_status is created in migrations/001 after `status` exists (legacy DBs may lack the column until migration runs).
