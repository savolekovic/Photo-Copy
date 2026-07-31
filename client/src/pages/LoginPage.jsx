import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { apiErrorMessage } from "../lib/apiErrorMessage.js";
import { HOME_BY_ROLE, STUDENT_EMAIL_DOMAINS } from "../constants.js";

/**
 * Sign-in and registration in one screen: a first-time university address simply becomes
 * an account when the link is clicked, so there is no separate signup form.
 */
export default function LoginPage() {
  const { t } = useI18n();
  const { user, loading, requestLink } = useAuth();

  const [email, setEmail] = useState("");
  const [indexNumber, setIndexNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [delivered, setDelivered] = useState(true);

  if (loading) {
    return (
      <p className="py-20 text-center text-sm text-slate-500">{t("common.loading")}</p>
    );
  }
  if (user) {
    return <Navigate to={HOME_BY_ROLE[user.role] ?? "/"} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await requestLink(email.trim(), indexNumber.trim());
      setDelivered(result.emailSent !== false);
      setSent(true);
    } catch (err) {
      setError(apiErrorMessage(err, t, { domains: STUDENT_EMAIL_DOMAINS }));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-soft text-center">
          <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
            ✓
          </div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900">
            {t("auth.sentTitle")}
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            {t("auth.sentBody", { email: email.trim() })}
          </p>
          <p className="mt-3 text-xs text-slate-500">{t("auth.sentExpiry")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("auth.sentSpam")}</p>

          {!delivered && (
            <p
              className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900"
              role="alert"
            >
              {t("auth.notDelivered")}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setSent(false);
              setError("");
            }}
            className="mt-6 text-sm font-medium text-slate-700 underline hover:text-slate-900"
          >
            {t("auth.sentAgain")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t("auth.title")}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
          {t("auth.subtitle")}
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft sm:p-8"
      >
        <div>
          <label
            htmlFor="login-email"
            className="mb-1.5 block text-xs font-medium text-slate-500"
          >
            {t("auth.emailLabel")} <span className="text-red-500">*</span>
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            {t("auth.emailHint", { domains: STUDENT_EMAIL_DOMAINS })}
          </p>
        </div>

        <div>
          <label
            htmlFor="login-index"
            className="mb-1.5 block text-xs font-medium text-slate-500"
          >
            {t("auth.indexLabel")}
          </label>
          <input
            id="login-index"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={indexNumber}
            onChange={(e) => setIndexNumber(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
          />
          <p className="mt-1.5 text-xs text-slate-500">{t("auth.indexHint")}</p>
        </div>

        {error && (
          <p
            className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? t("auth.sending") : t("auth.submit")}
        </button>
      </form>
    </div>
  );
}
