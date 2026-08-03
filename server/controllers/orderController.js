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

/**
 * Columns every order response is built from. The lines are aggregated in a subquery so an
 * order stays a single row — joining order_items directly would multiply the order across
 * its items and break both COUNT(*) and LIMIT.
 */
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
  o.programme_id,
  prog.name AS programme_name,
  sy.label_sr AS year_label_sr,
  sy.label_en AS year_label_en,
  (SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', oi.id,
                'materialId', oi.material_id,
                'title', oi.title,
                'quantity', oi.quantity,
                'unitPrice', oi.unit_price::float8,
                'lineTotal', (oi.unit_price * oi.quantity)::float8,
                'materialType', m.material_type
              ) ORDER BY oi.id
            ), '[]'::json)
     FROM order_items oi
     LEFT JOIN materials m ON m.id = oi.material_id
    WHERE oi.order_id = o.id) AS items`;

const ORDER_FROM = `
  FROM orders o
  LEFT JOIN users u ON u.id = o.user_id
  LEFT JOIN study_programmes prog ON prog.id = o.programme_id
  LEFT JOIN study_years sy ON sy.id = o.study_year_id`;

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
    items: r.items ?? [],
    itemCount: (r.items ?? []).reduce((n, i) => n + i.quantity, 0),
    programme: r.programme_id ? { id: r.programme_id, name: r.programme_name } : null,
    // Both labels travel with the order so the client can render it in either language
    // without holding a study-years lookup. Falls back to the stored code for legacy rows.
    yearLabel: { sr: r.year_label_sr, en: r.year_label_en },
    // Lets the client render only the buttons that will actually succeed.
    allowedTransitions: allowedTransitionsFrom(r.status),
  };
}

/* ------------------------------------------------------------------ create ---- */

export const orderValidators = [
  body("faculty_id").isInt({ min: 1 }).toInt(),
  body("year_id").isInt({ min: 1 }).toInt(),
  body("items").isArray({ min: 1, max: 50 }).withMessage("Cart is empty"),
  body("items.*.material_id").isInt({ min: 1 }).toInt(),
  body("items.*.quantity").optional().isInt({ min: 1, max: 99 }).toInt(),
  // What the student was shown. Optional, but when present it must agree with what the
  // catalogue says now, so a price edited mid-session cannot silently change the charge.
  body("expected_total").optional({ values: "falsy" }).isFloat({ min: 0 }).toFloat(),
  body("phone")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 40 })
    .withMessage("Phone is too long"),
];

/**
 * POST /api/orders — student only. Places a whole cart.
 *
 * Prices are never taken from the request: each line is priced from the catalogue and the
 * total is summed server-side. Every material must genuinely be placed in the chosen
 * faculty and year, so nothing off-offer can be ordered.
 *
 * The recipient address comes from the authenticated account for the same reason — the
 * spec ties an order to a verified university address.
 */
export async function createOrder(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { faculty_id, year_id, items, expected_total, phone } = req.body;
    const email = req.user.email;

    // Collapse duplicate lines for the same material rather than rejecting them: the unique
    // index allows only one row per material, and summing is what the student meant.
    const wanted = new Map();
    for (const it of items) {
      wanted.set(it.material_id, (wanted.get(it.material_id) ?? 0) + (it.quantity ?? 1));
    }
    const ids = [...wanted.keys()];

    const { rows: available } = await pool.query(
      `SELECT
         m.id,
         m.title,
         m.price::float8 AS price,
         f.name AS faculty_name,
         y.code AS year_code,
         ARRAY_AGG(DISTINCT p.id) AS programme_ids
       FROM materials m
       JOIN material_placements pl ON pl.material_id = m.id
       JOIN study_programmes p ON p.id = pl.programme_id AND p.is_active
       JOIN faculties f ON f.id = p.faculty_id AND f.is_active
       JOIN study_years y ON y.id = pl.study_year_id AND y.is_active
      WHERE m.id = ANY($1) AND f.id = $2 AND pl.study_year_id = $3 AND m.is_active
      GROUP BY m.id, m.title, m.price, f.name, y.code`,
      [ids, faculty_id, year_id]
    );

    // Anything the student asked for that is not on offer here.
    const found = new Set(available.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return res.status(400).json({
        error: "Some materials are not available for the selected faculty and year",
        code: "material_unavailable",
        materialIds: missing,
      });
    }

    const lines = available.map((r) => ({
      materialId: r.id,
      title: r.title,
      unitPrice: Number(r.price),
      quantity: wanted.get(r.id),
    }));
    const total =
      Math.round(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100) / 100;

    if (expected_total !== undefined && Math.abs(total - Number(expected_total)) > 0.009) {
      return res.status(400).json({
        error: "The total has changed since you reviewed the order",
        code: "price_mismatch",
        total,
      });
    }

    // The spec has the student choose a faculty, not a programme, so a cart whose materials
    // span several programmes of that faculty is genuinely ambiguous. Record a programme
    // only when every line agrees on exactly one.
    const programmeSets = available.map((r) => new Set(r.programme_ids ?? []));
    const commonProgrammes = programmeSets.reduce(
      (acc, set) => (acc === null ? set : new Set([...acc].filter((x) => set.has(x)))),
      null
    );
    const programmeId =
      commonProgrammes && commonProgrammes.size === 1 ? [...commonProgrammes][0] : null;

    const facultyName = available[0].faculty_name;
    const yearCode = available[0].year_code;

    // Order, its lines and its first history row all commit together, so no order can
    // exist without items or without an origin entry in the audit trail.
    const client = await pool.connect();
    let created;
    try {
      await client.query("BEGIN");
      const insert = await client.query(
        `INSERT INTO orders
           (faculty, year, price, email, phone, user_id, status, programme_id, study_year_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, created_at`,
        [
          facultyName,
          yearCode,
          total,
          email,
          phone || null,
          req.user.id,
          STATUS.NOVA,
          programmeId,
          year_id,
        ]
      );
      created = insert.rows[0];

      for (const l of lines) {
        await client.query(
          `INSERT INTO order_items (order_id, material_id, quantity, unit_price, title)
           VALUES ($1, $2, $3, $4, $5)`,
          [created.id, l.materialId, l.quantity, l.unitPrice, l.title]
        );
      }

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

    // Mail is sent after the commit: a delivery failure must not lose a persisted order.
    let emailSent = false;
    let emailError = null;
    try {
      const result = await sendOrderConfirmationEmails({
        orderId: created.id,
        createdAt: created.created_at,
        faculty: facultyName,
        year: yearCode,
        items: lines,
        price: total,
        email,
        phone: phone || "",
        locale: req.user.locale,
      });
      emailSent = result.sent === true;
    } catch (mailErr) {
      console.error("[email]", mailErr);
      emailError =
        mailErr.message || mailErr.response || "Email delivery failed (see server logs)";
    }

    return res.status(201).json({
      id: created.id,
      created_at: created.created_at,
      status: STATUS.NOVA,
      total,
      itemCount: lines.reduce((n, l) => n + l.quantity, 0),
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

  // faculty and year are historical text snapshots on the order, and the real values now
  // live in administrable tables, so there is no fixed list to validate against. An
  // unknown value simply matches nothing — the query is parameterised either way.
  const facultyQ = reqQuery.faculty;
  const faculty =
    typeof facultyQ === "string" ? facultyQ : Array.isArray(facultyQ) ? facultyQ[0] : "";
  if (faculty) {
    conditions.push(`o.faculty = $${i++}`);
    params.push(faculty);
  }

  const yearQ = reqQuery.year;
  const year =
    typeof yearQ === "string" ? yearQ : Array.isArray(yearQ) ? yearQ[0] : "";
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
      `(o.email ILIKE $${i}
         OR COALESCE(u.index_number, '') ILIKE $${i}
         OR EXISTS (
              SELECT 1 FROM order_items oi
               WHERE oi.order_id = o.id AND oi.title ILIKE $${i}
            ))`
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
          items: order.items,
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
