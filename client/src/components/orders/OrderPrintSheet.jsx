import { Fragment, useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { groupOrderItems, scopeLabel } from "../../lib/orderLabels.js";

/**
 * The order on paper — a pickup slip for the counter.
 *
 * It carries the same information as the detail modal, but not the same DOM. Printing the
 * modal itself would put the overlay, the scroll container, the transition buttons and the
 * audit trail on the page; none of that is useful on paper, and the modal's 90vh scroll box
 * would clip the item list at whatever the screen happened to show.
 *
 * So this renders alongside the app rather than inside it: a portal to <body>, outside
 * #root, hidden on screen and the only thing visible in print.
 *
 * The swap is done twice over, on purpose. `index.css` carries `@media print` rules keyed off
 * the class this component puts on <html>, and the effect below ALSO swaps inline styles from
 * `beforeprint`. Belt and braces, because a stylesheet is the one part that can go stale — a
 * cached CSS transform in dev silently reverts the rules and the whole modal prints, buttons
 * and audit trail and all. Inline styles ship with this module, so they cannot drift from it.
 *
 * Paper is monochrome and browsers drop background fills by default, so the layout leans on
 * rules and weight rather than colour — it reads the same from any printer.
 *
 * "details" is what the operator gets: the order as a plain record, laid out like the
 * on-screen detail view, with no signature line and no handover date to fill in.
 *
 * "slip" is the same information as a handover document — a wide table and a line for the
 * student to sign. Kept because it works and is one prop away, but nothing asks for it today.
 *
 * Neither carries the modal's buttons or its status history: one is not actionable on paper
 * and the other is an audit trail, not part of the order.
 */
export default function OrderPrintSheet({ order, variant = "details" }) {
  useEffect(() => {
    document.documentElement.classList.add("has-print-sheet");

    const app = document.getElementById("root");
    const swap = (printing) => {
      const sheet = document.getElementById("print-root");
      // Inline styles beat the `hidden` utility class, and clearing them hands control back.
      if (app) app.style.display = printing ? "none" : "";
      if (sheet) sheet.style.display = printing ? "block" : "";
    };
    const onBefore = () => swap(true);
    const onAfter = () => swap(false);

    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    // Safari fires no beforeprint; it flips the print media query instead.
    const mq = window.matchMedia?.("print");
    const onMedia = (e) => swap(e.matches);
    mq?.addEventListener?.("change", onMedia);

    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
      mq?.removeEventListener?.("change", onMedia);
      // Never leave the app hidden if the modal closes mid-print.
      swap(false);
      document.documentElement.classList.remove("has-print-sheet");
    };
  }, []);

  const { t, locale, formatDate, formatDateTime, formatPrice } = useI18n();

  if (!order) return null;

  const groups = groupOrderItems(order, locale);
  const mixed = (order.scopes ?? []).length > 1;
  // A handover record only belongs on an order that is still to be collected. On a cancelled
  // or already-collected one it invites a signature for something that will not happen.
  const awaitingCollection = ["nova", "u_pripremi", "spremno"].includes(order.status);

  const th = "border-b border-black pb-1 text-left text-[10pt] font-semibold uppercase";
  const td = "border-b border-neutral-300 py-1.5 align-top text-[11pt]";

  const field = (label, value) =>
    value ? (
      <div className="flex gap-2">
        {/* The label never wraps — a long e-mail or faculty name must push into the value's
            space, not break "E-mail" across two lines. */}
        <span className="shrink-0 whitespace-nowrap text-[10pt] text-neutral-600">{label}:</span>
        <span className="min-w-0 break-words text-[11pt] font-medium">{value}</span>
      </div>
    ) : null;

  // "details": the same information as the slip, in the stacked shape the detail view uses.
  if (variant === "details") {
    const stacked = (label, value) =>
      value ? (
        <div>
          <dt className="text-[9.5pt] uppercase tracking-wide text-neutral-600">{label}</dt>
          <dd className="text-[11.5pt] font-medium">{value}</dd>
        </div>
      ) : null;

    return createPortal(
      <div id="print-root" className="hidden bg-white text-black">
        <h1 className="mb-4 border-b-2 border-black pb-2 text-[16pt] font-bold">
          {t("orders.details.title", { id: order.id })}
        </h1>

        <dl className="grid gap-3">
          {stacked(t("orders.col.status"), t(`status.${order.status}`))}
          {stacked(t("orders.details.email"), order.email)}
          {stacked(t("orders.details.indexNumber"), order.student?.indexNumber)}
          {!mixed && stacked(t("orders.details.scope"), scopeLabel(order.scopes?.[0], locale))}

          <div>
            <dt className="mb-1 text-[9.5pt] uppercase tracking-wide text-neutral-600">
              {t("cart.items")}
            </dt>
            <dd className="border-t border-neutral-300">
              {groups.map((g) => (
                <div key={g.key}>
                  {mixed && (
                    <p className="border-b border-neutral-300 py-1 text-[10pt] font-semibold">
                      {g.label}
                    </p>
                  )}
                  {g.items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-baseline justify-between gap-4 border-b border-neutral-200 py-1.5"
                    >
                      <span className="text-[11pt]">
                        {it.title}
                        {it.quantity > 1 && (
                          <span className="ml-2 text-[10pt] text-neutral-600">
                            × {it.quantity}
                          </span>
                        )}
                        {it.materialType && (
                          <span className="ml-2 text-[9.5pt] text-neutral-600">
                            {t(`materialType.${it.materialType}`)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11pt] tabular-nums">
                        {formatPrice(it.lineTotal)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 pt-2">
                <span className="text-[10.5pt] font-semibold uppercase">{t("common.total")}</span>
                <span className="text-[13pt] font-bold tabular-nums">
                  {formatPrice(order.price)}
                </span>
              </div>
            </dd>
          </div>

          {stacked(t("orders.details.phone"), order.phone || t("common.notProvided"))}
          {stacked(t("orders.details.created"), formatDateTime(order.created_at))}
          {order.status === "spremno" &&
            stacked(t("orders.details.pickupDeadline"), formatDateTime(order.pickup_deadline))}
          {order.picked_up_at &&
            stacked(t("orders.details.pickedUpAt"), formatDateTime(order.picked_up_at))}
        </dl>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div id="print-root" className="hidden bg-white p-0 text-black">
      <header className="mb-4 flex items-end justify-between gap-6 border-b-2 border-black pb-2">
        <div>
          <p className="text-[10pt] uppercase tracking-widest">{t("brand.name")}</p>
          <h1 className="text-[17pt] font-bold leading-tight">{t("print.heading")}</h1>
        </div>
        <div className="text-right">
          <p className="text-[10pt] uppercase tracking-wide text-neutral-600">
            {t("print.orderNo")}
          </p>
          <p className="text-[22pt] font-bold leading-none tabular-nums">#{order.id}</p>
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-x-8 gap-y-1">
        {field(t("orders.col.status"), t(`status.${order.status}`))}
        {field(t("orders.details.created"), formatDateTime(order.created_at))}
        {field(t("orders.details.email"), order.email)}
        {field(t("orders.details.indexNumber"), order.student?.indexNumber)}
        {field(t("orders.details.phone"), order.phone)}
        {/* Only meaningful while the order is waiting to be collected. */}
        {order.status === "spremno" &&
          field(t("orders.details.pickupDeadline"), formatDateTime(order.pickup_deadline))}
        {order.picked_up_at &&
          field(t("orders.details.pickedUpAt"), formatDateTime(order.picked_up_at))}
        {!mixed && field(t("orders.details.scope"), scopeLabel(order.scopes?.[0], locale))}
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>{t("print.colItem")}</th>
            <th className={`${th} w-16 text-right`}>{t("print.colQty")}</th>
            <th className={`${th} w-24 text-right`}>{t("print.colUnit")}</th>
            <th className={`${th} w-24 text-right`}>{t("print.colTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              {/* The faculty and year a group belongs to is the shelf to walk to, so it heads
                  the rows it applies to. Suppressed when the whole order is one scope, which
                  the field list above already states. */}
              {mixed && (
                <tr>
                  <td
                    colSpan={4}
                    className="border-b border-neutral-300 pb-1 pt-3 text-[10.5pt] font-semibold"
                  >
                    {g.label}
                  </td>
                </tr>
              )}
              {g.items.map((it) => (
                <tr key={it.id}>
                  <td className={td}>
                    {it.title}
                    {it.materialType && (
                      <span className="ml-2 text-[9.5pt] text-neutral-600">
                        {t(`materialType.${it.materialType}`)}
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{it.quantity}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatPrice(it.unitPrice)}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatPrice(it.lineTotal)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr>
            <td colSpan={3} className="pt-2 text-right text-[11pt] font-semibold uppercase">
              {t("common.total")}
            </td>
            <td className="pt-2 text-right text-[14pt] font-bold tabular-nums">
              {formatPrice(order.price)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* A handover record: the counter keeps the signed copy. */}
      {awaitingCollection && (
      <section className="mt-10 flex items-end justify-between gap-10">
        <div className="flex-1">
          <div className="border-b border-black" />
          <p className="mt-1 text-[9.5pt] text-neutral-600">{t("print.signature")}</p>
        </div>
        <div className="w-40">
          <div className="border-b border-black" />
          <p className="mt-1 text-[9.5pt] text-neutral-600">{t("print.dateCollected")}</p>
        </div>
      </section>
      )}

      <footer className="mt-6 border-t border-neutral-300 pt-2 text-[9pt] text-neutral-600">
        {t("print.printedAt", { date: formatDate(new Date().toISOString()) })}
      </footer>
    </div>,
    document.body
  );
}
