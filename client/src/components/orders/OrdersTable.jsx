import OrderRow, { isOverdue } from "./OrderRow.jsx";
import StatusBadge from "../StatusBadge.jsx";
import StatusActionButton from "./StatusActionButton.jsx";
import { IconClock, IconEye } from "./OrderIcons.jsx";
import { PRIMARY_NEXT } from "./orderActions.js";
import { useI18n } from "../../i18n/I18nProvider.jsx";

/** Table on desktop, cards on mobile — the same data and the same actions in both. */
export default function OrdersTable({ orders, onView, onStatusChange, busyId }) {
  const { t } = useI18n();

  if (orders.length === 0) return null;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-soft md:block">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-14 px-3 py-3 pl-4">{t("orders.col.id")}</th>
              <th className="px-3 py-3">{t("orders.col.literature")}</th>
              <th className="px-3 py-3">{t("orders.col.student")}</th>
              <th className="px-3 py-3">{t("orders.col.status")}</th>
              <th className="px-3 py-3">{t("orders.col.date")}</th>
              <th className="w-[1%] px-3 py-3 pr-4 text-right">
                <span className="sr-only">{t("orders.col.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onView={onView}
                onStatusChange={onStatusChange}
                busyId={busyId}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onView={onView}
            onStatusChange={onStatusChange}
            busyId={busyId}
          />
        ))}
      </ul>
    </>
  );
}

function OrderCard({ order, onView, onStatusChange, busyId }) {
  const { t, formatDate } = useI18n();
  const busy = busyId === order.id;
  const primary = PRIMARY_NEXT[order.status];
  const allowed = order.allowedTransitions ?? [];
  const overdue = isOverdue(order);

  return (
    <li className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-soft transition-shadow hover:shadow-md">
      <button type="button" onClick={() => onView(order.id)} className="w-full text-left">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-xs font-medium tabular-nums text-slate-500">
            #{order.id}
          </span>
          <div className="flex items-center gap-1.5">
            <StatusBadge status={order.status} />
            {overdue && (
              <span className="text-rose-600" title={t("orders.summary.overdue")}>
                <IconClock className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>
        <p className="mb-1 line-clamp-2 text-sm font-medium text-slate-900">
          {order.literature?.name ?? t("common.dash")}
        </p>
        <p className="truncate text-xs text-slate-600">{order.email}</p>
        {order.student?.indexNumber && (
          <p className="text-xs tabular-nums text-slate-500">
            {order.student.indexNumber}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500">{formatDate(order.created_at)}</p>
      </button>

      <div className="mt-3 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          disabled={busy}
          onClick={() => onView(order.id)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title={t("orders.action.view")}
          aria-label={t("orders.action.view")}
        >
          <IconEye className="h-4 w-4" />
        </button>
        {primary && allowed.includes(primary) && (
          <StatusActionButton
            orderId={order.id}
            status={primary}
            onChange={onStatusChange}
            disabled={busy}
          />
        )}
        {allowed.includes("otkazano") && (
          <StatusActionButton
            orderId={order.id}
            status="otkazano"
            onChange={onStatusChange}
            disabled={busy}
          />
        )}
      </div>
    </li>
  );
}
