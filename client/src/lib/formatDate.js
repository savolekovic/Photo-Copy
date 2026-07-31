export function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return String(iso);
  }
}

/** Date only — for compact lists (detail modal has full time). */
export function formatDateShort(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(d);
  } catch {
    return String(iso);
  }
}
