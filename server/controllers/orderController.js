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
 * Columns every order response is built from.
 *
 * Scope (faculty, year, programme, subject) lives on the LINE, not the order, because a cart
 * may span faculties. An order's scope is therefore whatever its lines say, and the lines
 * come back ordered by faculty then year so the client can group them without sorting.
 *
 * The lines are aggregated in a subquery so an order stays a single row — joining
 * order_items directly would multiply the order across its items and break COUNT(*) and
 * LIMIT.
 */
const ORDER_SELECT = `
  o.id,
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
  (SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', oi.id,
                'materialId', oi.material_id,
                'title', oi.title,
                'quantity', oi.quantity,
                'unitPrice', oi.unit_price::float8,
                'lineTotal', (oi.unit_price * oi.quantity)::float8,
                'materialType', m.material_type,
                'facultyName', oi.faculty_name,
                'yearCode', oi.year_code,
                'yearLabelSr', sy.label_sr,
                'yearLabelEn', sy.label_en,
                'programmeName', prog.name,
                'subjectName', subj.name
              ) ORDER BY oi.faculty_name, sy.sort_order, oi.id
            ), '[]'::json)
     FROM order_items oi
     LEFT JOIN materials m ON m.id = oi.material_id
     LEFT JOIN study_years sy ON sy.id = oi.study_year_id
     LEFT JOIN study_programmes prog ON prog.id = oi.programme_id
     LEFT JOIN subjects subj ON subj.id = oi.subject_id
    WHERE oi.order_id = o.id) AS items`;

const ORDER_FROM = `
  FROM orders o
  LEFT JOIN users u ON u.id = o.user_id`;

function mapOrder(r) {
  return {
    id: r.id,
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
    // Distinct faculty+year pairs the order touches, in the order the lines came back.
    // One entry for an ordinary order; several for a cart spanning faculties or years.
    scopes: (r.items ?? []).reduce((acc, i) => {
      const key = `${i.facultyName}|${i.yearCode}`;
      if (!acc.some((sc) => sc.key === key)) {
        acc.push({
          key,
          facultyName: i.facultyName,
          yearCode: i.yearCode,
          yearLabel: { sr: i.yearLabelSr, en: i.yearLabelEn },
        });
      }
      return acc;
    }, []),
    // Lets the client render only the buttons that will actually succeed.
    allowedTransitions: allowedTransitionsFrom(r.status),
  };
}

/* ------------------------------------------------------------------ create ---- */

