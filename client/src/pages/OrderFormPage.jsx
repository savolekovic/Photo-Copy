import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchCatalogueFaculties,
  fetchCatalogueYears,
  fetchLiterature,
  submitOrder,
} from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { apiErrorMessage } from "../lib/apiErrorMessage.js";
import { yearLabel } from "../lib/orderLabels.js";

/**
 * The student ordering flow. Five steps, mirroring the spec: fakultet → godina →
 * materijali → pregled → potvrda.
 *
 * Faculties, years and materials all come from the administrable catalogue, so nothing is
 * hardcoded. Each step only offers options that actually have something behind them —
 * a faculty with no material never appears, and neither does an empty year.
 *
 * There is no e-mail step: the address comes from the verified university account.
 */
const STEP_KEYS = [
  "form.step.faculty",
  "form.step.year",
  "form.step.literature",
  "form.step.overview",
  "form.step.confirm",
];

const LAST_STEP = STEP_KEYS.length - 1;

export default function OrderFormPage() {
  const { t, locale, formatPrice } = useI18n();
  const { user } = useAuth();

  const [step, setStep] = useState(0);

  const [faculties, setFaculties] = useState([]);
  const [facultyId, setFacultyId] = useState(null);
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [materialId, setMaterialId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [litSearch, setLitSearch] = useState("");

  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [orderDone, setOrderDone] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);

  const faculty = useMemo(
    () => faculties.find((f) => f.id === facultyId) ?? null,
    [faculties, facultyId]
  );
  const year = useMemo(() => years.find((y) => y.id === yearId) ?? null, [years, yearId]);
  const material = useMemo(
    () => materials.find((m) => m.id === materialId) ?? null,
    [materials, materialId]
  );

  const filteredMaterials = useMemo(() => {
    const q = litSearch.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.author ?? "").toLowerCase().includes(q) ||
        (m.programmes ?? []).some((p) => p.toLowerCase().includes(q))
    );
  }, [materials, litSearch]);

  // Faculties, once.
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setLoadError("");
    fetchCatalogueFaculties({ signal: ac.signal })
      .then(setFaculties)
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(apiErrorMessage(e, t));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [t]);

  // Years for the chosen faculty. Selecting a different faculty invalidates the rest.
  useEffect(() => {
    if (!facultyId) return;
    const ac = new AbortController();
    setLoading(true);
    setLoadError("");
    fetchCatalogueYears(facultyId, { signal: ac.signal })
      .then((rows) => {
        setYears(rows);
        setYearId((prev) => (rows.some((r) => r.id === prev) ? prev : null));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(apiErrorMessage(e, t));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [facultyId, t]);

  // Materials for faculty + year.
  useEffect(() => {
    if (!facultyId || !yearId) return;
    const ac = new AbortController();
    setLoading(true);
    setLoadError("");
    fetchLiterature(facultyId, yearId, { signal: ac.signal })
      .then((rows) => {
        setMaterials(rows);
        setMaterialId((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoadError(apiErrorMessage(e, t));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [facultyId, yearId, t]);

  const canNext = useCallback(
    (s) => {
      if (s === 0) return Boolean(facultyId);
      if (s === 1) return Boolean(yearId);
      if (s === 2) return Boolean(material);
      return true;
    },
    [facultyId, yearId, material]
  );

  const goNext = () => {
    if (!canNext(step)) return;
    setStep((x) => Math.min(x + 1, LAST_STEP));
  };
  const goBack = () => {
    setSubmitError("");
    setStep((x) => Math.max(x - 1, 0));
  };

  const handleSubmit = async () => {
    if (!material || !facultyId || !yearId) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await submitOrder({
        faculty_id: facultyId,
        year_id: yearId,
        material_id: material.id,
        price: material.price,
        phone: phone.trim() || undefined,
      });
      setCompletedOrder(result);
      setOrderDone(true);
    } catch (e) {
      setSubmitError(apiErrorMessage(e, t));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(0);
    setFacultyId(null);
    setYears([]);
    setYearId(null);
    setMaterials([]);
    setMaterialId(null);
    setLitSearch("");
    setPhone("");
    setOrderDone(false);
    setCompletedOrder(null);
    setSubmitError("");
  };

  const total = material ? Number(material.price) : 0;

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-3xl">
        <header className="mb-10 text-center">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">
            {t("form.heading")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {t("form.title")}
          </h1>
        </header>

        <nav className="mb-10 w-full" aria-label="Progress">
          <ol className="-mx-1 flex flex-nowrap items-center justify-between gap-1 overflow-x-auto px-1 pb-1 sm:gap-2 md:gap-3 [scrollbar-width:thin]">
            {STEP_KEYS.map((key, i) => (
              <li key={key} className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
                <span
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors duration-300 sm:h-8 sm:w-8 sm:text-xs",
                    i === step
                      ? "bg-slate-900 text-white shadow-soft"
                      : i < step
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-600",
                  ].join(" ")}
                  aria-current={i === step ? "step" : undefined}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                <span
                  className={[
                    "hidden whitespace-nowrap text-[11px] transition-colors duration-300 sm:inline sm:text-xs md:text-sm",
                    i === step ? "font-semibold text-slate-900" : "text-slate-500",
                  ].join(" ")}
                >
                  {t(key)}
                </span>
              </li>
            ))}
          </ol>
        </nav>

        <div
          className="rounded-2xl border border-slate-100/80 bg-white p-6 shadow-soft transition-all duration-300 ease-out sm:p-8"
          style={{ minHeight: "320px" }}
        >
          <div key={step} className="animate-fade-in">
            {loadError && (
              <p className="mb-4 text-sm text-red-600" role="alert">
                {loadError}
              </p>
            )}

            {step === 0 && (
              <ChoiceStep
                titleKey="form.faculty.title"
                subtitleKey="form.faculty.subtitle"
                loading={loading && faculties.length === 0}
                items={faculties}
                selectedId={facultyId}
                onSelect={setFacultyId}
                labelOf={(f) => f.name}
                subLabelOf={(f) => f.short_name}
                emptyKey="form.literature.empty"
                layout="grid"
              />
            )}

            {step === 1 && (
              <ChoiceStep
                titleKey="form.year.title"
                subtitleKey="form.year.subtitle"
                loading={loading && years.length === 0}
                items={years}
                selectedId={yearId}
                onSelect={setYearId}
                labelOf={(y) => yearLabel(y, locale)}
                emptyKey="form.literature.empty"
                layout="pills"
              />
            )}

            {step === 2 && (
              <StepMaterials
                loading={loading && materials.length === 0}
                search={litSearch}
                onSearchChange={setLitSearch}
                items={filteredMaterials}
                selectedId={materialId}
                onSelect={setMaterialId}
              />
            )}

            {step === 3 && (
              <StepOverview
                facultyName={faculty?.name}
                yearName={year ? yearLabel(year, locale) : null}
                material={material}
                total={total}
                email={user?.email}
                phone={phone}
                onPhone={setPhone}
              />
            )}

            {step === 4 && !orderDone && (
              <StepConfirm
                facultyName={faculty?.name}
                yearName={year ? yearLabel(year, locale) : null}
                material={material}
                total={total}
                email={user?.email}
                phone={phone}
                onSubmit={handleSubmit}
                submitting={submitting}
                error={submitError}
              />
            )}

            {step === 4 && orderDone && (
              <div className="py-6 text-center">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
                  ✓
                </div>
                <h2 className="mb-2 text-xl font-semibold text-slate-900">
                  {t("form.done.title")}
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  {completedOrder?.emailSent
                    ? t("form.done.emailSent", { email: user?.email })
                    : t("form.done.emailFailed", { email: user?.email })}
                </p>
                <p className="mt-3 text-sm text-slate-500">{t("form.done.next")}</p>
                {completedOrder?.emailError && (
                  <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
                    {completedOrder.emailError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {!(step === LAST_STEP && orderDone) && (
          <div className="mt-8 flex justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || submitting}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-40"
            >
              {t("common.back")}
            </button>
            {step < LAST_STEP && (
              <button
                type="button"
                onClick={goNext}
                disabled={!canNext(step)}
                className="ml-auto rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-slate-800 disabled:opacity-40"
              >
                {t("common.continue")}
              </button>
            )}
          </div>
        )}

        {step === LAST_STEP && orderDone && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/moje-narudzbine"
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              {t("form.done.viewOrders")}
            </Link>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              {t("form.done.newOrder")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Faculty and year steps differ only in layout and labelling, so they share one component. */
function ChoiceStep({
  titleKey,
  subtitleKey,
  loading,
  items,
  selectedId,
  onSelect,
  labelOf,
  subLabelOf,
  emptyKey,
  layout,
}) {
  const { t } = useI18n();
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">{t(titleKey)}</h2>
      <p className="mb-6 text-sm text-slate-500">{t(subtitleKey)}</p>

      {loading && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-500">{t(emptyKey)}</p>
      )}

      {layout === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={[
                "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all duration-200",
                selectedId === item.id
                  ? "border-slate-900 bg-slate-900 text-white shadow-soft"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-300",
              ].join(" ")}
            >
              {labelOf(item)}
              {subLabelOf?.(item) ? (
                <span
                  className={
                    selectedId === item.id
                      ? "ml-2 text-xs text-slate-300"
                      : "ml-2 text-xs text-slate-500"
                  }
                >
                  {subLabelOf(item)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={[
                "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                selectedId === item.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
            >
              {labelOf(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepMaterials({ loading, search, onSearchChange, items, selectedId, onSelect }) {
  const { t, formatPrice } = useI18n();
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">
        {t("form.literature.title")}
      </h2>
      <p className="mb-4 text-sm text-slate-500">{t("form.literature.subtitle")}</p>

      <label htmlFor="lit-search" className="mb-1.5 block text-xs font-medium text-slate-500">
        {t("form.literature.searchLabel")}
      </label>
      <input
        id="lit-search"
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t("form.literature.searchPlaceholder")}
        className="mb-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
      />

      {loading && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-500">{t("form.literature.empty")}</p>
      )}

      {items.length > 0 && (
        <ul
          className="max-h-72 space-y-2 overflow-y-auto pr-1"
          role="listbox"
          aria-label={t("form.literature.title")}
        >
          {items.map((item) => {
            const selected = selectedId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect(item.id)}
                  className={[
                    "flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-200",
                    selected
                      ? "border-slate-900 bg-slate-900 text-white shadow-soft"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80",
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={[
                        "block text-sm font-medium",
                        selected ? "text-white" : "text-slate-900",
                      ].join(" ")}
                    >
                      {item.name}
                    </span>
                    {item.author && (
                      <span
                        className={[
                          "block text-xs",
                          selected ? "text-slate-300" : "text-slate-500",
                        ].join(" ")}
                      >
                        {item.author}
                      </span>
                    )}
                    <span
                      className={[
                        "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs",
                        selected ? "text-slate-300" : "text-slate-500",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "rounded px-1.5 py-0.5",
                          selected ? "bg-white/15" : "bg-slate-100",
                        ].join(" ")}
                      >
                        {t(`materialType.${item.material_type}`)}
                      </span>
                      {/* Programme is shown rather than being its own step, per the spec's
                          faculty → year → materials flow. */}
                      {(item.programmes ?? []).join(" · ")}
                    </span>
                    <span
                      className={[
                        "mt-1 block text-sm tabular-nums",
                        selected ? "text-slate-200" : "text-slate-700",
                      ].join(" ")}
                    >
                      {formatPrice(item.price)}
                    </span>
                  </span>
                  <span
                    className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      selected ? "bg-white/20 text-white" : "border-2 border-slate-200 bg-white",
                    ].join(" ")}
                    aria-hidden
                  >
                    {selected ? "✓" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SummaryRow({ label, value, strong }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "font-medium text-slate-700" : "text-slate-500"}>{label}</dt>
      <dd
        className={[
          "max-w-[60%] text-right",
          strong ? "font-semibold text-slate-900" : "font-medium text-slate-900",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function StepOverview({ facultyName, yearName, material, total, email, phone, onPhone }) {
  const { t, formatPrice } = useI18n();
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">{t("form.overview.title")}</h2>
      <p className="mb-6 text-sm text-slate-500">{t("form.overview.subtitle")}</p>

      <dl className="space-y-3 text-sm">
        <SummaryRow label={t("orders.details.faculty")} value={facultyName ?? t("common.dash")} />
        <SummaryRow label={t("orders.details.year")} value={yearName ?? t("common.dash")} />
        <SummaryRow
          label={t("orders.details.literature")}
          value={material?.name ?? t("common.dash")}
        />
        <SummaryRow label={t("orders.details.email")} value={email} />
        <div className="border-t border-slate-100 pt-3">
          <SummaryRow
            label={t("common.total")}
            value={material ? formatPrice(total) : t("common.dash")}
            strong
          />
        </div>
      </dl>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <label htmlFor="phone" className="mb-1.5 block text-xs font-medium text-slate-500">
          {t("form.contact.phoneLabel")}{" "}
          <span className="text-slate-400">({t("common.optional")})</span>
        </label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => onPhone(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
        />
        <p className="mt-1.5 text-xs text-slate-500">{t("form.contact.subtitle")}</p>
      </div>
    </div>
  );
}

function StepConfirm({
  facultyName,
  yearName,
  material,
  total,
  email,
  phone,
  onSubmit,
  submitting,
  error,
}) {
  const { t, formatPrice } = useI18n();
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">{t("form.confirm.title")}</h2>
      <p className="mb-6 text-sm text-slate-500">{t("form.confirm.subtitle")}</p>

      <dl className="mb-6 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
        <SummaryRow label={t("orders.details.faculty")} value={facultyName ?? t("common.dash")} />
        <SummaryRow label={t("orders.details.year")} value={yearName ?? t("common.dash")} />
        <SummaryRow
          label={t("orders.details.literature")}
          value={material?.name ?? t("common.dash")}
        />
        <SummaryRow label={t("orders.details.email")} value={email} />
        {phone ? <SummaryRow label={t("orders.details.phone")} value={phone} /> : null}
        <SummaryRow label={t("common.total")} value={formatPrice(total)} strong />
      </dl>

      {error && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
      >
        {submitting ? t("form.confirm.submitting") : t("form.confirm.submit")}
      </button>
    </div>
  );
}
