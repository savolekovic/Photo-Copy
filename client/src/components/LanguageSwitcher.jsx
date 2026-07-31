import { useI18n } from "../i18n/I18nProvider.jsx";

/**
 * Segmented CG / EN control. Changing it also persists the choice to the account when
 * signed in (handled in AuthContext), so e-mails follow the interface language.
 */
export default function LanguageSwitcher() {
  const { locale, setLocale, locales, t } = useI18n();

  return (
    <div
      className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5"
      role="group"
      aria-label={t("nav.language")}
    >
      {locales.map((l) => {
        const active = l.code === locale;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLocale(l.code)}
            aria-pressed={active}
            title={l.label}
            className={[
              "rounded-md px-2 py-1 text-xs font-semibold transition-colors",
              active
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
            ].join(" ")}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}
