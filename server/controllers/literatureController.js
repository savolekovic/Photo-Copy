import { pool } from "../db/pool.js";

/**
 * Read-only catalogue for the student ordering flow.
 *
 * The spec's steps are fakultet -> godina studija -> prikaz materijala, with no programme
 * step, so these endpoints aggregate across every programme belonging to the chosen
 * faculty. The programme each material comes from is still returned, so the materials
 * screen can offer it as a filter rather than an extra screen.
 *
 * Only active rows are ever exposed: deactivating a faculty, programme or material must
 * remove it from the student's view without disturbing the orders that reference it.
 */

/** GET /api/literature/faculties — faculties that actually have something to order. */
export async function listFaculties(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT f.id, f.name, f.short_name, f.sort_order
         FROM faculties f
        WHERE f.is_active
          AND EXISTS (
            SELECT 1
              FROM study_programmes p
              JOIN material_placements pl ON pl.programme_id = p.id
              JOIN materials m ON m.id = pl.material_id AND m.is_active
             WHERE p.faculty_id = f.id AND p.is_active
          )
        ORDER BY f.sort_order, LOWER(f.name)`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/literature/years?faculty_id=…
 * Years that have materials for that faculty, so the student is never shown an empty year.
 */
export async function listYears(req, res, next) {
  try {
    const facultyId = Number.parseInt(String(req.query.faculty_id ?? ""), 10);
    if (Number.isNaN(facultyId) || facultyId < 1) {
      return res.status(400).json({ error: "faculty_id is required", code: "missing_faculty" });
    }
    const { rows } = await pool.query(
      `SELECT y.id, y.code, y.label_sr, y.label_en, y.sort_order
         FROM study_years y
        WHERE y.is_active
          AND EXISTS (
            SELECT 1
              FROM material_placements pl
              JOIN study_programmes p ON p.id = pl.programme_id AND p.is_active
              JOIN materials m ON m.id = pl.material_id AND m.is_active
             WHERE pl.study_year_id = y.id AND p.faculty_id = $1
          )
        ORDER BY y.sort_order`,
      [facultyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/literature?faculty_id=…&year_id=…
 * The orderable materials for that faculty and year.
 *
 * A material shared by several programmes of the same faculty would otherwise appear once
 * per placement, so programme and subject names are aggregated and the row collapsed to
 * one entry per material.
 */
export async function listLiterature(req, res, next) {
  try {
    const facultyId = Number.parseInt(String(req.query.faculty_id ?? ""), 10);
    const yearId = Number.parseInt(String(req.query.year_id ?? ""), 10);
    if (Number.isNaN(facultyId) || facultyId < 1) {
      return res.status(400).json({ error: "faculty_id is required", code: "missing_faculty" });
    }
    if (Number.isNaN(yearId) || yearId < 1) {
      return res.status(400).json({ error: "year_id is required", code: "missing_year" });
    }

    const { rows } = await pool.query(
      `SELECT
         m.id,
         m.title AS name,
         m.author,
         m.material_type,
         m.price::float8 AS price,
         m.notes,
         -- DISTINCT so a material placed in one programme both directly and under a
         -- subject is not counted twice.
         ARRAY_AGG(DISTINCT p.name) AS programmes,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.name), NULL) AS subjects
       FROM materials m
       JOIN material_placements pl ON pl.material_id = m.id
       JOIN study_programmes p ON p.id = pl.programme_id AND p.is_active
       LEFT JOIN subjects s ON s.id = pl.subject_id AND s.is_active
      WHERE m.is_active
        AND p.faculty_id = $1
        AND pl.study_year_id = $2
      GROUP BY m.id, m.title, m.author, m.material_type, m.price, m.notes
      ORDER BY LOWER(m.title)`,
      [facultyId, yearId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
}
