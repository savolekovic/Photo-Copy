import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  addPlacement,
  createEntity,
  deleteEntity,
  fetchAdminCatalogue,
  removePlacement,
  updateEntity,
} from "../api.js";
import { MATERIAL_TYPES } from "../constants.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { apiErrorMessage } from "../lib/apiErrorMessage.js";
import { yearLabel } from "../lib/orderLabels.js";

/**
 * Operator-facing catalogue administration — the spec's "upravljanje osnovnim podacima".
 *
 * The whole tree is fetched in one request and re-fetched after every write. That is far
 * simpler than patching local state per entity kind, and the payload is only tens of rows.
 */

/**
 * URL slug -> section. Each is a real route so the sidebar can link to it and an operator
 * can bookmark, say, the materials list.
 *
 * `wide` marks the sections that are essentially data tables: those fill the window, while
 * the narrow list-and-form sections stay capped so fields do not stretch absurdly.
 */
const SECTIONS = {
  fakulteti: { labelKey: "admin.tab.faculties", wide: false },
  programi: { labelKey: "admin.tab.programmes", wide: false },
  godine: { labelKey: "admin.tab.years", wide: false },
  predmeti: { labelKey: "admin.tab.subjects", wide: false },
  materijali: { labelKey: "admin.tab.materials", wide: true },
};

export const ADMIN_SECTION_SLUGS = Object.keys(SECTIONS);

export default function AdminPage() {
  const { t } = useI18n();
  const { section: slug = "fakulteti" } = useParams();
  const section = SECTIONS[slug] ?? SECTIONS.fakulteti;
  const [catalogue, setCatalogue] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);

  const reload = useCallback(
    async (signal) => {
      try {
        const data = await fetchAdminCatalogue({ signal });
        setCatalogue(data);
        setError("");
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(apiErrorMessage(err, t));
      }
    },
    [t]
  );

  useEffect(() => {
    const ac = new AbortController();
    reload(ac.signal);
    return () => ac.abort();
  }, [reload]);

  /** Every write funnels through here so errors and refreshes are handled once. */
  const run = useCallback(
    async (fn, { name } = {}) => {
      setNotice(null);
      try {
        const result = await fn();
        // The API returns the row with deactivated:true when it could not hard-delete.
        if (result?.deactivated) {
          setNotice({
            tone: "warning",
            message: t("admin.deactivatedInstead", { name: name ?? result.name ?? result.title }),
          });
        }
        await reload();
        // Return the row itself where there is one, so a caller can use the new id.
        // A 204 yields null, which would read as failure, so fall back to true.
        return result ?? true;
      } catch (err) {
        setNotice({ tone: "error", message: apiErrorMessage(err, t) });
        return false;
      }
    },
    [reload, t]
  );

  // Guard on the data itself, not on `loading`. StrictMode double-invokes the mount effect
  // and the cleanup aborts the first fetch, so `loading` can go false while `catalogue` is
  // still null — which would render the tabs against nothing.
  if (!catalogue) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        {error ? (
          <>
            <p className="text-sm text-rose-700" role="alert">
              {error}
            </p>
            <button
              type="button"
              onClick={() => reload()}
              className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("common.retry")}
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500">{t("common.loading")}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={[
        "w-full px-4 py-8 sm:px-6",
        section.wide ? "max-w-none" : "mx-auto max-w-3xl",
      ].join(" ")}
    >
      <header className="mb-6">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-slate-500">
          {t("admin.title")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t(section.labelKey)}
        </h1>
      </header>

      {error && (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <div
          role="status"
          className={[
            "mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
            notice.tone === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-rose-200 bg-rose-50 text-rose-900",
          ].join(" ")}
        >
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-xs font-medium underline">
            {t("common.close")}
          </button>
        </div>
      )}


      {slug === "fakulteti" && <FacultiesTab catalogue={catalogue} run={run} />}
      {slug === "programi" && <ProgrammesTab catalogue={catalogue} run={run} />}
      {slug === "godine" && <YearsTab catalogue={catalogue} run={run} />}
      {slug === "predmeti" && <SubjectsTab catalogue={catalogue} run={run} />}
      {slug === "materijali" && <MaterialsTab catalogue={catalogue} run={run} />}
    </div>
  );
}

/* ------------------------------------------------------------------ shared ---- */

