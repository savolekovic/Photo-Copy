import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { fetchOrderSummary } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import LanguageSwitcher from "./LanguageSwitcher.jsx";

/**
 * Back-office shell for the operator. A persistent sidebar suits a tool worked all day and
 * flattens what used to be a top nav plus tabs nested inside a page.
 *
 * The queue sits above the administration group and carries live counts, because processing
 * orders is the daily job and editing the catalogue is occasional — a flat list of equals
 * would misrepresent that.
 *
 * The student flow deliberately keeps the plain header layout: a five-step wizard has one
 * destination and gains nothing from a sidebar.
 */

const ADMIN_SECTIONS = [
  { slug: "fakulteti", labelKey: "admin.tab.faculties" },
  { slug: "programi", labelKey: "admin.tab.programmes" },
  { slug: "godine", labelKey: "admin.tab.years" },
  { slug: "predmeti", labelKey: "admin.tab.subjects" },
  { slug: "materijali", labelKey: "admin.tab.materials" },
];

/** Queue views are query-string driven, so each is linkable and survives a refresh. */
const QUEUES = [
  { status: "active", labelKey: "op.queue.active", countKey: "active" },
  { status: "spremno", labelKey: "op.queue.ready", countKey: "spremno" },
  { status: "all", labelKey: "op.queue.all", countKey: null },
];

export default function OperatorLayout() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Counts follow the route so they refresh after a status change.
  useEffect(() => {
    const ac = new AbortController();
    fetchOrderSummary({ signal: ac.signal })
      .then(setSummary)
      .catch(() => setSummary(null));
    return () => ac.abort();
  }, [location.key]);

  // A drawer that stays open after navigating would cover the page it just opened.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/prijava", { replace: true });
  };

  const currentStatus = new URLSearchParams(location.search).get("status") ?? "active";
  const onOrders = location.pathname.startsWith("/narudzbine");

  const itemClass = (active) =>
    [
      "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
      active
        ? "bg-slate-900 font-medium text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    ].join(" ");

  const groupLabel =
    "px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400";

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-3 py-4">
        <NavLink to="/narudzbine" className="text-sm font-semibold tracking-tight text-slate-900">
          {t("brand.name")}
        </NavLink>
      </div>

      <nav className="flex-1 overflow-y-auto px-2" aria-label={t("op.menu")}>
        <p className={groupLabel}>{t("op.group.orders")}</p>
        {QUEUES.map((q) => {
          const active = onOrders && currentStatus === q.status;
          const count = q.countKey ? summary?.[q.countKey] ?? summary?.counts?.[q.countKey] : null;
          return (
            <NavLink
              key={q.status}
              to={`/narudzbine?status=${q.status}`}
              className={itemClass(active)}
            >
              <span>{t(q.labelKey)}</span>
              {count ? (
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                    active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700",
                  ].join(" ")}
                >
                  {count}
                </span>
              ) : null}
            </NavLink>
          );
        })}

        {/* The report reads the queue rather than being a queue itself, so it sits with the
            orders group but without a count of its own. */}
        <NavLink to="/izvjestaj" className={({ isActive }) => itemClass(isActive)}>
          <span>{t("report.nav")}</span>
        </NavLink>

        <p className={groupLabel}>{t("op.group.admin")}</p>
        {ADMIN_SECTIONS.map((s) => (
          <NavLink
            key={s.slug}
            to={`/administracija/${s.slug}`}
            className={({ isActive }) => itemClass(isActive)}
          >
            <span>{t(s.labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-3 border-t border-slate-200 px-3 py-3">
        <LanguageSwitcher />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            {t("op.signedInAs")}
          </p>
          <p className="truncate text-xs text-slate-600" title={user?.email}>
            {user?.email}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          {t("nav.logout")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop: always present. Mobile: a drawer, since the counter may be a tablet. */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label={t("op.closeMenu")}
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-slate-200 bg-white">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t("op.menu")}
            className="rounded-lg border border-slate-200 p-2 text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-900">{t("brand.name")}</span>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
