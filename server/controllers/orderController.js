import { body, param, validationResult } from "express-validator";
import { pool } from "../db/pool.js";
import { sendOrderEmails } from "../services/emailService.js";

const FACULTIES = [
  "Law",
  "Economics",
  "Engineering",
  "Medicine",
  "Arts",
  "Sciences",
];

const YEARS = ["1st", "2nd", "3rd", "4th", "Master"];

export const orderValidators = [
  body("faculty").isIn(FACULTIES).withMessage("Invalid faculty"),
  body("year").isIn(YEARS).withMessage("Invalid year"),
  body("literature_id").isInt({ min: 1 }).toInt(),
  body("price").isFloat({ min: 0 }).toFloat(),
  body("email").isEmail().normalizeEmail(),
  body("phone")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 40 })
    .withMessage("Phone is too long"),
];

export async function createOrder(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { faculty, year, literature_id, price, email, phone } = req.body;

    const lit = await pool.query(
      `SELECT id, name, faculty, year, price::float8 AS price
       FROM literature
       WHERE id = $1 AND faculty = $2 AND year = $3`,
      [literature_id, faculty, year]
    );

    if (lit.rows.length === 0) {
      return res.status(400).json({
        error: "Literature not found for the selected faculty and year",
      });
    }

    const row = lit.rows[0];
    const expected = Number(row.price);
    const submitted = Number(price);
    if (Math.abs(expected - submitted) > 0.009) {
      return res.status(400).json({ error: "Price does not match literature" });
    }

    const insert = await pool.query(
      `INSERT INTO orders (faculty, year, literature_id, price, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        faculty,
        year,
        literature_id,
        submitted,
        email,
        phone || null,
      ]
    );

    let emailSent = false;
    let emailError = null;
    try {
      const result = await sendOrderEmails({
        faculty,
        year,
        literatureName: row.name,
        price: submitted,
        email,
        phone: phone || "",
      });
      emailSent = result.sent === true;
    } catch (mailErr) {
      console.error("[email]", mailErr);
      emailError =
        mailErr.message ||
        mailErr.response ||
        "Email delivery failed (see server logs)";
    }

    res.status(201).json({
      id: insert.rows[0].id,
      created_at: insert.rows[0].created_at,
      emailSent,
      ...(emailError ? { emailError } : {}),
    });
  } catch (err) {
    next(err);
  }
}

export const getOrderValidators = [
  param("id").isInt({ min: 1 }).toInt(),
];

export async function getOrderById(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT
         o.id,
         o.faculty,
         o.year,
         o.price::float8 AS price,
         o.email,
         o.phone,
         o.status,
         o.created_at,
         l.id AS lit_id,
         l.name AS lit_name,
         l.price::float8 AS lit_price
       FROM orders o
       INNER JOIN literature l ON l.id = o.literature_id
       WHERE o.id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const r = rows[0];
    res.json({
      id: r.id,
      faculty: r.faculty,
      year: r.year,
      price: r.price,
      email: r.email,
      phone: r.phone,
      status: r.status,
      created_at: r.created_at,
      literature: {
        id: r.lit_id,
        name: r.lit_name,
        price: r.lit_price,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listOrders(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         o.id,
         o.faculty,
         o.year,
         o.price::float8 AS price,
         o.email,
         o.phone,
         o.status,
         o.created_at,
         l.id AS lit_id,
         l.name AS lit_name,
         l.price::float8 AS lit_price
       FROM orders o
       INNER JOIN literature l ON l.id = o.literature_id
       ORDER BY o.created_at DESC`
    );

    const payload = rows.map((r) => ({
      id: r.id,
      faculty: r.faculty,
      year: r.year,
      price: r.price,
      email: r.email,
      phone: r.phone,
      status: r.status,
      created_at: r.created_at,
      literature: {
        id: r.lit_id,
        name: r.lit_name,
        price: r.lit_price,
      },
    }));

    res.json(payload);
  } catch (err) {
    next(err);
  }
}

export const deleteOrderValidators = [
  param("id").isInt({ min: 1 }).toInt(),
];

export async function deleteOrder(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;
    const { rowCount } = await pool.query(`DELETE FROM orders WHERE id = $1`, [
      id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export const patchOrderValidators = [
  param("id").isInt({ min: 1 }).toInt(),
  body("status").isIn(["pending", "completed"]),
];

export async function updateOrderStatus(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE orders SET status = $1 WHERE id = $2
       RETURNING id, faculty, year, price::float8 AS price, email, phone, status, created_at, literature_id`,
      [status, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const lit = await pool.query(
      `SELECT id, name, price::float8 AS price FROM literature WHERE id = $1`,
      [rows[0].literature_id]
    );
    const row = rows[0];
    const l = lit.rows[0];
    res.json({
      id: row.id,
      faculty: row.faculty,
      year: row.year,
      price: row.price,
      email: row.email,
      phone: row.phone,
      status: row.status,
      created_at: row.created_at,
      literature: l
        ? { id: l.id, name: l.name, price: l.price }
        : null,
    });
  } catch (err) {
    next(err);
  }
}
