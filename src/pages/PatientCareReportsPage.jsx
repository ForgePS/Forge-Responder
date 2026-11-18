/**
 * Patient care reports (ePCR) in the RMS, in the same look as NERIS incident reports.
 *
 *   - list: crews see the reports they were on; supervisors (viewAllPcrs / unlockPcrs / exportPcrs) see every report
 *   - start a report from a CAD call (Active911, CAD records) or blank, and chart it on the desktop (PcrEditor)
 *   - review: NEMSIS checks, documentation suggestions, export, print, handoff, unlock, QA and history (PcrReview)
 *   - supervisors: queues (overdue, awaiting QA, returned) and EMS analytics (totals only, small counts hidden)
 *   - admins: EMS agency settings and the department's form settings (PcrFormSettings)
 *
 * PHI: every report holds patient data. Opening, unlocking, printing and exporting a report is written to the audit
 * log (report number only). Nothing here logs report contents.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ambulance, BarChart3, ChevronRight, CirclePlus, ClipboardList, Loader2, RefreshCw, Search, Settings2, SlidersHorizontal, Sparkles, Wifi, WifiOff, X,
} from "lucide-react";
import { version as APP_VERSION } from "../../package.json";
import { ProgressRing } from "../components/neris/NerisControls.jsx";
import PcrEditor from "../components/pcr/PcrEditor.jsx";
import PcrFormSettings from "../components/pcr/PcrFormSettings.jsx";
import { PcrStartDialog } from "../components/pcr/PcrCadDialogs.jsx";
import PcrAnalytics from "../components/pcr/PcrAnalytics.jsx";
import { qaStatus, reportStatus } from "../lib/pcr/pcrLifecycle.js";
import { formatWhen, friendlyError, needsReview } from "../components/pcr/PcrReview.jsx";
import {
  createPcr, getPcr, listPcrs, loadCadRecords, loadEmsSettings, loadPcrForm, rmsPcrNumber, saveEmsSettings, savePcrForm,
} from "../lib/pcrService.js";
import { emsSettingsErrors, missingEmsSettings, normalizeEmsSettings } from "../lib/nemsis/emsSettings.js";
import { normalizePcrForm, applyFormDefaults } from "../lib/pcr/pcrForm.js";
import { applyCadChanges, cadChanges, cadLink, cadValues } from "../lib/pcr/pcrCad.js";
import { newPcrRecordData } from "../field/fieldPcr.js";
import { pcrSummary, sectionProgress } from "../lib/nemsis/pcrModel.js";
import "../styles/pcr-desktop.css";

function useNemsisSchema() {
  const [state, setState] = useState({ schema: null, error: "" });
  useEffect(() => {
    let active = true;
    import("../lib/nemsis/index.js")
      .then((mod) => active && setState({ schema: mod.nemsisSchema, error: "" }))
      .catch(() => active && setState({ schema: null, error: "The NEMSIS data couldn't load. Refresh the page to try again." }));
    return () => {
      active = false;
    };
  }, []);
  return state;
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const GROUPS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "overdue", label: "Overdue" },
  { id: "review", label: "NEMSIS errors" },
  { id: "qa", label: "Awaiting QA", supervisors: true },
  { id: "returned", label: "Returned" },
  { id: "posted", label: "Posted" },
];
function inGroup(report, group) {
  if (group === "all") return true;
  if (group === "review") return needsReview(report);
  if (group === "posted") return report.status === "posted" && !needsReview(report);
  if (group === "overdue") return reportStatus(report).id === "overdue";
  if (group === "qa") return report.status === "posted" && qaStatus(report).id === "none";
  if (group === "returned") return qaStatus(report).id === "returned";
  return report.status === group;
}

const TONES = { good: "done", bad: "returned", warn: "review", muted: "draft" };
function statusOf(report) {
  const r = reportStatus(report);
  return { tone: TONES[r.tone] || "draft", label: r.label };
}

export default function PatientCareReportsPage({
  departmentId, uid, actor, query = "", canViewAll = false, canEdit = false, canUnlock = false, canExport = false, canReview = false, canManageSettings = false,
}) {
  const { schema, error: schemaError } = useNemsisSchema();
  const online = useOnline();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("list");
  const [settings, setSettings] = useState(normalizeEmsSettings(null));
  const [form, setForm] = useState(normalizePcrForm(null));
  const [editingAgency, setEditingAgency] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [cad, setCad] = useState({ records: [], loading: false, start: [] });

  const say = (text) => { setMessage(text); setError(""); };
  const fail = (text) => { setError(text); setMessage(""); };

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, ems, pcrForm] = await Promise.all([
        listPcrs(departmentId, { uid, readAll: canViewAll }),
        loadEmsSettings(departmentId),
        loadPcrForm(departmentId).catch(() => normalizePcrForm(null)),
      ]);
      setReports(rows);
      setSettings(ems);
      setForm(pcrForm);
    } catch (err) {
      fail(friendlyError(err, "Reports couldn't be loaded. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (departmentId && uid) reload();
  }, [departmentId, uid, canViewAll]);

  /** CAD records for refreshes (latest). Returns them. */
  const reloadCad = useCallback(async ({ sync = false, quiet = false } = {}) => {
    if (!quiet) setCad((c) => ({ ...c, loading: true }));
    try {
      const records = await loadCadRecords(departmentId, { sync });
      setCad((c) => ({ ...c, records, loading: false }));
      return records;
    } catch {
      setCad((c) => ({ ...c, loading: false }));
      return null;
    }
  }, [departmentId]);

  useEffect(() => {
    if (departmentId && canEdit) reloadCad({ quiet: true });
  }, [departmentId, canEdit, reloadCad]);

  /** CAD calls to start from. In the demo these are the calls as first dispatched, so a refresh later has news. */
  const loadStartRecords = async (sync = false) => {
    setCad((c) => ({ ...c, loading: true }));
    try {
      const start = await loadCadRecords(departmentId, { sync, stage: "initial" });
      setCad((c) => ({ ...c, start, loading: false }));
    } catch {
      setCad((c) => ({ ...c, loading: false }));
    }
  };

  const summaries = useMemo(() => {
    if (!schema) return [];
    return reports.map((report) => {
      const progress = sectionProgress(schema, report.nemsis || {});
      const totals = Object.values(progress).reduce((a, p) => ({ filled: a.filled + p.filled, total: a.total + p.total }), { filled: 0, total: 0 });
      return { report, summary: pcrSummary(schema, report.nemsis || {}), percent: totals.total ? Math.round((totals.filled / totals.total) * 100) : 0 };
    });
  }, [reports, schema]);

  const needle = `${query} ${search}`.trim().toLowerCase();
  const visible = summaries
    .filter(({ report }) => inGroup(report, group))
    .filter(({ report, summary }) => !needle || [report.number, report.unit, report.incidentNumber, summary.patient, summary.complaint, report.cad?.description]
      .join(" ").toLowerCase().includes(needle));
  const groups = GROUPS.filter((g) => !g.supervisors || canViewAll || canReview);
  const counts = Object.fromEntries(GROUPS.map((g) => [g.id, reports.filter((r) => inGroup(r, g.id)).length]));
  const missingAgency = missingEmsSettings(settings);

  const open = async (id) => {
    setError("");
    setMessage("");
    try {
      const pcr = await getPcr(departmentId, id, actor);
      if (!pcr) throw Object.assign(new Error("missing"), { code: "not-found" });
      setSelected(pcr);
      setView("editor");
    } catch (err) {
      fail(friendlyError(err, "That report couldn't be opened."));
    }
  };

  const start = async ({ record, unit }) => {
    setStartBusy(true);
    try {
      const id = globalThis.crypto.randomUUID();
      const values = record ? cadValues(record, unit) : {};
      const data = newPcrRecordData(schema, {
        uuid: id,
        number: rmsPcrNumber(),
        softwareVersion: APP_VERSION,
        uid,
        agency: { number: settings.agencyNumber, name: settings.agencyName },
        unit: unit ? { callSign: unit, vehicleNumber: unit } : undefined,
      });
      let nemsis = applyFormDefaults(schema, data.nemsis, form);
      if (record) nemsis = applyCadChanges(schema, nemsis, cadChanges(schema, nemsis, values, null, { overwrite: true }));
      const saved = await createPcr(departmentId, {
        ...data,
        nemsis,
        incidentNumber: values["eResponse.03"] || "",
        ...(record ? { cad: cadLink(record, values) } : {}),
      }, actor);
      setReports((rows) => [saved, ...rows]);
      setSelected(saved);
      setView("editor");
      setStarting(false);
      say(`${saved.number} started${record ? " from CAD" : ""}.`);
    } catch (err) {
      fail(friendlyError(err, "The report couldn't be started. Check your connection and try again."));
    } finally {
      setStartBusy(false);
    }
  };

  const onSaved = useCallback((saved) => {
    setReports((rows) => {
      const exists = rows.some((r) => r.id === saved.id);
      return exists ? rows.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)) : [saved, ...rows];
    });
  }, []);

  const banner = message || error ? (
    <div className={`nr-banner${error ? " pcr-banner-error" : ""}`} role={error ? "alert" : "status"}>
      <span>{error || message}</span>
      <button type="button" aria-label="Dismiss" onClick={() => { setMessage(""); setError(""); }}><X size={14} /></button>
    </div>
  ) : null;

  if (!schema) {
    return (
      <div className="module-page nr-page pcr-page">
        <div className="nr-empty-state">
          {schemaError ? <p className="nr-error" role="alert">{schemaError}</p> : <p className="nr-muted" role="status"><Loader2 size={16} className="nr-spin" /> Loading patient care reports…</p>}
        </div>
      </div>
    );
  }

  if (view === "editor" && selected) {
    return (
      <div className="module-page nr-page pcr-page">
        {banner}
        <PcrEditor
          key={selected.id}
          schema={schema}
          form={form}
          settings={settings}
          initial={selected}
          departmentId={departmentId}
          uid={uid}
          actor={actor}
          canEdit={canEdit}
          canUnlock={canUnlock}
          canExport={canExport}
          canReview={canReview}
          online={online}
          cadRecords={cad.records}
          cadLoading={cad.loading}
          onReloadCad={reloadCad}
          onSaved={onSaved}
          onMessage={say}
          onError={fail}
          onClose={() => { setView("list"); setSelected(null); setMessage(""); }}
        />
      </div>
    );
  }

  if (view === "analytics" && canViewAll) {
    return (
      <div className="module-page nr-page pcr-page">
        <PcrAnalytics schema={schema} reports={reports} onClose={() => setView("list")} />
      </div>
    );
  }

  if (view === "form" && canManageSettings) {
    return (
      <div className="module-page nr-page pcr-page">
        {banner}
        <PcrFormSettings
          schema={schema}
          initial={form}
          onClose={() => setView("list")}
          onSave={async (next) => {
            setForm(await savePcrForm(departmentId, next, actor));
            say("Form settings saved. FORGE FIELD picks them up the next time a device refreshes its data.");
          }}
        />
      </div>
    );
  }

  return (
    <div className="module-page nr-page pcr-page">
      <section className="nr-hero">
        <div className="nr-hero-text">
          <span className="nr-hero-icon"><Ambulance size={22} /></span>
          <div>
            <h1>Patient Care Reports</h1>
            <p>NEMSIS 3.5.1 charting for {settings.agencyName || "your agency"}. Start from CAD, step by step, with an AI narrator.</p>
          </div>
        </div>
        <div className="nr-hero-actions">
          <span className={`nr-pill ${online ? "nr-pill-ok" : "nr-pill-warn"}`}>{online ? <Wifi size={12} /> : <WifiOff size={12} />} {online ? "Online" : "Offline"}</span>
          {canViewAll ? <button type="button" className="nr-btn nr-btn-ghost" onClick={() => setView("analytics")}><BarChart3 size={16} /> Analytics</button> : null}
          {canManageSettings ? (
            <>
              <button type="button" className="nr-btn nr-btn-ghost" onClick={() => setView("form")}><SlidersHorizontal size={16} /> Form settings</button>
              <button type="button" className="nr-btn nr-btn-ghost" onClick={() => setEditingAgency(true)}><Settings2 size={16} /> Agency settings</button>
            </>
          ) : null}
          {canEdit ? (
            <button type="button" className="nr-btn nr-btn-primary nr-btn-lg" onClick={() => { setStarting(true); loadStartRecords(true); }}>
              <CirclePlus size={18} /> Start a report
            </button>
          ) : null}
        </div>
      </section>

      {banner}
      {(canExport || canManageSettings) && missingAgency.length ? (
        <div className="nr-banner pcr-banner-warn" role="status">
          <span>NEMSIS export needs the EMS agency details: {missingAgency.join(", ")}.{canManageSettings ? " Use Agency settings to add them." : " Ask an administrator to add them."}</span>
        </div>
      ) : null}

      <section className="nr-stats">
        {[
          ["draft", "Drafts", "nr-stat-draft"],
          ["overdue", "Overdue drafts", "nr-stat-review"],
          ["review", "Posted with NEMSIS errors", "nr-stat-review"],
          ...(canViewAll || canReview ? [["qa", "Awaiting QA", "nr-stat-draft"]] : []),
          ["posted", "Posted", "nr-stat-submitted"],
        ].map(([id, label, tone]) => (
          <button key={id} type="button" className={`nr-stat ${tone}${group === id ? " active" : ""}`} onClick={() => setGroup(group === id ? "all" : id)}>
            <strong>{counts[id]}</strong>
            <span>{label}</span>
          </button>
        ))}
        <button type="button" className={`nr-stat nr-stat-ready${group === "all" ? " active" : ""}`} onClick={() => setGroup("all")}>
          <strong>{counts.all}</strong>
          <span>{canViewAll ? "All reports" : "My reports"}</span>
        </button>
      </section>

      <section className="nr-list-card">
        <div className="nr-toolbar">
          <div className="nr-segmented nr-small" role="tablist">
            {groups.map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={group === g.id} className={group === g.id ? "active" : ""} onClick={() => setGroup(g.id)}>
                {g.label} <span className="nr-count-badge">{counts[g.id]}</span>
              </button>
            ))}
          </div>
          <div className="pcr-toolbar-right">
            <label className="nr-search">
              <Search size={15} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, unit, patient…" aria-label="Search reports" />
            </label>
            <button type="button" className="nr-icon-btn" onClick={reload} disabled={loading} title="Refresh" aria-label="Refresh">
              {loading ? <Loader2 size={16} className="nr-spin" /> : <RefreshCw size={16} />}
            </button>
          </div>
        </div>

        {visible.length ? (
          <ul className="nr-reports">
            {visible.map(({ report, summary, percent }) => {
              const status = statusOf(report);
              return (
                <li key={report.id}>
                  <button type="button" className="nr-report" onClick={() => open(report.id)}>
                    <span className="nr-report-icon nr-kind-ems"><Ambulance size={18} /></span>
                    <span className="nr-report-main">
                      <strong>{summary.patient !== "Unknown patient" ? summary.patient : "Patient not yet identified"}</strong>
                      <small>
                        {[report.number, formatWhen(summary.notified) || formatWhen(report.createdAt), report.unit, summary.complaint || report.cad?.description].filter(Boolean).join(" · ")}
                      </small>
                    </span>
                    <span className="nr-report-side">
                      {report.aiNarrative?.generated && !report.aiNarrative?.reviewedAt ? <span className="nr-pill nr-pill-warn nr-hide-sm"><Sparkles size={11} /> AI draft to review</span> : null}
                      {qaStatus(report).id !== "none" ? <span className={`nr-status nr-status-${TONES[qaStatus(report).tone]} nr-hide-sm`}>{qaStatus(report).label}</span> : null}
                      <span className={`nr-status nr-status-${status.tone}`}>{status.label}</span>
                      <ProgressRing percent={percent} size={38} stroke={4} />
                      <ChevronRight size={18} className="nr-chevron" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="nr-empty-state">
            <span className="nr-empty-icon"><ClipboardList size={28} /></span>
            <h3>{loading ? "Loading reports…" : reports.length ? "No reports match" : "No patient care reports yet"}</h3>
            <p>{reports.length ? "Try another filter or search." : "Start one here from a CAD call, or chart it in FORGE FIELD on scene."}</p>
            {canEdit && !reports.length && !loading ? (
              <button type="button" className="nr-btn nr-btn-primary" onClick={() => { setStarting(true); loadStartRecords(true); }}><CirclePlus size={16} /> Start a report</button>
            ) : null}
          </div>
        )}
      </section>

      {starting ? (
        <PcrStartDialog
          records={cad.start}
          loading={cad.loading}
          busy={startBusy}
          onReload={() => loadStartRecords(true)}
          onStart={start}
          onClose={() => setStarting(false)}
        />
      ) : null}

      {editingAgency ? (
        <AgencySettingsDialog
          initial={settings}
          onClose={() => setEditingAgency(false)}
          onSave={async (next) => {
            const saved = await saveEmsSettings(departmentId, next, actor);
            setSettings(normalizeEmsSettings(saved));
            setEditingAgency(false);
            say("EMS agency settings saved.");
          }}
        />
      ) : null}
    </div>
  );
}

const SETTINGS_FIELDS = [
  { key: "stateAgencyId", label: "EMS agency unique state ID (dAgency.01)", hint: "The ID your state EMS office assigned the agency." },
  { key: "agencyNumber", label: "EMS agency number (dAgency.02 / eResponse.01)", hint: "The state-assigned provider number. Prefilled on new reports." },
  { key: "agencyName", label: "EMS agency name (eResponse.02)", hint: "Prefilled on new reports." },
  { key: "state", label: "State code (dAgency.04)", hint: "Two-digit ANSI state code, e.g. 37 for North Carolina, 48 for Texas." },
];

function AgencySettingsDialog({ initial, onClose, onSave }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const errors = emsSettingsErrors(values);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(values);
    } catch (err) {
      setError(friendlyError(err, "The settings couldn't be saved."));
      setSaving(false);
    }
  };
  return (
    <div className="nr-dialog-backdrop" onClick={onClose}>
      <div className="nr-dialog" role="dialog" aria-modal="true" aria-label="EMS agency settings" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>EMS agency settings</h2>
          <button type="button" className="nr-icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        <p className="nr-muted">Used in the NEMSIS export header and to prefill new patient care reports.</p>
        {SETTINGS_FIELDS.map((field) => (
          <div key={field.key} className="nr-field nr-wide">
            <span className="nr-label">{field.label}</span>
            <input className="nr-input" value={values[field.key] || ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} aria-invalid={Boolean(errors[field.key])} />
            <small className={errors[field.key] ? "nr-error" : "nr-help"}>{errors[field.key] || field.hint}</small>
          </div>
        ))}
        {error ? <p className="nr-error" role="alert">{error}</p> : null}
        <div className="pcr-dialog-actions">
          <button className="nr-btn nr-btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="nr-btn nr-btn-primary" type="button" disabled={saving || Object.keys(errors).length > 0} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
