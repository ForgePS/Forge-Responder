/**
 * Patient care reports (ePCR) in the RMS: crews see the reports they were on; supervisors with viewAllPcrs,
 * unlockPcrs or exportPcrs see every report, review it section by section, run the server NEMSIS check, unlock a
 * posted report for an amendment and export NEMSIS 3.5.1 XML. Admins set the EMS agency details here.
 *
 * PHI: every report holds patient data. Opening, unlocking and exporting a report is written to the audit log
 * (report number only, never patient details). Nothing here logs report contents.
 */
import { useEffect, useMemo, useState } from "react";
import { Ambulance, Download, Lock, LockOpen, Printer, RefreshCw, Search, Settings2, ShieldCheck } from "lucide-react";
import { Badge, FleetSummary, Modal } from "../components/shell/ui.jsx";
import {
  checkPcrOnServer,
  getPcr,
  listPcrs,
  loadEmsSettings,
  recordPcrExport,
  recordPcrPrint,
  saveEmsSettings,
  unlockPcr,
} from "../lib/pcrService.js";
import { emsSettingsAgency, emsSettingsErrors, missingEmsSettings, normalizeEmsSettings } from "../lib/nemsis/emsSettings.js";

function useNemsis() {
  const [state, setState] = useState({ schema: null, model: null, error: "" });
  useEffect(() => {
    let active = true;
    Promise.all([import("../lib/nemsis/index.js"), import("../lib/nemsis/pcrModel.js"), import("../lib/nemsis/pcrPrint.js")])
      .then(([mod, model, print]) => active && setState({ schema: mod.nemsisSchema, model: { ...model, ...print }, error: "" }))
      .catch(() => active && setState({ schema: null, model: null, error: "The NEMSIS data couldn't load. Refresh the page to try again." }));
    return () => {
      active = false;
    };
  }, []);
  return state;
}

function formatWhen(value) {
  if (!value) return "";
  const t = Date.parse(value);
  return Number.isNaN(t) ? String(value) : new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function friendlyError(error, fallback) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied")) return "You don't have permission to do that.";
  if (code.includes("not-found")) return "That report wasn't found, or you can't open it.";
  if (code.includes("failed-precondition")) return error.message || fallback;
  return fallback;
}

function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS_LABEL = { draft: "Draft", posted: "Posted" };

/** Posted, but the server NEMSIS check (run on post) found errors: a supervisor should review and unlock it. */
const needsReview = (report) => report.status === "posted" && report.nemsisCheck?.ok === false;

function statusBadge(report) {
  if (needsReview(report)) return { tone: "critical", label: "Needs review" };
  if (report.status === "draft" && report.unlockedAt) return { tone: "warning", label: "Unlocked" };
  return { tone: report.status === "posted" ? "success" : "warning", label: STATUS_LABEL[report.status] || report.status };
}

