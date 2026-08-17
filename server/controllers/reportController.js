import { query, validationResult } from "express-validator";
import { pool } from "../db/pool.js";
import { STATUS } from "../lib/statuses.js";

/**
 * The production report: how many copies of each material the shop has to prepare.
 *
 * Without it the operator reads every ticket by hand and tallies titles on paper. This does
 * the tally: one row per material, with the copies summed across every order in scope.
 *
 * Two ways to choose the orders, both of which the shop asked for:
 *   - a period — everything placed between two dates, which is the daily/weekly worksheet;
 *   - explicit ticket ids — when the operator has picked a batch out of the queue.
 *
 * Ids win when both are supplied: an explicit selection is a stronger statement of intent
 * than a date range that happens to still be set in the form.
 */

/** Orders whose copies still have to be produced. The default, because that is the question. */
const PENDING = [STATUS.NOVA, STATUS.U_PRIPREMI];
/** Already produced. Included only on request, for "what did we get through" reporting. */
const DONE = [STATUS.SPREMNO, STATUS.PREUZETO];

export const productionReportValidators = [
  query("from").optional({ values: "falsy" }).isISO8601().withMessage("from must be a date"),
  query("to").optional({ values: "falsy" }).isISO8601().withMessage("to must be a date"),
  query("include_done").optional().isBoolean().toBoolean(),
  // A hand-picked batch. Capped so one request cannot ask for the entire table by id.
  query("order_ids")
    .optional({ values: "falsy" })
    .customSanitizer((value) =>
      String(value)
        .split(",")
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 500)
    )
    .custom((ids) => ids.length > 0)
    .withMessage("order_ids must contain at least one order id"),
];

/**
 * GET /api/reports/production — operator only.
 *
 * Cancelled orders are never counted: nobody prepares copies for an order that was called
 * off, in either mode.
 */
export async function getProductionReport(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { from, to, include_done: includeDone, order_ids: orderIds } = req.query;
    const statuses = includeDone ? [...PENDING, ...DONE] : PENDING;

    const conditions = ["o.status <> $1"];
    const params = [STATUS.OTKAZANO];
    let i = 2;

    if (orderIds && orderIds.length > 0) {
      conditions.push(`o.id = ANY($${i++}::int[])`);
      params.push(orderIds);
    } else {
      conditions.push(`o.status = ANY($${i++}::text[])`);
      params.push(statuses);
      if (from) {
        conditions.push(`o.created_at >= $${i++}::timestamptz`);
        params.push(from);
      }
      if (to) {
        // Exclusive upper bound on the day after, so a single date covers that whole day
        // rather than only its first instant.
        conditions.push(`o.created_at < ($${i++}::date + INTERVAL '1 day')`);
        params.push(to);
      }
    }

    const where = conditions.join(" AND ");

    // Grouped by material id, not by the line's title: `order_items.title` is a snapshot, so
    // a material renamed between two orders would otherwise split into two rows with the
    // total divided between them. The displayed title is the catalogue's current one — that
    // is what the operator will be looking for today — falling back to the snapshot for a
    // material since deleted.
    const { rows } = await pool.query(
      `SELECT
         oi.material_id                                    AS "materialId",
         COALESCE(m.title, MIN(oi.title))                  AS title,
         m.material_type                                   AS "materialType",
         SUM(oi.quantity)::int                             AS copies,
         COUNT(DISTINCT o.id)::int                         AS orders,
         BOOL_OR(m.id IS NULL)                             AS "removedFromCatalogue"
       FROM order_items oi
       JOIN orders o          ON o.id = oi.order_id
       LEFT JOIN materials m  ON m.id = oi.material_id
       WHERE ${where}
       GROUP BY oi.material_id, m.title, m.material_type
       ORDER BY SUM(oi.quantity) DESC, COALESCE(m.title, MIN(oi.title))`,
      params
    );

    // Counted over orders, not summed from the rows above, so an order contributing several
    // materials is still one ticket.
    const { rows: totals } = await pool.query(
      `SELECT
         COUNT(DISTINCT o.id)::int AS "orderCount",
         COALESCE(SUM(oi.quantity), 0)::int AS "copyCount"
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE ${where}`,
      params
    );

    // A hand-picked batch can contain tickets that contribute nothing — cancelled, or an id
    // that no longer exists. Silently returning an empty report reads as "these orders have no
    // materials", which is not the same thing, so name them.
    let ignoredOrderIds = [];
    if (orderIds && orderIds.length > 0) {
      const { rows: counted } = await pool.query(
        `SELECT DISTINCT o.id
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
          WHERE o.id = ANY($1::int[]) AND o.status <> $2`,
        [orderIds, STATUS.OTKAZANO]
      );
      const kept = new Set(counted.map((r) => r.id));
      ignoredOrderIds = orderIds.filter((id) => !kept.has(id));
    }

    return res.json({
      rows,
      ignoredOrderIds,
      totals: {
        materials: rows.length,
        copies: totals[0]?.copyCount ?? 0,
        orders: totals[0]?.orderCount ?? 0,
      },
      // Echoed back so the client can label the printout with what it actually covers.
      scope:
        orderIds && orderIds.length > 0
          ? { mode: "orders", orderIds }
          : { mode: "period", from: from ?? null, to: to ?? null, includeDone: Boolean(includeDone) },
    });
  } catch (err) {
    return next(err);
  }
}
