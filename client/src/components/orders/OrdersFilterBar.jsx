import { ORDER_STATUSES } from "../../constants.js";
import { useI18n } from "../../i18n/I18nProvider.jsx";

const SORTS = [
  { value: "date-desc", labelKey: "orders.sort.dateDesc" },
  { value: "date-asc", labelKey: "orders.sort.dateAsc" },
  { value: "price-desc", labelKey: "orders.sort.priceDesc" },
  { value: "price-asc", labelKey: "orders.sort.priceAsc" },
];

function IconFaculty({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.716 50.716 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.358 55.358 0 0 1 12 8.443" />
    </svg>
  );
}

function IconCalendar({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5a2.25 2.25 0 0 0 2.25-2.25m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5a2.25 2.25 0 0 1 2.25 2.25v7.5" />
    </svg>
  );
}

function IconSort({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

/** Compact icon-triggered select. The native <select> sits invisibly on top so the
 *  control keeps full keyboard and mobile behaviour. */
function IconSelect({ icon: Icon, value, onChange, options, ariaLabel, title, active }) {
  return (
    <div
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white shadow-sm transition-colors hover:bg-slate-50 focus-within:ring-2 focus-within:ring-slate-900/15 ${
        active ? "border-slate-900/25 ring-1 ring-slate-900/10" : "border-slate-200"
      }`}
      title={title}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 z-10 cursor-pointer opacity-0"
        aria-label={ariaLabel}
      >
        {options.map((opt) => (
          <option key={opt.value === "" ? "__all" : opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Icon className={`pointer-events-none h-5 w-5 ${active ? "text-slate-900" : "text-slate-500"}`} />
      {active ? (
        <span className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-slate-900" />
      ) : null}
    </div>
  );
}

/**
 * @param {Array<{name: string}>} facultyOptions
 * @param {Array<{code: string, label_sr: string, label_en: string}>} yearOptions
 *
 * Orders store the faculty NAME and the year CODE as historical snapshots, so those are
 * what the filters match on — not ids, which would miss orders placed before a rename.
 */
export default function OrdersFilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  facultyFilter,
  onFacultyChange,
  yearFilter,
  onYearChange,
  sort,
  onSortChange,
  facultyOptions = [],
  yearOptions = [],
}) {
  const { t, locale } = useI18n();

  // "active" and "all" are pseudo-statuses the API understands alongside real ones.
  const statusOptions = [
    { value: "active", label: t("orders.filter.statusActive") },
    { value: "all", label: t("orders.filter.statusAll") },
    ...ORDER_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
  ];

  const sortLabel = t(SORTS.find((s) => s.value === sort)?.labelKey ?? "orders.filter.sort");

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
      <label className="block w-full">
        <span className="mb-1.5 block text-xs font-medium text-slate-500">
          {t("common.search")}
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("orders.filter.searchPlaceholder")}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/15"
          autoComplete="off"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        {/* Status is the operator's main lens, so it gets a labelled select rather than
            an icon they would have to discover. */}
        <label className="block min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="mb-1.5 block text-xs font-medium text-slate-500">
            {t("orders.col.status")}
          </span>
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/15"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <IconSelect
            icon={IconFaculty}
            value={facultyFilter}
            onChange={onFacultyChange}
            options={[
              { value: "", label: t("orders.filter.facultyAll") },
              ...facultyOptions.map((f) => ({ value: f.name, label: f.name })),
            ]}
            ariaLabel={t("orders.filter.faculty")}
            active={Boolean(facultyFilter)}
            title={
              facultyFilter
                ? `${t("orders.filter.faculty")}: ${facultyFilter}`
                : t("orders.filter.facultyAll")
            }
          />
          <IconSelect
            icon={IconCalendar}
            value={yearFilter}
            onChange={onYearChange}
            options={[
              { value: "", label: t("orders.filter.yearAll") },
              ...yearOptions.map((y) => ({
                value: y.code,
                label: (locale === "en" ? y.label_en : y.label_sr) || y.code,
              })),
            ]}
            ariaLabel={t("orders.filter.year")}
            active={Boolean(yearFilter)}
            title={
              yearFilter
                ? `${t("orders.filter.year")}: ${
                    yearOptions.find((y) => y.code === yearFilter)?.label_sr ?? yearFilter
                  }`
                : t("orders.filter.yearAll")
            }
          />
          <IconSelect
            icon={IconSort}
            value={sort}
            onChange={onSortChange}
            options={SORTS.map((s) => ({ value: s.value, label: t(s.labelKey) }))}
            ariaLabel={t("orders.filter.sort")}
            active={sort !== "date-desc"}
            title={`${t("orders.filter.sort")}: ${sortLabel}`}
          />
        </div>
      </div>
    </div>
  );
}
