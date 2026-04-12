import { formatDateTime } from "../../lib/formatDate.js";
import { IconCheck, IconEye, IconTrash } from "./OrderIcons.jsx";

function StatusBadge({ status }) {
  const done = status === "completed";
  return (
    <span
      className={
        done
          ? "inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800"
          : "inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-900"
      }
    >
      {done ? "Completed" : "Pending"}
    </span>
  );
}

export default function OrderRow({
  order,
  onView,
  onDelete,
  onMarkComplete,
  busyId,
}) {
  const busy = busyId === order.id;
  const dateStr = formatDateTime(order.created_at);
  const isPending = order.status === "pending";

  return (
    <tr
      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/90 transition-colors cursor-pointer"
      onClick={() => onView(order.id)}
    >
      <td className="px-3 py-3 text-sm text-slate-600 tabular-nums align-middle">
        {order.id}
      </td>
      <td className="px-3 py-3 text-sm text-slate-900 max-w-[220px] align-middle">
        <span className="line-clamp-2" title={order.literature?.name}>
          {order.literature?.name ?? "—"}
        </span>
      </td>
      <td className="px-3 py-3 text-sm text-slate-800 align-middle">
        {order.faculty}
      </td>
      <td className="px-3 py-3 text-sm text-slate-700 align-middle">
        {order.year}
      </td>
      <td className="px-3 py-3 text-sm tabular-nums text-slate-800 align-middle">
        {Number(order.price).toFixed(2)}
      </td>
      <td className="px-3 py-3 align-middle">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-3 py-3 text-sm text-slate-600 whitespace-nowrap align-middle">
        {dateStr}
      </td>
      <td className="px-3 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onView(order.id);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
            title="View details"
          >
            <IconEye className="w-3.5 h-3.5" />
            View
          </button>
          {isPending && (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onMarkComplete(order.id);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition-colors disabled:opacity-50"
              title="Mark as completed"
            >
              <IconCheck className="w-3.5 h-3.5" />
              Done
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(order.id);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-white px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
            title="Delete order"
          >
            <IconTrash className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
