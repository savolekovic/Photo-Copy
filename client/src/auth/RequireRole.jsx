import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { HOME_BY_ROLE } from "../constants.js";

/**
 * Route guard. Client-side only and purely for navigation — every endpoint enforces the
 * same rules server-side, so bypassing this reveals nothing.
 *
 * @param {string|string[]} [role] Required role(s). Omit to require only a session.
 */
export default function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) {
    return (
      <p className="py-24 text-center text-sm text-slate-500">{t("common.loading")}</p>
    );
  }

  if (!user) {
    // Remember where they were headed so the login flow can return them there later.
    return <Navigate to="/prijava" replace state={{ from: location.pathname }} />;
  }

  const allowed = role === undefined || [].concat(role).includes(user.role);
  if (!allowed) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">
          {t("auth.wrongRoleTitle")}
        </h1>
        <p className="text-sm text-slate-600">{t("auth.wrongRoleBody")}</p>
        <Link
          to={HOME_BY_ROLE[user.role] ?? "/"}
          className="mt-6 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          {t(user.role === "operator" ? "nav.orders" : "nav.newOrder")}
        </Link>
      </div>
    );
  }

  return children;
}
