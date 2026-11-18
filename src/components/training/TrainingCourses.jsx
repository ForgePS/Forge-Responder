import { useEffect, useMemo, useState } from "react";
import { BookCopy, CirclePlus, Copy, FileUp, Trash2, Upload } from "lucide-react";
import { useTraining } from "./useTrainingData.js";
import { Badge, ConfirmButton, EmptyState, ErrorNote, Field, Modal, ModalActions, Notice, Section, Table } from "./TrainingUi.jsx";
import { blankCourse, STARTER_CATALOG } from "../../lib/training/trainingCatalog.js";
import { DISCIPLINES } from "../../lib/training/trainingReports.js";
import { listCourseVersions, publishCourseVersion, saveTrainingDoc, TRAINING_COLLECTIONS as C } from "../../lib/training/trainingService.js";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { safeFileName } from "../../lib/storagePaths.js";
import { friendlyError } from "../../lib/friendlyError.js";
import { uniqueRecordId } from "../../lib/recordIds.js";

const LESSON_KINDS = [
  { value: "text", label: "Lesson content" },
  { value: "instructorNotes", label: "Instructor notes" },
  { value: "handout", label: "Student handout" },
  { value: "practical", label: "Practical exercise" },
  { value: "safety", label: "Safety checklist" },
  { value: "evaluation", label: "Evaluation form" },
  { value: "video", label: "Video (link)" },
  { value: "file", label: "File (PDF, PowerPoint, image)" },
  { value: "embed", label: "Embedded resource (link)" },
];

const STATUS_TONE = { draft: "neutral", published: "success", archived: "warning", retired: "critical" };

