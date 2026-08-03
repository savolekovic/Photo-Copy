import { body, param, validationResult } from "express-validator";
import { pool } from "../db/pool.js";

/**
 * Catalogue administration — the spec's "upravljanje osnovnim podacima": fakulteti,
 * studijski programi, godine studija, predmeti, materijali (knjige / skripte / ostali)
 * and cijene. Operator-only; mounted behind requireOperator.
 *
 * Deletion policy throughout: an entity that something still points at is DEACTIVATED,
 * never removed. Orders must keep resolving to what was actually ordered, and the spec's
 * audit requirement makes silent disappearance unacceptable. Only genuinely unreferenced
 * rows are hard-deleted.
 */

const MATERIAL_TYPES = ["knjiga", "skripta", "ostali_materijal"];

/**
 * Reject on validation failure. Returns true when it has already answered, so callers
 * read as `if (fail(req, res)) return;`.
 */
function fail(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

/**
 * Map the constraint violations these endpoints can legitimately produce onto statuses
 * with a stable `code` the UI can translate. Anything else is a genuine fault and goes to
 * the error handler.
 */
const PG_UNIQUE_VIOLATION = "23505";
const PG_FK_VIOLATION = "23503";
const PG_CHECK_VIOLATION = "23514";

function handleWriteError(res, next, err, conflictMessage) {
  switch (err.code) {
    case PG_UNIQUE_VIOLATION:
      return res
        .status(409)
        .json({ error: conflictMessage || "Already exists", code: "duplicate" });
    case PG_FK_VIOLATION:
      return res
        .status(409)
        .json({ error: "Still referenced by other records", code: "in_use" });
    case PG_CHECK_VIOLATION:
      return res.status(400).json({ error: "Invalid value", code: "check_violation" });
    default:
      return next(err);
  }
}

/* ---------------------------------------------------------------- catalogue ---- */

/**
 * GET /api/admin/catalogue
 * The whole tree in one request. The admin screens need all of it at once, and it is
 * small enough (tens of rows) that paginating would cost more than it saves.
 */
export async function getCatalogue(_req, res, next) {
  try {
    const [faculties, programmes, years, subjects, materials, placements] =
      await Promise.all([
        pool.query(
          `SELECT id, name, short_name, sort_order, is_active FROM faculties
            ORDER BY sort_order, LOWER(name)`
        ),
        pool.query(
          `SELECT id, faculty_id, name, sort_order, is_active FROM study_programmes
            ORDER BY sort_order, LOWER(name)`
        ),
        pool.query(
          `SELECT id, code, label_sr, label_en, sort_order, is_active FROM study_years
            ORDER BY sort_order`
        ),
        pool.query(
          `SELECT id, programme_id, study_year_id, name, sort_order, is_active FROM subjects
            ORDER BY sort_order, LOWER(name)`
        ),
        pool.query(
          `SELECT id, title, author, material_type, price::float8 AS price, notes, is_active
             FROM materials ORDER BY LOWER(title)`
        ),
        pool.query(
          `SELECT id, material_id, programme_id, study_year_id, subject_id
             FROM material_placements`
        ),
      ]);

    res.json({
      faculties: faculties.rows,
      programmes: programmes.rows,
      years: years.rows,
      subjects: subjects.rows,
      materials: materials.rows,
      placements: placements.rows,
      materialTypes: MATERIAL_TYPES,
    });
  } catch (err) {
    next(err);
  }
}

/* ---------------------------------------------------------------- faculties ---- */

export const facultyValidators = [
  body("name").isString().trim().isLength({ min: 1, max: 200 }),
  body("short_name").optional({ values: "falsy" }).isString().trim().isLength({ max: 40 }),
  body("sort_order").optional().isInt().toInt(),
  body("is_active").optional().isBoolean().toBoolean(),
];

export async function createFaculty(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { name, short_name, sort_order } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO faculties (name, short_name, sort_order) VALUES ($1, $2, COALESCE($3, 0))
       RETURNING id, name, short_name, sort_order, is_active`,
      [name, short_name || null, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "A faculty with that name already exists");
  }
}

export async function updateFaculty(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { name, short_name, sort_order, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE faculties SET
         name = COALESCE($2, name),
         short_name = COALESCE($3, short_name),
         sort_order = COALESCE($4, sort_order),
         is_active = COALESCE($5, is_active),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, short_name, sort_order, is_active`,
      [req.params.id, name ?? null, short_name ?? null, sort_order ?? null, is_active ?? null]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Faculty not found" });
    res.json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "A faculty with that name already exists");
  }
}

