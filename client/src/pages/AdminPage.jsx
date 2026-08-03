import { useCallback, useEffect, useMemo, useState } from "react";
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

const TABS = [
  { key: "faculties", labelKey: "admin.tab.faculties" },
  { key: "programmes", labelKey: "admin.tab.programmes" },
  { key: "years", labelKey: "admin.tab.years" },
  { key: "subjects", labelKey: "admin.tab.subjects" },
  { key: "materials", labelKey: "admin.tab.materials" },
];

export default function AdminPage() {
  const { t } = useI18n();
  const [catalogue, setCatalogue] = useState(null);
  const [tab, setTab] = useState("faculties");
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
        return true;
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
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
      <header className="mb-6">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-slate-500">
          {t("orders.roleBadge")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {t("admin.title")}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">{t("admin.subtitle")}</p>
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

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-slate-200" aria-label={t("admin.title")}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            aria-current={tab === tb.key ? "page" : undefined}
            className={[
              "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === tb.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800",
            ].join(" ")}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </nav>

      {tab === "faculties" && <FacultiesTab catalogue={catalogue} run={run} />}
      {tab === "programmes" && <ProgrammesTab catalogue={catalogue} run={run} />}
      {tab === "years" && <YearsTab catalogue={catalogue} run={run} />}
      {tab === "subjects" && <SubjectsTab catalogue={catalogue} run={run} />}
      {tab === "materials" && <MaterialsTab catalogue={catalogue} run={run} />}
    </div>
  );
}

/* ------------------------------------------------------------------ shared ---- */

