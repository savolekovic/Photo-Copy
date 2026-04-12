import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchLiterature, submitOrder } from "../api.js";
import { FACULTIES, YEARS } from "../constants.js";

const STEPS = [
  "Faculty",
  "Year",
  "Literature",
  "Overview",
  "Contact",
  "Complete",
];

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
}

export default function OrderFormPage() {
  const [step, setStep] = useState(0);
  const [faculty, setFaculty] = useState("");
  const [year, setYear] = useState("");
  const [literatureList, setLiteratureList] = useState([]);
  const [literatureId, setLiteratureId] = useState(null);
  const [litSearch, setLitSearch] = useState("");
  const [litLoading, setLitLoading] = useState(false);
  const [litError, setLitError] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactErrors, setContactErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [orderDone, setOrderDone] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");

  const selectedLit = useMemo(
    () => literatureList.find((l) => l.id === literatureId) || null,
    [literatureList, literatureId]
  );

  const filteredLiterature = useMemo(() => {
    const q = litSearch.trim().toLowerCase();
    if (!q) return literatureList;
    return literatureList.filter((l) =>
      l.name.toLowerCase().includes(q)
    );
  }, [literatureList, litSearch]);

  useEffect(() => {
    if (step !== 2 || !faculty || !year) return;
    let cancelled = false;
    setLitLoading(true);
    setLitError("");
    fetchLiterature(faculty, year)
      .then((rows) => {
        if (cancelled) return;
        setLiteratureList(rows);
        setLiteratureId((prev) => {
          if (prev && rows.some((r) => r.id === prev)) return prev;
          return rows[0]?.id ?? null;
        });
      })
      .catch((e) => {
        if (!cancelled) setLitError(e.message || "Could not load options");
      })
      .finally(() => {
        if (!cancelled) setLitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, faculty, year]);

  const canNextFromStep = useCallback(
    (s) => {
      if (s === 0) return Boolean(faculty);
      if (s === 1) return Boolean(year);
      if (s === 2) return Boolean(selectedLit);
      if (s === 3) return true;
      if (s === 4) {
        const e = {};
        if (!email.trim()) e.email = "Email is required";
        else if (!isValidEmail(email)) e.email = "Enter a valid email";
        setContactErrors(e);
        return Object.keys(e).length === 0;
      }
      return true;
    },
    [faculty, year, selectedLit, email]
  );

  const goNext = () => {
    if (!canNextFromStep(step)) return;
    setStep((x) => Math.min(x + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setSubmitError("");
    setStep((x) => Math.max(x - 1, 0));
  };

  const handleSubmit = async () => {
    if (!selectedLit) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await submitOrder({
        faculty,
        year,
        literature_id: selectedLit.id,
        price: selectedLit.price,
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      setEmailSent(Boolean(result.emailSent));
      setEmailError(result.emailError || "");
      setOrderDone(true);
    } catch (e) {
      setSubmitError(e.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPrice = selectedLit ? Number(selectedLit.price) : 0;

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-lg">
        <header className="text-center mb-10">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500 mb-2">
            Academic photocopies
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">
            Place an order
          </h1>
        </header>

        <nav
          className="mb-10"
          aria-label="Progress"
        >
          <ol className="flex flex-wrap justify-center gap-2 sm:gap-3">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors duration-300",
                    i === step
                      ? "bg-slate-900 text-white shadow-soft"
                      : i < step
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-600",
                  ].join(" ")}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                <span
                  className={[
                    "hidden sm:inline text-sm transition-colors duration-300",
                    i === step ? "text-slate-900 font-medium" : "text-slate-500",
                  ].join(" ")}
                >
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </nav>

        <div
          className="rounded-2xl bg-white shadow-soft border border-slate-100/80 p-6 sm:p-8 transition-all duration-300 ease-out"
          style={{ minHeight: "320px" }}
        >
          <div key={step} className="animate-fade-in">
            {step === 0 && (
              <StepFaculty
                faculty={faculty}
                onSelect={setFaculty}
              />
            )}
            {step === 1 && (
              <StepYear year={year} onSelect={setYear} />
            )}
            {step === 2 && (
              <StepLiterature
                loading={litLoading}
                error={litError}
                search={litSearch}
                onSearchChange={setLitSearch}
                items={filteredLiterature}
                selectedId={literatureId}
                onSelect={setLiteratureId}
              />
            )}
            {step === 3 && (
              <StepOverview
                faculty={faculty}
                year={year}
                literature={selectedLit}
                total={totalPrice}
              />
            )}
            {step === 4 && (
              <StepContact
                email={email}
                phone={phone}
                onEmail={setEmail}
                onPhone={setPhone}
                errors={contactErrors}
              />
            )}
            {step === 5 && !orderDone && (
              <StepComplete
                faculty={faculty}
                year={year}
                literature={selectedLit}
                total={totalPrice}
                email={email}
                phone={phone}
                onSubmit={handleSubmit}
                submitting={submitting}
                error={submitError}
              />
            )}
            {step === 5 && orderDone && (
              <div className="text-center py-6">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-2xl mb-4">
                  ✓
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  Order submitted
                </h2>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {emailSent ? (
                    <>
                      Thank you. A confirmation email has been sent to{" "}
                      <span className="font-medium text-slate-800">{email}</span>.
                    </>
                  ) : (
                    <>
                      Your order was saved, but email could not be sent. We have
                      your address:{" "}
                      <span className="font-medium text-slate-800">{email}</span>.
                      {emailError ? (
                        <span className="block mt-3 text-left text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          {emailError}
                        </span>
                      ) : null}
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {step < 5 || (step === 5 && !orderDone) ? (
          <div className="mt-8 flex justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || submitting}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors"
            >
              Back
            </button>
            {step < 5 && (
              <button
                type="button"
                onClick={goNext}
                className="ml-auto px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors shadow-soft"
              >
                Continue
              </button>
            )}
          </div>
        ) : null}

        {step === 5 && orderDone && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => {
                setStep(0);
                setFaculty("");
                setYear("");
                setLiteratureList([]);
                setLiteratureId(null);
                setLitSearch("");
                setEmail("");
                setPhone("");
                setOrderDone(false);
                setEmailSent(false);
                setEmailError("");
                setSubmitError("");
              }}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              New order
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepFaculty({ faculty, onSelect }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Faculty</h2>
      <p className="text-sm text-slate-500 mb-6">
        Choose the faculty your materials belong to.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FACULTIES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onSelect(f)}
            className={[
              "rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all duration-200",
              faculty === f
                ? "border-slate-900 bg-slate-900 text-white shadow-soft"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300",
            ].join(" ")}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepYear({ year, onSelect }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Year</h2>
      <p className="text-sm text-slate-500 mb-6">Select your study year.</p>
      <div className="flex flex-wrap gap-2">
        {YEARS.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => onSelect(y)}
            className={[
              "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
              year === y
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            ].join(" ")}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepLiterature({
  loading,
  error,
  search,
  onSearchChange,
  items,
  selectedId,
  onSelect,
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Literature</h2>
      <p className="text-sm text-slate-500 mb-4">
        Pick the document set. Prices are per order.
      </p>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">
        Search
      </label>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Filter by title…"
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-300"
      />
      {loading && (
        <p className="text-sm text-slate-500">Loading options…</p>
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-slate-500">
          No literature for this faculty and year. Go back and adjust your
          selection.
        </p>
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="max-h-56 overflow-y-auto space-y-2 pr-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={[
                  "w-full rounded-xl border px-3 py-3 text-left transition-all duration-200",
                  selectedId === item.id
                    ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                    : "border-slate-200 hover:border-slate-300",
                ].join(" ")}
              >
                <span className="block text-sm font-medium text-slate-900">
                  {item.name}
                </span>
                <span className="text-sm text-slate-600">
                  {Number(item.price).toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepOverview({ faculty, year, literature, total }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Overview</h2>
      <p className="text-sm text-slate-500 mb-6">
        Review your selection before entering contact details.
      </p>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Faculty</dt>
          <dd className="font-medium text-slate-900 text-right">{faculty}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Year</dt>
          <dd className="font-medium text-slate-900 text-right">{year}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Literature</dt>
          <dd className="font-medium text-slate-900 text-right max-w-[60%]">
            {literature?.name ?? "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4 pt-3 border-t border-slate-100">
          <dt className="text-slate-700 font-medium">Total</dt>
          <dd className="font-semibold text-slate-900">
            {literature ? total.toFixed(2) : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function StepContact({ email, phone, onEmail, onPhone, errors }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Contact</h2>
      <p className="text-sm text-slate-500 mb-6">
        We will use this to confirm your order.
      </p>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-medium text-slate-500 mb-1.5"
          >
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-300"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="phone"
            className="block text-xs font-medium text-slate-500 mb-1.5"
          >
            Phone <span className="text-slate-400">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-300"
          />
        </div>
      </div>
    </div>
  );
}

function StepComplete({
  faculty,
  year,
  literature,
  total,
  email,
  phone,
  onSubmit,
  submitting,
  error,
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">
        Complete order
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        Submit to place your photocopy order.
      </p>
      <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 mb-6 text-sm space-y-2">
        <p>
          <span className="text-slate-500">Faculty:</span>{" "}
          <span className="font-medium text-slate-900">{faculty}</span>
        </p>
        <p>
          <span className="text-slate-500">Year:</span>{" "}
          <span className="font-medium text-slate-900">{year}</span>
        </p>
        <p>
          <span className="text-slate-500">Literature:</span>{" "}
          <span className="font-medium text-slate-900">
            {literature?.name}
          </span>
        </p>
        <p>
          <span className="text-slate-500">Total:</span>{" "}
          <span className="font-semibold text-slate-900">
            {total.toFixed(2)}
          </span>
        </p>
        <p>
          <span className="text-slate-500">Email:</span>{" "}
          <span className="font-medium text-slate-900">{email}</span>
        </p>
        {phone ? (
          <p>
            <span className="text-slate-500">Phone:</span>{" "}
            <span className="font-medium text-slate-900">{phone}</span>
          </p>
        ) : null}
      </div>
      {error && (
        <p className="text-sm text-red-600 mb-4" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="w-full rounded-xl bg-slate-900 text-white py-3 text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition-colors"
      >
        {submitting ? "Submitting…" : "Submit order"}
      </button>
    </div>
  );
}
