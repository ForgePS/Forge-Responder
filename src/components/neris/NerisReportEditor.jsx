import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, ClipboardCheck, Clock, Download, Flame, HeartPulse,
  Info, Link2, Loader2, LifeBuoy, Lock, MapPin, Paperclip, Plus, Radio, Search, Send, ShieldAlert, Trash2, Trees, Truck,
  Unlock, Users, Wrench, Zap, Biohazard, DollarSign, Sparkles, WifiOff,
} from "lucide-react";
import { Field, Picker, ProgressRing, Section, TextArea, TextInput, YesNo } from "./NerisControls.jsx";
import NerisAiNarrative from "./NerisAiNarrative.jsx";
import NerisCadImportModal from "./NerisCadImportModal.jsx";
import {
  INCIDENT_KINDS, STEPS, applicability, asList, checklistProgress, codeLabel, core, incidentTypes, isBlank,
  options, primaryTypeLabel, reportChecklist, statusTone, stepProgress, visibleFields,
} from "../../lib/neris/reportModel.js";
import { EMS_CHIEF_COMPLAINTS, EMS_DISPOSITIONS, EMS_TREATMENTS, WILDLAND_FUEL_TYPES } from "../../lib/neris/picklists.js";
import { REVIEW_STAGES, adminUnlockReport, applyReviewAction } from "../../lib/neris/workflow.js";
import { getOccupancyIncidentHistory } from "../../lib/neris/autoPopulation.js";
import { uploadFirebaseFile, deleteFirebaseFile } from "../../lib/firebaseClient.js";
import { buildNerisAttachmentPath } from "../../lib/storagePaths.js";
import { isObjectDeleted, softDeleteObject, withActiveLifecycle } from "../../lib/objectLifecycle.js";

const STEP_ICONS = { basics: Info, response: Radio, scene: Building2, details: Flame, narrative: Sparkles, review: ClipboardCheck };
const CATEGORY_LABELS = { FIRE: "Fire", MEDICAL: "Medical", RESCUE: "Rescue", HAZSIT: "Hazardous condition", PUBSERV: "Public service", NOEMERG: "No emergency", LAWENFORCE: "Law enforcement" };

