import { useI18n } from "../../i18n/I18nProvider.jsx";
import { TONE_CLASSES, TRANSITION_META, actionLabelKey } from "./orderActions.js";

/**
 * One status-transition button. Handles its own confirmation prompt, so every caller gets
 * the same guard on the two consequential moves (notifying the student, cancelling).
 *
 * @param {"icon"|"full"} variant `icon` for dense table rows, `full` for the detail modal.
 */
export default function StatusActionButton({
  orderId,
  status,
  onChange,
  disabled,
  variant = "icon",
}) {
  const { t } = useI18n();
  const meta = TRANSITION_META[status];
  if (!meta) return null;

  const Icon = meta.icon;
  const label = t(actionLabelKey(status));

  const handleClick = (e) => {
    e.stopPropagation();
    if (meta.confirmKey && !window.confirm(t(meta.confirmKey, { id: orderId }))) {
      return;
    }
    onChange(orderId, status);
  };

  if (variant === "full") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={[
          "flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors disabled:opacity-50",
          TONE_CLASSES[meta.tone] ?? TONE_CLASSES.neutral,
        ].join(" ")}
      >
        <Icon className="h-4 w-4" />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      title={label}
      aria-label={label}
      className={[
        "inline-flex items-center justify-center rounded-lg border p-2 transition-colors disabled:opacity-50",
        TONE_CLASSES[meta.tone] ?? TONE_CLASSES.neutral,
      ].join(" ")}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
