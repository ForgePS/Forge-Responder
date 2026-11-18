import { useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowLeft, ClipboardCheck, ClipboardList, FileUp, Inbox, RefreshCw, RotateCcw, Send, Settings2, Trash2, Upload,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { Badge, Panel } from "../components/shell/ui.jsx";
import FormEditor from "../components/digitalForms/FormEditor.jsx";
import FormFillView from "../components/digitalForms/FormFillView.jsx";
import { findMissingRequiredFields } from "../lib/inspections/checklistFields.js";
import { PLATFORM_SCOPE_ID } from "../lib/tenantPaths.js";
import {
  IMPORT_STATUS_LABELS, LINK_TYPE_LABELS, LINK_TYPE_OPTIONS, answerableCount, detailsToSubmit, missingRemarks, reviewProblems,
} from "../lib/digitalForms/formDraft.js";
import {
  ACCEPTED_TYPES, checkFile, convertImport, describeError, discardImport, listLinkOptions, loadFormVersion, originalFileUrl,
  publishImport, reviseForm, saveImportDraft, setFormStatus, submitForm, uploadAndConvert,
  watchForms, watchImports, watchSubmissions,
} from "../lib/digitalForms/digitalFormsService.js";
import { listInspectionTypes } from "../lib/inspections/inspectionConfigService.js";
import { canManageInspectionConfig } from "../lib/inspections/inspectionPermissions.js";
import { applyFormToInspections } from "../lib/digitalForms/inspectionTemplateFromForm.js";
import "../styles/inspections-checklist.css";
import "../styles/digital-forms.css";

const formatWhen = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

function Message({ message }) {
  if (!message?.text) return null;
  return <div className={message.tone === "error" ? "checklist-missing-alert" : "df-success"} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div>;
}

// ---------------------------------------------------------------- fill in

/** Pick the apparatus, occupancy, station or member a submission is about. */
function LinkPicker({ departmentId, type, value, onChange, missing }) {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setOptions(null);
    setError("");
    listLinkOptions(departmentId, type)
      .then((rows) => { if (live) setOptions(rows); })
      .catch((e) => { if (live) { setOptions([]); setError(describeError(e)); } });
    return () => { live = false; };
  }, [departmentId, type]);
  const label = LINK_TYPE_LABELS[type] || "Record";
  return (
    <label className={`config-field df-link-picker${missing ? " checklist-field-missing" : ""}`}>
      <span>{label} *{missing ? " (required)" : ""}</span>
      <select value={value} disabled={!options} onChange={(e) => onChange(e.target.value)} aria-invalid={missing || undefined}>
        <option value="">{options ? `Choose ${label.toLowerCase()}` : "Loading…"}</option>
        {(options || []).map((o) => <option key={o.id} value={o.id}>{o.detail ? `${o.label} — ${o.detail}` : o.label}</option>)}
      </select>
      {options && !options.length && !error ? <small className="occupancy-muted">No {label.toLowerCase()} records yet. Add them first.</small> : null}
      {error ? <small className="df-error-text">{error}</small> : null}
    </label>
  );
}