/** DELETE /api/admin/faculties/:id — hard-deletes only when no programme references it. */
export async function deleteFaculty(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { rows: used } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM study_programmes WHERE faculty_id = $1`,
      [req.params.id]
    );
    if ((used[0]?.c ?? 0) > 0) {
      const { rows } = await pool.query(
        `UPDATE faculties SET is_active = FALSE, updated_at = NOW() WHERE id = $1
         RETURNING id, name, short_name, sort_order, is_active`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Faculty not found" });
      return res.json({ ...rows[0], deactivated: true, reason: "has_programmes" });
    }
    const { rowCount } = await pool.query(`DELETE FROM faculties WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: "Faculty not found" });
    res.status(204).send();
  } catch (err) {
    handleWriteError(res, next, err, "");
  }
}

/* --------------------------------------------------------------- programmes ---- */

export const programmeValidators = [
  body("faculty_id").optional().isInt({ min: 1 }).toInt(),
  body("name").isString().trim().isLength({ min: 1, max: 200 }),
  body("sort_order").optional().isInt().toInt(),
  body("is_active").optional().isBoolean().toBoolean(),
];

export async function createProgramme(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { faculty_id, name, sort_order } = req.body;
    if (!faculty_id) {
      return res.status(400).json({ error: "faculty_id is required", code: "missing_faculty" });
    }
    const { rows } = await pool.query(
      `INSERT INTO study_programmes (faculty_id, name, sort_order)
       VALUES ($1, $2, COALESCE($3, 0))
       RETURNING id, faculty_id, name, sort_order, is_active`,
      [faculty_id, name, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "That faculty already has a programme with this name");
  }
}

