import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * The korpa. Held client-side and mirrored to localStorage, so a refresh or an accidental
 * navigation mid-order does not lose it. Nothing is persisted server-side until the student
 * confirms — an abandoned cart should leave no trace.
 *
 * A cart belongs to one faculty + year, matching the spec's linear flow. Changing either
 * selection empties it, because those materials are no longer the ones on offer.
 *
 * Prices are kept only to show a running total; the server re-prices every line on submit.
 */

const STORAGE_KEY = "photocopy_cart";

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.lines) ? parsed : null;
  } catch {
    // Corrupt or unavailable storage is not worth failing an order over.
    return null;
  }
}

export function useCart(facultyId, yearId) {
  const [state, setState] = useState(() => read() ?? { facultyId: null, yearId: null, lines: [] });

  // Drop the cart when it belongs to a different faculty/year than the one now selected.
  useEffect(() => {
    if (facultyId == null || yearId == null) return;
    setState((prev) =>
      prev.facultyId === facultyId && prev.yearId === yearId
        ? prev
        : { facultyId, yearId, lines: [] }
    );
  }, [facultyId, yearId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* non-fatal */
    }
  }, [state]);

  const add = useCallback((material) => {
    setState((prev) => {
      const existing = prev.lines.find((l) => l.materialId === material.id);
      const lines = existing
        ? prev.lines.map((l) =>
            l.materialId === material.id ? { ...l, quantity: l.quantity + 1 } : l
          )
        : [
            ...prev.lines,
            {
              materialId: material.id,
              title: material.name,
              unitPrice: Number(material.price),
              quantity: 1,
            },
          ];
      return { ...prev, lines };
    });
  }, []);

  const setQuantity = useCallback((materialId, quantity) => {
    setState((prev) => ({
      ...prev,
      lines:
        quantity <= 0
          ? prev.lines.filter((l) => l.materialId !== materialId)
          : prev.lines.map((l) =>
              l.materialId === materialId ? { ...l, quantity: Math.min(99, quantity) } : l
            ),
    }));
  }, []);

  const remove = useCallback((materialId) => {
    setState((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.materialId !== materialId) }));
  }, []);

  const clear = useCallback(() => {
    setState({ facultyId, yearId, lines: [] });
  }, [facultyId, yearId]);

  const total = useMemo(
    () =>
      Math.round(state.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100,
    [state.lines]
  );

  const count = useMemo(
    () => state.lines.reduce((n, l) => n + l.quantity, 0),
    [state.lines]
  );

  const quantityOf = useCallback(
    (materialId) => state.lines.find((l) => l.materialId === materialId)?.quantity ?? 0,
    [state.lines]
  );

  return { lines: state.lines, add, setQuantity, remove, clear, total, count, quantityOf };
}
