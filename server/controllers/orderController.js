import { body, param, validationResult } from "express-validator";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import {
  ACTIVE_STATUSES,
  ORDER_STATUSES,
  STATUS,
  allowedTransitionsFrom,
  canTransition,
} from "../lib/statuses.js";
import {
  sendOrderConfirmationEmails,
  sendOrderReadyEmail,
} from "../services/emailService.js";

const FACULTIES = [
  "Law",
  "Economics",
  "Engineering",
  "Medicine",
  "Arts",
  "Sciences",
];

const YEARS = ["1st", "2nd", "3rd", "4th", "Master"];

/** Columns every order response is built from. */
const ORDER_SELECT = `
  o.id,
  o.faculty,
  o.year,
  o.price::float8 AS price,
  o.email,
  o.phone,
  o.status,
  o.created_at,
  o.updated_at,
  o.ready_at,
  o.picked_up_at,
  o.pickup_deadline,
  o.reminder_count,
  o.last_reminder_at,
  o.user_id,
  u.index_number AS student_index_number,
  l.id AS lit_id,
  l.name AS lit_name,
  l.price::float8 AS lit_price`;

const ORDER_FROM = `
  FROM orders o
  INNER JOIN literature l ON l.id = o.literature_id
  LEFT JOIN users u ON u.id = o.user_id`;

function mapOrder(r) {
  return {
    id: r.id,
    faculty: r.faculty,
    year: r.year,
    price: r.price,
    email: r.email,
    phone: r.phone,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    ready_at: r.ready_at,
    picked_up_at: r.picked_up_at,
    pickup_deadline: r.pickup_deadline,
    reminder_count: r.reminder_count,
    last_reminder_at: r.last_reminder_at,
    student: {
      id: r.user_id,
      email: r.email,
      indexNumber: r.student_index_number,
    },
    literature: {
      id: r.lit_id,
      name: r.lit_name,
      price: r.lit_price,
    },
    // Lets the client render only the buttons that will actually succeed.
    allowedTransitions: allowedTransitionsFrom(r.status),
  };
}

/* ------------------------------------------------------------------ create ---- */

export const orderValidators = [
  body("faculty").isIn(FACULTIES).withMessage("Invalid faculty"),
  body("year").isIn(YEARS).withMessage("Invalid year"),
  body("literature_id").isInt({ min: 1 }).toInt(),
  body("price").isFloat({ min: 0 }).toFloat(),
  body("phone")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 40 })
    .withMessage("Phone is too long"),
];

/**
 * POST /api/orders — student only.
 *
 * The recipient address is taken from the authenticated account, never from the request
 * body: the spec ties an order to a verified university address, and accepting a
 * client-supplied address would let anyone direct confirmations elsewhere.
 */
