import { useEffect, useState } from "react";
import { fetchOrder } from "../../api.js";
import { formatDateTime } from "../../lib/formatDate.js";

function StatusBadge({ status }) {
  const done = status === "completed";
  return (
    <span
      className={
        done
          ? "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800"
          : "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-900"
      }
    >
      {done ? "Completed" : "Pending"}
    </span>
  );
}

export default function OrderDetailsModal({
  orderId,
  onClose,
  onMarkComplete,
  busy,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (orderId == null) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchOrder(orderId)
      .then((o) => {
        if (!cancelled) setData(o);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Failed to load order");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (orderId == null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl ring-1 ring-slate-200/80">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 bg-white/95 backdrop-blur-sm">
          <h2
            id="order-details-title"
            className="text-lg font-semibold text-slate-900"
          >
            Order #{orderId}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 text-sm font-medium"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {loading && (
            <p className="text-sm text-slate-500 text-center py-8">
              Loading…
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 text-center py-4" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && data && (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </span>
                <StatusBadge status={data.status} />
              </div>

              <dl className="space-y-4 text-sm">
                <DetailRow label="Faculty" value={data.faculty} />
                <DetailRow label="Year" value={data.year} />
                <DetailRow
                  label="Literature"
                  value={data.literature?.name ?? "—"}
                />
                <DetailRow
                  label="Price"
                  value={
                    data.price != null
                      ? Number(data.price).toFixed(2)
                      : "—"
                  }
                />
                <DetailRow label="Email" value={data.email} mono />
                <DetailRow
                  label="Phone"
                  value={data.phone || "—"}
                  mono={Boolean(data.phone)}
                />
                <DetailRow
                  label="Created"
                  value={formatDateTime(data.created_at)}
                />
              </dl>

              {data.status === "pending" && onMarkComplete && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMarkComplete(data.id)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                >
                  Mark as completed
                </button>
              )}
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
      <dt className="text-xs font-medium text-slate-500 mb-1">{label}</dt>
      <dd
        className={
          mono
            ? "text-slate-900 break-all font-mono text-[13px]"
            : "text-slate-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}
