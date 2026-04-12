import { getAdminSecret } from "./lib/adminSecret.js";

const base = import.meta.env.VITE_API_URL || "";

function adminHeaders() {
  const s = getAdminSecret();
  return s ? { "X-Admin-Secret": s } : {};
}

export async function fetchLiterature(faculty, year) {
  const q = new URLSearchParams({ faculty, year });
  const res = await fetch(`${base}/api/literature?${q}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load literature");
  }
  return res.json();
}

export async function submitOrder(payload) {
  const res = await fetch(`${base}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.errors?.[0]?.msg ||
      data.error ||
      (typeof data === "string" ? data : "Order failed");
    throw new Error(msg);
  }
  return data;
}

export async function fetchOrders() {
  const res = await fetch(`${base}/api/orders`, {
    headers: { ...adminHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403) {
    throw new Error("FORBIDDEN");
  }
  if (!res.ok) {
    throw new Error(data.error || "Failed to load orders");
  }
  return data;
}

export async function fetchOrder(id) {
  const res = await fetch(`${base}/api/orders/${id}`, {
    headers: { ...adminHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403) {
    throw new Error("FORBIDDEN");
  }
  if (res.status === 404) {
    throw new Error("Order not found");
  }
  if (!res.ok) {
    throw new Error(data.error || "Failed to load order");
  }
  return data;
}

export async function deleteOrder(id) {
  const res = await fetch(`${base}/api/orders/${id}`, {
    method: "DELETE",
    headers: { ...adminHeaders() },
  });
  if (res.status === 403) {
    throw new Error("FORBIDDEN");
  }
  if (res.status === 404) {
    throw new Error("Order not found");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Delete failed");
  }
}

export async function patchOrderStatus(id, status) {
  const res = await fetch(`${base}/api/orders/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...adminHeaders(),
    },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403) {
    throw new Error("FORBIDDEN");
  }
  if (!res.ok) {
    throw new Error(data.errors?.[0]?.msg || data.error || "Update failed");
  }
  return data;
}
