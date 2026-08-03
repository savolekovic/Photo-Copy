import { useEffect, useState } from "react";
import { fetchOrder } from "../../api.js";
import StatusBadge from "../StatusBadge.jsx";
import OrderStatusTimeline from "./OrderStatusTimeline.jsx";
import StatusActionButton from "./StatusActionButton.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { apiErrorMessage } from "../../lib/apiErrorMessage.js";
import { orderFacultyLabel, orderYearLabel } from "../../lib/orderLabels.js";

/**
 * Operator detail view. Unlike the table row, this exposes *every* legal transition —
 * including the reversals an operator needs after a mis-click — plus the full audit trail.
 *
 * `refreshKey` changes whenever the parent mutates the order, forcing a re-fetch so the
 * modal never shows a stale status after an action taken inside it.
 */
export default function OrderDetailsModal({
  orderId,
  onClose,
  onStatusChange,
  busy,
  refreshKey,
}) {
  const { t, locale, formatDateTime, formatPrice } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (orderId == null) return;
    const ac = new AbortController();
    setLoading(true);
    setError("");
    fetchOrder(orderId, { signal: ac.signal })
      .then((o) => setData(o))
      .catch((e) => {
        if (e.name === "AbortError") return;
        setError(apiErrorMessage(e, t));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [orderId, refreshKey, t]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (orderId == null) return null;

  const allowed = data?.allowedTransitions ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
        aria-label={t("common.close")}
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl ring-1 ring-slate-200/80">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm">
          <h2 id="order-details-title" className="text-lg font-semibold text-slate-900">
            {t("orders.details.title", { id: orderId })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            {t("common.close")}
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {loading && (
            <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>
          )}
          {error && (
            <p className="py-4 text-center text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && data && (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t("orders.col.status")}
                </span>
                <StatusBadge status={data.status} size="lg" />
              </div>

              <dl className="space-y-4 text-sm">
                <DetailRow label={t("orders.details.email")} value={data.email} mono />
                <DetailRow
                  label={t("orders.details.indexNumber")}
                  value={data.student?.indexNumber || t("common.dash")}
                  mono={Boolean(data.student?.indexNumber)}
                />
                <DetailRow label={t("orders.details.faculty")} value={orderFacultyLabel(data)} />
                <DetailRow label={t("orders.details.year")} value={orderYearLabel(data, locale)} />
                <DetailRow
                  label={t("orders.details.literature")}
                  value={data.literature?.name ?? t("common.dash")}
                />
                {data.literature?.materialType && (
                  <DetailRow
                    label={t("admin.type")}
                    value={t(`materialType.${data.literature.materialType}`)}
                  />
                )}
                {data.programme && (
                  <DetailRow label={t("admin.programme")} value={data.programme.name} />
                )}
                <DetailRow
                  label={t("orders.details.price")}
                  value={formatPrice(data.price)}
                />
                <DetailRow
                  label={t("orders.details.phone")}
                  value={data.phone || t("common.notProvided")}
                  mono={Boolean(data.phone)}
                />
                <DetailRow
                  label={t("orders.details.created")}
                  value={formatDateTime(data.created_at)}
                />
                {data.ready_at && (
                  <DetailRow
                    label={t("orders.details.readyAt")}
                    value={formatDateTime(data.ready_at)}
                  />
                )}
                {data.pickup_deadline && data.status === "spremno" && (
                  <DetailRow
                    label={t("orders.details.pickupDeadline")}
                    value={formatDateTime(data.pickup_deadline)}
                  />
                )}
                {data.picked_up_at && (
                  <DetailRow
                    label={t("orders.details.pickedUpAt")}
                    value={formatDateTime(data.picked_up_at)}
                  />
                )}
                {data.reminder_count > 0 && (
                  <DetailRow
                    label={t("orders.details.reminders")}
                    value={String(data.reminder_count)}
                  />
                )}
              </dl>

              {allowed.length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-5">
                  {allowed.map((status) => (
                    <StatusActionButton
                      key={status}
                      orderId={data.id}
                      status={status}
                      onChange={onStatusChange}
                      disabled={busy}
                      variant="full"
                    />
                  ))}
                </div>
              )}

              <div className="border-t border-slate-100 pt-5">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t("history.title")}
                </h3>
                <OrderStatusTimeline history={data.history} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-medium text-slate-500">{label}</dt>
      <dd
        className={
          mono ? "break-all font-mono text-[13px] text-slate-900" : "text-slate-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}
