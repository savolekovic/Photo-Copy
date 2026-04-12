import { pool } from "../db/pool.js";

const ALLOWED_YEARS = ["1st", "2nd", "3rd", "4th", "Master"];

export async function listLiterature(req, res, next) {
  try {
    const { faculty, year } = req.query;
    const params = [];
    let where = "WHERE 1=1";

    if (faculty) {
      params.push(String(faculty).trim());
      where += ` AND faculty = $${params.length}`;
    }
    if (year) {
      if (!ALLOWED_YEARS.includes(year)) {
        return res.status(400).json({ error: "Invalid year filter" });
      }
      params.push(year);
      where += ` AND year = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT id, name, faculty, year, price::float8 AS price
       FROM literature
       ${where}
       ORDER BY name ASC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
