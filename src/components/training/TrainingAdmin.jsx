import { useState } from "react";
import { CirclePlus } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { Badge, ConfirmButton, EmptyState, ErrorNote, Field, Modal, ModalActions, Notice, Section, Table } from "./TrainingUi.jsx";
import { deleteTrainingDoc, saveTrainingDoc, TRAINING_COLLECTIONS as C } from "../../lib/training/trainingService.js";
import { friendlyError } from "../../lib/friendlyError.js";

const ADOPTION = { adopted: ["Adopted", "success"], under_review: ["Under review", "warning"], reference: ["Reference only", "info"], superseded: ["Superseded", "neutral"] };

/**
 * Standards are catalogued by citation only (organization, publication, edition,
 * section id). The software never stores or reproduces standards text; the
 * department records its own summary and adoption decision.
 */
function StandardEditor({ initial, onClose, onSaved }) {
  const t = useTraining();
  const [s, setS] = useState(() => ({ organization: "", publication: "", edition: "", requirementId: "", title: "", jurisdiction: "", adoptionStatus: "under_review", effectiveFrom: "", effectiveTo: "", summary: "", adoptedBy: "", adoptionReference: "", ...(initial || {}) }));
  const [error, setError] = useState("");
  const set = (p) => setS((x) => ({ ...x, ...p }));
  async function save() {
    if (!s.organization.trim() || !s.publication.trim() || !s.edition.trim()) { setError("Organization, publication and edition are required."); return; }
    if (s.adoptionStatus === "adopted" && !s.adoptionReference.trim()) { setError("Record how it was adopted (ordinance, policy or SOG number) before marking it adopted."); return; }
    try { await saveTrainingDoc(t.departmentId, C.standards, s, t.actor, "STD"); onSaved(); } catch (e) { setError(friendlyError(e)); }
  }
  return (
    <Modal title={initial?.id ? "Edit standard" : "Add standard reference"} onClose={onClose}>
      <ErrorNote error={error} />
      <p className="trn-muted">Record the citation and your own summary only. Do not paste text from the standard.</p>
      <div className="trn-grid">
        <Field label="Organization"><input value={s.organization} onChange={(e) => set({ organization: e.target.value })} placeholder="e.g. NFPA, state EMS office, OSHA" /></Field>
        <Field label="Publication"><input value={s.publication} onChange={(e) => set({ publication: e.target.value })} placeholder="Document number" /></Field>
        <Field label="Edition"><input value={s.edition} onChange={(e) => set({ edition: e.target.value })} placeholder="Year / edition" /></Field>
        <Field label="Section / requirement id"><input value={s.requirementId} onChange={(e) => set({ requirementId: e.target.value })} /></Field>
        <Field label="Short title" wide><input value={s.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Jurisdiction"><input value={s.jurisdiction} onChange={(e) => set({ jurisdiction: e.target.value })} placeholder="Federal, state, local, department" /></Field>
        <Field label="Adoption status"><select value={s.adoptionStatus} onChange={(e) => set({ adoptionStatus: e.target.value })}>{Object.entries(ADOPTION).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Effective from"><input type="date" value={s.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} /></Field>
        <Field label="Effective to"><input type="date" value={s.effectiveTo} onChange={(e) => set({ effectiveTo: e.target.value })} /></Field>
        <Field label="Adopted by / reference" wide hint="Ordinance, policy, SOG or directive number and date"><input value={s.adoptionReference} onChange={(e) => set({ adoptionReference: e.target.value })} /></Field>
        <Field label="Department summary" wide><textarea rows={3} value={s.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="In your own words: what this means for your training program" /></Field>
      </div>
      <ModalActions onCancel={onClose} onSave={save} />
    </Modal>
  );
}

export default function TrainingAdmin({ legacyLog = null }) {
  const t = useTraining();
  const [tab, setTab] = useState("settings");
  const [settings, setSettings] = useState(() => ({ requireEvidence: false, recordReminderDays: 3, ...t.settings }));
  const [editingStd, setEditingStd] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const canConfigure = t.flags.canConfigure;
  const ruleCount = (stdId) => t.requirements.filter((r) => (r.standardIds || []).includes(stdId)).length;
  async function saveSettings() {
    try { await saveTrainingDoc(t.departmentId, C.settings, { ...settings, id: "main" }, t.actor, "SET", { create: !t.settings.id }); setNotice("Settings saved."); } catch (e) { setError(friendlyError(e)); }
  }
  const tabs = [["settings", "Settings"], ["standards", "Standards catalog"], ["templates", "Record templates"], ...(legacyLog ? [["legacy", "Legacy event log"]] : [])];
  return (
    <div className="trn-page">
      <Notice message={notice} onClose={() => setNotice("")} />
      <ErrorNote error={error} onClose={() => setError("")} />
      <div className="segmented-control">{tabs.map(([id, l]) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{l}</button>)}</div>
      {tab === "settings" ? (
        <Section title="Training settings">
          {!canConfigure ? <p className="trn-muted">Only training administrators can change these.</p> : null}
          <fieldset disabled={!canConfigure} className="trn-fieldset">
            <label className="trn-inline-label"><input type="checkbox" checked={Boolean(settings.requireEvidence)} onChange={(e) => setSettings({ ...settings, requireEvidence: e.target.checked })} /> Require a supporting document (sign-in sheet, photo, certificate) before a record can be submitted</label>
            <Field label="Remind officers about unsubmitted drafts after (days)" hint="Shown on the dashboard's needs-attention list"><input type="number" min="1" max="30" value={settings.recordReminderDays} onChange={(e) => setSettings({ ...settings, recordReminderDays: Number(e.target.value) })} /></Field>
            <p className="trn-muted">Always on: approver must differ from the submitter; approved records change only through amendments that keep the original values; live-fire records can't be submitted without the full live-fire checklist; CE credit can't be awarded twice for the same learning.</p>
            {canConfigure ? <div className="modal-actions"><button type="button" className="primary-button" onClick={saveSettings}>Save settings</button></div> : null}
          </fieldset>
        </Section>
      ) : null}
      {tab === "standards" ? (
        <Section title="Standards & regulatory references" actions={canConfigure ? <button type="button" className="primary-button" onClick={() => setEditingStd({})}><CirclePlus size={14} /> Add reference</button> : null}>
          <p className="trn-muted">A requirement can cite these references. Citing a standard doesn't make a requirement compliant with it; the department validates each mapping.</p>
          {t.standards.length ? <Table rows={t.standards} onRowClick={canConfigure ? (s) => setEditingStd(s) : undefined}
            columns={[{ key: "organization", label: "Org" }, { key: "publication", label: "Publication" }, { key: "edition", label: "Edition" }, { key: "requirementId", label: "Section" }, { key: "title", label: "Title" }, { key: "jurisdiction", label: "Jurisdiction" },
              { key: "adoptionStatus", label: "Status", render: (s) => <Badge tone={ADOPTION[s.adoptionStatus]?.[1]}>{ADOPTION[s.adoptionStatus]?.[0] || s.adoptionStatus}</Badge> },
              { key: "rules", label: "Requirements", render: (s) => ruleCount(s.id) }]} />
            : <EmptyState title="No standards catalogued">Add the standards and editions your department has adopted, then cite them on requirements and courses.</EmptyState>}
        </Section>
      ) : null}
      {tab === "templates" ? (
        <Section title="Record templates">
          {t.templates.length ? <Table rows={t.templates}
            columns={[{ key: "name", label: "Template" }, { key: "t", label: "Topic", render: (x) => x.fields?.title || "—" }, { key: "d", label: "Discipline", render: (x) => x.fields?.discipline || "—" }, { key: "h", label: "Hours", render: (x) => x.fields?.durationHours || "—" }, { key: "createdByName", label: "Created by" },
              { key: "a", label: "", render: (x) => (t.flags.canEdit ? <ConfirmButton className="text-button" confirm={`Delete template "${x.name}"? Records made from it are not affected.`} onConfirm={() => deleteTrainingDoc(t.departmentId, C.templates, x.id, t.actor, x.name).catch((e) => setError(friendlyError(e)))}>Delete</ConfirmButton> : null) }]} />
            : <EmptyState title="No templates">Use “Save as template” in the record editor to reuse a drill's topic, discipline and duration.</EmptyState>}
        </Section>
      ) : null}
      {tab === "legacy" ? (
        <div>
          <p className="trn-callout info">The older training event list. Forge Academy sync still writes here, and its completions count as evidence. New training should be logged under Records.</p>
          {legacyLog}
        </div>
      ) : null}
      {editingStd ? <StandardEditor initial={editingStd.id ? editingStd : null} onClose={() => setEditingStd(null)} onSaved={() => { setEditingStd(null); setNotice("Reference saved."); }} /> : null}
    </div>
  );
}
