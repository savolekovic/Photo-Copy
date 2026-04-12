import OrderRow from "./OrderRow.jsx";
import { formatDateTime } from "../../lib/formatDate.js";
import { IconCheck, IconEye, IconTrash } from "./OrderIcons.jsx";

export default function OrdersTable({
  orders,
  onView,
  onDelete,
  onMarkComplete,
  busyId,
}) {
  if (orders.length === 0) {
    return null;
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-soft">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3 pl-4">ID</th>
              <th className="px-3 py-3">Literature</th>
              <th className="px-3 py-3">Faculty</th>
              <th className="px-3 py-3">Year</th>
              <th className="px-3 py-3">Price</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Created</th>
              <th className="px-3 py-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onView={onView}
                onDelete={onDelete}
                onMarkComplete={onMarkComplete}
                busyId={busyId}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden space-y-3">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onView={onView}
            onDelete={onDelete}
            onMarkComplete={onMarkComplete}
            busyId={busyId}
          />
        ))}
      </ul>
    </>
  );
}

function OrderCard({
  order,
  onView,
  onDelete,
  onMarkComplete,
  busyId,
}) {
  const busy = busyId === order.id;
  const dateStr = formatDateTime(order.created_at);
  const isDone = order.status === "completed";

  return (
    <li className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-soft transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => onView(order.id)}
        className="w-full text-left"
      >
        <div className="flex justify-between items-start gap-2 mb-3">
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            #{order.id}
          </span>
          <span
            className={
              isDone
                ? "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800"
                : "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-900"
            }
          >
            {isDone ? "Completed" : "Pending"}
          </span>
        </div>
        <p className="text-sm font-medium text-slate-900 line-clamp-2 mb-2">
          {order.literature?.name ?? "—"}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>{order.faculty}</span>
          <span>{order.year}</span>
          <span className="tabular-nums">{Number(order.price).toFixed(2)}</span>
        </div>
        <p className="text-xs text-slate-500 mt-2">{dateStr}</p>
      </button>
      <div
        className="mt-4 flex flex-wrap gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => onView(order.id)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <IconEye className="w-3.5 h-3.5" />
          View
        </button>
        {!isDone && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onMarkComplete(order.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          >
            <IconCheck className="w-3.5 h-3.5" />
            Done
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(order.id)}
          className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          <IconTrash className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </li>
  );
}
