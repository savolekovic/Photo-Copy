import { useI18n } from "../i18n/I18nProvider.jsx";

/**
 * Localized status pill. Colour carries meaning consistently across the student and
 * operator views: amber = work in progress, emerald = waiting for the student,
 * slate = finished, red = cancelled.
 */
const TONE = {
  nova: "bg-sky-100 text-sky-900",
  u_pripremi: "bg-amber-100 text-amber-900",
  spremno: "bg-emerald-100 text-emerald-800",
  preuzeto: "bg-slate-200 text-slate-700",
  otkazano: "bg-rose-100 text-rose-900",
};

const SIZES = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
};

export default function StatusBadge({ status, size = "md", className = "" }) {
  const { t } = useI18n();
  return (
    <span
      className={[
        "inline-flex items-center rounded-full font-medium whitespace-nowrap",
        SIZES[size] ?? SIZES.md,
        TONE[status] ?? "bg-slate-100 text-slate-700",
        className,
      ].join(" ")}
    >
      {t(`status.${status}`)}
    </span>
  );
}
