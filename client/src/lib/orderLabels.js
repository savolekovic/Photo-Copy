/**
 * Faculty and year on an order are historical snapshots, not references, so they render
 * from the order itself rather than any lookup — a faculty renamed later must not change
 * what a past order says.
 *
 * `faculty` is already a display name. `year` is the study-year code, and the server sends
 * both localised labels alongside it.
 */

export function orderYearLabel(order, locale) {
  if (!order) return "—";
  const labels = order.yearLabel ?? {};
  const label = locale === "en" ? labels.en : labels.sr;
  // Legacy orders placed before study years existed have no label; show the raw code.
  return label || order.year || "—";
}

export function orderFacultyLabel(order) {
  return order?.faculty || "—";
}

/** Localised label for a study-year row returned by the API. */
export function yearLabel(year, locale) {
  if (!year) return "—";
  return (locale === "en" ? year.label_en : year.label_sr) || year.code || "—";
}
