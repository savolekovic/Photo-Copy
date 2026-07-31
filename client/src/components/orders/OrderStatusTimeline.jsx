import { useI18n } from "../../i18n/I18nProvider.jsx";

/**
 * Renders the audit trail for one order — the visible half of "evidentiranje svih promjena
 * narudžbine". Shared by the operator detail modal and the student's own history view.
 */
export default function OrderStatusTimeline({ history }) {
  const { t, formatDateTime } = useI18n();

  if (!history || history.length === 0) {
    return <p className="text-sm text-slate-500">{t("history.empty")}</p>;
  }

  return (
    <ol className="space-y-3">
      {history.map((entry, i) => {
        const isLast = i === history.length - 1;
        const label = entry.from
          ? t("history.transition", {
              from: t(`status.${entry.from}`),
              to: t(`status.${entry.to}`),
            })
          : t("history.created");

        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span
                className={[
                  "h-2 w-2 shrink-0 rounded-full",
                  isLast ? "bg-slate-900" : "bg-slate-300",
                ].join(" ")}
                aria-hidden
              />
              {!isLast && <span className="mt-1 w-px flex-1 bg-slate-200" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm font-medium text-slate-900">{label}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatDateTime(entry.at)}
                {" · "}
                {/* A null actor means the change came from the system, not an operator. */}
                {t("history.by", {
                  who: entry.by?.email ?? t("history.system"),
                })}
              </p>
              {entry.note && (
                <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                  {entry.note}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
