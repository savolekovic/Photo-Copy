import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteOrder,
  fetchOrders,
  patchOrderStatus,
} from "../api.js";
import OrderDetailsModal from "../components/orders/OrderDetailsModal.jsx";
import OrdersTable from "../components/orders/OrdersTable.jsx";
import { FACULTIES, YEARS } from "../constants.js";
import { getAdminSecret, setAdminSecret } from "../lib/adminSecret.js";

const SORTS = [
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
  { value: "price-desc", label: "Price high → low" },
  { value: "price-asc", label: "Price low → high" },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [viewOrderId, setViewOrderId] = useState(null);

  const [search, setSearch] = useState("");
  const [facultyFilter, setFacultyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [sort, setSort] = useState("date-desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const data = await fetchOrders();
      setForbidden(false);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e.message === "FORBIDDEN") {
        setForbidden(true);
        setOrders([]);
      } else {
        setError(e.message || "Failed to load orders");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = orders;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.email.toLowerCase().includes(q) ||
          (o.literature?.name || "").toLowerCase().includes(q)
      );
    }
    if (facultyFilter) {
      list = list.filter((o) => o.faculty === facultyFilter);
    }
    if (yearFilter) {
      list = list.filter((o) => o.year === yearFilter);
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "date-desc" || sort === "date-asc") {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        return sort === "date-desc" ? tb - ta : ta - tb;
      }
      const pa = Number(a.price);
      const pb = Number(b.price);
      return sort === "price-desc" ? pb - pa : pa - pb;
    });
    return sorted;
  }, [orders, search, facultyFilter, yearFilter, sort]);

  const handleSaveSecret = (e) => {
    e.preventDefault();
    setAdminSecret(secretInput);
    setSecretInput("");
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Delete order #${id}? This cannot be undone.`)) {
      return;
    }
    setBusyId(id);
    try {
      await deleteOrder(id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      if (e.message === "FORBIDDEN") {
        setForbidden(true);
      } else {
        alert(e.message);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusChange = async (id, status) => {
    const prev = orders.find((o) => o.id === id);
    if (!prev || prev.status === status) return;
    setBusyId(id);
    try {
      const updated = await patchOrderStatus(id, status);
      setOrders((o) =>
        o.map((row) => (row.id === id ? { ...row, ...updated } : row))
      );
      setViewOrderId((open) => (open === id ? null : open));
    } catch (e) {
      if (e.message === "FORBIDDEN") {
        setForbidden(true);
      } else {
        alert(e.message);
      }
      load();
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkComplete = (id) => handleStatusChange(id, "completed");

  if (forbidden && getAdminSecret() === "") {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Orders</h1>
        <p className="text-sm text-slate-600 mb-6">
          This list is protected. Enter the admin secret configured on the server
          (<code className="text-xs bg-slate-100 px-1 rounded">ADMIN_SECRET</code> in{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">.env</code>).
        </p>
        <form onSubmit={handleSaveSecret} className="space-y-3">
          <label className="block text-xs font-medium text-slate-500">
            Admin secret
            <input
              type="password"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/15"
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-xl bg-slate-900 text-white py-2.5 text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  if (forbidden && getAdminSecret() !== "") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Orders</h1>
        <p className="text-sm text-slate-600 mb-4">
          Invalid admin secret. Check <code className="text-xs bg-slate-100 px-1 rounded">ADMIN_SECRET</code> matches this value.
        </p>
        <button
          type="button"
          onClick={() => {
            setAdminSecret("");
            setForbidden(false);
            load();
          }}
          className="text-sm font-medium text-slate-700 underline"
        >
          Clear and try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500 mb-1">
            Admin
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">
            Orders
          </h1>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="self-start text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg border border-slate-200 hover:bg-white transition-colors disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-soft mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="block text-xs font-medium text-slate-500">
            Search (literature or email)
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to filter…"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/15"
            />
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Faculty
            <select
              value={facultyFilter}
              onChange={(e) => setFacultyFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
            >
              <option value="">All</option>
              {FACULTIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Year
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
            >
              <option value="">All</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading && (
        <p className="text-center text-sm text-slate-500 py-12">Loading orders…</p>
      )}

      {!loading && error && (
        <p className="text-center text-sm text-red-600 py-8" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && filtered.length === 0 && orders.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center">
          <p className="text-slate-600 text-sm">No orders yet.</p>
          <p className="text-slate-500 text-xs mt-2">
            Submitted orders will appear here.
          </p>
        </div>
      )}

      {!loading && !error && orders.length > 0 && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-600">
          No orders match your filters.
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <OrdersTable
          orders={filtered}
          onView={(id) => setViewOrderId(id)}
          onDelete={handleDelete}
          onMarkComplete={handleMarkComplete}
          busyId={busyId}
        />
      )}

      <OrderDetailsModal
        orderId={viewOrderId}
        onClose={() => setViewOrderId(null)}
        onMarkComplete={handleMarkComplete}
        busy={busyId === viewOrderId}
      />
    </div>
  );
}
