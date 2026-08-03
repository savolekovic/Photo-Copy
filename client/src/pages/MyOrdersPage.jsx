import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMyOrders, fetchOrderHistory } from "../api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import OrderStatusTimeline from "../components/orders/OrderStatusTimeline.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { apiErrorMessage } from "../lib/apiErrorMessage.js";
import { orderFacultyLabel, orderYearLabel } from "../lib/orderLabels.js";

const PAGE_SIZE = 10;

/**
 * "Student nakon prijave može pregledati istoriju svojih narudžbina i njihov trenutni
 * status." Scoped server-side to the signed-in account.
 */
export default function MyOrdersPage() {
  const { t, locale, formatDate, formatDateTime, formatPrice } = useI18n();

  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [histories, setHistories] = useState({});

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchMyOrders(
          { page, limit: PAGE_SIZE, status: "all" },
          { signal: ac.signal }
        );
        setOrders(data.orders ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        if (typeof data.page === "number") setPage(data.page);
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(apiErrorMessage(err, t));
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [page, t]);

  /** History is fetched lazily, only for the order the student opens. */
  const toggleHistory = useCallback(
    async (id) => {
      setExpandedId((open) => (open === id ? null : id));
      if (histories[id]) return;
      try {
        const data = await fetchOrderHistory(id);
        setHistories((prev) => ({ ...prev, [id]: data.history ?? [] }));
      } catch {
        setHistories((prev) => ({ ...prev, [id]: [] }));
      }
    },
    [histories]
  );

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {t("myOrders.title")}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">{t("myOrders.subtitle")}</p>
      </header>

      {loading && (
        <p className="py-12 text-center text-sm text-slate-500">{t("common.loading")}</p>
      )}

      {!loading && error && (
        <p className="py-8 text-center text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && total === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center">
          <p className="text-sm text-slate-600">{t("myOrders.empty")}</p>
          <p className="mt-2 text-xs text-slate-500">{t("myOrders.emptyHint")}</p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            {t("myOrders.createFirst")}
          </Link>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <>
          <ul className="space-y-3">
            {orders.map((order) => {
              const isReady = order.status === "spremno";
              const expanded = expandedId === order.id;

              return (
                <li
                  key={order.id}
                  className={[
                    "rounded-xl border bg-white p-4 shadow-soft transition-shadow sm:p-5",
                    // A ready order is the one thing the student must act on, so it is
                    // visually promoted rather than left to read as one row among many.
                    isReady ? "border-emerald-300 ring-1 ring-emerald-100" : "border-slate-200/90",
                  ].join(" ")}
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <span className="text-xs font-medium tabular-nums text-slate-500">
                      {t("myOrders.orderNumber", { id: order.id })}
                    </span>
                    <StatusBadge status={order.status} />
                  </div>

                  {order.items?.length > 0 ? (
                    <ul className="space-y-0.5">
                      {order.items.map((it) => (
                        <li key={it.id} className="text-sm font-medium text-slate-900">
                          {it.title}
                          {it.quantity > 1 && (
                            <span className="ml-1 text-xs font-normal text-slate-500">
                              × {it.quantity}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">{t("common.dash")}</p>
                  )}

                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                    <div className="flex gap-1.5">
                      <dt>{t("orders.details.faculty")}:</dt>
                      <dd className="text-slate-700">{orderFacultyLabel(order)}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>{t("orders.details.year")}:</dt>
                      <dd className="text-slate-700">{orderYearLabel(order, locale)}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>{t("common.total")}:</dt>
                      <dd className="tabular-nums text-slate-700">
                        {formatPrice(order.price)}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt>{t("orders.details.created")}:</dt>
                      <dd className="text-slate-700">{formatDate(order.created_at)}</dd>
                    </div>
                  </dl>

                  {isReady && order.pickup_deadline && (
                    <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
                      {t("myOrders.readyBanner", {
                        date: formatDateTime(order.pickup_deadline),
                      })}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleHistory(order.id)}
                    aria-expanded={expanded}
                    className="mt-3 text-xs font-medium text-slate-600 underline hover:text-slate-900"
                  >
                    {t("history.title")}
                  </button>

                  {expanded && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {histories[order.id] ? (
                        <OrderStatusTimeline history={histories[order.id]} />
                      ) : (
                        <p className="text-xs text-slate-500">{t("common.loading")}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                {t("common.showing", { from: rangeStart, to: rangeEnd, total })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
                >
                  {t("common.previous")}
                </button>
                <span className="px-1 text-sm tabular-nums text-slate-600">
                  {t("common.pageOf", { page, totalPages })}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
                >
                  {t("common.next")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