export const orderValidators = [
  body("items").isArray({ min: 1, max: 50 }).withMessage("Cart is empty"),
  body("items.*.material_id").isInt({ min: 1 }).toInt(),
  body("items.*.quantity").optional().isInt({ min: 1, max: 99 }).toInt(),
  // Scope is per line: a cart may span faculties and years.
  body("items.*.faculty_id").isInt({ min: 1 }).toInt(),
  body("items.*.year_id").isInt({ min: 1 }).toInt(),
  body("items.*.subject_id").optional({ values: "null" }).isInt({ min: 1 }).toInt(),
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
 * POST /api/orders — student only. Places a whole cart, which may draw on several faculties
 * and years: a language at the Centar za strane jezike alongside a degree programme, or a
 * subject being retaken from an earlier year.
 *
 * Every line is validated against ITS OWN faculty and year, so nothing off-offer can be
 * ordered, and priced from the catalogue — prices are never taken from the request.
 *
 * The recipient address comes from the authenticated account, since the spec ties an order
 * to a verified university address.
 */
export async function createOrder(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, expected_total, phone } = req.body;
    const email = req.user.email;

    // One line per material, matching the unique index on (order_id, material_id): a copy
    // shop hands over one physical copy however many places it was requested from, so
    // quantities are summed and the first scope recorded as provenance.
    const wanted = new Map();
    for (const it of items) {
      const existing = wanted.get(it.material_id);
      if (existing) {
        existing.quantity += it.quantity ?? 1;
      } else {
        wanted.set(it.material_id, {
          materialId: it.material_id,
          facultyId: it.faculty_id,
          yearId: it.year_id,
          subjectId: it.subject_id ?? null,
          quantity: it.quantity ?? 1,
        });
      }
    }
    const ids = [...wanted.keys()];

    // Every (material, faculty, year) the catalogue actually offers among those materials.
    const { rows: offered } = await pool.query(
      `SELECT
         m.id AS material_id,
         m.title,
         m.price::float8 AS price,
         f.id AS faculty_id,
         f.name AS faculty_name,
         y.id AS year_id,
         y.code AS year_code,
         y.label_sr,
         y.label_en,
         ARRAY_AGG(DISTINCT p.id) AS programme_ids
       FROM materials m
       JOIN material_placements pl ON pl.material_id = m.id
       JOIN study_programmes p ON p.id = pl.programme_id AND p.is_active
       JOIN faculties f ON f.id = p.faculty_id AND f.is_active
       JOIN study_years y ON y.id = pl.study_year_id AND y.is_active
      WHERE m.id = ANY($1) AND m.is_active
      GROUP BY m.id, m.title, m.price, f.id, f.name, y.id, y.code, y.label_sr, y.label_en`,
      [ids]
    );

    const offeredBy = new Map(
      offered.map((r) => [`${r.material_id}|${r.faculty_id}|${r.year_id}`, r])
    );

    // Reject per line, naming what failed: the client drops exactly those from the cart.
    const unavailable = [];
    const lines = [];
    for (const w of wanted.values()) {
      const match = offeredBy.get(`${w.materialId}|${w.facultyId}|${w.yearId}`);
      if (!match) {
        unavailable.push(w.materialId);
        continue;
      }
      const programmeIds = match.programme_ids ?? [];
      lines.push({
        materialId: w.materialId,
        title: match.title,
        unitPrice: Number(match.price),
        quantity: w.quantity,
        facultyName: match.faculty_name,
        yearCode: match.year_code,
        yearLabelSr: match.label_sr,
        yearLabelEn: match.label_en,
        studyYearId: w.yearId,
        subjectId: w.subjectId,
        // Only recorded when unambiguous; a material shared by several programmes of one
        // faculty genuinely has no single answer, and the student never chose one.
        programmeId: programmeIds.length === 1 ? programmeIds[0] : null,
      });
    }

    if (unavailable.length > 0) {
      return res.status(400).json({
        error: "Some materials are not available for the faculty and year requested",
        code: "material_unavailable",
        materialIds: unavailable,
      });
    }

    const total =
      Math.round(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100) / 100;

    if (expected_total !== undefined && Math.abs(total - Number(expected_total)) > 0.009) {
      return res.status(400).json({
        error: "The total has changed since you reviewed the order",
        code: "price_mismatch",
        total,
      });
    }

    // Order, lines and the first history row commit together, so no order can exist without
    // items or without an origin entry in the audit trail.
    const client = await pool.connect();
    let created;
    try {
      await client.query("BEGIN");
      const insert = await client.query(
        `INSERT INTO orders (price, email, phone, user_id, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [total, email, phone || null, req.user.id, STATUS.NOVA]
      );
      created = insert.rows[0];

      for (const l of lines) {
        await client.query(
          `INSERT INTO order_items
             (order_id, material_id, quantity, unit_price, title,
              faculty_name, year_code, programme_id, study_year_id, subject_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            created.id,
            l.materialId,
            l.quantity,
            l.unitPrice,
            l.title,
            l.facultyName,
            l.yearCode,
            l.programmeId,
            l.studyYearId,
            l.subjectId,
          ]
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

  // Scope lives on the lines, so an order matches when ANY line does. A cart spanning two
  // faculties therefore appears under both — which is what an operator filtering by faculty
  // wants, since they still have to prepare that order.
  const facultyQ = reqQuery.faculty;
  const faculty =
    typeof facultyQ === "string" ? facultyQ : Array.isArray(facultyQ) ? facultyQ[0] : "";
  if (faculty) {
    conditions.push(
      `EXISTS (SELECT 1 FROM order_items oif
                WHERE oif.order_id = o.id AND oif.faculty_name = $${i++})`
    );
    params.push(faculty);
  }

  const yearQ = reqQuery.year;
  const year =
    typeof yearQ === "string" ? yearQ : Array.isArray(yearQ) ? yearQ[0] : "";
  if (year) {
    conditions.push(
      `EXISTS (SELECT 1 FROM order_items oiy
                WHERE oiy.order_id = o.id AND oiy.year_code = $${i++})`
    );
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
