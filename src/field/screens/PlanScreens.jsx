/** Pre-fire plans: find (search / nearest), view offline, edit (permitted roles) or send an update. */
import { useEffect, useMemo, useState } from "react";
import {
  Building, CloudDownload, FileText, KeyRound, LocateFixed, Loader2, MapPin, MessageSquarePlus, Pencil, Plus, Search, Shield, X,
} from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { distanceMeters, formatDistance } from "../fieldHydrants.js";
import { getSavedPlanFile, isImageFile, openPlanFile, savePlanFileOffline } from "../fieldPlanFiles.js";
import { Banner, ErrorSummary, Field, PhotoStrip, Screen, Section, Segmented, TextArea, TextInput, cx, formatWhen } from "../ui.jsx";
import { STARTER_PREPLAN_TEMPLATE_SECTIONS } from "../../lib/inspections/preplanDefaults.js";

/** Which FORGE Field setting controls a template section (by its title). */
export function sectionConfigKey(title = "") {
  const text = String(title).toLowerCase();
  if (/access|approach|knox/.test(text)) return "access";
  if (/water/.test(text)) return "water";
  if (/protection|sprinkler|alarm/.test(text)) return "fireProtection";
  if (/utilit/.test(text)) return "utilities";
  if (/hazard|occupan/.test(text)) return "hazards";
  if (/contact/.test(text)) return "contacts";
  if (/tactic/.test(text)) return "tactical";
  return "";
}

const LEGACY_FIELDS = [
  { key: "businessName", label: "Business / occupancy name" },
  { key: "address", label: "Address" },
  { key: "occupancyType", label: "Occupancy type" },
  { key: "contactName", label: "Contact name", config: "contacts" },
  { key: "contactPhone", label: "Contact phone", config: "contacts", inputMode: "tel" },
  { key: "hazards", label: "Hazards", config: "hazards", long: true },
  { key: "utilities", label: "Utilities", config: "utilities", long: true },
  { key: "fireProtection", label: "Fire protection", config: "fireProtection", long: true },
  { key: "hydrants", label: "Hydrants / water", config: "water", long: true },
  { key: "notes", label: "Notes", long: true },
];

function usePlans() {
  const { refData, records } = useField();
  return useMemo(() => {
    const plans = [...refItems(refData, "preplans"), ...refItems(refData, "legacyPlans")];
    // New plans made on this device that haven't reached the server yet.
    // New plans made on this device: shown until the downloaded data includes them.
    const known = new Set(plans.map((plan) => `${plan.source}:${plan.id}`));
    records.filter((row) => row.kind === "planCreate" && row.status !== "draft").forEach((row) => {
      if (known.has(`${row.data.source}:${row.data.planId}`)) return;
      plans.unshift({
        ...row.data.plan,
        id: row.data.planId,
        source: row.data.source,
        pendingLocalId: row.status === "synced" ? "" : row.localId,
        sections: row.data.sections || [],
        sectionAnswers: row.data.sectionAnswers || {},
        currentSectionAnswers: row.data.sectionAnswers || {},
        status: row.status === "synced" ? "draft" : "",
        files: [],
      });
    });
    return plans;
  }, [refData, records]);
}

