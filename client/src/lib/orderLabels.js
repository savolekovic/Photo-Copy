/**
 * The faculty and year of an order are historical snapshots on its LINES, not references on
 * the order, so they render from the order itself rather than any lookup — a faculty renamed
 * later must not change what a past order says.
 *
 * The server derives `scopes`: the distinct faculty+year pairs the lines touch, ordered by
 * faculty then year. An ordinary order has exactly one; a cart drawing on a language centre
 * alongside a degree programme has several.
 */

export function orderScopes(order) {
  return order?.scopes ?? [];
}

/** Localised label for one scope. Falls back to the stored code for legacy rows. */
export function scopeYearLabel(scope, locale) {
  if (!scope) return "—";
  const labels = scope.yearLabel ?? {};
  return (locale === "en" ? labels.en : labels.sr) || scope.yearCode || "—";
}

/** "Fakultet · I godina", for a heading or a single-line summary. */
export function scopeLabel(scope, locale) {
  if (!scope) return "—";
  return [scope.facultyName, scopeYearLabel(scope, locale)].filter(Boolean).join(" · ") || "—";
}

/** Groups an order's lines the way its scopes are ordered, for grouped display. */
export function groupOrderItems(order, locale) {
  const items = order?.items ?? [];
  const groups = [];
  const byKey = new Map();
  for (const it of items) {
    const key = `${it.facultyName}|${it.yearCode}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        facultyName: it.facultyName,
        label: scopeLabel({ facultyName: it.facultyName, yearCode: it.yearCode, yearLabel: { sr: it.yearLabelSr, en: it.yearLabelEn } }, locale),
        items: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(it);
  }
  return groups;
}

/** Localised label for a study-year row returned by the API. */
export function yearLabel(year, locale) {
  if (!year) return "—";
  return (locale === "en" ? year.label_en : year.label_sr) || year.code || "—";
}
