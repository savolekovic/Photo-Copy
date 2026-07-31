import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { apiErrorMessage } from "../lib/apiErrorMessage.js";
import { HOME_BY_ROLE, STUDENT_EMAIL_DOMAINS } from "../constants.js";

/**
 * Landing page for the emailed link. It POSTs the token rather than the link being a GET
 * endpoint, so mail scanners that pre-fetch URLs cannot burn the single-use token.
 */
export default function LoginVerifyPage() {
  const { t } = useI18n();
  const { verify } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [error, setError] = useState("");
  // The token is single-use, so it must be redeemed exactly once. StrictMode runs effects
  // twice in development; without this guard the second run would report a false failure.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!token) {
      setError(t("auth.error.invalid_token"));
      return;
    }

    verify(token)
      .then((user) => {
        navigate(HOME_BY_ROLE[user.role] ?? "/", { replace: true });
      })
      .catch((err) => {
        setError(apiErrorMessage(err, t, { domains: STUDENT_EMAIL_DOMAINS }));
      });
  }, [token, verify, navigate, t]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-soft">
          <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-700">
            !
          </div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900">
            {t("auth.verifyFailedTitle")}
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">{error}</p>
          <Link
            to="/prijava"
            className="mt-6 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            {t("auth.backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <p className="py-24 text-center text-sm text-slate-500">{t("auth.verifying")}</p>
  );
}