export async function updateProgramme(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { faculty_id, name, sort_order, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE study_programmes SET
         faculty_id = COALESCE($2, faculty_id),
         name = COALESCE($3, name),
         sort_order = COALESCE($4, sort_order),
         is_active = COALESCE($5, is_active),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, faculty_id, name, sort_order, is_active`,
      [req.params.id, faculty_id ?? null, name ?? null, sort_order ?? null, is_active ?? null]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Programme not found" });
    res.json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "That faculty already has a programme with this name");
  }
}

/** Deactivates instead of deleting when orders or placements point at the programme. */
export async function deleteProgramme(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { rows: used } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM material_placements WHERE programme_id = $1)
       + (SELECT COUNT(*) FROM orders WHERE programme_id = $1)
       + (SELECT COUNT(*) FROM subjects WHERE programme_id = $1) AS c`,
      [req.params.id]
    );
    if (Number(used[0]?.c ?? 0) > 0) {
      const { rows } = await pool.query(
        `UPDATE study_programmes SET is_active = FALSE, updated_at = NOW() WHERE id = $1
         RETURNING id, faculty_id, name, sort_order, is_active`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Programme not found" });
      return res.json({ ...rows[0], deactivated: true, reason: "in_use" });
    }
    const { rowCount } = await pool.query(`DELETE FROM study_programmes WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: "Programme not found" });
    res.status(204).send();
  } catch (err) {
    handleWriteError(res, next, err, "");
  }
}

/* -------------------------------------------------------------- study years ---- */

export const yearValidators = [
  body("code").optional().isString().trim().isLength({ min: 1, max: 40 }),
  body("label_sr").optional().isString().trim().isLength({ min: 1, max: 100 }),
  body("label_en").optional().isString().trim().isLength({ min: 1, max: 100 }),
  body("sort_order").optional().isInt().toInt(),
  body("is_active").optional().isBoolean().toBoolean(),
];

export async function createYear(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { code, label_sr, label_en, sort_order } = req.body;
    if (!code || !label_sr || !label_en) {
      return res
        .status(400)
        .json({ error: "code, label_sr and label_en are required", code: "missing_fields" });
    }
    const { rows } = await pool.query(
      `INSERT INTO study_years (code, label_sr, label_en, sort_order)
       VALUES ($1, $2, $3, COALESCE($4, 0))
       RETURNING id, code, label_sr, label_en, sort_order, is_active`,
      [code, label_sr, label_en, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "A study year with that code already exists");
  }
}

export async function updateYear(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { code, label_sr, label_en, sort_order, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE study_years SET
         code = COALESCE($2, code),
         label_sr = COALESCE($3, label_sr),
         label_en = COALESCE($4, label_en),
         sort_order = COALESCE($5, sort_order),
         is_active = COALESCE($6, is_active),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, code, label_sr, label_en, sort_order, is_active`,
      [
        req.params.id,
        code ?? null,
        label_sr ?? null,
        label_en ?? null,
        sort_order ?? null,
        is_active ?? null,
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Study year not found" });
    res.json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "A study year with that code already exists");
  }
}

export async function deleteYear(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { rows: used } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM material_placements WHERE study_year_id = $1)
       + (SELECT COUNT(*) FROM subjects WHERE study_year_id = $1)
       + (SELECT COUNT(*) FROM orders WHERE study_year_id = $1) AS c`,
      [req.params.id]
    );
    if (Number(used[0]?.c ?? 0) > 0) {
      const { rows } = await pool.query(
        `UPDATE study_years SET is_active = FALSE, updated_at = NOW() WHERE id = $1
         RETURNING id, code, label_sr, label_en, sort_order, is_active`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Study year not found" });
      return res.json({ ...rows[0], deactivated: true, reason: "in_use" });
    }
    const { rowCount } = await pool.query(`DELETE FROM study_years WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: "Study year not found" });
    res.status(204).send();
  } catch (err) {
    handleWriteError(res, next, err, "");
  }
}

/* ----------------------------------------------------------------- subjects ---- */

export const subjectValidators = [
  body("programme_id").optional().isInt({ min: 1 }).toInt(),
  body("study_year_id").optional().isInt({ min: 1 }).toInt(),
  body("name").isString().trim().isLength({ min: 1, max: 200 }),
  body("sort_order").optional().isInt().toInt(),
  body("is_active").optional().isBoolean().toBoolean(),
];

export async function createSubject(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { programme_id, study_year_id, name, sort_order } = req.body;
    if (!programme_id || !study_year_id) {
      return res.status(400).json({
        error: "programme_id and study_year_id are required",
        code: "missing_fields",
      });
    }
    const { rows } = await pool.query(
      `INSERT INTO subjects (programme_id, study_year_id, name, sort_order)
       VALUES ($1, $2, $3, COALESCE($4, 0))
       RETURNING id, programme_id, study_year_id, name, sort_order, is_active`,
      [programme_id, study_year_id, name, sort_order]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "That programme and year already has this subject");
  }
}

