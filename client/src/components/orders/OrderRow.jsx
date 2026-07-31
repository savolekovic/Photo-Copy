import StatusBadge from "../StatusBadge.jsx";
import StatusActionButton from "./StatusActionButton.jsx";
import { IconClock, IconEye } from "./OrderIcons.jsx";
import { PRIMARY_NEXT } from "./orderActions.js";
import { useI18n } from "../../i18n/I18nProvider.jsx";

/** True when a ready order has sat past its pickup deadline. */
export function isOverdue(order) {
  return (
    order.status === "spremno" &&
    order.pickup_deadline &&
    new Date(order.pickup_deadline).getTime() < Date.now()
  );
}

export default function OrderRow({ order, onView, onStatusChange, busyId }) {
  const { t, formatDate } = useI18n();
  const busy = busyId === order.id;
  const primary = PRIMARY_NEXT[order.status];
  const allowed = order.allowedTransitions ?? [];
  const overdue = isOverdue(order);

  return (
    <tr
      className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/90"
      onClick={() => onView(order.id)}
    >
      <td className="w-14 px-3 py-3 pl-4 align-middle text-xs tabular-nums text-slate-500">
        #{order.id}
      </td>

      <td className="min-w-0 px-3 py-3 align-middle text-sm text-slate-900">
        <span className="line-clamp-2" title={order.literature?.name}>
          {order.literature?.name ?? t("common.dash")}
        </span>
      </td>

      <td className="px-3 py-3 align-middle text-sm">
        <span className="block max-w-[13rem] truncate text-slate-700" title={order.email}>
          {order.email}
        </span>
        {order.student?.indexNumber && (
          <span className="block text-xs tabular-nums text-slate-500">
            {order.student.indexNumber}
          </span>
        )}
      </td>

      <td className="px-3 py-3 align-middle">
        <div className="flex items-center gap-1.5">
          <StatusBadge status={order.status} />
          {overdue && (
            <span
              className="inline-flex items-center text-rose-600"
              title={t("orders.summary.overdue")}
            >
              <IconClock className="h-4 w-4" />
            </span>
          )}
        </div>
      </td>

      <td className="whitespace-nowrap px-3 py-3 align-middle text-sm text-slate-600">
        {formatDate(order.created_at)}
      </td>

      <td
        className="w-[1%] px-3 py-3 pr-4 text-right align-middle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onView(order.id);
            }}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            title={t("orders.action.view")}
            aria-label={t("orders.action.view")}
          >
            <IconEye className="h-4 w-4" />
          </button>

          {/* Only the next step and cancel appear here; reversals live in the modal. */}
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
      </td>
    </tr>
  );
}
