import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider.jsx";

/**
 * The production report on paper — the worksheet that goes to the copier.
 *
 * Same approach as the order sheet: a portal to <body>, outside #root, so printing swaps the
 * app out rather than trying to make the screen layout fit a page. The swap is done both in
 * `index.css` and inline from `beforeprint`, because a stale stylesheet must not be able to
 * put the whole application on the paper.
 *
 * The copies column is set large and bold. On a shop floor this sheet is read at arm's length
 * while pulling stock, and the count is the only thing on it that matters.
 */
export default function ReportPrintSheet({ rows, totals, scopeLabel, statusLabel }) {
  // Guarded, not just returned on: registering the swap with nothing to render would hide the
  // app at print time and hand over a blank page.
  const hasRows = Boolean(rows && rows.length > 0);

  useEffect(() => {
    if (!hasRows) return undefined;
    document.documentElement.classList.add("has-print-sheet");

    const app = document.getElementById("root");
    const swap = (printing) => {
      const sheet = document.getElementById("print-root");
      if (app) app.style.display = printing ? "none" : "";
      if (sheet) sheet.style.display = printing ? "block" : "";
    };
    const onBefore = () => swap(true);
    const onAfter = () => swap(false);

    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    const mq = window.matchMedia?.("print");
    const onMedia = (e) => swap(e.matches);
    mq?.addEventListener?.("change", onMedia);

    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
      mq?.removeEventListener?.("change", onMedia);
      swap(false);
      document.documentElement.classList.remove("has-print-sheet");
    };
  }, [hasRows]);

  const { t, formatDate } = useI18n();

  if (!hasRows) return null;

  const th = "border-b border-black pb-1 text-left text-[10pt] font-semibold uppercase";
  const td = "border-b border-neutral-300 py-2 align-top text-[11.5pt]";

  return createPortal(
    <div id="print-root" className="hidden bg-white text-black">
      <header className="mb-4 flex items-end justify-between gap-6 border-b-2 border-black pb-2">
        <div>
          <p className="text-[10pt] uppercase tracking-widest">{t("brand.name")}</p>
          <h1 className="text-[17pt] font-bold leading-tight">{t("report.title")}</h1>
        </div>
        <div className="text-right text-[10pt]">
          <p className="font-medium">{scopeLabel}</p>
          {statusLabel && <p className="text-neutral-600">{statusLabel}</p>}
        </div>
      </header>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>{t("report.col.material")}</th>
            <th className={`${th} w-28`}>{t("report.col.type")}</th>
            <th className={`${th} w-24 text-right`}>{t("report.col.copies")}</th>
            <th className={`${th} w-20 text-right`}>{t("report.col.orders")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.materialId ?? r.title}>
              <td className={td}>{r.title}</td>
              <td className={`${td} text-neutral-600`}>
                {r.materialType ? t(`materialType.${r.materialType}`) : "—"}
              </td>
              <td className={`${td} text-right text-[15pt] font-bold tabular-nums`}>{r.copies}</td>
              <td className={`${td} text-right text-neutral-600 tabular-nums`}>{r.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {totals && (
        <div className="mt-3 flex items-baseline justify-between border-t-2 border-black pt-2">
          <span className="text-[10.5pt] font-semibold uppercase">{t("common.total")}</span>
          <span className="text-[13pt] font-bold tabular-nums">
            {totals.copies} {t("report.copiesSuffix")}
          </span>
        </div>
      )}

      <footer className="mt-6 border-t border-neutral-300 pt-2 text-[9pt] text-neutral-600">
        {t("print.printedAt", { date: formatDate(new Date().toISOString()) })}
      </footer>
    </div>,
    document.body
  );
}