function planCoords(plan) {
  const lat = Number(plan.latitude);
  const lng = Number(plan.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null;
}

export function PlansScreen() {
  const { caps, navigate, back } = useField();
  const plans = usePlans();
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = plans.filter((plan) => !q || `${plan.name} ${plan.address} ${plan.preplanNumber || ""}`.toLowerCase().includes(q));
    if (position) {
      list = list
        .map((plan) => ({ plan, distance: distanceMeters(position, planCoords(plan)) }))
        .sort((a, b) => a.distance - b.distance)
        .map(({ plan, distance }) => ({ ...plan, distance }));
    } else {
      list = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
    }
    return list.slice(0, 120);
  }, [plans, query, position]);

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  return (
    <Screen
      title="Pre-fire plans"
      subtitle={plans.length ? `${plans.length} on this device` : ""}
      onBack={back}
      footer={caps.preFirePlanEdit ? (
        <button type="button" className="fa-btn fa-btn-primary fa-btn-block" onClick={() => navigate("planEdit", { mode: "new" })}>
          <Plus size={22} /> New pre-fire plan
        </button>
      ) : null}
    >
      <div className="fa-search-row">
        <label className="fa-search">
          <Search size={20} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Address or business" enterKeyHint="search" autoComplete="off" />
          {query ? <button type="button" className="fa-icon-btn sm" onClick={() => setQuery("")} aria-label="Clear"><X size={18} /></button> : null}
        </label>
        <button type="button" className={cx("fa-btn", position ? "fa-btn-primary" : "fa-btn-secondary")} onClick={position ? () => setPosition(null) : locate} disabled={locating}>
          {locating ? <Loader2 size={20} className="fa-spin" /> : <LocateFixed size={20} />} {position ? "Nearest" : "Near me"}
        </button>
      </div>
      {!plans.length ? <Banner tone="info" icon={<Building size={22} />} title="No pre-fire plans on this device">Connect and tap Update on the home screen.</Banner> : null}
      <div className="fa-list">
        {rows.map((plan) => (
          <button key={`${plan.source}:${plan.id}`} type="button" className="fa-row" onClick={() => navigate("planView", { source: plan.source, planId: plan.id })}>
            <span className="fa-row-icon"><Building size={22} /></span>
            <span className="fa-row-text">
              <strong>{plan.name}</strong>
              <small><MapPin size={13} /> {plan.address || "No address"}{Number.isFinite(plan.distance) ? ` · ${formatDistance(plan.distance)}` : ""}</small>
            </span>
            <span className="fa-row-meta">{plan.pendingLocalId ? "Not sent" : plan.riskLevel || (plan.source === "legacy" ? "Plan file" : plan.status)}</span>
          </button>
        ))}
        {query && !rows.length ? <p className="fa-empty">No plan matches “{query}”.</p> : null}
      </div>
    </Screen>
  );
}

function FileTile({ file }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    getSavedPlanFile(file.url).then((entry) => setSaved(Boolean(entry)));
  }, [file.url]);
  const image = isImageFile(file);
  return (
    <button type="button" className="fa-file" onClick={() => openPlanFile(file)}>
      {image ? <img src={file.url} alt="" loading="lazy" /> : <FileText size={30} />}
      <span>{file.name}</span>
      {saved ? <small>On device</small> : null}
    </button>
  );
}

function AnswerBlock({ label, value, sensitive }) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return (
    <div className="fa-answer">
      <span>{label}{sensitive ? <Shield size={13} aria-label="restricted" /> : null}</span>
      <p>{Array.isArray(value) ? value.join(", ") : String(value)}</p>
    </div>
  );
}

