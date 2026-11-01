import { useState } from "react";
import { Droplets } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { findHydrant, hydrantAddress, hydrantKey, hydrantLabel, hydrantSnapshot } from "../fieldHydrants.js";
import { validateHydrantDamage } from "../fieldValidation.js";
import { requiredFieldErrors } from "../fieldAppConfig.js";
import { DAMAGE_OPERATIONAL_STATUSES, DAMAGE_SEVERITIES, STARTER_DAMAGE_CATEGORIES } from "../../lib/hydrantDamage/defaults.js";
import { Banner, Chips, ErrorSummary, Field, PhotoStrip, PickerButton, PickerSheet, Screen, Section, Segmented, TextArea, formatWhen } from "../ui.jsx";

const SEVERITY_TONE = { information: "muted", minor: "ok", moderate: "warn", major: "bad", critical: "bad", immediate_hazard: "bad" };
const COMMON_STATUSES = ["in_service", "in_service_limited", "out_of_service", "unknown"];

function describe(data) {
  const severity = DAMAGE_SEVERITIES.find((row) => row.id === data.severity)?.label || "";
  return {
    title: `Hydrant ${data.hydrant ? hydrantLabel(data.hydrant) : ""} — damage`,
    subtitle: [severity, formatWhen(data.discoveredAt)].filter(Boolean).join(" · "),
  };
}

function newReportId() {
  return `HDR-F${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export default function HydrantDamageScreen({ params = {} }) {
  const { refData, back, rulesFor } = useField();
  const rules = rulesFor("hydrantDamage");
  const hydrants = refItems(refData, "hydrants");
  const hydrant = params.hydrantKey ? findHydrant(hydrants, params.hydrantKey) : null;
  const [sheet, setSheet] = useState(false);
  const form = useRecordForm({
    kind: "hydrantDamage",
    localId: params.localId,
    initialData: {
      reportId: newReportId(),
      hydrant: hydrant ? hydrantSnapshot(hydrant) : null,
      categoryIds: [],
      severity: "moderate",
      operationalStatus: "",
      leaking: false,
      roadwayHazard: false,
      publicSafetyHazard: false,
      description: "",
      immediateActions: "",
      discoveredAt: new Date().toISOString(),
    },
    describe,
    validate: (data, photos = []) => ({
      ...(rules.required("photos") && !photos.length ? { photos: "Add a photo." } : {}),
      ...requiredFieldErrors(rules, [
        { field: "description", value: data.description, message: "Describe the damage." },
        { field: "immediateActions", value: data.immediateActions, message: "Describe actions taken." },
      ]),
      ...validateHydrantDamage(data),
    }),
  });
  const { data, update, errors, submit, saving, attachments, addPhoto, removePhoto } = form;
  const hazards = [
    data.leaking && "leaking",
    data.roadwayHazard && "roadwayHazard",
    data.publicSafetyHazard && "publicSafetyHazard",
  ].filter(Boolean);

  return (
    <Screen
      title="Report hydrant damage"
      subtitle={data.hydrant ? `${hydrantLabel(data.hydrant)} · ${hydrantAddress(data.hydrant)}` : ""}
      onBack={back}
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button type="button" className="fa-btn fa-btn-primary fa-btn-block" disabled={saving} onClick={() => submit()}>
            Save damage report
          </button>
        </>
      )}
    >
      <Banner tone="info" icon={<Droplets size={22} />}>
        The report goes to the hydrant damage queue. The water company is emailed from the RMS after review.
      </Banner>
      {!hydrant && !data.hydrant ? (
        <Field label="Hydrant" required error={errors.hydrant}>
          <PickerButton value="" placeholder="Pick the hydrant" onClick={() => setSheet(true)} error={errors.hydrant} />
        </Field>
      ) : null}
      <Section title="What's damaged?">
        <Field required error={errors.categoryIds}>
          <Chips values={data.categoryIds} options={STARTER_DAMAGE_CATEGORIES.map((row) => ({ value: row.id, label: row.name }))} onChange={(values) => update({ categoryIds: values })} ariaLabel="Damage" />
        </Field>
      </Section>
      <Section title="How bad?">
        <Field label="Severity" required error={errors.severity}>
          <Segmented
            value={data.severity}
            options={DAMAGE_SEVERITIES.filter((row) => row.id !== "information").map((row) => ({ value: row.id, label: row.label, tone: SEVERITY_TONE[row.id] }))}
            onChange={(value) => update({ severity: value })}
            columns={2}
          />
        </Field>
        <Field label="Can it still be used?" required error={errors.operationalStatus}>
          <Segmented
            value={data.operationalStatus}
            options={DAMAGE_OPERATIONAL_STATUSES.filter((row) => COMMON_STATUSES.includes(row.id)).map((row) => ({ value: row.id, label: row.label, tone: row.id === "out_of_service" ? "bad" : row.id === "in_service" ? "ok" : "warn" }))}
            onChange={(value) => update({ operationalStatus: value })}
            columns={2}
          />
        </Field>
        {rules.show("hazards") ? <Field label="Hazards">
          <Chips
            values={hazards}
            options={[{ value: "leaking", label: "Leaking water" }, { value: "roadwayHazard", label: "Roadway hazard" }, { value: "publicSafetyHazard", label: "Public safety hazard" }]}
            onChange={(values) => update({ leaking: values.includes("leaking"), roadwayHazard: values.includes("roadwayHazard"), publicSafetyHazard: values.includes("publicSafetyHazard") })}
          />
        </Field> : null}
      </Section>
      <Section title="Details">
        {rules.show("description") ? (
          <Field label="Description" required={rules.required("description")} error={errors.description}>
            <TextArea value={data.description} onChange={(value) => update({ description: value })} placeholder="What you found" />
          </Field>
        ) : null}
        {rules.show("immediateActions") ? (
          <Field label="Actions taken" required={rules.required("immediateActions")} error={errors.immediateActions}>
            <TextArea value={data.immediateActions} onChange={(value) => update({ immediateActions: value })} placeholder="Coned off, water shut, notified PD…" rows={2} />
          </Field>
        ) : null}
        {rules.show("photos") ? (
          <Field label="Photos" required={rules.required("photos")} error={errors.photos}>
            <PhotoStrip attachments={attachments} onAdd={addPhoto} onRemove={removePhoto} />
          </Field>
        ) : null}
      </Section>
      <PickerSheet
        open={sheet}
        title="Hydrant"
        options={hydrants.slice(0, 3000).map((row) => ({ value: hydrantKey(row), label: hydrantLabel(row), detail: hydrantAddress(row) }))}
        onPick={(value) => { update({ hydrant: hydrantSnapshot(findHydrant(hydrants, value)) }); setSheet(false); }}
        onClose={() => setSheet(false)}
      />
    </Screen>
  );
}