function formatWhen(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Guided NERIS report editor: Basics → Response → Scene → Details → Narrative → Review.
 */
export default function NerisReportEditor({
  report,
  allReports = [],
  canEdit = false,
  departmentId = "",
  online = true,
  savedAt = "",
  reviewerName = "",
  sources = {},
  onUpdate,
  onUpdateModule,
  onAutoPopulate,
  onRecordSubmission,
  onClose,
  onOpenReport,
  onDelete,
}) {
  const [stepId, setStepId] = useState(() => (report.status === "Needs Review" || report.status === "Approved" || report.status === "Ready for Submission" ? "review" : "basics"));
  const [cadOpen, setCadOpen] = useState(false);
  const editable = canEdit && !report.locked;
  const ws = report.workspace || {};
  const c = core(report);
  const a = applicability(report);
  const checklist = useMemo(() => reportChecklist(report), [report]);
  const progress = useMemo(() => checklistProgress(report), [report]);
  const stepIndex = STEPS.findIndex((s) => s.id === stepId);

  function updateWorkspace(key, patch) {
    onUpdate({ workspace: { ...ws, [key]: { ...(ws[key] || {}), ...patch } } });
  }
  function setWorkspaceValue(key, value) {
    onUpdate({ workspace: { ...ws, [key]: value } });
  }
  const setCore = (field) => (value) => onUpdateModule("core_mod_incident", field, value);

  function goTo(id) {
    setStepId(id);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
    document.querySelector(".nr-main")?.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  const missingFor = (id) => checklist.some((i) => i.id === id && !i.done && i.required);

  return (
    <div className="nr-editor">
      <header className="nr-editor-head">
        <button type="button" className="nr-btn nr-btn-ghost" onClick={onClose}><ArrowLeft size={16} /> All reports</button>
        <div className="nr-editor-title">
          <h1>{primaryTypeLabel(report)}</h1>
          <p>
            <span>{report.reportNumber}</span>
            {report.incidentDate ? <span><Clock size={13} /> {report.incidentDate}</span> : null}
            {report.incidentAddress ? <span><MapPin size={13} /> {report.incidentAddress}</span> : null}
          </p>
        </div>
        <div className="nr-editor-status">
          {!online ? <span className="nr-pill nr-pill-warn"><WifiOff size={12} /> Offline — saving on this device</span> : null}
          {report.locked ? <span className="nr-pill"><Lock size={12} /> Locked</span> : null}
          <span className={`nr-status nr-status-${statusTone(report.status)}`}>{report.status || "Draft"}</span>
          {savedAt ? <span className="nr-saved"><Check size={13} /> Saved {savedAt}</span> : null}
          {onDelete && canEdit && !report.locked && ["Draft", "In Progress", "Returned"].includes(report.status || "Draft") ? (
            <button type="button" className="nr-icon-btn" title="Delete this draft" aria-label="Delete this draft" onClick={onDelete}><Trash2 size={15} /></button>
          ) : null}
        </div>
      </header>

      <nav className="nr-stepper" aria-label="Report steps">
        {STEPS.map((step, index) => {
          const sp = stepProgress(report, step.id);
          const complete = sp.total > 0 && sp.done === sp.total;
          const Icon = STEP_ICONS[step.id];
          return (
            <button key={step.id} type="button" className={`nr-step${step.id === stepId ? " active" : ""}${complete ? " complete" : ""}`} onClick={() => goTo(step.id)} aria-current={step.id === stepId ? "step" : undefined}>
              <span className="nr-step-dot">{complete ? <Check size={14} /> : <Icon size={14} />}</span>
              <span className="nr-step-text">
                <strong>{index + 1}. {step.label}</strong>
                <small>{sp.total ? `${sp.done} of ${sp.total} done` : step.description}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="nr-body">
        <main className="nr-main">
          <div className="nr-step-head">
            <h2>{STEPS[stepIndex].label}</h2>
            <p>{STEPS[stepIndex].description}</p>
          </div>

          {stepId === "basics" ? (
            <>
              <Section title="What kind of incident was it?" icon={Flame} description="Pick all that apply. This decides which questions you'll see.">
                <div className="nr-kinds nr-wide">
                  {INCIDENT_KINDS.map((kind) => {
                    const disciplines = report.disciplines || ws.disciplines || [];
                    const on = kind.discipline ? disciplines.includes(kind.discipline) : incidentTypes(report).some((t) => t.startsWith(kind.typePrefix));
                    return (
                      <button key={kind.id} type="button" className={`nr-kind${on ? " on" : ""}`} disabled={!editable} onClick={() => {
                        if (!kind.discipline) return;
                        const next = new Set(disciplines);
                        if (next.has(kind.discipline)) next.delete(kind.discipline); else next.add(kind.discipline);
                        onUpdate({ disciplines: [...next], workspace: { ...ws, disciplines: [...next] } });
                      }}>
                        <strong>{kind.label}</strong>
                        <small>{kind.hint}</small>
                      </button>
                    );
                  })}
                </div>
                <Field label="NERIS incident type" required wide missing={missingFor("type")} help="Search for the type found on scene. The first one you pick is the primary type." id="nr-field-type">
                  <IncidentTypePicker report={report} editable={editable} onUpdate={onUpdate} />
                </Field>
              </Section>
              <Section title="When and where" icon={MapPin}>
                <Field label="Incident date" required missing={missingFor("date")}>
                  <TextInput type="date" value={report.incidentDate} disabled={!editable} onChange={(v) => onUpdate({ incidentDate: v })} />
                </Field>
                <Field label="Address or location" required missing={missingFor("address")} help="Street address, intersection or mile marker.">
                  <TextInput value={report.incidentAddress} disabled={!editable} placeholder="123 Main St" onChange={(v) => onUpdate({ incidentAddress: v })} />
                </Field>
                <Field label="Were people present at the incident?" required missing={missingFor("people")}>
                  <YesNo value={c.incident_people_present} disabled={!editable} onChange={setCore("incident_people_present")} />
                </Field>
              </Section>
            </>
          ) : null}

          {stepId === "response" ? (
            <>
              <Section
                title="Times"
                icon={Clock}
                description="From CAD or your run sheet."
                action={editable ? (
                  <div className="nr-actions">
                    <button type="button" className="nr-btn nr-btn-soft" onClick={() => setCadOpen(true)}><Download size={15} /> Import from CAD</button>
                    {onAutoPopulate ? <button type="button" className="nr-btn nr-btn-soft" onClick={onAutoPopulate}><Sparkles size={15} /> Fill from FORGE records</button> : null}
                  </div>
                ) : null}
              >
                <Field label="Dispatched" required missing={missingFor("dispatch")}>
                  <TextInput type="datetime-local" value={ws.cad?.dispatchTime} disabled={!editable} onChange={(v) => updateWorkspace("cad", { dispatchTime: v })} />
                </Field>
                <Field label="Arrived on scene" required={!asList(c.incident_noaction).length} missing={missingFor("arrival")}>
                  <TextInput type="datetime-local" value={ws.cad?.arrivalTime} disabled={!editable} onChange={(v) => updateWorkspace("cad", { arrivalTime: v })} />
                </Field>
                <Field label="Cleared" required missing={missingFor("clear")}>
                  <TextInput type="datetime-local" value={ws.cad?.clearTime} disabled={!editable} onChange={(v) => updateWorkspace("cad", { clearTime: v })} />
                </Field>
                <Field label="CAD incident number">
                  <TextInput value={ws.cad?.cadCallNumber} disabled={!editable} onChange={(v) => updateWorkspace("cad", { cadCallNumber: v })} />
                </Field>
                <Field label="Priority">
                  <TextInput value={ws.cad?.priority} disabled={!editable} placeholder="e.g. Emergent" onChange={(v) => updateWorkspace("cad", { priority: v })} />
                </Field>
                <Field label="Alarm level">
                  <TextInput value={ws.cad?.alarmLevel} disabled={!editable} placeholder="1" onChange={(v) => updateWorkspace("cad", { alarmLevel: v })} />
                </Field>
                <Field label="Dispatch notes" wide>
                  <TextArea rows={2} value={ws.cad?.initialComments} disabled={!editable} onChange={(v) => updateWorkspace("cad", { initialComments: v })} />
                </Field>
                {checklist.filter((i) => i.problem && i.step === "response").map((i) => (
                  <p key={i.id} className="nr-error nr-wide"><ShieldAlert size={14} /> {i.label}</p>
                ))}
              </Section>
              <UnitsSection report={report} editable={editable} apparatus={sources.apparatus || []} missing={missingFor("units")} onChange={(units) => setWorkspaceValue("units", units)} />
              <CrewSection report={report} editable={editable} personnel={sources.personnel || []} onChange={(crew) => setWorkspaceValue("personnel", crew)} />
              <Section title="Mutual aid" icon={Link2} description="Leave blank if no aid was given or received.">
                <Field label="Aid given or received?">
                  <Picker value={c.incident_aid_direction} options={options("type_aid_direction")} disabled={!editable} placeholder="No mutual aid" onChange={setCore("incident_aid_direction")} />
                </Field>
                {!isBlank(c.incident_aid_direction) ? (
                  <>
                    <Field label="Type of aid" required missing={missingFor("aid-type")}>
                      <Picker value={c.incident_aid_type} options={options("type_aid")} disabled={!editable} onChange={setCore("incident_aid_type")} />
                    </Field>
                    <Field label="Fire department(s)" required missing={missingFor("aid-dept")} help="Separate several with commas.">
                      <TextInput value={asList(c.incident_aid_department_name).join(", ")} disabled={!editable} onChange={(v) => setCore("incident_aid_department_name")(v.split(",").map((s) => s.trim()).filter(Boolean))} />
                    </Field>
                    <Field label="Other agencies that helped">
                      <Picker multiple value={c.incident_aid_nonfd} options={options("type_aid_nonfd")} disabled={!editable} onChange={setCore("incident_aid_nonfd")} />
                    </Field>
                  </>
                ) : null}
              </Section>
            </>
          ) : null}

          {stepId === "scene" ? (
            <>
              <Section title="Location and property" icon={Building2} description={ws.location?.occupancyName && report.autoPopulateSources?.["workspace.location"] ? "Filled from your occupancy records — check it's right." : undefined}>
                <Field label="Business or property name"><TextInput value={ws.location?.occupancyName} disabled={!editable} onChange={(v) => updateWorkspace("location", { occupancyName: v })} /></Field>
                <Field label="Property use"><TextInput value={ws.location?.propertyUse} disabled={!editable} placeholder="e.g. Single family home" onChange={(v) => updateWorkspace("location", { propertyUse: v })} /></Field>
                <Field label="Construction type"><TextInput value={ws.location?.constructionType} disabled={!editable} onChange={(v) => updateWorkspace("location", { constructionType: v })} /></Field>
                <Field label="Sprinklers"><TextInput value={ws.location?.sprinklerStatus} disabled={!editable} placeholder="None / Present / Operated" onChange={(v) => updateWorkspace("location", { sprinklerStatus: v })} /></Field>
                <Field label="Fire alarm"><TextInput value={ws.location?.alarmStatus} disabled={!editable} onChange={(v) => updateWorkspace("location", { alarmStatus: v })} /></Field>
                <Field label="Knox Box"><TextInput value={ws.location?.knoxBox} disabled={!editable} onChange={(v) => updateWorkspace("location", { knoxBox: v })} /></Field>
                <Field label="Known hazards" wide><TextArea rows={2} value={ws.location?.hazards} disabled={!editable} onChange={(v) => updateWorkspace("location", { hazards: v })} /></Field>
              </Section>
              <Section title="People and animals" icon={Users}>
                <Field label="Was anyone displaced from their home or business?">
                  <YesNo value={ws.location?.displaced} disabled={!editable} onChange={(v) => updateWorkspace("location", { displaced: v })} />
                </Field>
                {ws.location?.displaced === "True" ? (
                  <Field label="Why were they displaced?">
                    <Picker multiple value={c.incident_displaced_cause} options={options("type_displace_cause")} disabled={!editable} onChange={setCore("incident_displaced_cause")} />
                  </Field>
                ) : null}
                <Field label="Animals rescued">
                  <TextInput type="number" min="0" value={c.incident_rescue_animal} disabled={!editable} placeholder="0" onChange={setCore("incident_rescue_animal")} />
                </Field>
              </Section>
            </>
          ) : null}

          {stepId === "details" ? (
            <>
              <Section title="What did crews do?" icon={Zap}>
                <Field label="Actions taken" required={isBlank(c.incident_noaction)} missing={missingFor("actions")} wide help="Search and pick everything crews did on scene.">
                  <Picker
                    multiple
                    value={c.incident_actions_taken}
                    options={options("type_action_tactic")}
                    disabled={!editable}
                    groupBy={(o) => o.label.split(" — ")[0]}
                    onChange={(v) => {
                      onUpdateModule("core_mod_incident", "incident_actions_taken", v);
                      onUpdate({ workspace: { ...ws, actions: v } });
                    }}
                  />
                </Field>
                <Field label="No action taken? Why not" help="Only if crews took no action (cancelled, standby, nothing found).">
                  <Picker value={c.incident_noaction} options={options("type_noaction")} disabled={!editable} placeholder="Crews took action" onChange={setCore("incident_noaction")} />
                </Field>
              </Section>

              {a.fire ? <ModuleSection title="Fire" icon={Flame} moduleId="mod_fire" report={report} editable={editable} onUpdateModule={onUpdateModule} checklist={checklist} /> : null}
              {a.wildland ? (
                <Section title="Wildland" icon={Trees}>
                  <Field label="Fire name"><TextInput value={ws.wildland?.fireName} disabled={!editable} onChange={(v) => updateWorkspace("wildland", { fireName: v })} /></Field>
                  <Field label="Percent contained"><TextInput type="number" min="0" max="100" value={ws.wildland?.percentContained} disabled={!editable} onChange={(v) => updateWorkspace("wildland", { percentContained: v })} /></Field>
                  <Field label="Fuel type"><Picker value={ws.wildland?.fuelType} options={WILDLAND_FUEL_TYPES} disabled={!editable} onChange={(v) => updateWorkspace("wildland", { fuelType: v })} /></Field>
                  <Field label="Structures threatened"><TextInput type="number" min="0" value={ws.wildland?.structuresThreatened} disabled={!editable} onChange={(v) => updateWorkspace("wildland", { structuresThreatened: v })} /></Field>
                </Section>
              ) : null}
              {a.ems ? (
                <Section title="Medical" icon={HeartPulse}>
                  <Field label="Chief complaint" required missing={missingFor("ems-complaint")}><Picker value={ws.ems?.chiefComplaint} options={EMS_CHIEF_COMPLAINTS} disabled={!editable} onChange={(v) => updateWorkspace("ems", { chiefComplaint: v })} /></Field>
                  <Field label="Number of patients"><TextInput type="number" min="0" value={ws.ems?.patientCount} disabled={!editable} onChange={(v) => updateWorkspace("ems", { patientCount: v })} /></Field>
                  <Field label="Level of care"><Picker value={ws.ems?.responseLevel} options={[{ value: "ALS", label: "ALS" }, { value: "BLS", label: "BLS" }]} disabled={!editable} onChange={(v) => updateWorkspace("ems", { responseLevel: v })} /></Field>
                  <Field label="Main treatment"><Picker value={ws.ems?.treatment} options={EMS_TREATMENTS} disabled={!editable} onChange={(v) => updateWorkspace("ems", { treatment: v })} /></Field>
                  <Field label="Disposition"><Picker value={ws.ems?.disposition} options={EMS_DISPOSITIONS} disabled={!editable} onChange={(v) => updateWorkspace("ems", { disposition: v })} /></Field>
                  <Field label="Transporting agency"><TextInput value={ws.ems?.transportAgency} disabled={!editable} onChange={(v) => updateWorkspace("ems", { transportAgency: v })} /></Field>
                  <ModuleFields moduleId="mod_medical" report={report} editable={editable} onUpdateModule={onUpdateModule} checklist={checklist} />
                </Section>
              ) : null}
              {a.rescue ? (
                <Section title="Rescue" icon={LifeBuoy}>
                  <Field label="Type of rescue"><TextInput value={ws.rescue?.type} disabled={!editable} placeholder="e.g. Vehicle extrication" onChange={(v) => updateWorkspace("rescue", { type: v })} /></Field>
                  <Field label="People extricated"><TextInput type="number" min="0" value={ws.rescue?.extricated} disabled={!editable} onChange={(v) => updateWorkspace("rescue", { extricated: v })} /></Field>
                  <Field label="Rescue notes" wide><TextArea value={ws.rescue?.notes} disabled={!editable} onChange={(v) => updateWorkspace("rescue", { notes: v })} /></Field>
                </Section>
              ) : null}
              {a.hazmat ? <ModuleSection title="Hazardous condition" icon={Biohazard} moduleId="mod_hazard" report={report} editable={editable} onUpdateModule={onUpdateModule} checklist={checklist} /> : null}
              {a.casualties ? (
                <Section title="Injuries and deaths" icon={Users} description="Leave at 0 if none.">
                  <Field label="Civilian injuries"><TextInput type="number" min="0" value={ws.casualties?.injuries} disabled={!editable} placeholder="0" onChange={(v) => updateWorkspace("casualties", { injuries: v })} /></Field>
                  <Field label="Civilian deaths"><TextInput type="number" min="0" value={ws.casualties?.fatalities} disabled={!editable} placeholder="0" onChange={(v) => updateWorkspace("casualties", { fatalities: v })} /></Field>
                  <Field label="Firefighter injuries"><TextInput type="number" min="0" value={ws.casualties?.ffInjuries} disabled={!editable} placeholder="0" onChange={(v) => updateWorkspace("casualties", { ffInjuries: v })} /></Field>
                  <Field label="Notes" wide><TextArea rows={2} value={ws.casualties?.notes} disabled={!editable} onChange={(v) => updateWorkspace("casualties", { notes: v })} /></Field>
                </Section>
              ) : null}
              {a.fire ? (
                <Section title="Loss and investigation" icon={DollarSign}>
                  <Field label="Property loss ($)"><TextInput type="number" min="0" value={ws.propertyLoss?.property} disabled={!editable} onChange={(v) => updateWorkspace("propertyLoss", { property: v })} /></Field>
                  <Field label="Contents loss ($)"><TextInput type="number" min="0" value={ws.propertyLoss?.contents} disabled={!editable} onChange={(v) => updateWorkspace("propertyLoss", { contents: v })} /></Field>
                  <Field label="Investigation status">
                    <Picker value={ws.investigations?.status} disabled={!editable} options={[{ value: "not_required", label: "Not required" }, { value: "pending", label: "Pending" }, { value: "in_progress", label: "In progress" }, { value: "complete", label: "Complete" }]} onChange={(v) => updateWorkspace("investigations", { status: v })} />
                  </Field>
                  <Field label="Investigator"><TextInput value={ws.investigations?.investigator} disabled={!editable} onChange={(v) => updateWorkspace("investigations", { investigator: v })} /></Field>
                  <Field label="Cause determination" wide><TextInput value={ws.investigations?.cause} disabled={!editable} onChange={(v) => updateWorkspace("investigations", { cause: v })} /></Field>
                </Section>
              ) : null}
              {!a.fire && !a.ems && !a.rescue && !a.hazmat ? (
                <p className="nr-hint"><Info size={15} /> Pick the incident type on <button type="button" className="nr-link" onClick={() => goTo("basics")}>Basics</button> to see questions for fire, medical, rescue or hazardous incidents.</p>
              ) : null}
            </>
          ) : null}

          {stepId === "narrative" ? (
            <NerisAiNarrative report={report} departmentId={departmentId} editable={editable} online={online} onUpdate={onUpdate} onUpdateModule={onUpdateModule} />
          ) : null}

          {stepId === "review" ? (
            <ReviewStep
              report={report}
              allReports={allReports}
              canEdit={canEdit}
              editable={editable}
              departmentId={departmentId}
              progress={progress}
              reviewerName={reviewerName}
              onUpdate={onUpdate}
              onUpdateModule={onUpdateModule}
              onRecordSubmission={onRecordSubmission}
              onOpenReport={onOpenReport}
              goTo={goTo}
            />
          ) : null}

          <footer className="nr-step-nav">
            {stepIndex > 0 ? <button type="button" className="nr-btn nr-btn-ghost" onClick={() => goTo(STEPS[stepIndex - 1].id)}><ArrowLeft size={16} /> {STEPS[stepIndex - 1].label}</button> : <span />}
            {stepIndex < STEPS.length - 1 ? <button type="button" className="nr-btn nr-btn-primary" onClick={() => goTo(STEPS[stepIndex + 1].id)}>Next: {STEPS[stepIndex + 1].label} <ArrowRight size={16} /></button> : null}
          </footer>
        </main>

        <aside className="nr-rail" aria-label="Report checklist">
          <div className="nr-rail-card">
            <div className="nr-rail-progress">
              <ProgressRing percent={progress.percent} size={64} stroke={6} />
              <div>
                <strong>{progress.missing.length ? `${progress.missing.length} thing${progress.missing.length === 1 ? "" : "s"} left` : "Ready for review"}</strong>
                <small>{progress.done} of {progress.total} required items done</small>
              </div>
            </div>
            {progress.missing.length ? (
              <ul className="nr-rail-list">
                {progress.missing.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => goTo(item.step)}>
                      <span className={item.problem ? "nr-dot nr-dot-bad" : "nr-dot"} />
                      {item.label}
                      <small>{STEPS.find((s) => s.id === item.step)?.label}</small>
                    </button>
                  </li>
                ))}
                {progress.missing.length > 8 ? <li className="nr-rail-more">+{progress.missing.length - 8} more</li> : null}
              </ul>
            ) : <p className="nr-rail-done"><CheckCircle2 size={16} /> Everything required is filled in.</p>}
          </div>
        </aside>
      </div>

      {cadOpen ? (
        <NerisCadImportModal open report={report} onClose={() => setCadOpen(false)} onApply={(next) => { onUpdate(next); setCadOpen(false); }} />
      ) : null}
    </div>
  );
}

function IncidentTypePicker({ report, editable, onUpdate }) {
  const disciplines = report.disciplines || report.workspace?.disciplines || [];
  const prefixes = INCIDENT_KINDS.filter((k) => k.discipline && disciplines.includes(k.discipline)).map((k) => k.typePrefix);
  const all = options("type_incident");
  const list = prefixes.length ? all.filter((o) => prefixes.some((p) => o.value.startsWith(p)) || incidentTypes(report).includes(o.value)) : all;
  return (
    <Picker
      multiple
      value={incidentTypes(report)}
      options={list}
      disabled={!editable}
      placeholder="Search incident types…"
      groupBy={(o) => CATEGORY_LABELS[o.value.split(":")[0]] || o.value.split(":")[0]}
      onChange={(types) => {
        const modules = { ...(report.modules || {}) };
        modules.core_mod_incident = {
          ...(modules.core_mod_incident || {}),
          incident_final_type: types,
          incident_final_type_primary: types.map((_, i) => (i === 0 ? "True" : "False")),
          incident_internal_id: report.reportNumber || "",
        };
        onUpdate({ modules, incidentTypeSummary: types.map((t) => codeLabel(t)).join(", ") });
      }}
    />
  );
}

function ModuleFields({ moduleId, report, editable, onUpdateModule, checklist }) {
  const data = report.modules?.[moduleId] || {};
  return visibleFields(moduleId, report).map((f) => {
    const missing = checklist.some((i) => i.id === `${moduleId}.${f.name}` && !i.done);
    const set = (v) => onUpdateModule(moduleId, f.name, v);
    let control;
    if (f.kind === "select") control = <Picker value={data[f.name]} options={options(f.valueSet)} disabled={!editable} onChange={set} />;
    else if (f.kind === "multi") control = <Picker multiple value={data[f.name]} options={options(f.valueSet)} disabled={!editable} onChange={set} />;
    else if (f.kind === "yesno") control = <YesNo value={Array.isArray(data[f.name]) ? data[f.name][0] : data[f.name]} disabled={!editable} onChange={set} />;
    else if (f.kind === "number") control = <TextInput type="number" value={data[f.name]} disabled={!editable} onChange={set} />;
    else control = <TextInput value={Array.isArray(data[f.name]) ? data[f.name].join(", ") : data[f.name]} disabled={!editable} onChange={set} />;
    return <Field key={f.name} label={f.label} help={f.help} required={f.required} missing={missing}>{control}</Field>;
  });
}

function ModuleSection({ title, icon, moduleId, report, editable, onUpdateModule, checklist }) {
  return (
    <Section title={title} icon={icon}>
      <ModuleFields moduleId={moduleId} report={report} editable={editable} onUpdateModule={onUpdateModule} checklist={checklist} />
    </Section>
  );
}

function UnitsSection({ report, editable, apparatus, missing, onChange }) {
  const units = report.workspace?.units || [];
  const unitOptions = apparatus
    .map((u) => ({ value: String(u.unit || u.name || u.id), label: [u.unit || u.name || u.id, u.type].filter(Boolean).join(" · ") }))
    .filter((o) => o.value && !units.some((x) => x.unitId === o.value));
  const [adding, setAdding] = useState("");
  const [other, setOther] = useState("");

  function addUnit(unitId) {
    if (!unitId) return;
    const rig = apparatus.find((u) => String(u.unit || u.name || u.id) === unitId);
    onChange([...units, { unitId, apparatusType: rig?.type || rig?.apparatusType || "", station: rig?.station || "", dispatchTime: "", arrivalTime: "", clearTime: "", source: rig ? "apparatus" : "manual" }]);
    setAdding("");
    setOther("");
  }
  function patch(index, values) {
    onChange(units.map((u, i) => (i === index ? { ...u, ...values } : u)));
  }

  return (
    <Section title="Responding units" icon={Truck} tone={missing ? "missing" : undefined} description="Every apparatus that responded, with its own times if they differ.">
      <div className="nr-wide nr-units">
        {units.map((unit, index) => (
          <div className="nr-unit" key={`${unit.unitId}-${index}`}>
            <div className="nr-unit-name"><Truck size={16} /><strong>{unit.unitId}</strong>{unit.apparatusType ? <small>{unit.apparatusType}</small> : null}</div>
            <label><span>Dispatched</span><TextInput type="datetime-local" value={unit.dispatchTime} disabled={!editable} onChange={(v) => patch(index, { dispatchTime: v })} /></label>
            <label><span>On scene</span><TextInput type="datetime-local" value={unit.arrivalTime} disabled={!editable} onChange={(v) => patch(index, { arrivalTime: v })} /></label>
            <label><span>Cleared</span><TextInput type="datetime-local" value={unit.clearTime} disabled={!editable} onChange={(v) => patch(index, { clearTime: v })} /></label>
            {editable ? <button type="button" className="nr-icon-btn" aria-label={`Remove ${unit.unitId}`} onClick={() => onChange(units.filter((_, i) => i !== index))}><Trash2 size={15} /></button> : null}
          </div>
        ))}
        {!units.length ? <p className="nr-empty">No units yet.</p> : null}
        {editable ? (
          <div className="nr-add-row">
            <Picker value={adding} options={unitOptions} placeholder={apparatus.length ? "Add a unit from your fleet…" : "No apparatus on file"} onChange={(v) => { setAdding(v); addUnit(v); }} />
            <TextInput value={other} placeholder="Or type another unit (e.g. mutual aid Engine 4)" onChange={setOther} onKeyDown={(e) => { if (e.key === "Enter") addUnit(other.trim()); }} />
            <button type="button" className="nr-btn nr-btn-soft" disabled={!other.trim()} onClick={() => addUnit(other.trim())}><Plus size={15} /> Add</button>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function CrewSection({ report, editable, personnel, onChange }) {
  const crew = report.workspace?.personnel || [];
  const units = report.workspace?.units || [];
  const nameOf = (p) => p.name || [p.firstName, p.lastName].filter(Boolean).join(" ") || p.displayName || p.id;
  const crewOptions = personnel
    .filter((p) => !crew.some((x) => x.personnelId === p.id))
    .map((p) => ({ value: p.id, label: [nameOf(p), p.rank].filter(Boolean).join(" · ") }));
  return (
    <Section title="Crew" icon={Users} description="Optional. Filled from the schedule when you use “Fill from FORGE records”.">
      <div className="nr-wide nr-crew">
        {crew.length ? (
          <table className="nr-table">
            <thead><tr><th>Name</th><th>Rank</th><th>Unit</th><th>Role</th><th /></tr></thead>
            <tbody>
              {crew.map((p, index) => (
                <tr key={`${p.personnelId || p.name}-${index}`}>
                  <td>{p.name}</td>
                  <td>{p.rank}</td>
                  <td>
                    {editable && units.length ? (
                      <select className="nr-input nr-mini" value={p.unitId || ""} onChange={(e) => onChange(crew.map((x, i) => (i === index ? { ...x, unitId: e.target.value } : x)))}>
                        <option value="">—</option>
                        {units.map((u) => <option key={u.unitId} value={u.unitId}>{u.unitId}</option>)}
                      </select>
                    ) : p.unitId}
                  </td>
                  <td>{p.role}</td>
                  <td>{editable ? <button type="button" className="nr-icon-btn" aria-label={`Remove ${p.name}`} onClick={() => onChange(crew.filter((_, i) => i !== index))}><Trash2 size={14} /></button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="nr-empty">No crew listed.</p>}
        {editable ? (
          <div className="nr-add-row">
            <Picker
              value=""
              options={crewOptions}
              placeholder="Add a crew member…"
              onChange={(id) => {
                const p = personnel.find((x) => x.id === id);
                if (p) onChange([...crew, { personnelId: p.id, name: nameOf(p), rank: p.rank || "", certification: p.emsLevel || p.certification || "", unitId: "", role: "Responder", source: "manual" }]);
              }}
            />
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function ReviewStep({ report, allReports, canEdit, editable, departmentId, progress, reviewerName, onUpdate, onUpdateModule, onRecordSubmission, onOpenReport, goTo }) {
  const ws = report.workspace || {};
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const history = useMemo(() => getOccupancyIncidentHistory(report, allReports).filter((h) => h.id !== report.id), [report, allReports]);
  const stageIndex = Math.max(0, REVIEW_STAGES.findIndex((s) => s.id === report.reviewStage));
  const attachments = (ws.attachments || []).filter((att) => !isObjectDeleted(att));
  const ready = progress.missing.length === 0;
  const canSendForReview = editable && ["Draft", "In Progress", "Returned"].includes(report.status || "Draft");
  const inReview = report.status === "Needs Review";
  const approvedForSubmit = ["Approved", "Ready for Submission"].includes(report.status);
  const actor = reviewerName || "Reviewer";

  function act(action) {
    onUpdate(applyReviewAction(report, { action, comments: comment, reviewerName: actor, reviewerRole: REVIEW_STAGES[stageIndex]?.role || "officer" }));
    setComment("");
  }

  async function upload(file) {
    if (!file || !departmentId) return;
    setUploading(true);
    setUploadError("");
    try {
      const uploaded = await uploadFirebaseFile(buildNerisAttachmentPath(departmentId, report.id, file.name), file);
      onUpdate({ workspace: { ...ws, attachments: [...(ws.attachments || []), withActiveLifecycle({ id: `ATT-${Date.now()}`, name: file.name, downloadUrl: uploaded.downloadUrl, storagePath: uploaded.storagePath, contentType: uploaded.contentType, addedAt: new Date().toISOString() })] } });
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(att) {
    if (att.storagePath) await deleteFirebaseFile(att.storagePath).catch(() => undefined);
    onUpdate({ workspace: { ...ws, attachments: (ws.attachments || []).map((x) => (x.id === att.id ? softDeleteObject(x) : x)) } });
  }

  return (
    <>
      <Section title={ready ? "Everything required is filled in" : "Still to do"} icon={ready ? CheckCircle2 : Search} tone={ready ? "ok" : "missing"}>
        {ready ? <p className="nr-wide nr-muted">Send it for review, or record the NERIS submission once it's approved.</p> : (
          <ul className="nr-todo nr-wide">
            {progress.missing.map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
                <button type="button" className="nr-link" onClick={() => goTo(item.step)}>Go to {STEPS.find((s) => s.id === item.step)?.label}</button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Review and approval" icon={ClipboardCheck}>
        <ol className="nr-stages nr-wide">
          {REVIEW_STAGES.map((stage, index) => (
            <li key={stage.id} className={index < stageIndex || report.status === "Submitted" ? "done" : index === stageIndex ? "current" : ""}>
              <span>{index < stageIndex || report.status === "Submitted" ? <Check size={13} /> : index + 1}</span>
              {stage.label}
            </li>
          ))}
        </ol>
        {(ws.approvals || []).length ? (
          <ul className="nr-history nr-wide">
            {[...(ws.approvals || [])].reverse().map((entry) => (
              <li key={entry.id}>
                <strong>{entry.action === "submit" ? "Sent for review" : entry.action === "approve" ? "Approved" : entry.action === "return" ? "Returned for changes" : entry.action}</strong>
                <span>{entry.reviewerName} · {formatWhen(entry.timestamp)}</span>
                {entry.comments ? <p>{entry.comments}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {canEdit && (canSendForReview || inReview) ? (
          <>
            <Field label={inReview ? "Comments for the author" : "Note for the reviewer"} wide>
              <TextArea rows={2} value={comment} onChange={setComment} placeholder="Optional" />
            </Field>
            <div className="nr-actions nr-wide">
              {canSendForReview ? (
                <button type="button" className="nr-btn nr-btn-primary" disabled={!ready} title={ready ? "" : "Finish the required items first"} onClick={() => act("submit")}><Send size={15} /> Send for review</button>
              ) : null}
              {inReview ? (
                <>
                  <button type="button" className="nr-btn nr-btn-primary" onClick={() => act("approve")}><CheckCircle2 size={15} /> Approve as {REVIEW_STAGES[stageIndex]?.label || "reviewer"}</button>
                  <button type="button" className="nr-btn nr-btn-danger" onClick={() => act("return")}>Return for changes</button>
                </>
              ) : null}
            </div>
          </>
        ) : null}
        {report.locked && canEdit ? (
          <button type="button" className="nr-btn nr-btn-ghost nr-wide" onClick={() => onUpdate(adminUnlockReport(report, "Unlocked for corrections", actor))}><Unlock size={15} /> Unlock for corrections</button>
        ) : null}
      </Section>

      <Section title="Submit to NERIS" icon={Send}>
        <p className="nr-wide nr-muted">FORGE doesn't send reports to NERIS automatically yet. Once the report is approved, enter it in the NERIS portal, then record the submission here.</p>
        <Field label="NERIS incident ID (from the portal)">
          <TextInput value={report.modules?.core_mod_incident?.incident_neris_id} disabled={!canEdit || report.status === "Submitted"} placeholder="Shown after you submit in NERIS" onChange={(v) => onUpdateModule("core_mod_incident", "incident_neris_id", v)} />
        </Field>
        <div className="nr-actions nr-wide">
          {report.status === "Submitted" ? (
            <span className="nr-pill nr-pill-ok"><CheckCircle2 size={13} /> Submitted {formatWhen(report.submittedAt)}</span>
          ) : canEdit ? (
            <button type="button" className="nr-btn nr-btn-primary" disabled={!approvedForSubmit || !ready} title={approvedForSubmit ? "" : "The report must be approved first"} onClick={onRecordSubmission}><Send size={15} /> Record NERIS submission</button>
          ) : null}
        </div>
      </Section>

      <Section title="Photos and files" icon={Paperclip}>
        <div className="nr-wide nr-files">
          {attachments.map((att) => (
            <div key={att.id} className="nr-file">
              <Paperclip size={15} />
              {att.downloadUrl ? <a href={att.downloadUrl} target="_blank" rel="noreferrer">{att.name}</a> : <span>{att.name}</span>}
              {editable ? <button type="button" className="nr-icon-btn" aria-label={`Remove ${att.name}`} onClick={() => removeAttachment(att)}><Trash2 size={14} /></button> : null}
            </div>
          ))}
          {!attachments.length ? <p className="nr-empty">No files attached.</p> : null}
          {uploadError ? <p className="nr-error">{uploadError}</p> : null}
          {editable ? (
            <label className={`nr-btn nr-btn-soft nr-upload${uploading ? " busy" : ""}`}>
              {uploading ? <><Loader2 size={15} className="nr-spin" /> Uploading…</> : <><Plus size={15} /> Add photo or file</>}
              <input type="file" hidden disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(f); }} />
            </label>
          ) : null}
        </div>
      </Section>

      {history.length ? (
        <Section title="Earlier incidents at this address" icon={Wrench}>
          <ul className="nr-history nr-wide">
            {history.map((h) => (
              <li key={h.id}>
                <strong>{h.reportNumber}</strong>
                <span>{h.incidentDate} · {h.type}</span>
                {onOpenReport ? <button type="button" className="nr-link" onClick={() => onOpenReport(h.id)}>Open</button> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