export async function createOrder(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { faculty, year, literature_id, price, phone } = req.body;
    const email = req.user.email;

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

    // Insert the order and its first history row together, so no order can exist
    // without an origin entry in the audit trail.
    const client = await pool.connect();
    let created;
    try {
      await client.query("BEGIN");
      const insert = await client.query(
        `INSERT INTO orders (faculty, year, literature_id, price, email, phone, user_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [
          faculty,
          year,
          literature_id,
          submitted,
          email,
          phone || null,
          req.user.id,
          STATUS.NOVA,
        ]
      );
      created = insert.rows[0];
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_by_role, note)
         VALUES ($1, NULL, $2, $3, $4, 'Order placed')`,
        [created.id, STATUS.NOVA, req.user.id, req.user.role]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Mail is sent after the commit and never blocks the response contract: a delivery
    // failure must not lose a persisted order.
    let emailSent = false;
    let emailError = null;
    try {
      const result = await sendOrderConfirmationEmails({
        orderId: created.id,
        createdAt: created.created_at,
        faculty,
        year,
        literatureName: row.name,
        price: submitted,
        email,
        phone: phone || "",
        locale: req.user.locale,
      });
      emailSent = result.sent === true;
    } catch (mailErr) {
      console.error("[email]", mailErr);
      emailError =
        mailErr.message ||
        mailErr.response ||
        "Email delivery failed (see server logs)";
    }

    return res.status(201).json({
      id: created.id,
      created_at: created.created_at,
      status: STATUS.NOVA,
      emailSent,
      ...(emailError ? { emailError } : {}),
    });
  } catch (err) {
    return next(err);
  }
}

/* -------------------------------------------------------------------- read ---- */

export const getOrderValidators = [param("id").isInt({ min: 1 }).toInt()];

async function fetchStatusHistory(orderId) {
  const { rows } = await pool.query(
    `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at,
            h.changed_by, h.changed_by_role, u.email AS changed_by_email
       FROM order_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.order_id = $1
      ORDER BY h.created_at ASC, h.id ASC`,
    [orderId]
  );
  return rows.map((r) => ({
    id: r.id,
    from: r.from_status,
    to: r.to_status,
    note: r.note,
    at: r.created_at,
    by: r.changed_by
      ? { id: r.changed_by, email: r.changed_by_email, role: r.changed_by_role }
      : null, // null = automatic/system action
  }));
}

/**
 * GET /api/orders/:id — an operator may read any order; a student only their own.
 * Returns 404 rather than 403 for someone else's order so the endpoint cannot be used to
 * probe which order IDs exist.
 */
export async function getOrderById(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;

    const params = [id];
    let ownership = "";
    if (req.user.role === "student") {
      ownership = " AND o.user_id = $2";
      params.push(req.user.id);
    }

    const { rows } = await pool.query(
      `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.id = $1${ownership}`,
      params
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({
      ...mapOrder(rows[0]),
      history: await fetchStatusHistory(id),
    });
  } catch (err) {
    return next(err);
  }
}

const SORT_OPTIONS = ["date-desc", "date-asc", "price-desc", "price-asc"];

const ORDER_BY = {
  "date-asc": "o.created_at ASC",
  "date-desc": "o.created_at DESC",
  "price-asc": "o.price ASC",
  "price-desc": "o.price DESC",
};

/**
 * Shared filter/sort/paginate builder for both list endpoints.
 * `statusFilter` accepts a concrete status, "active" (the operator default) or "all".
 */
function buildListQuery(reqQuery, extraConditions = [], extraParams = []) {
  const conditions = [...extraConditions];
  const params = [...extraParams];
  let i = params.length + 1;

  const statusRaw =
    typeof reqQuery.status === "string" ? reqQuery.status.trim() : "active";

  if (statusRaw === "all") {
    // no status predicate
  } else if (statusRaw === "active" || statusRaw === "") {
    conditions.push(`o.status = ANY($${i++})`);
    params.push(ACTIVE_STATUSES);
  } else if (ORDER_STATUSES.includes(statusRaw)) {
    conditions.push(`o.status = $${i++}`);
    params.push(statusRaw);
  } else {
    return { error: "Invalid status filter" };
  }

  const facultyQ = reqQuery.faculty;
  const faculty =
    typeof facultyQ === "string" ? facultyQ : Array.isArray(facultyQ) ? facultyQ[0] : "";
  if (faculty !== "" && !FACULTIES.includes(faculty)) {
    return { error: "Invalid faculty filter" };
  }
  if (faculty) {
    conditions.push(`o.faculty = $${i++}`);
    params.push(faculty);
  }

  const yearQ = reqQuery.year;
  const year =
    typeof yearQ === "string" ? yearQ : Array.isArray(yearQ) ? yearQ[0] : "";
  if (year !== "" && !YEARS.includes(year)) {
    return { error: "Invalid year filter" };
  }
  if (year) {
    conditions.push(`o.year = $${i++}`);
    params.push(year);
  }

  const searchRaw = typeof reqQuery.search === "string" ? reqQuery.search : "";
  const search = searchRaw.trim().slice(0, 200);
  // Strip LIKE wildcards so a user's "%" is treated as text, not as a pattern.
  const safePattern =
    search.length > 0
      ? `%${search.replace(/[%_\\]/g, "").replace(/\s+/g, " ")}%`
      : "";
  if (safePattern) {
    conditions.push(
      `(o.email ILIKE $${i} OR l.name ILIKE $${i} OR COALESCE(u.index_number, '') ILIKE $${i})`
    );
    params.push(safePattern);
    i++;
  }

  let page = parseInt(String(reqQuery.page ?? "1"), 10);
  if (Number.isNaN(page) || page < 1) page = 1;

  let limit = parseInt(String(reqQuery.limit ?? "20"), 10);
  if (Number.isNaN(limit) || limit < 1) limit = 20;
  limit = Math.min(100, limit);

  const sort = SORT_OPTIONS.includes(reqQuery.sort) ? reqQuery.sort : "date-desc";

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
    nextIndex: i,
    page,
    limit,
    orderBy: ORDER_BY[sort],
  };
}