export default function PatientCareReportsPage({
  departmentId,
  uid,
  actor,
  query = "",
  canViewAll = false,
  canUnlock = false,
  canExport = false,
  canManageSettings = false,
}) {
  const { schema, model, error: schemaError } = useNemsis();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [settings, setSettings] = useState(normalizeEmsSettings(null));
  const [editingSettings, setEditingSettings] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, ems] = await Promise.all([listPcrs(departmentId, { uid, readAll: canViewAll }), loadEmsSettings(departmentId)]);
      setReports(rows);
      setSettings(ems);
    } catch (err) {
      setError(friendlyError(err, "Reports couldn't be loaded. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (departmentId && uid) reload();
  }, [departmentId, uid, canViewAll]);

  const summaries = useMemo(() => {
    if (!schema || !model) return [];
    return reports.map((report) => ({ report, summary: model.pcrSummary(schema, report.nemsis || {}) }));
  }, [reports, schema, model]);

  const needle = `${query} ${search}`.trim().toLowerCase();
  const visible = summaries
    .filter(({ report }) => statusFilter === "all" || (statusFilter === "review" ? needsReview(report) : report.status === statusFilter))
    .filter(({ report, summary }) => !needle || [report.number, report.unit, report.incidentNumber, summary.patient, summary.complaint]
      .join(" ").toLowerCase().includes(needle));

  const missingAgency = missingEmsSettings(settings);
  const counts = {
    all: reports.length,
    draft: reports.filter((r) => r.status === "draft").length,
    posted: reports.filter((r) => r.status === "posted").length,
    unlocked: reports.filter((r) => r.status === "draft" && r.unlockedAt).length,
    review: reports.filter(needsReview).length,
  };

  const open = async (id) => {
    setError("");
    setMessage("");
    try {
      const pcr = await getPcr(departmentId, id, actor);
      if (!pcr) throw Object.assign(new Error("missing"), { code: "not-found" });
      setSelected(pcr);
    } catch (err) {
      setError(friendlyError(err, "That report couldn't be opened."));
    }
  };

  const updateSelected = (next) => {
    setSelected(next);
    setReports((rows) => rows.map((row) => (row.id === next.id ? { ...row, ...next } : row)));
  };

  if (!schema) {
    return (
      <section className="panel">
        <div className="panel-body">
          <p className={schemaError ? "occupancy-error" : "occupancy-muted"} role={schemaError ? "alert" : "status"}>
            {schemaError || "Loading patient care reports…"}
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="pcr-page">
      <FleetSummary
        items={[
          ["Reports", counts.all, "neutral"],
          ["Drafts", counts.draft, counts.draft ? "warning" : "neutral"],
          ["Posted", counts.posted, "success"],
          ["Posted with NEMSIS errors", counts.review, counts.review ? "critical" : "neutral"],
          ["Unlocked for changes", counts.unlocked, counts.unlocked ? "warning" : "neutral"],
        ]}
      />

      {(canExport || canManageSettings) && missingAgency.length ? (
        <p className="occupancy-error" role="alert">
          NEMSIS export needs the EMS agency details: {missingAgency.join(", ")}.
          {canManageSettings ? " Use Agency settings to add them." : " Ask an administrator to add them."}
        </p>
      ) : null}
      {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
      {message ? <p className="occupancy-message" role="status">{message}</p> : null}

      <section className="personnel-workspace occupancy-workspace">
        <section className="panel">
          <header>
            <div><Ambulance size={15} aria-hidden /><strong>{canViewAll ? "All reports" : "My reports"}</strong></div>
            <div className="pcr-toolbar">
              <label className="config-inline-search">
                <Search size={14} aria-hidden />
                <input placeholder="Search number, unit, patient" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search reports" />
              </label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
                <option value="all">All</option>
                <option value="draft">Drafts</option>
                <option value="posted">Posted</option>
                <option value="review">Needs review</option>
              </select>
              <button className="secondary-button" type="button" onClick={reload} disabled={loading} title="Refresh">
                <RefreshCw size={14} aria-hidden /> <span className="sr-only">Refresh</span>
              </button>
              {canManageSettings ? (
                <button className="secondary-button" type="button" onClick={() => setEditingSettings(true)}>
                  <Settings2 size={14} aria-hidden /> Agency settings
                </button>
              ) : null}
            </div>
          </header>
          <div className="panel-body">
            {loading ? <p className="occupancy-muted" role="status">Loading reports…</p> : null}
            <div className="personnel-list">
              {visible.map(({ report, summary }) => (
                <button
                  key={report.id}
                  type="button"
                  className={report.id === selected?.id ? "person-row selected" : "person-row"}
                  onClick={() => open(report.id)}
                >
                  <span>
                    <strong>{report.number || report.id}</strong>
                    <small>
                      {[formatWhen(summary.notified) || formatWhen(report.createdAt), report.unit, summary.patient, summary.complaint].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  <Badge tone={statusBadge(report).tone}>{statusBadge(report).label}</Badge>
                </button>
              ))}
              {!loading && !visible.length ? (
                <p className="occupancy-muted">
                  {reports.length ? "No reports match." : "No patient care reports yet. Crews chart them in FORGE FIELD."}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {selected ? (
          <ReportDetail
            key={selected.id}
            schema={schema}
            model={model}
            pcr={selected}
            departmentId={departmentId}
            actor={actor}
            settings={settings}
            canUnlock={canUnlock}
            canExport={canExport}
            onChange={updateSelected}
            onMessage={(text) => { setMessage(text); setError(""); }}
            onError={(text) => { setError(text); setMessage(""); }}
          />
        ) : (
          <section className="panel">
            <div className="panel-body">
              <p className="occupancy-muted">Pick a report to review it.</p>
            </div>
          </section>
        )}
      </section>

      {editingSettings ? (
        <AgencySettingsModal
          initial={settings}
          onClose={() => setEditingSettings(false)}
          onSave={async (next) => {
            const saved = await saveEmsSettings(departmentId, next, actor);
            setSettings(normalizeEmsSettings(saved));
            setEditingSettings(false);
            setMessage("EMS agency settings saved.");
          }}
        />
      ) : null}
    </div>
  );
}

function ReportDetail({ schema, model, pcr, departmentId, actor, settings, canUnlock, canExport, onChange, onMessage, onError }) {
  const [busy, setBusy] = useState("");
  const [serverCheck, setServerCheck] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const nemsis = pcr.nemsis || {};
  const local = useMemo(() => model.postCheck(schema, nemsis), [model, schema, nemsis]);
  const sections = useMemo(
    () => model.PCR_SECTIONS.map((section) => ({ section, items: model.sectionReadout(schema, nemsis, section.id) })),
    [model, schema, nemsis],
  );
  const filled = sections.filter((s) => s.items.length);
  const posted = pcr.status === "posted";
  const missingAgency = missingEmsSettings(settings);
  const lastCheck = pcr.nemsisCheck;
  const lastCheckStale = lastCheck?.at && pcr.updatedAt && lastCheck.at < pcr.updatedAt;

  const runCheck = async () => {
    setBusy("check");
    try {
      const result = await checkPcrOnServer(departmentId, pcr.id);
      setServerCheck(result);
      onChange({ ...pcr, nemsisCheck: { at: new Date().toISOString(), ok: result.ok, errorCount: result.errorCount, warningCount: result.warningCount, trigger: "manual" } });
      onMessage(result.ok ? "NEMSIS check passed." : "NEMSIS check finished with issues (listed below).");
    } catch (err) {
      onError(friendlyError(err, "The NEMSIS check couldn't run. Try again in a minute."));
    } finally {
      setBusy("");
    }
  };

  const exportXml = async () => {
    setBusy("export");
    try {
      const xml = model.pcrXml(schema, { agency: emsSettingsAgency(settings), pcr: { ...nemsis, attrs: { ...(nemsis.attrs || {}), UUID: nemsis.attrs?.UUID || pcr.uuid } } });
      await recordPcrExport(departmentId, pcr, actor);
      downloadText(`PCR-${pcr.number || pcr.id}.xml`, xml, "application/xml");
      onMessage("NEMSIS XML downloaded. It contains patient information: store and send it securely.");
    } catch (err) {
      onError(friendlyError(err, "The report couldn't be exported."));
    } finally {
      setBusy("");
    }
  };

  const print = async () => {
    // Open the window first (in the click) so pop-up blockers allow it, then fill it.
    const win = window.open("", "_blank");
    if (!win) {
      onError("The print view was blocked. Allow pop-ups for this site and try again.");
      return;
    }
    try {
      await recordPcrPrint(departmentId, pcr, actor);
      win.document.open();
      win.document.write(model.pcrPrintHtml(schema, pcr, {
        agencyName: settings.agencyName,
        printedBy: actor?.actorName,
        printedAt: new Date().toISOString(),
        when: formatWhen,
      }));
      win.document.close();
      win.focus();
      win.print();
    } catch (err) {
      win.close();
      onError(friendlyError(err, "The print view couldn't be opened."));
    }
  };

  const unlock = async (reason) => {
    setBusy("unlock");
    try {
      onChange(await unlockPcr(departmentId, pcr, actor, reason));
      setUnlocking(false);
      onMessage("Report unlocked. The crew can edit it in FORGE FIELD the next time they open it with signal.");
    } catch (err) {
      onError(friendlyError(err, "The report couldn't be unlocked."));
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="panel pcr-detail">
      <header>
        <div>
          {posted ? <Lock size={15} aria-hidden /> : <LockOpen size={15} aria-hidden />}
          <strong>{pcr.number || pcr.id}</strong>
          <span className="occupancy-muted" style={{ marginLeft: 8 }}>
            {posted ? `Posted ${formatWhen(pcr.postedAt)}${pcr.postedByName ? ` by ${pcr.postedByName}` : ""}` : pcr.unlockedAt ? `Unlocked ${formatWhen(pcr.unlockedAt)} by ${pcr.unlockedBy || "a supervisor"}` : "Draft"}
          </span>
        </div>
        <div className="occupancy-detail-actions">
          <button className="secondary-button" type="button" onClick={runCheck} disabled={Boolean(busy)}>
            <ShieldCheck size={14} aria-hidden /> {busy === "check" ? "Checking…" : "Run NEMSIS check"}
          </button>
          {canExport ? (
            <button
              className="secondary-button"
              type="button"
              onClick={exportXml}
              disabled={Boolean(busy) || missingAgency.length > 0}
              title={missingAgency.length ? "Add the EMS agency details first" : "Download NEMSIS 3.5.1 XML"}
            >
              <Download size={14} aria-hidden /> Export XML
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={print} disabled={Boolean(busy)}>
            <Printer size={14} aria-hidden /> Print
          </button>
          {canUnlock && posted ? (
            <button className="secondary-button" type="button" onClick={() => setUnlocking(true)} disabled={Boolean(busy)}>
              <LockOpen size={14} aria-hidden /> Unlock
            </button>
          ) : null}
        </div>
      </header>
      <div className="panel-body">
        <dl className="pcr-facts">
          <div><dt>Unit</dt><dd>{pcr.unit || "—"}</dd></div>
          <div><dt>Incident</dt><dd>{pcr.incidentNumber || "—"}</dd></div>
          <div><dt>Charted by</dt><dd>{pcr.createdByName || "—"}</dd></div>
          <div><dt>Last change</dt><dd>{formatWhen(pcr.updatedAt) || "—"}{pcr.updatedByName ? ` · ${pcr.updatedByName}` : ""}</dd></div>
        </dl>
        {pcr.unlockReason ? <p className="occupancy-muted">Unlock reason: {pcr.unlockReason}</p> : null}

        <div className="pcr-checks">
          <p>
            <strong>Charting check:</strong>{" "}
            {local.ok ? "no errors" : `${local.blocking.length} error${local.blocking.length === 1 ? "" : "s"}`}
            {local.warnings.length ? `, ${local.warnings.length} warning${local.warnings.length === 1 ? "" : "s"}` : ""}
          </p>
          {needsReview(pcr) && !serverCheck ? (
            <p className="occupancy-error" role="alert">
              Posted with NEMSIS errors. Run the NEMSIS check to see them{canUnlock ? ", then unlock the report so the crew can fix it" : ""}.
            </p>
          ) : null}
          {lastCheck && !serverCheck ? (
            <p className="occupancy-muted">
              Last NEMSIS check{lastCheck.trigger === "post" ? " (on posting)" : ""} {formatWhen(lastCheck.at)}:{" "}
              {lastCheck.ok ? "passed" : `${lastCheck.errorCount} error${lastCheck.errorCount === 1 ? "" : "s"}`}
              {lastCheck.missingAgency ? " (agency settings incomplete)" : ""}
              {lastCheckStale ? " (the report changed since)" : ""}
            </p>
          ) : null}
          {serverCheck ? <ServerCheckResult result={serverCheck} /> : null}
          {!local.ok ? (
            <details>
              <summary>Charting errors</summary>
              <ul className="pcr-issues">
                {local.blocking.map((issue, i) => (
                  <li key={`${issue.path}-${i}`}>
                    <strong>{model.PCR_SECTIONS.find((s) => s.id === model.sectionForPath(issue.path))?.label || "Report"}:</strong> {issue.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        {filled.map(({ section, items }) => (
          <details key={section.id} className="pcr-section" open={["dispatch", "times", "patient", "situation", "narrative"].includes(section.id)}>
            <summary>{section.label}</summary>
            <ReadoutItems items={items} />
          </details>
        ))}
        {!filled.length ? <p className="occupancy-muted">Nothing has been charted on this report yet.</p> : null}
      </div>

      {unlocking ? <UnlockModal busy={busy === "unlock"} onClose={() => setUnlocking(false)} onConfirm={unlock} /> : null}
    </section>
  );
}

function ServerCheckResult({ result }) {
  const errors = (result.findings || []).filter((f) => f.severity === "error");
  const warnings = (result.findings || []).filter((f) => f.severity !== "error");
  return (
    <div className="pcr-server-check">
      <p>
        <strong>NEMSIS check ({result.schemaVersion || "3.5.1"}):</strong>{" "}
        {result.ok ? "passed" : `${result.errorCount} error${result.errorCount === 1 ? "" : "s"}`}
        {result.warningCount ? `, ${result.warningCount} warning${result.warningCount === 1 ? "" : "s"}` : ""}
      </p>
      {result.missingAgency?.length ? <p className="occupancy-error">Agency settings missing: {result.missingAgency.join(", ")}.</p> : null}
      {errors.length || warnings.length || result.blocking?.length ? (
        <ul className="pcr-issues">
          {(result.blocking || []).map((issue, i) => <li key={`b-${i}`}><Badge tone="critical">Error</Badge> {issue.message}</li>)}
          {errors.map((f, i) => <li key={`e-${i}`}><Badge tone="critical">Error</Badge> {f.message}</li>)}
          {warnings.map((f, i) => <li key={`w-${i}`}><Badge tone="warning">Warning</Badge> {f.message}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function ReadoutItems({ items }) {
  return (
    <dl className="pcr-readout">
      {items.map((item, i) => (item.type === "field" ? (
        <div key={`${item.el}-${i}`} className="pcr-readout-field">
          <dt>{item.label}</dt>
          <dd>{(item.kind === "datetime" ? item.values.map(formatWhen) : item.values).join(", ")}</dd>
        </div>
      ) : (
        <div key={`${item.name}-${i}`} className="pcr-readout-group">
          <dt>{item.label}</dt>
          <dd>
            {item.rows.map((row, r) => (
              <div key={r} className="pcr-readout-row">
                {item.rows.length > 1 ? <span className="occupancy-muted">#{r + 1}</span> : null}
                <ReadoutItems items={row} />
              </div>
            ))}
          </dd>
        </div>
      )))}
    </dl>
  );
}

function UnlockModal({ busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Unlock this report?" onClose={onClose}>
      <p>The report goes back to draft so the crew can amend it, then post it again. This is recorded in the audit log.</p>
      <label className="config-field wide">
        <span>Reason</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Add the second set of vitals" />
      </label>
      <div className="occupancy-detail-actions">
        <button className="primary-button" type="button" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

const SETTINGS_FIELDS = [
  { key: "stateAgencyId", label: "EMS agency unique state ID (dAgency.01)", hint: "The ID your state EMS office assigned the agency." },
  { key: "agencyNumber", label: "EMS agency number (dAgency.02 / eResponse.01)", hint: "The state-assigned provider number. Prefilled on new reports." },
  { key: "agencyName", label: "EMS agency name (eResponse.02)", hint: "Prefilled on new reports." },
  { key: "state", label: "State code (dAgency.04)", hint: "Two-digit ANSI state code, e.g. 37 for North Carolina, 48 for Texas." },
];

function AgencySettingsModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const errors = emsSettingsErrors(form);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(form);
    } catch (err) {
      setError(friendlyError(err, "The settings couldn't be saved."));
      setSaving(false);
    }
  };
  return (
    <Modal title="EMS agency settings" onClose={onClose}>
      <p className="occupancy-muted">Used in the NEMSIS export header and to prefill new patient care reports in FORGE FIELD.</p>
      <div className="occupancy-form-grid">
        {SETTINGS_FIELDS.map((field) => (
          <label key={field.key} className="config-field wide">
            <span>{field.label}</span>
            <input value={form[field.key] || ""} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} aria-invalid={Boolean(errors[field.key])} />
            <small className={errors[field.key] ? "occupancy-error" : "occupancy-muted"}>{errors[field.key] || field.hint}</small>
          </label>
        ))}
      </div>
      {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
      <div className="occupancy-detail-actions">
        <button className="primary-button" type="button" disabled={saving || Object.keys(errors).length > 0} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