const inputClass =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/15";

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
            <select className={inputClass} value={draft.faculty_id} onChange={(e) => setDraft({ ...draft, faculty_id: e.target.value })}>
              <option value="">—</option>
              {catalogue.faculties.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
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
                    <select className={`${inputClass} min-w-[12rem]`} value={edit.faculty_id} onChange={(e) => setEdit({ ...edit, faculty_id: e.target.value })}>
                      {catalogue.faculties.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
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
          <select className={inputClass} value={draft.programme_id} onChange={(e) => setDraft({ ...draft, programme_id: e.target.value })}>
            <option value="">—</option>
            {catalogue.programmes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Labelled>
        <Labelled label={t("admin.year")} className="min-w-[9rem]">
          <select className={inputClass} value={draft.study_year_id} onChange={(e) => setDraft({ ...draft, study_year_id: e.target.value })}>
            <option value="">—</option>
            {catalogue.years.map((y) => (
              <option key={y.id} value={y.id}>{yearLabel(y, locale)}</option>
            ))}
          </select>
        </Labelled>
      </AddBar>

      <div className="border-b border-slate-100 p-3">
        <select className={`${inputClass} max-w-xs`} value={filterProgramme} onChange={(e) => setFilterProgramme(e.target.value)}>
          <option value="">{t("orders.filter.facultyAll")}</option>
          {catalogue.programmes.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
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

function MaterialsTab({ catalogue, run }) {
  const { t, locale, formatPrice } = useI18n();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});
  const [draft, setDraft] = useState({ title: "", material_type: "knjiga", price: "" });

  const progName = (id) => catalogue.programmes.find((p) => p.id === id)?.name ?? "—";
  const yr = (id) => catalogue.years.find((y) => y.id === id);
  const subjName = (id) => catalogue.subjects.find((s) => s.id === id)?.name;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogue.materials.filter(
      (m) =>
        (showInactive || m.is_active) &&
        (!q || m.title.toLowerCase().includes(q) || (m.author ?? "").toLowerCase().includes(q))
    );
  }, [catalogue.materials, search, showInactive]);

  const zeroPriced = catalogue.materials.filter((m) => Number(m.price) === 0).length;

  const add = async () => {
    if (!draft.title.trim()) return;
    const ok = await run(() =>
      createEntity("materials", {
        title: draft.title,
        material_type: draft.material_type,
        price: draft.price === "" ? 0 : Number(draft.price),
      })
    );
    if (ok) setDraft({ title: "", material_type: "knjiga", price: "" });
  };

  return (
    <>
      {zeroPriced > 0 && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t("admin.pricesZero")} ({zeroPriced})
        </p>
      )}
      <Card>
        <AddBar onAdd={add} disabled={!draft.title.trim()}>
          <Labelled label={t("admin.title_")} className="min-w-[14rem] flex-1">
            <input className={inputClass} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Labelled>
          <Labelled label={t("admin.type")} className="min-w-[10rem]">
            <select className={inputClass} value={draft.material_type} onChange={(e) => setDraft({ ...draft, material_type: e.target.value })}>
              {MATERIAL_TYPES.map((ty) => (
                <option key={ty} value={ty}>{t(`materialType.${ty}`)}</option>
              ))}
            </select>
          </Labelled>
          <Labelled label={t("admin.price")} className="w-24">
            <input type="number" min="0" step="0.01" className={inputClass} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
          </Labelled>
        </AddBar>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <input
            type="search"
            className={`${inputClass} max-w-sm`}
            placeholder={t("admin.searchMaterials")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            {t("admin.showInactive")}
          </label>
          <span className="ml-auto text-xs text-slate-500">{shown.length}</span>
        </div>

        <ul className="divide-y divide-slate-100">
          {shown.length === 0 && <li className="p-4 text-sm text-slate-500">{t("admin.empty")}</li>}
          {shown.map((m) => {
            const editing = editId === m.id;
            const places = catalogue.placements.filter((p) => p.material_id === m.id);
            return (
              <li key={m.id} className="p-3">
                <div className="flex flex-wrap items-center gap-3">
                  {editing ? (
                    <>
                      <input className={`${inputClass} min-w-[12rem] flex-1`} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                      <input className={`${inputClass} w-40`} placeholder={t("admin.author")} value={edit.author ?? ""} onChange={(e) => setEdit({ ...edit, author: e.target.value })} />
                      <select className={`${inputClass} w-40`} value={edit.material_type} onChange={(e) => setEdit({ ...edit, material_type: e.target.value })}>
                        {MATERIAL_TYPES.map((ty) => (
                          <option key={ty} value={ty}>{t(`materialType.${ty}`)}</option>
                        ))}
                      </select>
                      <input type="number" min="0" step="0.01" className={`${inputClass} w-24`} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                    </>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-slate-900">{m.title}</span>
                      {!m.is_active && <InactiveBadge />}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">{t(`materialType.${m.material_type}`)}</span>
                        {m.author && <span>{m.author}</span>}
                        <span className="tabular-nums">{formatPrice(m.price)}</span>
                        <button type="button" onClick={() => setExpanded(expanded === m.id ? null : m.id)} className="underline hover:text-slate-800">
                          {t("admin.placements")} ({places.length})
                        </button>
                      </div>
                    </div>
                  )}
                  <RowActions
                    editing={editing}
                    name={m.title}
                    onEdit={() => {
                      setEditId(m.id);
                      setEdit({
                        title: m.title,
                        author: m.author ?? "",
                        material_type: m.material_type,
                        price: String(m.price ?? 0),
                      });
                    }}
                    onSave={async () => {
                      const ok = await run(() =>
                        updateEntity("materials", m.id, { ...edit, price: Number(edit.price) })
                      );
                      if (ok) setEditId(null);
                    }}
                    onCancel={() => setEditId(null)}
                    onRemove={() => run(() => deleteEntity("materials", m.id), { name: m.title })}
                  />
                </div>

                {expanded === m.id && (
                  <PlacementEditor
                    material={m}
                    places={places}
                    catalogue={catalogue}
                    run={run}
                    progName={progName}
                    yr={yr}
                    subjName={subjName}
                    locale={locale}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

/** Where one material appears. This is what lets a shared book live in several programmes. */
function PlacementEditor({ material, places, catalogue, run, progName, yr, subjName, locale }) {
  const { t } = useI18n();
  const [np, setNp] = useState({ programme_id: "", study_year_id: "", subject_id: "" });

  const subjectsFor = catalogue.subjects.filter(
    (s) =>
      s.programme_id === Number(np.programme_id) &&
      s.study_year_id === Number(np.study_year_id)
  );

  const add = async () => {
    if (!np.programme_id || !np.study_year_id) return;
    const ok = await run(() =>
      addPlacement(material.id, {
        programme_id: Number(np.programme_id),
        study_year_id: Number(np.study_year_id),
        ...(np.subject_id ? { subject_id: Number(np.subject_id) } : {}),
      })
    );
    if (ok) setNp({ programme_id: "", study_year_id: "", subject_id: "" });
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      {places.length === 0 ? (
        <p className="mb-2 text-xs text-slate-500">{t("admin.noPlacements")}</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {places.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-xs text-slate-700">
              <span>
                {progName(p.programme_id)} · {yearLabel(yr(p.study_year_id), locale)}
                {p.subject_id && ` · ${subjName(p.subject_id) ?? ""}`}
              </span>
              <button
                type="button"
                onClick={() => run(() => removePlacement(material.id, p.id))}
                className="rounded border border-rose-200 px-2 py-0.5 font-medium text-rose-700 hover:bg-rose-50"
              >
                {t("admin.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Labelled label={t("admin.programme")} className="min-w-[11rem]">
          <select className={inputClass} value={np.programme_id} onChange={(e) => setNp({ ...np, programme_id: e.target.value, subject_id: "" })}>
            <option value="">—</option>
            {catalogue.programmes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Labelled>
        <Labelled label={t("admin.year")} className="min-w-[9rem]">
          <select className={inputClass} value={np.study_year_id} onChange={(e) => setNp({ ...np, study_year_id: e.target.value, subject_id: "" })}>
            <option value="">—</option>
            {catalogue.years.map((y) => (
              <option key={y.id} value={y.id}>{yearLabel(y, locale)}</option>
            ))}
          </select>
        </Labelled>
        <Labelled label={`${t("admin.subject")} (${t("common.optional")})`} className="min-w-[11rem]">
          <select className={inputClass} value={np.subject_id} onChange={(e) => setNp({ ...np, subject_id: e.target.value })} disabled={subjectsFor.length === 0}>
            <option value="">—</option>
            {subjectsFor.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Labelled>
        <button
          type="button"
          onClick={add}
          disabled={!np.programme_id || !np.study_year_id}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {t("admin.addPlacement")}
        </button>
      </div>
    </div>
  );
}