export function PlanViewScreen({ params = {} }) {
  const { caps, navigate, back, rulesFor, toast } = useField();
  const rules = rulesFor("preFirePlan");
  const plans = usePlans();
  const plan = plans.find((row) => row.source === params.source && row.id === params.planId);
  const [saving, setSaving] = useState(false);
  if (!plan) {
    return <Screen title="Pre-fire plan" onBack={back}><Banner tone="warn" title="Plan not on this device">Connect and tap Update.</Banner></Screen>;
  }
  const files = (plan.files || []).filter((file) => caps.preplanSensitive || !file.sensitive);

  async function saveFiles() {
    setSaving(true);
    let ok = 0;
    for (const file of files) {
      const result = await savePlanFileOffline(file);
      if (result !== "failed") ok += 1;
    }
    setSaving(false);
    toast(ok === files.length ? "Plan files saved on this device" : `${ok} of ${files.length} files saved — try again with a better signal`, ok === files.length ? "ok" : "warn");
  }

  return (
    <Screen
      title={plan.name}
      subtitle={[plan.address, plan.preplanNumber].filter(Boolean).join(" · ")}
      onBack={back}
      footer={plan.pendingLocalId ? null : (
        <div className="fa-footer-row">
          <button type="button" className="fa-btn fa-btn-secondary fa-btn-grow" onClick={() => navigate("planUpdate", { source: plan.source, planId: plan.id })}>
            <MessageSquarePlus size={20} /> Send update
          </button>
          {caps.preFirePlanEdit ? (
            <button type="button" className="fa-btn fa-btn-primary fa-btn-grow" onClick={() => navigate("planEdit", { source: plan.source, planId: plan.id })}>
              <Pencil size={20} /> Edit
            </button>
          ) : null}
        </div>
      )}
    >
      <div className="fa-facts">
        <div><span>Risk</span><strong>{plan.riskLevel || "—"}</strong></div>
        <div><span>{plan.source === "legacy" ? "Type" : "Station"}</span><strong>{plan.source === "legacy" ? plan.occupancyType || "—" : plan.station || plan.firstDueCompany || "—"}</strong></div>
        <div><span>Status</span><strong>{plan.pendingLocalId ? "Not sent yet" : plan.source === "legacy" ? "Plan library" : plan.revisionStatus || plan.status || "—"}</strong></div>
        <div><span>Updated</span><strong>{plan.updatedAt ? formatWhen(plan.updatedAt) : "—"}</strong></div>
      </div>
      {plan.narrative?.dispatchSummary ? <Banner tone="info" icon={<KeyRound size={22} />} title="Dispatch summary">{plan.narrative.dispatchSummary}</Banner> : null}

      {plan.source === "preplan" ? (
        (plan.sections || []).map((section) => {
          const configKey = sectionConfigKey(section.title);
          if (configKey && !rules.show(configKey)) return null;
          const fields = (section.fields || []).filter((field) => caps.preplanSensitive || !field.sensitive);
          const hasAnswers = fields.some((field) => String(plan.sectionAnswers?.[field.key] ?? "").trim());
          if (!hasAnswers) return null;
          return (
            <Section key={section.id || section.title} title={section.title}>
              <div className="fa-answers">
                {fields.map((field) => <AnswerBlock key={field.key} label={field.label} value={plan.sectionAnswers?.[field.key]} sensitive={field.sensitive} />)}
              </div>
            </Section>
          );
        })
      ) : (
        <Section title="Plan details">
          <div className="fa-answers">
            {LEGACY_FIELDS.filter((field) => !["businessName", "address"].includes(field.key) && (!field.config || rules.show(field.config))).map((field) => (
              <AnswerBlock key={field.key} label={field.label} value={plan[field.key]} />
            ))}
          </div>
        </Section>
      )}

      {rules.show("files") && files.length ? (
        <Section
          title="Plan files & photos"
          aside={<button type="button" className="fa-link" onClick={saveFiles} disabled={saving || !navigator.onLine}>{saving ? <Loader2 size={16} className="fa-spin" /> : <CloudDownload size={16} />} Save offline</button>}
        >
          <div className="fa-files">{files.map((file) => <FileTile key={file.url} file={file} />)}</div>
        </Section>
      ) : null}
    </Screen>
  );
}

function describeUpdate(data) {
  return { title: `Plan update — ${data.planName || data.address || "pre-fire plan"}`, subtitle: data.section || "" };
}

