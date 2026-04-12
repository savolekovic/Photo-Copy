import { NavLink, Outlet } from "react-router-dom";

const linkClass = ({ isActive }) =>
  [
    "text-sm font-medium transition-colors px-3 py-2 rounded-lg",
    isActive
      ? "bg-slate-900 text-white"
      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
  ].join(" ");

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <NavLink
            to="/"
            className="text-sm font-semibold text-slate-900 tracking-tight"
          >
            Photocopy
          </NavLink>
          <nav className="flex items-center gap-1" aria-label="Main">
            <NavLink to="/" className={linkClass} end>
              New order
            </NavLink>
            <NavLink to="/orders" className={linkClass}>
              Orders
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