async function runListQuery(built, res) {
  const baseFrom = `${ORDER_FROM} ${built.whereClause}`;

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS c ${baseFrom}`,
    built.params
  );
  const total = countRows[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / built.limit));
  const safePage = Math.min(Math.max(1, built.page), totalPages);
  const offset = (safePage - 1) * built.limit;

  const { rows } = await pool.query(
    `SELECT ${ORDER_SELECT} ${baseFrom}
      ORDER BY ${built.orderBy}
      LIMIT $${built.nextIndex} OFFSET $${built.nextIndex + 1}`,
    [...built.params, built.limit, offset]
  );

  return res.json({
    orders: rows.map(mapOrder),
    total,
    page: safePage,
    limit: built.limit,
    totalPages,
  });
}

/** GET /api/orders — operator dashboard. Defaults to the active queue. */
export async function listOrders(req, res, next) {
  try {
    const built = buildListQuery(req.query);
    if (built.error) return res.status(400).json({ error: built.error });
    return await runListQuery(built, res);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/orders/mine — the student's own order history.
 * Defaults to every status, because a student wants their full history, whereas an
 * operator wants the work still outstanding.
 */
export async function listMyOrders(req, res, next) {
  try {
    const query = { ...req.query, status: req.query.status ?? "all" };
    const built = buildListQuery(query, ["o.user_id = $1"], [req.user.id]);
    if (built.error) return res.status(400).json({ error: built.error });
    return await runListQuery(built, res);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/orders/summary — counts per status for the operator landing page. */
export async function getOrderSummary(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status`
    );
    const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
    for (const r of rows) counts[r.status] = r.count;

    const active = ACTIVE_STATUSES.reduce((sum, s) => sum + counts[s], 0);

    // Orders already past their pickup deadline but still uncollected.
    const { rows: overdueRows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM orders
        WHERE status = $1 AND pickup_deadline IS NOT NULL AND pickup_deadline < NOW()`,
      [STATUS.SPREMNO]
    );

    return res.json({
      counts,
      active,
      overdue: overdueRows[0]?.c ?? 0,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ status ---- */

export const patchStatusValidators = [
  param("id").isInt({ min: 1 }).toInt(),
  body("status").isIn(ORDER_STATUSES),
  body("note").optional({ values: "falsy" }).isString().trim().isLength({ max: 500 }),
];

/**
 * PATCH /api/orders/:id/status — operator only.
 *
 * Validates the move against the transition map, writes the order row and its audit entry
 * in one transaction, and stamps the lifecycle timestamps. The ready-for-pickup e-mail is
 * sent only after the transaction commits, so a mail failure cannot roll back a status
 * change the operator has already been told about — nor can a student be told an order is
 * ready when the write actually failed.
 */
export async function updateOrderStatus(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status: nextStatus, note } = req.body;

    const client = await pool.connect();
    let updated;
    let previousStatus;
    try {
      await client.query("BEGIN");

      // FOR UPDATE serialises two operators clicking at the same time; the loser then
      // fails the transition check instead of silently overwriting.
      const { rows: currentRows } = await client.query(
        `SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (currentRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Order not found" });
      }

      previousStatus = currentRows[0].status;

      if (previousStatus === nextStatus) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `Order is already "${nextStatus}"`,
          code: "same_status",
          status: previousStatus,
        });
      }
      if (!canTransition(previousStatus, nextStatus)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `Cannot move an order from "${previousStatus}" to "${nextStatus}"`,
          code: "illegal_transition",
          status: previousStatus,
          allowedTransitions: allowedTransitionsFrom(previousStatus),
        });
      }

      // Lifecycle timestamps, keyed off the destination status.
      const isReady = nextStatus === STATUS.SPREMNO;
      const isPickedUp = nextStatus === STATUS.PREUZETO;

      const { rows: updatedRows } = await client.query(
        `UPDATE orders
            SET status = $2,
                updated_at = NOW(),
                ready_at = CASE WHEN $3 THEN NOW() ELSE ready_at END,
                pickup_deadline = CASE
                  WHEN $3 THEN NOW() + ($5 || ' days')::interval
                  ELSE pickup_deadline END,
                picked_up_at = CASE WHEN $4 THEN NOW() ELSE picked_up_at END,
                -- Re-marking an order ready restarts the reminder clock from zero.
                reminder_count = CASE WHEN $3 THEN 0 ELSE reminder_count END,
                last_reminder_at = CASE WHEN $3 THEN NULL ELSE last_reminder_at END
          WHERE id = $1
        RETURNING id`,
        [id, nextStatus, isReady, isPickedUp, String(config.pickupDeadlineDays)]
      );

      await client.query(
        `INSERT INTO order_status_history
           (order_id, from_status, to_status, changed_by, changed_by_role, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, previousStatus, nextStatus, req.user.id, req.user.role, note || null]
      );

      await client.query("COMMIT");
      updated = updatedRows[0];
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Re-read through the standard projection so the response shape matches the list.
    const { rows } = await pool.query(
      `SELECT ${ORDER_SELECT} ${ORDER_FROM} WHERE o.id = $1`,
      [updated.id]
    );
    const order = mapOrder(rows[0]);

    let emailSent = false;
    let emailError = null;
    if (nextStatus === STATUS.SPREMNO) {
      try {
        // Prefer the student's stored language; fall back to the default for legacy
        // orders that have no linked account.
        const { rows: localeRows } = await pool.query(
          `SELECT locale FROM users WHERE id = $1`,
          [rows[0].user_id]
        );
        const result = await sendOrderReadyEmail({
          orderId: order.id,
          createdAt: order.created_at,
          faculty: order.faculty,
          year: order.year,
          literatureName: order.literature.name,
          price: order.price,
          email: order.email,
          phone: order.phone || "",
          pickupDeadline: order.pickup_deadline,
          locale: localeRows[0]?.locale ?? config.defaultLocale,
        });
        emailSent = result.sent === true;
      } catch (mailErr) {
        console.error("[email] ready-for-pickup notification failed:", mailErr);
        emailError = mailErr.message || "Email delivery failed (see server logs)";
      }
    }

    return res.json({
      ...order,
      previousStatus,
      ...(nextStatus === STATUS.SPREMNO ? { emailSent } : {}),
      ...(emailError ? { emailError } : {}),
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/orders/:id/history — the audit trail on its own. */
export async function getOrderHistory(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;

    const params = [id];
    let ownership = "";
    if (req.user.role === "student") {
      ownership = " AND user_id = $2";
      params.push(req.user.id);
    }
    const { rows } = await pool.query(
      `SELECT id FROM orders WHERE id = $1${ownership}`,
      params
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({ history: await fetchStatusHistory(id) });
  } catch (err) {
    return next(err);
  }
}