export function PlanUpdateScreen({ params = {} }) {
  const { back, snapshot } = useField();
  const plans = usePlans();
  const plan = plans.find((row) => row.source === params.source && row.id === params.planId);
  const sections = plan?.source === "preplan"
    ? (plan.sections || []).map((section) => section.title).filter(Boolean)
    : ["Access", "Water supply", "Hazards", "Utilities", "Contacts", "Other"];
  const form = useRecordForm({
    kind: "planUpdate",
    localId: params.localId,
    initialData: {
      planSource: plan?.source || params.source || "",
      planId: plan?.id || params.planId || "",
      planName: plan?.name || "",
      address: plan?.address || "",
      section: "",
      note: "",
      submittedBy: snapshot.displayName,
    },
    describe: describeUpdate,
    validate: (data) => (String(data.note || "").trim() ? {} : { note: "Describe what changed." }),
  });
  const { data, update, errors, submit, saving, attachments, addPhoto, removePhoto } = form;
  return (
    <Screen
      title="Send a plan update"
      subtitle={data.planName}
      onBack={back}
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button type="button" className="fa-btn fa-btn-primary fa-btn-block" disabled={saving} onClick={() => submit({ message: navigator.onLine ? "Update sent for review" : "Update saved — it goes for review when you're back online" })}>Send for review</button>
        </>
      )}
    >
      <Banner tone="info" icon={<MessageSquarePlus size={22} />}>A plan reviewer sees this in the RMS (Admin → FORGE Field → Plan updates) and updates the plan.</Banner>
      <Field label="Which part?">
        <Segmented value={data.section} options={sections.slice(0, 8).map((value) => ({ value, label: value, clearable: true }))} onChange={(value) => update({ section: value })} columns={2} />
      </Field>
      <Field label="What changed?" required error={errors.note}>
        <TextArea value={data.note} onChange={(value) => update({ note: value })} rows={5} placeholder="e.g. Knox box moved to the east entrance; new hazmat storage in bay 3" />
      </Field>
      <Field label="Photos">
        <PhotoStrip attachments={attachments} onAdd={addPhoto} onRemove={removePhoto} />
      </Field>
    </Screen>
  );
}

function describeEdit(data) {
  const name = data.plan?.name || data.plan?.businessName || data.plan?.address || "Pre-fire plan";
  return { title: `${data.mode === "new" ? "New plan" : "Plan edit"} — ${name}`, subtitle: data.plan?.address || "" };
}

