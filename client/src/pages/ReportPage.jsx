import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchProductionReport } from "../api.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { apiErrorMessage } from "../lib/apiErrorMessage.js";
import ReportPrintSheet from "../components/orders/ReportPrintSheet.jsx";

/**
 * The production report. Answers one question: how many copies of each material do I have to
 * prepare — without reading every ticket and tallying titles on paper.
 *
 * Everything lives in the query string, so a particular report is a link the operator can
 * bookmark or send, and a refresh does not lose it.
 *
 * Two modes. A period is the everyday one and is what the page opens in. An explicit set of
 * ticket ids arrives when the operator has ticked rows in the queue; that selection then
 * overrides the dates entirely, and the page says so rather than showing date controls that
 * no longer affect the numbers.
 */

/** Local YYYY-MM-DD. `toISOString` would shift the date near midnight in a +02:00 zone. */
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function presetRange(preset) {
  const today = new Date();
  if (preset === "today") return { from: isoDate(today), to: isoDate(today) };
  if (preset === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: isoDate(start), to: isoDate(today) };
  }
  if (preset === "month") {
    return {
      from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: isoDate(today),
    };
  }
  // No dates at all. Marked explicitly rather than left blank, so it survives a reload and
  // cannot be mistaken for "the operator has not chosen yet".
  return { from: null, to: null, range: "all" };
}

export default function ReportPage() {
  const { t, tn, formatDate } = useI18n();
  const [params, setParams] = useSearchParams();

  const orderIds = useMemo(() => {
    const raw = params.get("orders");
    if (!raw) return [];
    return raw
      .split(",")
      .map((n) => Number.parseInt(n.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
  }, [params]);

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const allTime = params.get("range") === "all";
  const includeDone = params.get("done") === "1";
  const bySelection = orderIds.length > 0;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Opening the page with nothing set would report on all of history, which is never what the
  // operator wants first. The current month is the useful default.
  useEffect(() => {
    if (bySelection || allTime || from || to) return;
    const range = presetRange("month");
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("from", range.from);
        next.set("to", range.to);
        return next;
      },
      { replace: true }
    );
  }, [bySelection, allTime, from, to, setParams]);

  useEffect(() => {
    if (!bySelection && !allTime && !from && !to) return; // waiting for the default above
    const ac = new AbortController();
    setLoading(true);
    setError("");
    fetchProductionReport(
      bySelection ? { orderIds } : { from: allTime ? "" : from, to: allTime ? "" : to, includeDone },
      { signal: ac.signal }
    )
      .then(setData)
      .catch((e) => {
        if (e.name === "AbortError") return;
        setError(apiErrorMessage(e, t));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [bySelection, allTime, orderIds, from, to, includeDone, t]);

  const update = useCallback(
    (changes) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        return next;
      });
    },
    [setParams]
  );

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  const rangeLabel = useMemo(() => {
    if (allTime || (!from && !to)) return t("report.scope.periodAll");
    if (from && to && from === to) return formatDate(from);
    return `${from ? formatDate(from) : "…"} – ${to ? formatDate(to) : "…"}`;
  }, [allTime, from, to, formatDate, t]);

  const CTL =
    "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/15";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {data && (
        <ReportPrintSheet
          rows={rows}
          totals={totals}
          scopeLabel={bySelection ? t("report.scope.orders", { ids: orderIds.join(", ") }) : rangeLabel}
          statusLabel={
            bySelection
              ? null
              : includeDone
                ? t("report.scope.includingDone")
                : t("report.scope.pendingOnly")
          }
        />
      )}

      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {t("report.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("report.subtitle")}</p>
      </header>

      {bySelection ? (
        // A hand-picked batch. Date controls are hidden rather than disabled: showing inputs
        // that no longer change the numbers would be a lie about what the report covers.
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-700">
            {t("report.scope.orders", { ids: orderIds.join(", ") })}
          </span>
          <Link
            to="/narudzbine"
            className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
          >
            {t("report.backToOrders")}
          </Link>
        </div>
      ) : (
        <div className="mb-5 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">{t("report.from")}</span>
              <input
                type="date"
                value={allTime ? "" : from}
                onChange={(e) => update({ from: e.target.value, range: null })}
                className={CTL}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">{t("report.to")}</span>
              <input
                type="date"
                value={allTime ? "" : to}
                onChange={(e) => update({ to: e.target.value, range: null })}
                className={CTL}
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {["today", "week", "month", "all"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => update({ range: null, ...presetRange(preset) })}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {t(`report.preset.${preset}`)}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={includeDone}
              onChange={(e) => update({ done: e.target.checked ? "1" : null })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
            />
            <span>
              <span className="block text-sm text-slate-800">{t("report.includeDone")}</span>
              <span className="block text-xs text-slate-500">{t("report.includeDoneHint")}</span>
            </span>
          </label>
        </div>
      )}

      {/* Named rather than left to inference: an empty report from a deliberate selection
          otherwise looks like the app lost the tickets. */}
      {data?.ignoredOrderIds?.length > 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {t("report.ignoredOrders", { ids: data.ignoredOrderIds.join(", ") })}
        </p>
      )}

      {loading && <p className="py-10 text-center text-sm text-slate-500">{t("common.loading")}</p>}
      {error && (
        <p className="py-6 text-center text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {totals
                ? t("report.summary", {
                    materials: totals.materials,
                    copies: totals.copies,
                    orders: totals.orders,
                  })
                : null}
            </p>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.32 0H6.34m4.66-13.5h2.32c.621 0 1.125.504 1.125 1.125v3.026a48.31 48.31 0 00-4.57 0V5.625c0-.621.504-1.125 1.125-1.125z" />
              </svg>
              {t("print.action")}
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-sm text-slate-600">
              {bySelection ? t("report.emptySelection") : t("report.empty")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">{t("report.col.material")}</th>
                    <th className="w-32 px-3 py-2.5">{t("report.col.type")}</th>
                    <th className="w-24 px-3 py-2.5 text-right">{t("report.col.copies")}</th>
                    <th className="w-24 px-4 py-2.5 text-right">{t("report.col.orders")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.materialId ?? r.title} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 text-sm text-slate-900">
                        {r.title}
                        {r.removedFromCatalogue && (
                          <span className="ml-2 text-xs text-amber-700">
                            ({t("report.removedMaterial")})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-slate-600">
                        {r.materialType ? t(`materialType.${r.materialType}`) : t("common.dash")}
                      </td>
                      {/* The one number the operator is here for, so it carries the weight. */}
                      <td className="px-3 py-2.5 text-right text-base font-semibold tabular-nums text-slate-900">
                        {r.copies}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-500">
                        {r.orders}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