function FillForm({ departmentId, uid, form, signerName, onDone, onBack }) {
  const [version, setVersion] = useState(null);
  const [answers, setAnswers] = useState({});
  const [details, setDetails] = useState({});
  const [linkedId, setLinkedId] = useState("");
  const [missingKeys, setMissingKeys] = useState(new Set());
  const [missingRemarkKeys, setMissingRemarkKeys] = useState(new Set());
  const [linkMissing, setLinkMissing] = useState(false);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    loadFormVersion(departmentId, form.publishedVersionId)
      .then((v) => { if (live) setVersion(v); })
      .catch((error) => { if (live) setMessage({ tone: "error", text: describeError(error) }); });
    return () => { live = false; };
  }, [departmentId, form.publishedVersionId]);

  const linkType = version?.snapshot?.linkType || "";

  async function submit() {
    const missing = findMissingRequiredFields(version.snapshot, answers);
    const remarks = missingRemarks(version.snapshot, answers, details);
    const noLink = Boolean(linkType) && !linkedId;
    setMissingKeys(new Set(missing.map((m) => m.key)));
    setMissingRemarkKeys(new Set(remarks.map((m) => m.key)));
    setLinkMissing(noLink);
    const problems = [];
    if (noLink) problems.push(`Choose the ${(LINK_TYPE_LABELS[linkType] || "record").toLowerCase()} this form is for.`);
    if (missing.length) problems.push(`Answer the required fields: ${missing.map((m) => m.label).join(", ")}.`);
    if (remarks.length) problems.push(`Add remarks for: ${remarks.map((m) => m.label).join(", ")}.`);
    if (problems.length) {
      setMessage({ tone: "error", text: problems.join(" ") });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await submitForm(departmentId, form.id, version.id, answers, {
        details: detailsToSubmit(version.snapshot, answers, details),
        linkedRecordId: linkedId,
      });
      onDone(`"${version.snapshot.name}" was saved.`);
    } catch (error) {
      setMessage({ tone: "error", text: describeError(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title={form.name}
      icon={ClipboardList}
      action={<button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={14} /> Back</button>}
    >
      <Message message={message} />
      {!version ? <p className="occupancy-muted">Loading form…</p> : (
        <>
          {linkType ? (
            <LinkPicker departmentId={departmentId} type={linkType} value={linkedId} missing={linkMissing}
              onChange={(id) => { setLinkedId(id); setLinkMissing(false); }} />
          ) : null}
          <FormFillView
            definition={version.snapshot}
            answers={answers}
            details={details}
            missingKeys={missingKeys}
            missingRemarkKeys={missingRemarkKeys}
            signerName={signerName}
            departmentId={departmentId}
            uid={uid}
            onChange={(key, next) => setAnswers((prev) => ({ ...prev, [key]: next }))}
            onDetailChange={(key, next) => setDetails((prev) => ({ ...prev, [key]: next }))}
          />
          <div className="df-actions">
            <button type="button" className="primary-button" disabled={saving} onClick={submit}><Send size={14} /> {saving ? "Saving…" : "Submit"}</button>
          </div>
        </>
      )}
    </Panel>
  );
}

function FormsTab({ departmentId, uid, forms, signerName, canFill }) {
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState(null);
  const live = forms.filter((f) => f.lifecycleStatus === "published");

  if (open) {
    return <FillForm departmentId={departmentId} uid={uid} form={open} signerName={signerName}
      onBack={() => setOpen(null)}
      onDone={(text) => { setOpen(null); setMessage({ tone: "ok", text }); }} />;
  }
  return (
    <Panel title="Forms to fill in" icon={ClipboardList}>
      <Message message={message} />
      {!live.length ? <p className="occupancy-muted">No forms are published yet.</p> : (
        <div className="df-card-list">
          {live.map((form) => (
            <div key={form.id} className="df-card">
              <div>
                <strong>{form.name}</strong>
                {form.description ? <small className="occupancy-muted">{form.description}</small> : null}
                <small className="occupancy-muted">
                  {form.fieldCount || answerableCount(form)} fields · version {form.currentVersion}
                  {form.linkType ? ` · one per ${(LINK_TYPE_LABELS[form.linkType] || "").toLowerCase()}` : ""}
                </small>
              </div>
              {canFill ? <button type="button" className="primary-button" onClick={() => { setMessage(null); setOpen(form); }}>Fill in</button> : null}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- submissions

function SubmissionsTab({ departmentId, uid, all }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  useEffect(() => watchSubmissions(departmentId, { uid, all }, setRows, (e) => setError(describeError(e))), [departmentId, uid, all]);

  if (open) {
    return (
      <Panel title={open.templateName} icon={Inbox}
        action={<button type="button" className="secondary-button" onClick={() => setOpen(null)}><ArrowLeft size={14} /> Back</button>}>
        <p className="occupancy-muted">Submitted by {open.submittedByName || open.submittedBy} on {formatWhen(open.submittedAt)}</p>
        {open.linkedRecord ? (
          <p className="df-linked">
            <strong>{LINK_TYPE_LABELS[open.linkedRecord.type] || "Linked to"}:</strong> {open.linkedRecord.label}
            {open.linkedRecord.detail ? ` — ${open.linkedRecord.detail}` : ""}
          </p>
        ) : null}
        <FormFillView definition={open.templateSnapshot} answers={open.answers || {}} details={open.details || {}} editable={false} />
      </Panel>
    );
  }
  return (
    <Panel title={all ? "Submissions" : "My submissions"} icon={Inbox}>
      {error ? <Message message={{ tone: "error", text: error }} /> : null}
      {!rows.length ? <p className="occupancy-muted">Nothing submitted yet.</p> : (
        <div className="df-card-list">
          {rows.map((row) => (
            <button key={row.id} type="button" className="df-card df-card-button" onClick={() => setOpen(row)}>
              <div>
                <strong>{row.templateName}</strong>
                <small className="occupancy-muted">
                  {row.linkedRecord ? `${row.linkedRecord.label} · ` : ""}{all ? `${row.submittedByName || row.submittedBy} · ` : ""}{formatWhen(row.submittedAt)}
                </small>
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- import + review

function ReviewImport({ departmentId, record, signerName, onBack, onPublished }) {
  const [draft, setDraft] = useState(record.draft);
  const [serverProblems, setServerProblems] = useState(record.problems || []);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const problems = useMemo(() => [...new Set([...reviewProblems(draft), ...serverProblems])], [draft, serverProblems]);

  useEffect(() => {
    originalFileUrl(record.uploadPath).then(setOriginalUrl).catch(() => setOriginalUrl(""));
  }, [record.uploadPath]);

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      const result = await saveImportDraft(departmentId, record.id, draft);
      setDraft(result.draft);
      setServerProblems(result.problems || []);
      setMessage({ tone: "ok", text: "Draft saved." });
    } catch (error) {
      setMessage({ tone: "error", text: describeError(error) });
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    if (problems.length) return;
    if (!window.confirm(`Publish "${draft.name}"? Members will be able to fill it in.`)) return;
    setBusy("publish");
    setMessage(null);
    try {
      await publishImport(departmentId, record.id, draft);
      onPublished(`"${draft.name}" is published.`);
    } catch (error) {
      setServerProblems(error?.details?.problems || []);
      setMessage({ tone: "error", text: describeError(error) });
    } finally {
      setBusy("");
    }
  }

  return (
    <Panel title={`Review: ${record.fileName}`} icon={Settings2}
      action={<button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={14} /> Back</button>}>
      <p className="occupancy-muted">
        Check every field against the original before publishing. Nothing is visible to members until you publish.
        {originalUrl ? <> <a href={originalUrl} target="_blank" rel="noreferrer">Open the original</a>.</> : null}
      </p>
      <Message message={message} />
      <FormEditor value={draft} onChange={setDraft} problems={problems} warnings={record.warnings || []} signerName={signerName} />
      <div className="df-actions">
        <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={save}>{busy === "save" ? "Saving…" : "Save draft"}</button>
        <button type="button" className="primary-button" disabled={Boolean(busy) || problems.length > 0} onClick={publish}>{busy === "publish" ? "Publishing…" : "Publish"}</button>
      </div>
    </Panel>
  );
}

function ImportTab({ departmentId, signerName }) {
  const [imports, setImports] = useState([]);
  const [file, setFile] = useState(null);
  const [linkType, setLinkType] = useState("");
  const [stage, setStage] = useState("");
  const [message, setMessage] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  useEffect(() => watchImports(departmentId, setImports, (e) => setMessage({ tone: "error", text: describeError(e) })), [departmentId]);

  const visible = imports.filter((r) => r.status !== "discarded");
  const fileProblem = file ? checkFile(file) : "";

  async function start() {
    setMessage(null);
    try {
      const result = await uploadAndConvert(departmentId, file, setStage, { linkType });
      setFile(null);
      setReviewing(result.id);
    } catch (error) {
      setMessage({ tone: "error", text: describeError(error) });
    } finally {
      setStage("");
    }
  }

  async function act(fn, okText) {
    setMessage(null);
    try {
      await fn();
      if (okText) setMessage({ tone: "ok", text: okText });
    } catch (error) {
      setMessage({ tone: "error", text: describeError(error) });
    }
  }

  const reviewRecord = reviewing ? visible.find((r) => r.id === reviewing && r.status === "review") : null;
  if (reviewRecord) {
    return <ReviewImport departmentId={departmentId} record={reviewRecord} signerName={signerName}
      onBack={() => setReviewing(null)}
      onPublished={(text) => { setReviewing(null); setMessage({ tone: "ok", text }); }} />;
  }

  return (
    <>
      <Panel title="Convert a paper form" icon={FileUp}>
        <p className="occupancy-muted">
          Upload a PDF, or a photo or scan of a paper form (PNG or JPG, up to 20 MB). FORGE reads the form and lists its
          fields for you to check. The file is sent to Anthropic&apos;s Claude service to be read; don&apos;t upload forms
          that already contain patient or personal information.
        </p>
        <div className="df-upload">
          <label className="df-link-type">
            <span>Each submission is for</span>
            <select value={linkType} disabled={Boolean(stage)} onChange={(e) => setLinkType(e.target.value)}>
              {LINK_TYPE_OPTIONS.map((o) => <option key={o.id || "none"} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <input type="file" accept={ACCEPTED_TYPES.join(",")} disabled={Boolean(stage)}
            onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label="Form file" />
          <button type="button" className="primary-button" disabled={!file || Boolean(fileProblem) || Boolean(stage)} onClick={start}>
            <Upload size={14} /> {stage === "upload" ? "Uploading…" : stage === "convert" ? "Converting… (up to a minute)" : "Upload and convert"}
          </button>
        </div>
        {fileProblem ? <small className="df-error-text">{fileProblem}</small> : null}
        <Message message={message} />
      </Panel>

      <Panel title="Uploads" icon={Inbox}>
        {!visible.length ? <p className="occupancy-muted">No uploads yet.</p> : (
          <div className="df-card-list">
            {visible.map((record) => (
              <div key={record.id} className="df-card">
                <div>
                  <strong>{record.draft?.name || record.fileName}</strong>
                  <small className="occupancy-muted">{record.fileName} · {formatWhen(record.createdAt)} · {record.createdByName}</small>
                  {record.status === "failed" && record.error ? <small className="df-error-text">{record.error}</small> : null}
                </div>
                <div className="df-card-actions">
                  <Badge tone={record.status === "failed" ? "danger" : record.status === "published" ? "good" : "warning"}>{IMPORT_STATUS_LABELS[record.status] || record.status}</Badge>
                  {record.status === "review" ? <button type="button" className="primary-button" onClick={() => setReviewing(record.id)}>Review</button> : null}
                  {["failed", "awaiting_upload"].includes(record.status) && !stage ? (
                    <button type="button" className="secondary-button" onClick={() => act(() => convertImport(departmentId, record.id).then((r) => setReviewing(r.id)))}><RefreshCw size={14} /> Try again</button>
                  ) : null}
                  {!["published", "converting"].includes(record.status) && !stage ? (
                    <button type="button" className="icon-button danger" aria-label="Discard upload" title="Discard"
                      onClick={() => window.confirm(`Discard ${record.fileName}? The uploaded file is deleted.`) && act(() => discardImport(departmentId, record.id), "Upload discarded.")}>
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- manage published

/** Copy a published form into an inspection template and make it an inspection type's default. */
function UseForInspections({ departmentId, form, actor, onDone, onCancel }) {
  const [types, setTypes] = useState(null);
  const [typeId, setTypeId] = useState("");
  const [newTypeName, setNewTypeName] = useState(form.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    listInspectionTypes(departmentId)
      .then((rows) => {
        if (!live) return;
        const active = rows.filter((row) => row.lifecycleStatus !== "archived" && !row.disabled);
        setTypes(active);
        // Pick the type this form already feeds, or one with the same name.
        const match = active.find((row) => row.name.trim().toLowerCase() === String(form.name).trim().toLowerCase());
        if (match) setTypeId(match.id);
      })
      .catch((e) => { if (live) { setTypes([]); setError(describeError(e)); } });
    return () => { live = false; };
  }, [departmentId, form.name]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const version = await loadFormVersion(departmentId, form.publishedVersionId);
      if (!version?.snapshot) throw new Error("This form's published version couldn't be loaded.");
      const result = await applyFormToInspections(departmentId, {
        form, definition: version.snapshot, typeId, newTypeName,
      }, actor);
      onDone(result.updated
        ? `Inspection type "${result.type.name}" now uses version ${form.currentVersion} of "${form.name}".`
        : `"${form.name}" is now the checklist for "${result.type.name}" inspections. New inspections of that type use it.`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="df-use-inspections">
      <strong>Use "{form.name}" for inspections</strong>
      <p className="occupancy-muted">
        The form becomes the checklist for an inspection type. Inspectors fill it in on each inspection, and any
        No or Fail answer asks for remarks and photos. Inspections already started keep their old checklist.
      </p>
      <label className="config-field">
        <span>Inspection type</span>
        <select value={typeId} disabled={!types || busy} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">New inspection type…</option>
          {(types || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      {!typeId ? (
        <label className="config-field">
          <span>New type name</span>
          <input value={newTypeName} disabled={busy} onChange={(e) => setNewTypeName(e.target.value)} />
        </label>
      ) : (
        <small className="occupancy-muted">This replaces that type's current checklist for new inspections.</small>
      )}
      {error ? <small className="df-error-text">{error}</small> : null}
      <div className="df-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="primary-button" disabled={busy || !types || (!typeId && !newTypeName.trim())} onClick={confirm}>
          {busy ? "Saving…" : "Use for inspections"}
        </button>
      </div>
    </div>
  );
}

function ManageTab({ departmentId, forms, signerName, canConfigInspections, actor }) {
  const [forInspections, setForInspections] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const problems = useMemo(() => (draft ? reviewProblems(draft) : []), [draft]);

  async function act(fn, okText) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: "ok", text: okText });
      return true;
    } catch (error) {
      setMessage({ tone: "error", text: describeError(error) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (editing && draft) {
    return (
      <Panel title={`Edit: ${editing.name}`} icon={Settings2}
        action={<button type="button" className="secondary-button" onClick={() => setEditing(null)}><ArrowLeft size={14} /> Back</button>}>
        <p className="occupancy-muted">Publishing saves a new version. Submissions already made keep the version they answered.</p>
        <Message message={message} />
        <FormEditor value={draft} onChange={setDraft} problems={problems} signerName={signerName} />
        <div className="df-actions">
          <button type="button" className="primary-button" disabled={busy || problems.length > 0}
            onClick={async () => {
              if (await act(() => reviseForm(departmentId, editing.id, draft), `New version of "${draft.name}" published.`)) setEditing(null);
            }}>Publish new version</button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Published forms" icon={Settings2}>
      <Message message={message} />
      {!forms.length ? <p className="occupancy-muted">Nothing published yet. Convert a paper form to get started.</p> : (
        <div className="df-card-list">
          {forms.map((form) => (
            <div key={form.id} className="df-card">
              <div>
                <strong>{form.name}</strong>
                <small className="occupancy-muted">Version {form.currentVersion} · {formatWhen(form.publishedAt)}</small>
              </div>
              <div className="df-card-actions">
                <Badge tone={form.lifecycleStatus === "published" ? "good" : "neutral"}>{form.lifecycleStatus === "published" ? "Live" : "Archived"}</Badge>
                <button type="button" className="secondary-button" disabled={busy}
                  onClick={() => { setMessage(null); setEditing(form); setDraft({ name: form.name, description: form.description, linkType: form.linkType || "", sections: form.sections }); }}>Edit</button>
                {form.lifecycleStatus === "published" ? (
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => act(() => setFormStatus(departmentId, form.id, "archived"), `"${form.name}" archived.`)}><Archive size={14} /> Archive</button>
                ) : (
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => act(() => setFormStatus(departmentId, form.id, "published"), `"${form.name}" restored.`)}><RotateCcw size={14} /> Restore</button>
                )}
                {canConfigInspections && form.lifecycleStatus === "published" ? (
                  <button type="button" className="secondary-button" disabled={busy}
                    onClick={() => { setMessage(null); setForInspections(form.id); }}><ClipboardCheck size={14} /> Use for inspections</button>
                ) : null}
              </div>
              {forInspections === form.id ? (
                <UseForInspections departmentId={departmentId} form={form} actor={actor}
                  onCancel={() => setForInspections(null)}
                  onDone={(text) => { setForInspections(null); setMessage({ tone: "ok", text }); }} />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- page

export default function DigitalFormsPage() {
  const { departmentId } = useTenant();
  const { user, permissions, isCreator } = useAuth();
  const has = (key) => isCreator || permissions?.[key] === true;
  const canManage = has("manageDigitalForms");
  const canFill = has("fillDigitalForms") || canManage;
  const seeAll = canManage || has("viewDigitalFormSubmissions");
  const signerName = user?.displayName || "";

  const tabs = [
    { id: "fill", label: "Forms", icon: ClipboardList },
    { id: "submissions", label: seeAll ? "Submissions" : "My submissions", icon: Inbox },
    ...(canManage ? [{ id: "import", label: "Convert a form", icon: FileUp }, { id: "manage", label: "Manage", icon: Settings2 }] : []),
  ];
  const [tab, setTab] = useState("fill");
  const [forms, setForms] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => (departmentId && departmentId !== PLATFORM_SCOPE_ID ? watchForms(departmentId, setForms, (e) => setError(describeError(e))) : undefined), [departmentId]);

  return (
    <div className="module-page digital-forms-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><ClipboardList size={22} /></span>
          <div>
            <h1>Digital Forms</h1>
            <p>Turn your paper forms into forms members fill in here.</p>
          </div>
        </div>
      </section>
      {!departmentId || departmentId === PLATFORM_SCOPE_ID ? <p className="occupancy-muted">Choose a department in the workspace menu first.</p> : (
        <>
          <section className="cert-toolbar">
            <div className="segmented-control" role="tablist" aria-label="Digital Forms views">
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
            </div>
          </section>
          {error ? <Message message={{ tone: "error", text: error }} /> : null}
          {tab === "fill" ? <FormsTab departmentId={departmentId} uid={user?.uid} forms={forms} signerName={signerName} canFill={canFill} /> : null}
          {tab === "submissions" ? <SubmissionsTab departmentId={departmentId} uid={user?.uid} all={seeAll} /> : null}
          {tab === "import" && canManage ? <ImportTab departmentId={departmentId} signerName={signerName} /> : null}
          {tab === "manage" && canManage ? <ManageTab departmentId={departmentId} forms={forms} signerName={signerName}
            canConfigInspections={canManageInspectionConfig(permissions, isCreator)}
            actor={{ actorUid: user?.uid || "system", actorName: signerName || user?.email || "User" }} /> : null}
        </>
      )}
    </div>
  );
}
