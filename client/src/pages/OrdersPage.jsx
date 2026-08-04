import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchAdminCatalogue,
  fetchOrderSummary,
  fetchOrders,
  patchOrderStatus,
} from "../api.js";
import OrderDetailsModal from "../components/orders/OrderDetailsModal.jsx";
import OrdersFilterBar from "../components/orders/OrdersFilterBar.jsx";
import OrdersTable from "../components/orders/OrdersTable.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { apiErrorMessage } from "../lib/apiErrorMessage.js";

const PAGE_SIZE = 20;

/**
 * Operator dashboard — "pregled svih pristiglih narudžbina", filtering, detail view and
 * status management. Defaults to the active queue so the landing view is the work still
 * outstanding rather than the full archive.
 */
export default function OrdersPage() {
  const { t } = useI18n();

  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [viewOrderId, setViewOrderId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [summary, setSummary] = useState(null);
  // Filter options come from the administrable catalogue rather than a fixed list.
  const [facultyOptions, setFacultyOptions] = useState([]);
  const [yearOptions, setYearOptions] = useState([]);
  // Bumped after every mutation so both the list and the open modal re-fetch.
  const [version, setVersion] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Driven by the URL so the sidebar links select a view and each is bookmarkable.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") ?? "active";
  const setStatusFilter = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams);
      if (next === "active") params.delete("status");
      else params.set("status", next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );
  const [facultyFilter, setFacultyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [sort, setSort] = useState("date-desc");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch,
      faculty: facultyFilter,
      year: yearFilter,
      sort,
      status: statusFilter,
    }),
    [page, debouncedSearch, facultyFilter, yearFilter, sort, statusFilter]
  );

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchOrders(listParams, { signal: ac.signal });
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
  }, [listParams, version, t]);

  // Summary is independent of the filters — it always describes the whole queue.
  useEffect(() => {
    const ac = new AbortController();
    fetchOrderSummary({ signal: ac.signal })
      .then(setSummary)
      .catch(() => setSummary(null));
    return () => ac.abort();
  }, [version]);

  // Faculty and year filter options. Fetched once; the catalogue changes rarely.
  useEffect(() => {
    const ac = new AbortController();
    fetchAdminCatalogue({ signal: ac.signal })
      .then((c) => {
        setFacultyOptions(c.faculties ?? []);
        setYearOptions(c.years ?? []);
      })
      .catch(() => {
        // Filters simply offer nothing if this fails; the list itself still works.
      });
    return () => ac.abort();
  }, []);

  const handleStatusChange = useCallback(
    async (id, status) => {
      setBusyId(id);
      setNotice(null);
      try {
        const updated = await patchOrderStatus(id, status);

        // Only the ready transition sends mail, so only it reports delivery.
        if (status === "spremno") {
          setNotice({
            tone: updated.emailSent ? "success" : "warning",
            message: updated.emailSent
              ? t("orders.readyEmailSent")
              : t("orders.readyEmailFailed"),
          });
        }
        setVersion((v) => v + 1);
      } catch (err) {
        setNotice({ tone: "error", message: apiErrorMessage(err, t) });
        // Re-sync regardless: a rejected transition usually means someone else already
        // moved the order, so the local copy is the stale one.
        setVersion((v) => v + 1);
      } finally {
        setBusyId(null);
      }
    },
    [t]
  );

  const hasFilters =
    Boolean(debouncedSearch) ||
    Boolean(facultyFilter) ||
    Boolean(yearFilter) ||
    statusFilter !== "active";

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="w-full px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-slate-500">
            {t("orders.roleBadge")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {t("orders.title")}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">{t("orders.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setVersion((v) => v + 1)}
          disabled={loading}
          className="self-start rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-900 disabled:opacity-50"
        >
          {t("common.refresh")}
        </button>
      </div>

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile
            label={t("orders.summary.nova")}
            value={summary.counts?.nova ?? 0}
            onClick={() => {
              setStatusFilter("nova");
              setPage(1);
            }}
          />
          <SummaryTile
            label={t("orders.summary.u_pripremi")}
            value={summary.counts?.u_pripremi ?? 0}
            onClick={() => {
              setStatusFilter("u_pripremi");
              setPage(1);
            }}
          />
          <SummaryTile
            label={t("orders.summary.spremno")}
            value={summary.counts?.spremno ?? 0}
            onClick={() => {
              setStatusFilter("spremno");
              setPage(1);
            }}
          />
          <SummaryTile
            label={t("orders.summary.overdue")}
            value={summary.overdue ?? 0}
            tone={summary.overdue > 0 ? "danger" : "default"}
            onClick={() => {
              setStatusFilter("spremno");
              setPage(1);
            }}
          />
        </div>
      )}

      {notice && (
        <div
          role="status"
          className={[
            "mb-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : notice.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-rose-200 bg-rose-50 text-rose-900",
          ].join(" ")}
        >
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-xs font-medium underline"
          >
            {t("common.close")}
          </button>
        </div>
      )}

      <OrdersFilterBar
        search={searchInput}
        onSearchChange={setSearchInput}
        statusFilter={statusFilter}
        onStatusChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        facultyFilter={facultyFilter}
        onFacultyChange={(v) => {
          setFacultyFilter(v);
          setPage(1);
        }}
        yearFilter={yearFilter}
        onYearChange={(v) => {
          setYearFilter(v);
          setPage(1);
        }}
        sort={sort}
        onSortChange={(v) => {
          setSort(v);
          setPage(1);
        }}
        facultyOptions={facultyOptions}
        yearOptions={yearOptions}
      />

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
          <p className="text-sm text-slate-600">
            {hasFilters ? t("orders.empty.filtered") : t("orders.empty.active")}
          </p>
          {!hasFilters && (
            <p className="mt-2 text-xs text-slate-500">{t("orders.empty.activeHint")}</p>
          )}
        </div>
      )}

      {!loading && !error && total > 0 && (
        <>
          <OrdersTable
            orders={orders}
            onView={(id) => setViewOrderId(id)}
            onStatusChange={handleStatusChange}
            busyId={busyId}
          />

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              {t("common.showing", { from: rangeStart, to: rangeEnd, total })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
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
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
              >
                {t("common.next")}
              </button>
            </div>
          </div>
        </>
      )}

      <OrderDetailsModal
        orderId={viewOrderId}
        onClose={() => setViewOrderId(null)}
        onStatusChange={handleStatusChange}
        busy={busyId === viewOrderId}
        refreshKey={version}
      />
    </div>
  );
}

function SummaryTile({ label, value, tone = "default", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl border bg-white p-4 text-left shadow-soft transition-colors hover:bg-slate-50",
        tone === "danger" ? "border-rose-200" : "border-slate-200",
      ].join(" ")}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={[
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "danger" && value > 0 ? "text-rose-700" : "text-slate-900",
        ].join(" ")}
      >
        {value}
      </p>
    </button>
  );
}
