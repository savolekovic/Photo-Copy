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
import { useCart } from "../lib/useCart.js";

/**
 * The student ordering flow. Five steps, mirroring the spec: fakultet → godina →
 * materijali (korpa) → pregled → potvrda.
 *
 * Faculties, years and materials all come from the administrable catalogue, so nothing is
 * hardcoded, and each step only offers options that have something behind them.
 *
 * The faculty and year choices scope what the catalogue step SHOWS; they do not scope the
 * cart. Going back and picking another faculty keeps everything already added, so a student
 * can order a language from the Centar za strane jezike alongside their own programme's
 * literature, or a subject being retaken from an earlier year, in one order — and collect it
 * in one go. Each line remembers where it was picked from.
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

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [litSearch, setLitSearch] = useState("");

  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [orderDone, setOrderDone] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);

  const cart = useCart();

  const faculty = useMemo(
    () => faculties.find((f) => f.id === facultyId) ?? null,
    [faculties, facultyId]
  );
  const year = useMemo(() => years.find((y) => y.id === yearId) ?? null, [years, yearId]);

  /**
   * Stamped onto each line as it is added. The names travel with the line so the cart can
   * group and label itself after the student has moved on to another faculty, without
   * refetching a catalogue that is no longer on screen.
   */
  const scope = useMemo(
    () =>
      faculty && year
        ? {
            facultyId: faculty.id,
            facultyName: faculty.name,
            yearId: year.id,
            yearLabel: yearLabel(year, locale),
          }
        : null,
    [faculty, year, locale]
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

  useEffect(() => {
    if (!facultyId || !yearId) return;
    const ac = new AbortController();
    setLoading(true);
    setLoadError("");
    fetchLiterature(facultyId, yearId, { signal: ac.signal })
      .then(setMaterials)
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
      if (s === 2) return cart.count > 0;
      return true;
    },
    [facultyId, yearId, cart.count]
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
    // No order-level faculty or year to check: every line carries its own.
    if (cart.count === 0) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await submitOrder({
        items: cart.lines.map((l) => ({
          material_id: l.materialId,
          quantity: l.quantity,
          faculty_id: l.facultyId,
          year_id: l.yearId,
        })),
        // Guards against the catalogue price changing between review and confirm.
        expected_total: cart.total,
        phone: phone.trim() || undefined,
      });
      setCompletedOrder(result);
      setOrderDone(true);
      cart.clear();
    } catch (e) {
      // Both of these are recoverable, so say what happened and send the student back to
      // the cart rather than leaving them stuck on the confirm step.
      if (e.code === "price_mismatch") {
        setSubmitError(t("cart.totalChanged"));
        setStep(2);
      } else if (e.code === "material_unavailable") {
        cart.removeMany(e.materialIds ?? []);
        setSubmitError(t("cart.unavailable"));
        setStep(2);
      } else {
        setSubmitError(apiErrorMessage(e, t));
      }
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
    setLitSearch("");
    setPhone("");
    setOrderDone(false);
    setCompletedOrder(null);
    setSubmitError("");
    cart.clear();
  };

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
            {submitError && step === 2 && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
                {submitError}
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
                layout="pills"
              />
            )}

            {step === 2 && (
              <StepMaterials
                loading={loading && materials.length === 0}
                search={litSearch}
                onSearchChange={setLitSearch}
                items={filteredMaterials}
                cart={cart}
                scope={scope}
                onChangeScope={() => setStep(0)}
              />
            )}

            {step === 3 && (
              <StepOverview
                cart={cart}
                email={user?.email}
                phone={phone}
                onPhone={setPhone}
              />
            )}

            {step === 4 && !orderDone && (
              <StepConfirm
                cart={cart}
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
                {completedOrder?.total != null && (
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    {t("common.total")}: {formatPrice(completedOrder.total)}
                  </p>
                )}
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
          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || submitting}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-40"
            >
              {t("common.back")}
            </button>
            {cart.count > 0 && step < LAST_STEP && (
              <span className="text-xs text-slate-500">
                {t("cart.itemCount", { count: cart.count })} · {formatPrice(cart.total)}
              </span>
            )}
            {step < LAST_STEP && (
              <button
                type="button"
                onClick={goNext}
                disabled={!canNext(step)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-slate-800 disabled:opacity-40"
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
  layout,
}) {
  const { t } = useI18n();
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">{t(titleKey)}</h2>
      <p className="mb-6 text-sm text-slate-500">{t(subtitleKey)}</p>

      {loading && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-500">{t("form.literature.empty")}</p>
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

/** − N + control. Dropping to zero removes the line, which is what students expect. */
function QuantityStepper({ quantity, onChange }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        aria-label={t("cart.decrease")}
        className="px-2 py-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        −
      </button>
      <span className="min-w-[1.75rem] text-center text-sm font-medium tabular-nums text-slate-900">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        aria-label={t("cart.increase")}
        className="px-2 py-1 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        +
      </button>
    </span>
  );
}

function StepMaterials({ loading, search, onSearchChange, items, cart, scope, onChangeScope }) {
  const { t, formatPrice } = useI18n();
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">
        {t("form.literature.title")}
      </h2>
      <p className="mb-1 text-sm text-slate-500">{t("form.literature.subtitle")}</p>
      <p className="mb-4 text-xs text-slate-400">{t("cart.scopeNote")}</p>

      {/* Which faculty and year this list belongs to. Stated here because the cart may hold
          lines from elsewhere, so the list alone no longer implies the whole order. */}
      {scope && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="min-w-0 text-xs text-slate-600">
            {t("cart.showing")}{" "}
            <span className="font-medium text-slate-900">{scope.facultyName}</span>
            <span className="text-slate-400"> · </span>
            <span className="font-medium text-slate-900">{scope.yearLabel}</span>
          </span>
          <button
            type="button"
            onClick={onChangeScope}
            className="shrink-0 text-xs font-medium text-slate-600 underline hover:text-slate-900"
          >
            {t("cart.changeScope")}
          </button>
        </div>
      )}

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
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const qty = cart.quantityOf(item.id);
            const inCart = qty > 0;
            return (
              <li
                key={item.id}
                className={[
                  "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-3",
                  inCart ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white",
                ].join(" ")}
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{item.name}</span>
                  {item.author && (
                    <span className="block text-xs text-slate-500">{item.author}</span>
                  )}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">
                      {t(`materialType.${item.material_type}`)}
                    </span>
                    {(item.programmes ?? []).join(" · ")}
                  </span>
                  <span className="mt-1 block text-sm tabular-nums text-slate-700">
                    {formatPrice(item.price)}
                  </span>
                </div>

                {inCart ? (
                  <div className="flex items-center gap-2">
                    <QuantityStepper
                      quantity={qty}
                      onChange={(q) => cart.setQuantity(item.id, q)}
                    />
                    <button
                      type="button"
                      onClick={() => cart.remove(item.id)}
                      className="text-xs font-medium text-rose-700 underline hover:text-rose-900"
                    >
                      {t("cart.remove")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => cart.add(item, scope)}
                    disabled={!scope}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    {t("cart.add")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <CartPanel cart={cart} onAddFromElsewhere={onChangeScope} />
      </div>
    </div>
  );
}

/**
 * The korpa itself: line totals and a running sum.
 *
 * Lines are grouped by the faculty and year they were picked from. With one group the
 * headings are suppressed — the step already says which faculty is on screen and repeating
 * it on every line would be noise. With several, each group is labelled and subtotalled,
 * because that is the only place the mix is visible before the order is placed.
 */
function CartPanel({ cart, readOnly = false, onAddFromElsewhere }) {
  const { t, tn, formatPrice } = useI18n();

  if (cart.lines.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center">
        <p className="text-sm text-slate-600">{t("cart.empty")}</p>
        <p className="mt-1 text-xs text-slate-500">{t("cart.emptyHint")}</p>
      </div>
    );
  }

  const mixed = cart.groups.length > 1;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {t("cart.title")}
          {mixed && (
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
              {tn("cart.groupCount", cart.groups.length)}
            </span>
          )}
        </h3>
        {!readOnly && (
          <button
            type="button"
            onClick={cart.clear}
            className="shrink-0 text-xs font-medium text-slate-500 underline hover:text-slate-800"
          >
            {t("cart.clear")}
          </button>
        )}
      </div>

      {mixed && <p className="mb-2 text-xs text-slate-500">{t("cart.mixedNote")}</p>}

      <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {cart.groups.map((g) => (
          <div key={g.key}>
            {mixed && (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-slate-50 px-3 py-2">
                <span className="min-w-0 text-xs font-medium text-slate-700">
                  {g.facultyName}
                  <span className="text-slate-400"> · </span>
                  {g.yearLabel}
                </span>
                <span className="text-xs tabular-nums text-slate-500">
                  {formatPrice(g.total)}
                </span>
              </div>
            )}
            <ul className="divide-y divide-slate-100">
              {g.lines.map((l) => (
                <li key={l.materialId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 text-sm text-slate-900">{l.title}</span>
                  {readOnly ? (
                    <span className="text-xs text-slate-500">× {l.quantity}</span>
                  ) : (
                    <QuantityStepper
                      quantity={l.quantity}
                      onChange={(q) => cart.setQuantity(l.materialId, q)}
                    />
                  )}
                  <span className="w-20 text-right text-sm tabular-nums text-slate-800">
                    {formatPrice(l.unitPrice * l.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between px-3">
        <span className="text-sm font-medium text-slate-700">{t("common.total")}</span>
        <span className="text-base font-semibold tabular-nums text-slate-900">
          {formatPrice(cart.total)}
        </span>
      </div>

      {/* Offered once there is something in the cart: at that point "I am done with this
          faculty" is a real intent, and the way to act on it is not otherwise obvious. */}
      {!readOnly && onAddFromElsewhere && (
        <button
          type="button"
          onClick={onAddFromElsewhere}
          className="mt-3 w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
        >
          + {t("cart.addFromElsewhere")}
        </button>
      )}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

/**
 * The faculty and year of the order. One scope states itself plainly; several cannot be
 * reduced to one row, so the grouped cart below is left to spell the mix out.
 */
function ScopeRows({ cart }) {
  const { t } = useI18n();
  if (cart.groups.length !== 1) {
    return <SummaryRow label={t("orders.details.scope")} value={t("orders.details.mixed")} />;
  }
  const [only] = cart.groups;
  return (
    <>
      <SummaryRow
        label={t("orders.details.faculty")}
        value={only.facultyName ?? t("common.dash")}
      />
      <SummaryRow label={t("orders.details.year")} value={only.yearLabel ?? t("common.dash")} />
    </>
  );
}

function StepOverview({ cart, email, phone, onPhone }) {
  const { t } = useI18n();
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">{t("form.overview.title")}</h2>
      <p className="mb-6 text-sm text-slate-500">{t("form.overview.subtitle")}</p>

      <dl className="mb-6 space-y-3 text-sm">
        <ScopeRows cart={cart} />
        <SummaryRow label={t("orders.details.email")} value={email} />
      </dl>

      <CartPanel cart={cart} />

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

function StepConfirm({ cart, email, phone, onSubmit, submitting, error }) {
  const { t } = useI18n();
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">{t("form.confirm.title")}</h2>
      <p className="mb-6 text-sm text-slate-500">{t("form.confirm.subtitle")}</p>

      <dl className="mb-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
        <ScopeRows cart={cart} />
        <SummaryRow label={t("orders.details.email")} value={email} />
        {phone ? <SummaryRow label={t("orders.details.phone")} value={phone} /> : null}
      </dl>

      {/* Read-only here: the confirm step should show exactly what is about to be sent. */}
      <CartPanel cart={cart} readOnly />

      {error && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || cart.count === 0}
        className="mt-6 w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
      >
        {submitting ? t("form.confirm.submitting") : t("form.confirm.submit")}
      </button>
    </div>
  );
}
