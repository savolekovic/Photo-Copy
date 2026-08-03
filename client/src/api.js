const base = import.meta.env.VITE_API_URL || "";

/**
 * API client. Every request sends the session cookie, so there is no token for
 * JavaScript to hold — and nothing for an XSS payload to steal.
 */

/** Carries the server's machine-readable `code` so the UI can translate the message. */
export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    // Required for the httpOnly session cookie to travel cross-origin in dev.
    credentials: "include",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data.errors?.[0]?.msg || data.error || `Request failed (${res.status})`,
      { status: res.status, code: data.code }
    );
  }
  return data;
}

/* -------------------------------------------------------------------- auth ---- */

export function requestLoginLink({ email, indexNumber }) {
  return request("/api/auth/request-link", {
    method: "POST",
    body: { email, indexNumber: indexNumber || undefined },
  });
}

export function verifyLoginToken(token) {
  return request("/api/auth/verify", { method: "POST", body: { token } });
}

export function fetchMe(options = {}) {
  return request("/api/auth/me", { signal: options.signal });
}

export function logout() {
  return request("/api/auth/logout", { method: "POST" });
}

export function updateLocale(locale) {
  return request("/api/auth/me", { method: "PATCH", body: { locale } });
}

/* -------------------------------------------------------------- literature ---- */

/** Faculties that currently have orderable material. */
export function fetchCatalogueFaculties(options = {}) {
  return request("/api/literature/faculties", { signal: options.signal });
}

/** Study years that have material for that faculty, so no empty year is offered. */
export function fetchCatalogueYears(facultyId, options = {}) {
  return request(`/api/literature/years?faculty_id=${facultyId}`, { signal: options.signal });
}

export function fetchLiterature(facultyId, yearId, options = {}) {
  const q = new URLSearchParams({ faculty_id: facultyId, year_id: yearId });
  return request(`/api/literature?${q}`, { signal: options.signal });
}

/* ------------------------------------------------------------------- admin ---- */

/** The whole catalogue tree in one request, for the Administracija screens. */
export function fetchAdminCatalogue(options = {}) {
  return request("/api/admin/catalogue", { signal: options.signal });
}

/**
 * CRUD helpers per entity kind. `kind` is the URL segment: faculties, programmes,
 * years, subjects or materials.
 */
export function createEntity(kind, body) {
  return request(`/api/admin/${kind}`, { method: "POST", body });
}

export function updateEntity(kind, id, body) {
  return request(`/api/admin/${kind}/${id}`, { method: "PATCH", body });
}

/**
 * Returns the updated row when the server deactivated it instead of deleting (because
 * something still references it), or null on a hard delete.
 */
export function deleteEntity(kind, id) {
  return request(`/api/admin/${kind}/${id}`, { method: "DELETE" });
}

export function addPlacement(materialId, body) {
  return request(`/api/admin/materials/${materialId}/placements`, { method: "POST", body });
}

export function removePlacement(materialId, placementId) {
  return request(`/api/admin/materials/${materialId}/placements/${placementId}`, {
    method: "DELETE",
  });
}

/* ------------------------------------------------------------------ orders ---- */

/** The recipient address comes from the session, so it is deliberately not sent here. */
export function submitOrder(payload) {
  return request("/api/orders", { method: "POST", body: payload });
}

function orderListQuery(params = {}) {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.search) q.set("search", params.search);
  if (params.faculty) q.set("faculty", params.faculty);
  if (params.year) q.set("year", params.year);
  if (params.sort) q.set("sort", params.sort);
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

/** Operator view — every student's orders. */
export function fetchOrders(params = {}, options = {}) {
  return request(`/api/orders${orderListQuery(params)}`, { signal: options.signal });
}

/** Student view — only the signed-in student's own orders. */
export function fetchMyOrders(params = {}, options = {}) {
  return request(`/api/orders/mine${orderListQuery(params)}`, { signal: options.signal });
}

/** Status counts for the operator landing page. */
export function fetchOrderSummary(options = {}) {
  return request("/api/orders/summary", { signal: options.signal });
}

export function fetchOrder(id, options = {}) {
  return request(`/api/orders/${id}`, { signal: options.signal });
}

export function fetchOrderHistory(id, options = {}) {
  return request(`/api/orders/${id}/history`, { signal: options.signal });
}

/**
 * Move an order to `status`. The server validates the transition, records it in the
 * audit trail, and sends the student's e-mail when the target is `spremno`.
 */
export function patchOrderStatus(id, status, note) {
  return request(`/api/orders/${id}/status`, {
    method: "PATCH",
    body: { status, ...(note ? { note } : {}) },
  });
}
