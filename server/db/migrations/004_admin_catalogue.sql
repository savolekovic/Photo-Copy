-- Administrable catalogue: the entities the spec asks operators to manage
-- ("fakultete, studijske programe, godine studija, predmete, knjige, skripte,
-- ostale nastavne materijale, cijene"), replacing the hardcoded arrays.
--
-- Shape confirmed with the client: fakultet -> studijski program -> godina -> predmet,
-- where predmet is OPTIONAL (their own folders use subjects for only 8 of 18 programmes),
-- and one material may sit in several places at once.

/* ------------------------------------------------------------------ fakulteti ---- */

CREATE TABLE IF NOT EXISTS faculties (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  -- Abbreviation the university actually uses (FMEFB, FDM, HS…), shown where space is tight.
  short_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_faculties_name ON faculties (LOWER(name));

/* --------------------------------------------------------- studijski programi ---- */

CREATE TABLE IF NOT EXISTS study_programmes (
  id SERIAL PRIMARY KEY,
  -- RESTRICT: a faculty holding programmes must be deactivated, not deleted.
  faculty_id INTEGER NOT NULL REFERENCES faculties (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Two faculties may each run a programme of the same name, so uniqueness is per faculty.
CREATE UNIQUE INDEX IF NOT EXISTS idx_programmes_faculty_name
  ON study_programmes (faculty_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_programmes_faculty ON study_programmes (faculty_id);

/* ------------------------------------------------------------ godine studija ---- */

-- A small fixed lookup, so labels live in columns rather than the i18n dictionaries:
-- these are administrable data, and "I godina" / "1st year" genuinely differ per language.
CREATE TABLE IF NOT EXISTS study_years (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label_sr TEXT NOT NULL,
  label_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Includes master and doctoral because the client's own tree has both
-- ("master", "DR studije", "Dr.studije").
INSERT INTO study_years (code, label_sr, label_en, sort_order) VALUES
  ('1',          'I godina',            '1st year',        10),
  ('2',          'II godina',           '2nd year',        20),
  ('3',          'III godina',          '3rd year',        30),
  ('4',          'IV godina',           '4th year',        40),
  ('master',     'Master',              'Master',          50),
  ('doktorske',  'Doktorske studije',   'Doctoral studies', 60)
ON CONFLICT (code) DO NOTHING;

/* ------------------------------------------------------------------- predmeti ---- */

CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  programme_id INTEGER NOT NULL REFERENCES study_programmes (id) ON DELETE CASCADE,
  study_year_id INTEGER NOT NULL REFERENCES study_years (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_scope_name
  ON subjects (programme_id, study_year_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_subjects_programme_year
  ON subjects (programme_id, study_year_id);

/* ------------------------------------------------------------------ materijali ---- */

-- `literature` becomes `materials`. Renaming keeps the primary key values, so every
-- existing orders.literature_id continues to resolve and no order is orphaned.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'literature')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'materials')
  THEN
    ALTER TABLE literature RENAME TO materials;
    ALTER TABLE materials RENAME COLUMN name TO title;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS materials (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0)
);

-- The three kinds the spec names. "ostali_materijal" is the catch-all so nothing is
-- unclassifiable; hrestomatija/praktikum deliberately live under it rather than adding
-- types the client did not ask for.
ALTER TABLE materials ADD COLUMN IF NOT EXISTS material_type TEXT NOT NULL DEFAULT 'ostali_materijal';
ALTER TABLE materials ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE materials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_type_check') THEN
    ALTER TABLE materials ADD CONSTRAINT materials_type_check
      CHECK (material_type IN ('knjiga', 'skripta', 'ostali_materijal'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_materials_title ON materials (LOWER(title));
CREATE INDEX IF NOT EXISTS idx_materials_type ON materials (material_type);

/* ----------------------------------------------------- gdje materijal pripada ---- */

-- One material, many placements. Lets a shared book (their "Osnovi racunovodstva ll",
-- which sits under three programmes) exist once, so a price fix happens once.
CREATE TABLE IF NOT EXISTS material_placements (
  id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
  programme_id INTEGER NOT NULL REFERENCES study_programmes (id) ON DELETE CASCADE,
  study_year_id INTEGER NOT NULL REFERENCES study_years (id) ON DELETE RESTRICT,
  -- NULL means the material hangs directly off the year, with no subject.
  subject_id INTEGER REFERENCES subjects (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- COALESCE so that "no subject" counts as a single distinct slot; without it NULLs
-- would never collide and the same material could be added to one year repeatedly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_placements_unique
  ON material_placements (material_id, programme_id, study_year_id, COALESCE(subject_id, 0));
CREATE INDEX IF NOT EXISTS idx_placements_lookup
  ON material_placements (programme_id, study_year_id);
CREATE INDEX IF NOT EXISTS idx_placements_material ON material_placements (material_id);

/* ------------------------------------------------- migrate the existing catalogue ---- */

-- The old model carried faculty and year as free text on each material. Promote those
-- into real rows, then express the relationship as a placement.
--
-- The six faculty names are the PLACEHOLDERS from before, and each becomes a faculty
-- holding a single same-named programme, because the old model had no notion of
-- programmes. The client replaces all of it through the admin UI.
DO $$
DECLARE
  has_faculty BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'faculty'
  ) INTO has_faculty;

  IF NOT has_faculty THEN
    RETURN;  -- already migrated
  END IF;

  INSERT INTO faculties (name, sort_order)
  SELECT DISTINCT m.faculty, 0 FROM materials m WHERE m.faculty IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO study_programmes (faculty_id, name)
  SELECT f.id, f.name FROM faculties f
  ON CONFLICT DO NOTHING;

  -- Old year values were '1st'..'4th' and 'Master'; map them onto the new codes.
  INSERT INTO material_placements (material_id, programme_id, study_year_id)
  SELECT m.id, p.id, y.id
    FROM materials m
    JOIN faculties f        ON LOWER(f.name) = LOWER(m.faculty)
    JOIN study_programmes p ON p.faculty_id = f.id AND LOWER(p.name) = LOWER(f.name)
    JOIN study_years y      ON y.code = CASE m.year
                                  WHEN '1st' THEN '1'
                                  WHEN '2nd' THEN '2'
                                  WHEN '3rd' THEN '3'
                                  WHEN '4th' THEN '4'
                                  WHEN 'Master' THEN 'master'
                                  ELSE LOWER(m.year)
                                END
   WHERE m.faculty IS NOT NULL AND m.year IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- Faculty and year now live in placements, so drop the denormalised copies.
  ALTER TABLE materials DROP COLUMN faculty;
  ALTER TABLE materials DROP COLUMN year;
END $$;

DROP INDEX IF EXISTS idx_literature_faculty_year;

/* ------------------------------------------------------------------- narudžbine ---- */

-- Point orders at the renamed table. The column keeps its values, so nothing is relinked.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'orders'
                AND column_name = 'literature_id')
  THEN
    ALTER TABLE orders RENAME COLUMN literature_id TO material_id;
  END IF;
END $$;

-- Structured references for filtering and reporting. Nullable because orders placed
-- before this migration predate programmes entirely.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS programme_id INTEGER REFERENCES study_programmes (id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS study_year_id INTEGER REFERENCES study_years (id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subjects (id) ON DELETE SET NULL;

-- orders.faculty and orders.year are deliberately KEPT as free text. They are a
-- historical snapshot of what the student ordered: renaming a faculty later must not
-- silently rewrite past orders.
UPDATE orders o
   SET programme_id = p.id
  FROM faculties f
  JOIN study_programmes p ON p.faculty_id = f.id AND LOWER(p.name) = LOWER(f.name)
 WHERE o.programme_id IS NULL AND LOWER(o.faculty) = LOWER(f.name);

UPDATE orders o
   SET study_year_id = y.id
  FROM study_years y
 WHERE o.study_year_id IS NULL
   AND y.code = CASE o.year
         WHEN '1st' THEN '1' WHEN '2nd' THEN '2' WHEN '3rd' THEN '3'
         WHEN '4th' THEN '4' WHEN 'Master' THEN 'master' ELSE LOWER(o.year)
       END;

CREATE INDEX IF NOT EXISTS idx_orders_programme ON orders (programme_id);
CREATE INDEX IF NOT EXISTS idx_orders_study_year ON orders (study_year_id);
