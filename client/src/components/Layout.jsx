import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";

const linkClass = ({ isActive }) =>
  [
    "text-sm font-medium transition-colors px-3 py-2 rounded-lg",
    isActive
      ? "bg-slate-900 text-white"
      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
  ].join(" ");

export default function Layout() {
  const { t } = useI18n();
  const { user, isStudent, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/prijava", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <NavLink
            to="/"
            className="text-sm font-semibold tracking-tight text-slate-900"
          >
            {t("brand.name")}
          </NavLink>

          <div className="flex flex-wrap items-center gap-2">
            {/* Navigation is role-scoped: a student never sees the operator queue. */}
            <nav className="flex items-center gap-1" aria-label="Main">
              {isStudent && (
                <>
                  <NavLink to="/" className={linkClass} end>
                    {t("nav.newOrder")}
                  </NavLink>
                  <NavLink to="/moje-narudzbine" className={linkClass}>
                    {t("nav.myOrders")}
                  </NavLink>
                </>
              )}
              {!user && (
                <NavLink to="/prijava" className={linkClass}>
                  {t("nav.login")}
                </NavLink>
              )}
            </nav>

            <LanguageSwitcher />

            {user && (
              <div className="flex items-center gap-2 border-l border-slate-200 pl-2">
                <span
                  className="hidden max-w-[14rem] truncate text-xs text-slate-500 sm:inline"
                  title={user.email}
                >
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  {t("nav.logout")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
