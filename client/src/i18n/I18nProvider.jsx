import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, LOCALES, messages } from "./messages.js";

/**
 * Minimal i18n layer — a dictionary lookup plus `{placeholder}` interpolation.
 * Deliberately dependency-free: with two locales and flat keys, a full i18n library
 * would add more weight than it saves.
 */

const STORAGE_KEY = "photocopy_locale";
const CODES = LOCALES.map((l) => l.code);

const I18nContext = createContext(null);

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && CODES.includes(stored) ? stored : null;
  } catch {
    // Private browsing can throw on access; fall back to the default.
    return null;
  }
}

function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(() => readStoredLocale() ?? DEFAULT_LOCALE);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* non-fatal */
    }
    // Keeps screen readers and `lang`-scoped CSS in sync with the chosen language.
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (CODES.includes(next)) setLocaleState(next);
  }, []);

  /**
   * Look up `key`, falling back to the default locale, then to the key itself so a
   * missing string is visible in the UI rather than rendering blank.
   */
  const t = useCallback(
    (key, vars) => {
      const table = messages[locale] ?? messages[DEFAULT_LOCALE];
      const template = table[key] ?? messages[DEFAULT_LOCALE][key] ?? key;
      return vars ? interpolate(template, vars) : template;
    },
    [locale]
  );

  /**
   * Plural-aware lookup. Montenegrin agrees differently at 1, 2–4 and 5+ ("1 materijal",
   * "4 materijala"), and the rule is not "n === 1", so Intl.PluralRules decides which of
   * `<key>.one` / `.few` / `.other` to use rather than a hand-rolled condition.
   */
  const tn = useCallback(
    (baseKey, count, vars) => {
      let form = "other";
      try {
        form = new Intl.PluralRules(locale).select(count);
      } catch {
        form = count === 1 ? "one" : "other";
      }
      const table = messages[locale] ?? messages[DEFAULT_LOCALE];
      const key = table[`${baseKey}.${form}`] ? `${baseKey}.${form}` : `${baseKey}.other`;
      return t(key, { count, ...vars });
    },
    [locale, t]
  );

  /** Locale-aware date helpers, so every screen formats dates the same way. */
  const formatDate = useCallback(
    (iso, opts = { dateStyle: "medium" }) => {
      if (!iso) return "—";
      try {
        return new Intl.DateTimeFormat(locale, opts).format(new Date(iso));
      } catch {
        return String(iso);
      }
    },
    [locale]
  );

  const formatDateTime = useCallback(
    (iso) => formatDate(iso, { dateStyle: "medium", timeStyle: "short" }),
    [formatDate]
  );

  /**
   * Prices are in euro. Intl places the symbol and decimal separator per locale, so
   * sr-ME renders "12,50 €" and en renders "€12.50" — both correct for their reader.
   */
  const formatPrice = useCallback(
    (value) => {
      if (value === null || value === undefined || value === "") return "—";
      const n = Number(value);
      if (Number.isNaN(n)) return "—";
      try {
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "EUR",
        }).format(n);
      } catch {
        return `${n.toFixed(2)} €`;
      }
    },
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      tn,
      formatDate,
      formatDateTime,
      formatPrice,
      locales: LOCALES,
    }),
    [locale, setLocale, t, tn, formatDate, formatDateTime, formatPrice]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