function newPlanId(source) {
  const stamp = Date.now().toString(36).toUpperCase();
  return source === "legacy" ? `pfp-field-${stamp.toLowerCase()}` : `PP-F${stamp}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export function PlanEditScreen({ params = {} }) {
  const { caps, back, rulesFor, refData } = useField();
  const rules = rulesFor("preFirePlan");
  const plans = usePlans();
  const isNew = params.mode === "new";
  const existing = isNew ? null : plans.find((row) => row.source === params.source && row.id === params.planId);
  const source = existing?.source || (caps.preplanModule ? "preplan" : "legacy");
  const templateSections = existing?.sections?.length
    ? existing.sections
    : (refItems(refData, "preplans").find((row) => row.sections?.length)?.sections || (source === "preplan" ? STARTER_PREPLAN_TEMPLATE_SECTIONS : []));
  const startAnswers = existing?.source === "preplan" ? { ...(existing.currentSectionAnswers || existing.sectionAnswers || {}) } : {};
  const form = useRecordForm({
    kind: isNew ? "planCreate" : "planEdit",
    localId: params.localId,
    initialData: {
      mode: isNew ? "new" : "edit",
      source,
      planId: existing?.id || newPlanId(source),
      revisionId: existing?.currentRevisionId || "",
      plan: {
        name: existing?.name || "",
        businessName: existing?.businessName || existing?.name || "",
        address: existing?.address || "",
        riskLevel: existing?.riskLevel || "",
        station: existing?.station || "",
        ...(existing?.source === "legacy" ? Object.fromEntries(LEGACY_FIELDS.map((field) => [field.key, existing[field.key] || ""])) : {}),
      },
      sectionAnswers: startAnswers,
      sections: templateSections,
    },
    base: existing ? {
      plan: existing.source === "legacy" ? Object.fromEntries(LEGACY_FIELDS.map((field) => [field.key, existing[field.key] || ""])) : { address: existing.address || "", riskLevel: existing.riskLevel || "" },
      sectionAnswers: startAnswers,
      updatedAt: existing.source === "legacy" ? existing.updatedAt : existing.revisionUpdatedAt,
    } : null,
    describe: describeEdit,
    validate: (data) => {
      const errors = {};
      if (!String(data.plan.address || "").trim()) errors.address = "Enter the address.";
      if (data.source === "legacy" && !String(data.plan.businessName || data.plan.address || "").trim()) errors.businessName = "Name the plan.";
      if (data.source === "preplan" && data.mode === "new" && !String(data.plan.name || "").trim()) errors.name = "Name the building or business.";
      return errors;
    },
  });
  const { data, update, errors, submit, saving, attachments, addPhoto, removePhoto } = form;
  const setPlan = (patch) => update((current) => ({ plan: { ...current.plan, ...patch } }));
  const setAnswer = (key, value) => update((current) => ({ sectionAnswers: { ...current.sectionAnswers, [key]: value } }));

  if (!caps.preFirePlanEdit) {
    return <Screen title="Edit plan" onBack={back}><Banner tone="info" title="Your role can't edit plans">Use “Send update” on the plan instead.</Banner></Screen>;
  }

  return (
    <Screen
      title={isNew ? "New pre-fire plan" : `Edit ${existing?.name || "plan"}`}
      subtitle={data.source === "preplan" ? "Saved as a draft revision for approval in the RMS" : "Plan library"}
      onBack={back}
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button type="button" className="fa-btn fa-btn-primary fa-btn-block" disabled={saving} onClick={() => submit()}>{isNew ? "Save plan" : "Save changes"}</button>
        </>
      )}
    >
      <Section title="Building">
        {data.source === "preplan" ? (
          <>
            {isNew ? (
              <Field label="Building / business name" required error={errors.name}>
                <TextInput value={data.plan.name} onChange={(value) => setPlan({ name: value })} />
              </Field>
            ) : null}
            <Field label="Address" required error={errors.address}>
              <TextInput value={data.plan.address} onChange={(value) => setPlan({ address: value })} autoComplete="off" />
            </Field>
            <Field label="Risk level">
              <Segmented value={data.plan.riskLevel} options={["Low", "Moderate", "High", "Target hazard"].map((value) => ({ value, label: value, tone: value === "Low" ? "ok" : value === "Moderate" ? "warn" : "bad" }))} onChange={(value) => setPlan({ riskLevel: value })} columns={2} />
            </Field>
          </>
        ) : (
          LEGACY_FIELDS.filter((field) => !field.config || rules.show(field.config)).map((field) => (
            <Field key={field.key} label={field.label} required={field.key === "address"} error={errors[field.key]}>
              {field.long
                ? <TextArea value={data.plan[field.key]} onChange={(value) => setPlan({ [field.key]: value })} rows={2} />
                : <TextInput value={data.plan[field.key]} onChange={(value) => setPlan({ [field.key]: value })} inputMode={field.inputMode} />}
            </Field>
          ))
        )}
      </Section>
      {data.source === "preplan" ? (data.sections || []).map((section) => {
        const configKey = sectionConfigKey(section.title);
        if (configKey && !rules.show(configKey)) return null;
        const fields = (section.fields || []).filter((field) => caps.preplanSensitive || !field.sensitive);
        if (!fields.length) return null;
        return (
          <Section key={section.id || section.title} title={section.title}>
            {fields.map((field) => (
              <Field key={field.key} label={field.label}>
                {field.type === "long_text"
                  ? <TextArea value={data.sectionAnswers[field.key]} onChange={(value) => setAnswer(field.key, value)} rows={2} />
                  : <TextInput value={data.sectionAnswers[field.key]} onChange={(value) => setAnswer(field.key, value)} />}
              </Field>
            ))}
          </Section>
        );
      }) : null}
      {rules.show("files") ? (
        <Section title="Photos">
          <PhotoStrip attachments={attachments} onAdd={addPhoto} onRemove={removePhoto} max={10} />
        </Section>
      ) : null}
    </Screen>
  );
}