function LessonEditor({ lesson, onChange, onRemove, departmentId, courseId }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const up = await uploadFirebaseFile(`departments/${departmentId}/training/courses/${courseId}/${Date.now()}-${safeFileName(file.name)}`, file);
      onChange({ ...lesson, fileName: file.name, url: up.downloadUrl, storagePath: up.storagePath, contentType: up.contentType });
    } catch (e) { setErr(friendlyError(e, "Upload failed.")); } finally { setBusy(false); }
  }
  return (
    <div className="trn-lesson">
      <div className="trn-inline">
        <select value={lesson.kind} onChange={(e) => onChange({ ...lesson, kind: e.target.value })} aria-label="Section type">{LESSON_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
        <input value={lesson.title} onChange={(e) => onChange({ ...lesson, title: e.target.value })} placeholder="Section title" aria-label="Section title" className="trn-grow" />
        <button type="button" className="icon-button" aria-label="Remove section" onClick={onRemove}><Trash2 size={13} /></button>
      </div>
      {["video", "embed"].includes(lesson.kind) ? <input type="url" value={lesson.url || ""} onChange={(e) => onChange({ ...lesson, url: e.target.value })} placeholder="https://…" aria-label="Link" /> : null}
      {lesson.kind === "file" ? (
        <div className="trn-inline">
          <label className="secondary-button trn-file"><input type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,image/*,video/*" onChange={(e) => upload(e.target.files?.[0])} /><FileUp size={14} /> {busy ? "Uploading…" : "Upload"}</label>
          {lesson.url ? <a href={lesson.url} target="_blank" rel="noreferrer">{lesson.fileName || "Open file"}</a> : <span className="trn-muted">No file yet</span>}
        </div>
      ) : null}
      {err ? <p className="form-error">{err}</p> : null}
      <textarea rows={lesson.kind === "text" ? 6 : 3} value={lesson.body || ""} onChange={(e) => onChange({ ...lesson, body: e.target.value })} placeholder={lesson.kind === "safety" ? "One checklist item per line" : "Content (plain text; line breaks are kept)"} aria-label="Section content" />
    </div>
  );
}

function CourseEditor({ initial, onClose, onSaved }) {
  const t = useTraining();
  const [c, setC] = useState(() => ({ ...blankCourse(), id: initial?.id || uniqueRecordId("CRS"), ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const set = (p) => setC((x) => ({ ...x, ...p }));
  const isNew = !initial?.id;

  async function save(publish) {
    setError("");
    if (!c.title.trim()) { setError("Enter a course name."); return; }
    setBusy(true);
    try {
      const payload = { ...c, status: c.status === "published" && !publish ? "published" : c.status };
      const saved = await saveTrainingDoc(t.departmentId, C.courses, payload, t.actor, "CRS", { create: isNew });
      const id = saved.id;
      if (publish) await publishCourseVersion(t.departmentId, { ...c, id }, t.actor, note);
      onSaved(publish ? "published" : "saved");
    } catch (e) { setError(friendlyError(e, "Couldn't save the course.")); } finally { setBusy(false); }
  }

  const lessons = c.lessons || [];
  return (
    <Modal title={isNew ? "New course" : `Edit ${c.title}`} onClose={onClose}>
      <div className="trn-form">
        <ErrorNote error={error} />
        <div className="trn-grid">
          <Field label="Course name" wide><input value={c.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Course ID / code"><input value={c.code} onChange={(e) => set({ code: e.target.value })} /></Field>
          <Field label="Discipline"><select value={c.discipline} onChange={(e) => set({ discipline: e.target.value })}>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Category"><input value={c.category} onChange={(e) => set({ category: e.target.value })} /></Field>
          <Field label="Difficulty"><select value={c.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>{["Basic", "Intermediate", "Advanced"].map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Estimated hours"><input type="number" min="0" step="0.25" value={c.estimatedHours} onChange={(e) => set({ estimatedHours: e.target.value })} /></Field>
          <Field label="Intended audience"><input value={c.audience} onChange={(e) => set({ audience: e.target.value })} /></Field>
          <Field label="Description" wide><textarea rows={2} value={c.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Learning objectives (one per line)" wide><textarea rows={3} value={(c.objectives || []).join("\n")} onChange={(e) => set({ objectives: e.target.value.split("\n") })} /></Field>
          <Field label="Prerequisite courses" wide>
            <select multiple value={c.prerequisiteCourseIds} onChange={(e) => set({ prerequisiteCourseIds: [...e.target.selectedOptions].map((o) => o.value) })} size={4}>
              {t.courses.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </Field>
          <Field label="Applicable standards" hint="Pick from your standards catalog (Administration).">
            <select multiple value={c.standards} onChange={(e) => set({ standards: [...e.target.selectedOptions].map((o) => o.value) })} size={4}>
              {t.standards.map((s) => <option key={s.id} value={s.id}>{s.organization} {s.publication} ({s.edition}) {s.requirementId}</option>)}
            </select>
          </Field>
          <Field label="Related JPRs"><input value={c.jprs} onChange={(e) => set({ jprs: e.target.value })} placeholder="Your JPR identifiers" /></Field>
          <Field label="Instructor qualification required"><input value={c.instructorQualification} onChange={(e) => set({ instructorQualification: e.target.value })} /></Field>
          <Field label="Required equipment"><input value={c.equipment} onChange={(e) => set({ equipment: e.target.value })} /></Field>
          <Field label="Required PPE"><input value={c.ppe} onChange={(e) => set({ ppe: e.target.value })} /></Field>
          <Field label="Safety considerations" wide><textarea rows={2} value={c.safety} onChange={(e) => set({ safety: e.target.value })} /></Field>
          <Field label="Written assessment"><input value={c.writtenAssessment} onChange={(e) => set({ writtenAssessment: e.target.value })} /></Field>
          <Field label="Practical evaluation">
            <select value={c.practicalSkillId || ""} onChange={(e) => set({ practicalSkillId: e.target.value })}><option value="">None</option>{t.skills.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
          </Field>
          <Field label="Passing requirement"><input value={c.passingRequirement} onChange={(e) => set({ passingRequirement: e.target.value })} /></Field>
          <Field label="Live-fire training"><select value={c.liveFire ? "yes" : "no"} onChange={(e) => set({ liveFire: e.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes — requires live-fire documentation</option></select></Field>
          <Field label="CE eligible" hint="Eligibility only. Credit is awarded per person by a CE approver."><select value={c.ceEligible ? "yes" : "no"} onChange={(e) => set({ ceEligible: e.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></select></Field>
          {c.ceEligible ? <><Field label="CE provider"><input value={c.ceProvider} onChange={(e) => set({ ceProvider: e.target.value })} /></Field><Field label="Course approval number"><input value={c.ceApprovalNumber} onChange={(e) => set({ ceApprovalNumber: e.target.value })} /></Field></> : null}
        </div>
        <div className="trn-subhead"><h4>Lesson plan</h4><button type="button" className="secondary-button" onClick={() => set({ lessons: [...lessons, { id: uniqueRecordId("LSN"), kind: "text", title: "", body: "" }] })}><CirclePlus size={14} /> Add section</button></div>
        {lessons.length ? lessons.map((l, i) => (
          <LessonEditor key={l.id} lesson={l} departmentId={t.departmentId} courseId={c.id}
            onChange={(next) => set({ lessons: lessons.map((x, j) => (j === i ? next : x)) })}
            onRemove={() => set({ lessons: lessons.filter((_, j) => j !== i) })} />
        )) : <p className="trn-muted">No sections yet. Add lesson content, instructor notes, handouts, practical exercises, safety checklists, evaluation forms, videos or files.</p>}
        <Field label="Change note for this version" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed (shown in version history)" /></Field>
      </div>
      <ModalActions onCancel={onClose} busy={busy} extra={<>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => save(false)}>Save draft</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => save(true)}><Upload size={14} /> Publish new version</button>
      </>} />
    </Modal>
  );
}

function CourseView({ course, onClose, onEdit }) {
  const t = useTraining();
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);
  useEffect(() => { listCourseVersions(t.departmentId, course.id).then(setVersions).catch((e) => setError(friendlyError(e))); }, [t.departmentId, course.id, course.publishedVersion]);
  const used = t.records.filter((r) => r.courseId === course.id);
  const content = viewing ? viewing.content : course;
  async function setStatus(status) {
    try { await saveTrainingDoc(t.departmentId, C.courses, { ...course, status }, t.actor); } catch (e) { setError(friendlyError(e)); }
  }
  async function duplicate() {
    try {
      const { id, publishedVersion, ...rest } = course;
      await saveTrainingDoc(t.departmentId, C.courses, { ...rest, title: `${course.title} (copy)`, status: "draft", duplicatedFrom: id }, t.actor, "CRS");
      onClose();
    } catch (e) { setError(friendlyError(e)); }
  }
  return (
    <Modal title={content.title} onClose={onClose}>
      <ErrorNote error={error} />
      <div className="trn-detail-head"><Badge tone={STATUS_TONE[course.status]}>{course.status}</Badge>{course.publishedVersion ? <span className="trn-muted">Current version {course.publishedVersion}</span> : null}{viewing ? <Badge tone="info">Viewing version {viewing.version}</Badge> : null}</div>
      <div className="cert-detail-grid">{[["Code", content.code], ["Discipline", content.discipline], ["Category", content.category], ["Hours", content.estimatedHours], ["Audience", content.audience], ["Difficulty", content.difficulty], ["PPE", content.ppe], ["Equipment", content.equipment], ["JPRs", content.jprs], ["CE", content.ceEligible ? `Eligible · ${content.ceProvider || ""} ${content.ceApprovalNumber || ""}` : "No"]].map(([k, v]) => <div key={k}><span>{k}</span><strong>{v || "—"}</strong></div>)}</div>
      {content.description ? <p className="trn-pre">{content.description}</p> : null}
      {(content.objectives || []).filter(Boolean).length ? <><h4>Objectives</h4><ul className="trn-list">{content.objectives.filter(Boolean).map((o, i) => <li key={i}>{o}</li>)}</ul></> : null}
      {content.safety ? <p className="trn-callout warning"><strong>Safety:</strong> {content.safety}</p> : null}
      {(content.lessons || []).map((l) => (
        <div key={l.id} className="trn-lesson-view">
          <h5>{LESSON_KINDS.find((k) => k.value === l.kind)?.label}: {l.title}</h5>
          {l.url ? <p><a href={l.url} target="_blank" rel="noreferrer">{l.fileName || l.url}</a></p> : null}
          {l.kind === "safety" ? <ul>{String(l.body || "").split("\n").filter(Boolean).map((x, i) => <li key={i}><input type="checkbox" aria-label={x} /> {x}</li>)}</ul> : <p className="trn-pre">{l.body}</p>}
        </div>
      ))}
      <h4>Version history</h4>
      <Table rows={versions} rowKey={(v) => v.version} empty="Not published yet."
        columns={[{ key: "version", label: "Version" }, { key: "publishedAt", label: "Published", render: (v) => String(v.publishedAt).slice(0, 10) }, { key: "publishedByName", label: "By" }, { key: "changeNote", label: "Note" },
          { key: "v", label: "", render: (v) => <button type="button" className="text-button" onClick={() => setViewing(v)}>View</button> }]} />
      <p className="trn-muted">{used.length} training record{used.length === 1 ? "" : "s"} reference this course; each keeps the version it was taught from.</p>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        {viewing ? <button type="button" className="secondary-button" onClick={() => setViewing(null)}>Back to current</button> : null}
        {t.flags.canEdit ? <button type="button" className="secondary-button" onClick={duplicate}><Copy size={14} /> Duplicate</button> : null}
        {t.flags.canEdit && course.status !== "archived" ? <ConfirmButton confirm="Archive this course? It stays on past records but can't be picked for new training." onConfirm={() => setStatus("archived")}>Archive</ConfirmButton> : null}
        {t.flags.canEdit && course.status === "archived" ? <button type="button" className="secondary-button" onClick={() => setStatus(course.publishedVersion ? "published" : "draft")}>Restore</button> : null}
        {t.flags.canConfigure && course.status !== "retired" ? <ConfirmButton className="secondary-button danger-button" confirm="Retire this course permanently? Past records keep it." onConfirm={() => setStatus("retired")}>Retire</ConfirmButton> : null}
        {t.flags.canEdit && course.status !== "retired" ? <button type="button" className="primary-button" onClick={() => onEdit(course)}>Edit / revise</button> : null}
      </div>
    </Modal>
  );
}

export function StarterCatalogImport({ onClose, onDone }) {
  const t = useTraining();
  const existing = new Set(t.courses.map((c) => c.title.toLowerCase()));
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    try {
      for (const group of STARTER_CATALOG) {
        for (const title of group.titles) {
          const key = `${group.category}|${title}`;
          if (!picked.has(key)) continue;
          await saveTrainingDoc(t.departmentId, C.courses, { ...blankCourse(), title, discipline: group.discipline, category: group.category, status: "draft", source: "starter-catalog" }, t.actor, "CRS");
        }
      }
      onDone(picked.size);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title="Add starter course templates" onClose={onClose}>
      <ErrorNote error={error} />
      <p className="trn-muted">These are blank course templates (titles and categories). They are not certifications or compliance requirements; you fill in content, standards and hours, then publish.</p>
      {STARTER_CATALOG.map((g) => (
        <fieldset key={g.category} className="trn-fieldset">
          <legend>{g.category} <button type="button" className="text-button" onClick={() => setPicked((p) => { const n = new Set(p); g.titles.forEach((x) => !existing.has(x.toLowerCase()) && n.add(`${g.category}|${x}`)); return n; })}>Select all</button></legend>
          <div className="trn-checks">{g.titles.map((x) => {
            const key = `${g.category}|${x}`;
            const have = existing.has(x.toLowerCase());
            return <label key={key} className={have ? "trn-muted" : ""}><input type="checkbox" disabled={have} checked={picked.has(key)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(key); else n.delete(key); return n; })} /> {x}{have ? " (in catalog)" : ""}</label>;
          })}</div>
        </fieldset>
      ))}
      <ModalActions onCancel={onClose} onSave={run} busy={busy} disabled={!picked.size} saveLabel={`Add ${picked.size} course${picked.size === 1 ? "" : "s"}`} />
    </Modal>
  );
}

export default function TrainingCourses() {
  const t = useTraining();
  const [q, setQ] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [starter, setStarter] = useState(false);
  const [notice, setNotice] = useState("");
  const rows = useMemo(() => t.courses.filter((c) => {
    if (status === "active" && ["archived", "retired"].includes(c.status)) return false;
    if (status !== "active" && status !== "all" && c.status !== status) return false;
    if (discipline && c.discipline !== discipline) return false;
    const n = q.trim().toLowerCase();
    return !n || [c.title, c.code, c.category, c.description].join(" ").toLowerCase().includes(n);
  }).sort((a, b) => String(a.title).localeCompare(String(b.title))), [t.courses, q, discipline, status]);
  const view = viewId ? t.courses.find((c) => c.id === viewId) : null;
  return (
    <div className="trn-page">
      <Notice message={notice} onClose={() => setNotice("")} />
      <div className="trn-toolbar">
        <div className="trn-filters">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses…" aria-label="Search courses" />
          <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} aria-label="Discipline"><option value="">All disciplines</option>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="active">Draft & published</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option><option value="retired">Retired</option><option value="all">All</option></select>
        </div>
        {t.flags.canEdit ? <div className="trn-actions">
          <button type="button" className="secondary-button" onClick={() => setStarter(true)}><BookCopy size={14} /> Starter templates</button>
          <button type="button" className="primary-button" onClick={() => setEditing({})}><CirclePlus size={14} /> New course</button>
        </div> : null}
      </div>
      {!t.courses.length ? <EmptyState title="No courses yet" action={t.flags.canEdit ? <button type="button" className="secondary-button" onClick={() => setStarter(true)}>Add starter templates</button> : null}>Build courses with lesson plans and publish versions. Training records keep the exact version taught.</EmptyState> : (
        <Section title="Course catalog">
          <Table rows={rows} onRowClick={(c) => setViewId(c.id)} empty="No courses match."
            columns={[{ key: "title", label: "Course" }, { key: "code", label: "Code" }, { key: "discipline", label: "Discipline" }, { key: "category", label: "Category" }, { key: "estimatedHours", label: "Hours" },
              { key: "v", label: "Version", render: (c) => c.publishedVersion || "—" }, { key: "status", label: "Status", render: (c) => <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge> }]} />
        </Section>
      )}
      {editing ? <CourseEditor initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={(what) => { setEditing(null); setNotice(`Course ${what}.`); }} /> : null}
      {view && !editing ? <CourseView course={view} onClose={() => setViewId(null)} onEdit={(c) => { setViewId(null); setEditing(c); }} /> : null}
      {starter ? <StarterCatalogImport onClose={() => setStarter(false)} onDone={(n) => { setStarter(false); setNotice(`Added ${n} draft course${n === 1 ? "" : "s"}.`); }} /> : null}
    </div>
  );
}