/**
 * One control height for everything. A native <select> given the same padding as an <input>
 * renders taller or shorter depending on the browser's own chrome, so the height is set
 * explicitly and selects drop their native appearance in favour of a drawn chevron.
 */
const CTL =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/15";

const inputClass = CTL;

function Input(props) {
  return <input {...props} className={`${CTL} ${props.className ?? ""}`} />;
}

function Select({ children, className = "", ...rest }) {
  return (
    <div className="relative">
      <select {...rest} className={`${CTL} cursor-pointer appearance-none pr-8 ${className}`}>
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
      </svg>
    </div>
  );
}

function Card({ children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
      {children}
    </div>
  );
}

function InactiveBadge() {
  const { t } = useI18n();
  return (
    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {t("admin.inactive")}
    </span>
  );
}

function RowActions({ editing, onEdit, onSave, onCancel, onRemove, name }) {
  const { t } = useI18n();
  if (editing) {
    return (
      <div className="flex justify-end gap-1">
        <button type="button" onClick={onSave} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
          {t("admin.save")}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          {t("admin.cancel")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex justify-end gap-1">
      <button type="button" onClick={onEdit} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
        {t("admin.edit")}
      </button>
      <button
        type="button"
        onClick={() => {
          if (window.confirm(t("admin.confirmRemove", { name }))) onRemove();
        }}
        className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
      >
        {t("admin.remove")}
      </button>
    </div>
  );
}

function AddBar({ children, onAdd, disabled }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50/60 p-3">
      {children}
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
      >
        {t("admin.add")}
      </button>
    </div>
  );
}

function Labelled({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/* --------------------------------------------------------------- faculties ---- */

function FacultiesTab({ catalogue, run }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ name: "", short_name: "" });
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});

  const add = async () => {
    if (!draft.name.trim()) return;
    if (await run(() => createEntity("faculties", draft))) setDraft({ name: "", short_name: "" });
  };

  return (
    <Card>
      <AddBar onAdd={add} disabled={!draft.name.trim()}>
        <Labelled label={t("admin.name")} className="min-w-[16rem] flex-1">
          <input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Labelled>
        <Labelled label={t("admin.shortName")} className="w-32">
          <input className={inputClass} value={draft.short_name} onChange={(e) => setDraft({ ...draft, short_name: e.target.value })} />
        </Labelled>
      </AddBar>

      <ul className="divide-y divide-slate-100">
        {catalogue.faculties.length === 0 && (
          <li className="p-4 text-sm text-slate-500">{t("admin.empty")}</li>
        )}
        {catalogue.faculties.map((f) => {
          const editing = editId === f.id;
          const count = catalogue.programmes.filter((p) => p.faculty_id === f.id).length;
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-3 p-3">
              {editing ? (
                <>
                  <input className={`${inputClass} min-w-[14rem] flex-1`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <input className={`${inputClass} w-28`} value={edit.short_name ?? ""} onChange={(e) => setEdit({ ...edit, short_name: e.target.value })} />
                </>
              ) : (
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-slate-900">{f.name}</span>
                  {f.short_name && <span className="ml-2 text-xs text-slate-500">{f.short_name}</span>}
                  {!f.is_active && <InactiveBadge />}
                  <span className="ml-2 text-xs text-slate-400">
                    {count} {t("admin.tab.programmes").toLowerCase()}
                  </span>
                </div>
              )}
              <RowActions
                editing={editing}
                name={f.name}
                onEdit={() => {
                  setEditId(f.id);
                  setEdit({ name: f.name, short_name: f.short_name ?? "" });
                }}
                onSave={async () => {
                  if (await run(() => updateEntity("faculties", f.id, edit))) setEditId(null);
                }}
                onCancel={() => setEditId(null)}
                onRemove={() => run(() => deleteEntity("faculties", f.id), { name: f.name })}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* -------------------------------------------------------------- programmes ---- */

function ProgrammesTab({ catalogue, run }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ name: "", faculty_id: "" });
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});

  const facultyName = (id) => catalogue.faculties.find((f) => f.id === id)?.name ?? "—";

  const add = async () => {
    if (!draft.name.trim() || !draft.faculty_id) return;
    if (await run(() => createEntity("programmes", { ...draft, faculty_id: Number(draft.faculty_id) })))
      setDraft({ name: "", faculty_id: "" });
  };

  return (
    <>
      {/* Reassigning a programme is how the imported faculty grouping gets corrected. */}
      <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        {t("admin.moveHint")}
      </p>
      <Card>
        <AddBar onAdd={add} disabled={!draft.name.trim() || !draft.faculty_id}>
          <Labelled label={t("admin.name")} className="min-w-[14rem] flex-1">
            <input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Labelled>
          <Labelled label={t("admin.faculty")} className="min-w-[12rem]">
            <Select value={draft.faculty_id} onChange={(e) => setDraft({ ...draft, faculty_id: e.target.value })}>
              <option value="">—</option>
              {catalogue.faculties.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </Labelled>
        </AddBar>

        <ul className="divide-y divide-slate-100">
          {catalogue.programmes.length === 0 && (
            <li className="p-4 text-sm text-slate-500">{t("admin.empty")}</li>
          )}
          {catalogue.programmes.map((p) => {
            const editing = editId === p.id;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
                {editing ? (
                  <>
                    <input className={`${inputClass} min-w-[12rem] flex-1`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                    <Select className="min-w-[12rem]" value={edit.faculty_id} onChange={(e) => setEdit({ ...edit, faculty_id: e.target.value })}>
                      {catalogue.faculties.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </Select>
                  </>
                ) : (
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-slate-900">{p.name}</span>
                    {!p.is_active && <InactiveBadge />}
                    <span className="ml-2 text-xs text-slate-500">{facultyName(p.faculty_id)}</span>
                  </div>
                )}
                <RowActions
                  editing={editing}
                  name={p.name}
                  onEdit={() => {
                    setEditId(p.id);
                    setEdit({ name: p.name, faculty_id: String(p.faculty_id) });
                  }}
                  onSave={async () => {
                    const ok = await run(() =>
                      updateEntity("programmes", p.id, {
                        name: edit.name,
                        faculty_id: Number(edit.faculty_id),
                      })
                    );
                    if (ok) setEditId(null);
                  }}
                  onCancel={() => setEditId(null)}
                  onRemove={() => run(() => deleteEntity("programmes", p.id), { name: p.name })}
                />
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------- years ---- */

function YearsTab({ catalogue, run }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ code: "", label_sr: "", label_en: "" });
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});

  const add = async () => {
    if (!draft.code.trim() || !draft.label_sr.trim() || !draft.label_en.trim()) return;
    if (await run(() => createEntity("years", draft))) setDraft({ code: "", label_sr: "", label_en: "" });
  };

  return (
    <Card>
      <AddBar onAdd={add} disabled={!draft.code.trim() || !draft.label_sr.trim() || !draft.label_en.trim()}>
        <Labelled label={t("admin.code")} className="w-28">
          <input className={inputClass} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
        </Labelled>
        <Labelled label={t("admin.labelSr")} className="min-w-[10rem] flex-1">
          <input className={inputClass} value={draft.label_sr} onChange={(e) => setDraft({ ...draft, label_sr: e.target.value })} />
        </Labelled>
        <Labelled label={t("admin.labelEn")} className="min-w-[10rem] flex-1">
          <input className={inputClass} value={draft.label_en} onChange={(e) => setDraft({ ...draft, label_en: e.target.value })} />
        </Labelled>
      </AddBar>

      <ul className="divide-y divide-slate-100">
        {catalogue.years.map((y) => {
          const editing = editId === y.id;
          return (
            <li key={y.id} className="flex flex-wrap items-center gap-3 p-3">
              {editing ? (
                <>
                  <input className={`${inputClass} w-24`} value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
                  <input className={`${inputClass} min-w-[9rem] flex-1`} value={edit.label_sr} onChange={(e) => setEdit({ ...edit, label_sr: e.target.value })} />
                  <input className={`${inputClass} min-w-[9rem] flex-1`} value={edit.label_en} onChange={(e) => setEdit({ ...edit, label_en: e.target.value })} />
                </>
              ) : (
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-slate-500">{y.code}</span>
                  <span className="ml-3 text-sm font-medium text-slate-900">{y.label_sr}</span>
                  <span className="ml-2 text-xs text-slate-500">{y.label_en}</span>
                  {!y.is_active && <InactiveBadge />}
                </div>
              )}
              <RowActions
                editing={editing}
                name={y.label_sr}
                onEdit={() => {
                  setEditId(y.id);
                  setEdit({ code: y.code, label_sr: y.label_sr, label_en: y.label_en });
                }}
                onSave={async () => {
                  if (await run(() => updateEntity("years", y.id, edit))) setEditId(null);
                }}
                onCancel={() => setEditId(null)}
                onRemove={() => run(() => deleteEntity("years", y.id), { name: y.label_sr })}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- subjects ---- */

function SubjectsTab({ catalogue, run }) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState({ name: "", programme_id: "", study_year_id: "" });
  const [filterProgramme, setFilterProgramme] = useState("");

  const progName = (id) => catalogue.programmes.find((p) => p.id === id)?.name ?? "—";
  const yr = (id) => catalogue.years.find((y) => y.id === id);

  const shown = useMemo(
    () =>
      filterProgramme
        ? catalogue.subjects.filter((s) => s.programme_id === Number(filterProgramme))
        : catalogue.subjects,
    [catalogue.subjects, filterProgramme]
  );

  const add = async () => {
    if (!draft.name.trim() || !draft.programme_id || !draft.study_year_id) return;
    const ok = await run(() =>
      createEntity("subjects", {
        name: draft.name,
        programme_id: Number(draft.programme_id),
        study_year_id: Number(draft.study_year_id),
      })
    );
    if (ok) setDraft({ ...draft, name: "" });
  };

  return (
    <Card>
      <AddBar onAdd={add} disabled={!draft.name.trim() || !draft.programme_id || !draft.study_year_id}>
        <Labelled label={t("admin.name")} className="min-w-[12rem] flex-1">
          <input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Labelled>
        <Labelled label={t("admin.programme")} className="min-w-[11rem]">
          <Select value={draft.programme_id} onChange={(e) => setDraft({ ...draft, programme_id: e.target.value })}>
            <option value="">—</option>
            {catalogue.programmes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Labelled>
        <Labelled label={t("admin.year")} className="min-w-[9rem]">
          <Select value={draft.study_year_id} onChange={(e) => setDraft({ ...draft, study_year_id: e.target.value })}>
            <option value="">—</option>
            {catalogue.years.map((y) => (
              <option key={y.id} value={y.id}>{yearLabel(y, locale)}</option>
            ))}
          </Select>
        </Labelled>
      </AddBar>

      <div className="border-b border-slate-100 p-3">
        <Select className="max-w-xs" value={filterProgramme} onChange={(e) => setFilterProgramme(e.target.value)}>
          <option value="">{t("orders.filter.facultyAll")}</option>
          {catalogue.programmes.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>

      <ul className="divide-y divide-slate-100">
        {shown.length === 0 && <li className="p-4 text-sm text-slate-500">{t("admin.empty")}</li>}
        {shown.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-slate-900">{s.name}</span>
              {!s.is_active && <InactiveBadge />}
              <span className="ml-2 text-xs text-slate-500">
                {progName(s.programme_id)} · {yearLabel(yr(s.study_year_id), locale)}
              </span>
            </div>
            <RowActions
              editing={false}
              name={s.name}
              onEdit={() => {
                const next = window.prompt(t("admin.name"), s.name);
                if (next && next !== s.name) run(() => updateEntity("subjects", s.id, { name: next }));
              }}
              onRemove={() => run(() => deleteEntity("subjects", s.id), { name: s.name })}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* --------------------------------------------------------------- materials ---- */

/**
 * Materials.
 *
 * An operator thinks in terms of "what does a Pravo first-year see?" — the same way their
 * folders are organised. So programme + year is a SCOPE you work inside: it filters the
 * list, and anything added while it is set is assigned there immediately. That removes the
 * three things that made the old screen confusing — 198 ungrouped rows, no way to see where
 * a material belongs, and newly created materials silently invisible to students.
 */
function MaterialsTab({ catalogue, run }) {
  const { t, locale, formatPrice } = useI18n();

  const [scopeProgramme, setScopeProgramme] = useState("");
  const [scopeYear, setScopeYear] = useState("");
  const [scopeSubject, setScopeSubject] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});
  const [draft, setDraft] = useState({ title: "", material_type: "knjiga", price: "" });
  const [addingTo, setAddingTo] = useState(null);

  const programmeById = useMemo(
    () => Object.fromEntries(catalogue.programmes.map((p) => [p.id, p])),
    [catalogue.programmes]
  );
  const yearById = useMemo(
    () => Object.fromEntries(catalogue.years.map((y) => [y.id, y])),
    [catalogue.years]
  );
  const subjectById = useMemo(
    () => Object.fromEntries(catalogue.subjects.map((x) => [x.id, x])),
    [catalogue.subjects]
  );

  /** Programmes grouped by faculty — 23 in a flat list is hard to scan. */
  const programmeGroups = useMemo(() => {
    const byFaculty = new Map();
    for (const f of catalogue.faculties) byFaculty.set(f.id, { faculty: f, programmes: [] });
    for (const p of catalogue.programmes) byFaculty.get(p.faculty_id)?.programmes.push(p);
    return [...byFaculty.values()].filter((g) => g.programmes.length > 0);
  }, [catalogue.faculties, catalogue.programmes]);

  const scopeSubjects = useMemo(
    () =>
      catalogue.subjects.filter(
        (x) =>
          x.programme_id === Number(scopeProgramme) && x.study_year_id === Number(scopeYear)
      ),
    [catalogue.subjects, scopeProgramme, scopeYear]
  );

  const placementsOf = useCallback(
    (materialId) => catalogue.placements.filter((pl) => pl.material_id === materialId),
    [catalogue.placements]
  );

  const scopeActive = Boolean(scopeProgramme && scopeYear);
  const scopeLabel = scopeActive
    ? [
        programmeById[scopeProgramme]?.name,
        yearLabel(yearById[scopeYear], locale),
        scopeSubject ? subjectById[scopeSubject]?.name : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const inScope = useCallback(
    (materialId) =>
      placementsOf(materialId).some(
        (pl) =>
          pl.programme_id === Number(scopeProgramme) &&
          pl.study_year_id === Number(scopeYear) &&
          (!scopeSubject || pl.subject_id === Number(scopeSubject))
      ),
    [placementsOf, scopeProgramme, scopeYear, scopeSubject]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogue.materials.filter((m) => {
      if (!showInactive && !m.is_active) return false;
      if (typeFilter && m.material_type !== typeFilter) return false;
      if (q && !m.title.toLowerCase().includes(q) && !(m.author ?? "").toLowerCase().includes(q))
        return false;
      if (scopeProgramme && !scopeYear) {
        return placementsOf(m.id).some((pl) => pl.programme_id === Number(scopeProgramme));
      }
      if (scopeActive) return inScope(m.id);
      return true;
    });
  }, [
    catalogue.materials, search, typeFilter, showInactive,
    scopeProgramme, scopeYear, scopeActive, inScope, placementsOf,
  ]);

  const addMaterial = async () => {
    if (!draft.title.trim()) return;
    const created = await run(() =>
      createEntity("materials", {
        title: draft.title,
        material_type: draft.material_type,
        price: draft.price === "" ? 0 : Number(draft.price),
      })
    );
    if (!created?.id) return;
    // Assigned straight away when a scope is set, so a new material is never invisible to
    // students by accident — which was the single most confusing thing about the old screen.
    if (scopeActive) {
      await run(() =>
        addPlacement(created.id, {
          programme_id: Number(scopeProgramme),
          study_year_id: Number(scopeYear),
          ...(scopeSubject ? { subject_id: Number(scopeSubject) } : {}),
        })
      );
    }
    setDraft({ title: "", material_type: "knjiga", price: "" });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- scope ---------- */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("admin.scope.label")}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Labelled label={t("admin.programme")} className="min-w-[13rem] flex-1">
            <Select
              value={scopeProgramme}
              onChange={(e) => {
                setScopeProgramme(e.target.value);
                setScopeSubject("");
              }}
            >
              <option value="">{t("admin.scope.allPrograms")}</option>
              {programmeGroups.map((g) => (
                <optgroup key={g.faculty.id} label={g.faculty.name}>
                  {g.programmes.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Labelled>
          <Labelled label={t("admin.year")} className="min-w-[10rem]">
            <Select
              value={scopeYear}
              onChange={(e) => {
                setScopeYear(e.target.value);
                setScopeSubject("");
              }}
            >
              <option value="">{t("admin.scope.allYears")}</option>
              {catalogue.years.map((y) => (
                <option key={y.id} value={y.id}>{yearLabel(y, locale)}</option>
              ))}
            </Select>
          </Labelled>
          <Labelled label={`${t("admin.subject")} (${t("common.optional")})`} className="min-w-[11rem]">
            <Select
              value={scopeSubject}
              onChange={(e) => setScopeSubject(e.target.value)}
              disabled={!scopeActive || scopeSubjects.length === 0}
            >
              <option value="">—</option>
              {scopeSubjects.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </Select>
          </Labelled>
          {(scopeProgramme || scopeYear) && (
            <button
              type="button"
              onClick={() => {
                setScopeProgramme("");
                setScopeYear("");
                setScopeSubject("");
              }}
              className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {t("admin.showAll")}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {scopeActive
            ? t("admin.scope.count", { count: shown.length })
            : t("admin.scope.hint")}
        </p>
      </div>

      {/* ---------- add ---------- */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-end gap-2">
          <Labelled label={t("admin.title_")} className="min-w-[16rem] flex-1">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Labelled>
          <Labelled label={t("admin.type")} className="w-44">
            <Select
              value={draft.material_type}
              onChange={(e) => setDraft({ ...draft, material_type: e.target.value })}
            >
              {MATERIAL_TYPES.map((ty) => (
                <option key={ty} value={ty}>{t(`materialType.${ty}`)}</option>
              ))}
            </Select>
          </Labelled>
          <Labelled label={t("admin.price")} className="w-28">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
          </Labelled>
          <button
            type="button"
            onClick={addMaterial}
            disabled={!draft.title.trim()}
            className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {scopeActive ? t("admin.addHere") : t("admin.add")}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {scopeActive
            ? t("admin.addHereHint", { scope: scopeLabel })
            : t("admin.addNoScopeHint")}
        </p>
      </div>

      {/* ---------- filters ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder={t("admin.searchMaterials")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="w-40">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{t("admin.typeAll")}</option>
            {MATERIAL_TYPES.map((ty) => (
              <option key={ty} value={ty}>{t(`materialType.${ty}`)}</option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          {t("admin.showInactive")}
        </label>
        <span className="ml-auto text-xs tabular-nums text-slate-500">{shown.length}</span>
      </div>

      {/* ---------- list ---------- */}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
          <p className="text-sm text-slate-600">
            {scopeActive ? t("admin.noneInScope") : t("admin.empty")}
          </p>
          {scopeActive && (
            <p className="mt-1 text-xs text-slate-500">{t("admin.noneInScopeHint")}</p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((m) => {
            const editing = editId === m.id;
            const places = placementsOf(m.id);
            const orphan = places.length === 0;
            return (
              <li
                key={m.id}
                className={[
                  "rounded-xl border bg-white p-3 shadow-soft",
                  orphan ? "border-amber-300" : "border-slate-200",
                ].join(" ")}
              >
                {editing ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <Labelled label={t("admin.title_")} className="min-w-[14rem] flex-1">
                      <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                    </Labelled>
                    <Labelled label={t("admin.author")} className="w-44">
                      <Input value={edit.author ?? ""} onChange={(e) => setEdit({ ...edit, author: e.target.value })} />
                    </Labelled>
                    <Labelled label={t("admin.type")} className="w-40">
                      <Select value={edit.material_type} onChange={(e) => setEdit({ ...edit, material_type: e.target.value })}>
                        {MATERIAL_TYPES.map((ty) => (
                          <option key={ty} value={ty}>{t(`materialType.${ty}`)}</option>
                        ))}
                      </Select>
                    </Labelled>
                    <Labelled label={t("admin.price")} className="w-28">
                      <Input type="number" min="0" step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                    </Labelled>
                    <div className="flex gap-1 pb-0.5">
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await run(() =>
                            updateEntity("materials", m.id, { ...edit, price: Number(edit.price) })
                          );
                          if (ok) setEditId(null);
                        }}
                        className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
                      >
                        {t("admin.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId(null)}
                        className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        {t("admin.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {m.title}
                          {!m.is_active && <InactiveBadge />}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            {t(`materialType.${m.material_type}`)}
                          </span>
                          {m.author && <span>{m.author}</span>}
                          <span className="tabular-nums text-slate-700">{formatPrice(m.price)}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(m.id);
                            setEdit({
                              title: m.title,
                              author: m.author ?? "",
                              material_type: m.material_type,
                              price: String(m.price ?? 0),
                            });
                          }}
                          className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {t("admin.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(t("admin.confirmDeleteMaterial", { name: m.title })))
                              run(() => deleteEntity("materials", m.id), { name: m.title });
                          }}
                          className="h-8 rounded-lg border border-rose-200 px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        >
                          {t("admin.deleteMaterial")}
                        </button>
                      </div>
                    </div>

                    {/* Where it appears — inline, because this is the thing that decides
                        whether a student ever sees it. */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                      {orphan ? (
                        <span className="text-xs font-medium text-amber-800" title={t("admin.notAssignedHint")}>
                          {t("admin.notAssigned")} — {t("admin.notAssignedHint")}
                        </span>
                      ) : (
                        <>
                          <span className="mr-1 text-[11px] uppercase tracking-wide text-slate-400">
                            {t("admin.locations")}
                          </span>
                          {places.map((pl) => (
                            <span
                              key={pl.id}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-2 pr-1 text-xs text-slate-700"
                            >
                              {[
                                programmeById[pl.programme_id]?.name,
                                yearLabel(yearById[pl.study_year_id], locale),
                                pl.subject_id ? subjectById[pl.subject_id]?.name : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              <button
                                type="button"
                                onClick={() => run(() => removePlacement(m.id, pl.id))}
                                aria-label={t("admin.removeLocation")}
                                title={t("admin.removeLocation")}
                                className="rounded-full px-1 text-slate-400 hover:bg-rose-100 hover:text-rose-700"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </>
                      )}

                      {/* One click when a scope is set, otherwise the full picker. */}
                      {scopeActive && !inScope(m.id) ? (
                        <button
                          type="button"
                          onClick={() =>
                            run(() =>
                              addPlacement(m.id, {
                                programme_id: Number(scopeProgramme),
                                study_year_id: Number(scopeYear),
                                ...(scopeSubject ? { subject_id: Number(scopeSubject) } : {}),
                              })
                            )
                          }
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                        >
                          + {scopeLabel}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingTo(addingTo === m.id ? null : m.id)}
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          + {t("admin.addPlacement")}
                        </button>
                      )}
                    </div>

                    {addingTo === m.id && (
                      <PlacementPicker
                        material={m}
                        catalogue={catalogue}
                        run={run}
                        onDone={() => setAddingTo(null)}
                        programmeGroups={programmeGroups}
                      />
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Compact picker for assigning a material to a programme + year (+ optional subject). */
function PlacementPicker({ material, catalogue, run, onDone, programmeGroups }) {
  const { t, locale } = useI18n();
  const [np, setNp] = useState({ programme_id: "", study_year_id: "", subject_id: "" });

  const subjectsFor = catalogue.subjects.filter(
    (x) =>
      x.programme_id === Number(np.programme_id) && x.study_year_id === Number(np.study_year_id)
  );

  const submit = async () => {
    if (!np.programme_id || !np.study_year_id) return;
    const ok = await run(() =>
      addPlacement(material.id, {
        programme_id: Number(np.programme_id),
        study_year_id: Number(np.study_year_id),
        ...(np.subject_id ? { subject_id: Number(np.subject_id) } : {}),
      })
    );
    if (ok) onDone();
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
      <Labelled label={t("admin.programme")} className="min-w-[12rem] flex-1">
        <Select
          value={np.programme_id}
          onChange={(e) => setNp({ ...np, programme_id: e.target.value, subject_id: "" })}
        >
          <option value="">—</option>
          {programmeGroups.map((g) => (
            <optgroup key={g.faculty.id} label={g.faculty.name}>
              {g.programmes.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Labelled>
      <Labelled label={t("admin.year")} className="min-w-[9rem]">
        <Select
          value={np.study_year_id}
          onChange={(e) => setNp({ ...np, study_year_id: e.target.value, subject_id: "" })}
        >
          <option value="">—</option>
          {catalogue.years.map((y) => (
            <option key={y.id} value={y.id}>{yearLabel(y, locale)}</option>
          ))}
        </Select>
      </Labelled>
      <Labelled label={`${t("admin.subject")} (${t("common.optional")})`} className="min-w-[10rem]">
        <Select
          value={np.subject_id}
          onChange={(e) => setNp({ ...np, subject_id: e.target.value })}
          disabled={subjectsFor.length === 0}
        >
          <option value="">—</option>
          {subjectsFor.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </Select>
      </Labelled>
      <button
        type="button"
        onClick={submit}
        disabled={!np.programme_id || !np.study_year_id}
        className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
      >
        {t("admin.addPlacement")}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        {t("admin.cancel")}
      </button>
    </div>
  );
}
