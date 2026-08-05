import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * The korpa. Held client-side and mirrored to localStorage, so a refresh or an accidental
 * navigation mid-order does not lose it. Nothing is persisted server-side until the student
 * confirms — an abandoned cart should leave no trace.
 *
 * A cart may span faculties and years, so scope lives on the LINE, not on the cart: a student
 * taking a language at the Centar za strane jezike alongside their own programme, or retaking
 * a subject from an earlier year, needs one order — otherwise the copy shop prepares two,
 * sends two ready-for-pickup e-mails and hands over twice.
 *
 * Changing the faculty selection therefore no longer empties the cart; it only changes what
 * the catalogue step is showing.
 *
 * Prices are kept only to show a running total; the server re-prices every line on submit.
 */

const STORAGE_KEY = "photocopy_cart";

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.lines)) return null;
    // A cart saved before scope moved to the line has no per-line faculty, so the server
    // could not validate it. Dropping it costs the student one re-pick; keeping it would
    // fail at submit with nothing they could do about it.
    if (parsed.lines.some((l) => l.facultyId == null || l.yearId == null)) return null;
    return { lines: parsed.lines };
  } catch {
    // Corrupt or unavailable storage is not worth failing an order over.
    return null;
  }
}

export function useCart() {
  const [state, setState] = useState(() => read() ?? { lines: [] });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* non-fatal */
    }
  }, [state]);

  /**
   * `scope` is where the material was picked from: {facultyId, facultyName, yearId,
   * yearLabel, subjectId?}. The names are carried so the cart can group itself without
   * refetching a catalogue the student has since navigated away from.
   */
  const add = useCallback((material, scope) => {
    setState((prev) => {
      const existing = prev.lines.find((l) => l.materialId === material.id);
      // One line per material, matching the server: the same book requested from two
      // programmes is still one copy to collect.
      const lines = existing
        ? prev.lines.map((l) =>
            l.materialId === material.id ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l
          )
        : [
            ...prev.lines,
            {
              materialId: material.id,
              title: material.name,
              unitPrice: Number(material.price),
              quantity: 1,
              facultyId: scope.facultyId,
              facultyName: scope.facultyName,
              yearId: scope.yearId,
              yearLabel: scope.yearLabel,
              subjectId: scope.subjectId ?? null,
            },
          ];
      return { lines };
    });
  }, []);

  const setQuantity = useCallback((materialId, quantity) => {
    setState((prev) => ({
      lines:
        quantity <= 0
          ? prev.lines.filter((l) => l.materialId !== materialId)
          : prev.lines.map((l) =>
              l.materialId === materialId ? { ...l, quantity: Math.min(99, quantity) } : l
            ),
    }));
  }, []);

  const remove = useCallback((materialId) => {
    setState((prev) => ({ lines: prev.lines.filter((l) => l.materialId !== materialId) }));
  }, []);

  /** Used after a rejected submit to drop exactly the lines the server would not accept. */
  const removeMany = useCallback((materialIds) => {
    const drop = new Set(materialIds);
    setState((prev) => ({ lines: prev.lines.filter((l) => !drop.has(l.materialId)) }));
  }, []);

  const clear = useCallback(() => setState({ lines: [] }), []);

  const total = useMemo(
    () =>
      Math.round(state.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100,
    [state.lines]
  );

  const count = useMemo(() => state.lines.reduce((n, l) => n + l.quantity, 0), [state.lines]);

  const quantityOf = useCallback(
    (materialId) => state.lines.find((l) => l.materialId === materialId)?.quantity ?? 0,
    [state.lines]
  );

  /** The cart grouped by where each line came from, for display and for the summary step. */
  const groups = useMemo(() => groupCartLines(state.lines), [state.lines]);

  return {
    lines: state.lines,
    groups,
    add,
    setQuantity,
    remove,
    removeMany,
    clear,
    total,
    count,
    quantityOf,
  };
}

/** Shared with the summary step so both render the same grouping. */
export function groupCartLines(lines) {
  const out = [];
  const byKey = new Map();
  for (const l of lines ?? []) {
    const key = `${l.facultyId}|${l.yearId}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        facultyId: l.facultyId,
        facultyName: l.facultyName,
        yearId: l.yearId,
        yearLabel: l.yearLabel,
        lines: [],
        total: 0,
      };
      byKey.set(key, group);
      out.push(group);
    }
    group.lines.push(l);
    group.total = Math.round((group.total + l.unitPrice * l.quantity) * 100) / 100;
  }
  return out;
}