export async function updateSubject(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { programme_id, study_year_id, name, sort_order, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE subjects SET
         programme_id = COALESCE($2, programme_id),
         study_year_id = COALESCE($3, study_year_id),
         name = COALESCE($4, name),
         sort_order = COALESCE($5, sort_order),
         is_active = COALESCE($6, is_active),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, programme_id, study_year_id, name, sort_order, is_active`,
      [
        req.params.id,
        programme_id ?? null,
        study_year_id ?? null,
        name ?? null,
        sort_order ?? null,
        is_active ?? null,
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Subject not found" });
    res.json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "That programme and year already has this subject");
  }
}

export async function deleteSubject(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { rows: used } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM orders WHERE subject_id = $1) AS c`,
      [req.params.id]
    );
    if (Number(used[0]?.c ?? 0) > 0) {
      const { rows } = await pool.query(
        `UPDATE subjects SET is_active = FALSE, updated_at = NOW() WHERE id = $1
         RETURNING id, programme_id, study_year_id, name, sort_order, is_active`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Subject not found" });
      return res.json({ ...rows[0], deactivated: true, reason: "in_use" });
    }
    // Placements referencing it are not a blocker: subject_id is ON DELETE SET NULL, so
    // the materials simply fall back to hanging off the year.
    const { rowCount } = await pool.query(`DELETE FROM subjects WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: "Subject not found" });
    res.status(204).send();
  } catch (err) {
    handleWriteError(res, next, err, "");
  }
}

/* ---------------------------------------------------------------- materials ---- */

export const materialValidators = [
  body("title").isString().trim().isLength({ min: 1, max: 500 }),
  body("author").optional({ values: "falsy" }).isString().trim().isLength({ max: 300 }),
  body("material_type").optional().isIn(MATERIAL_TYPES),
  body("price").optional().isFloat({ min: 0 }).toFloat(),
  body("notes").optional({ values: "falsy" }).isString().trim().isLength({ max: 2000 }),
  body("is_active").optional().isBoolean().toBoolean(),
];

export async function createMaterial(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { title, author, material_type, price, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO materials (title, author, material_type, price, notes)
       VALUES ($1, $2, COALESCE($3, 'ostali_materijal'), COALESCE($4::numeric, 0), $5)
       RETURNING id, title, author, material_type, price::float8 AS price, notes, is_active`,
      [title, author || null, material_type, price, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "");
  }
}

export async function updateMaterial(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { title, author, material_type, price, notes, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE materials SET
         title = COALESCE($2, title),
         author = COALESCE($3, author),
         material_type = COALESCE($4, material_type),
         price = COALESCE($5::numeric, price),
         notes = COALESCE($6, notes),
         is_active = COALESCE($7, is_active),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, author, material_type, price::float8 AS price, notes, is_active`,
      [
        req.params.id,
        title ?? null,
        author ?? null,
        material_type ?? null,
        price ?? null,
        notes ?? null,
        is_active ?? null,
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Material not found" });
    res.json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "");
  }
}

/**
 * A material that has ever been ordered is only deactivated. Deleting it would break the
 * order's reference to what was actually bought, which the audit requirement forbids.
 */
export async function deleteMaterial(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { rows: used } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM orders WHERE material_id = $1`,
      [req.params.id]
    );
    if ((used[0]?.c ?? 0) > 0) {
      const { rows } = await pool.query(
        `UPDATE materials SET is_active = FALSE, updated_at = NOW() WHERE id = $1
         RETURNING id, title, author, material_type, price::float8 AS price, notes, is_active`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Material not found" });
      return res.json({ ...rows[0], deactivated: true, reason: "ordered" });
    }
    const { rowCount } = await pool.query(`DELETE FROM materials WHERE id = $1`, [
      req.params.id,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: "Material not found" });
    res.status(204).send();
  } catch (err) {
    handleWriteError(res, next, err, "");
  }
}

/* --------------------------------------------------------------- placements ---- */

export const placementValidators = [
  param("id").isInt({ min: 1 }).toInt(),
  body("programme_id").isInt({ min: 1 }).toInt(),
  body("study_year_id").isInt({ min: 1 }).toInt(),
  body("subject_id").optional({ values: "null" }).isInt({ min: 1 }).toInt(),
];

/** POST /api/admin/materials/:id/placements — put one material into a programme+year. */
export async function addPlacement(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { programme_id, study_year_id, subject_id } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO material_placements (material_id, programme_id, study_year_id, subject_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id, material_id, programme_id, study_year_id, subject_id`,
      [req.params.id, programme_id, study_year_id, subject_id ?? null]
    );
    if (rows.length === 0) {
      return res
        .status(409)
        .json({ error: "That material is already placed there", code: "duplicate" });
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    handleWriteError(res, next, err, "That material is already placed there");
  }
}

export async function removePlacement(req, res, next) {
  if (fail(req, res)) return;
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM material_placements WHERE id = $1 AND material_id = $2`,
      [req.params.placementId, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Placement not found" });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
