import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Save } from "lucide-react";
import {
  getDamageCategoryOptions,
  getDamageOperationalStatusOptions,
  getDamageSeverityOptions,
} from "../../lib/hydrantDamage/index.js";
import {
  buildHydrantDamageEmailPreview,
  openHydrantDamageReportPrintPreview,
} from "../../lib/hydrantDamage/damageReportPrint.js";
import OutOfServiceHydrantList, {
  hydrantRecordKey,
  listOutOfServiceHydrants,
} from "./OutOfServiceHydrantList.jsx";

const STEPS = [
  { id: 1, label: "Hydrant" },
  { id: 2, label: "Damage" },
  { id: 3, label: "Impact" },
  { id: 4, label: "Details" },
  { id: 5, label: "Evidence" },
  { id: 6, label: "Recipients" },
  { id: 7, label: "Preview" },
  { id: 8, label: "Send" },
];

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * @param {{
 *   draft: object,
 *   setDraft: Function,
 *   hydrants?: object[],
 *   companies?: object[],
 *   reports?: object[],
 *   canEdit?: boolean,
 *   canSend?: boolean,
 *   saving?: boolean,
 *   departmentName?: string,
 *   onSave?: Function,
 *   onReadyToSend?: Function,
 *   onSend?: Function,
 *   onAssignHydrant?: Function,
 *   onClose?: Function,
 * }} props
 */
export default function HydrantDamageWizard({
  draft,
  setDraft,
  hydrants = [],
  companies = [],
  reports = [],
  canEdit = false,
  canSend = false,
  saving = false,
  departmentName = "",
  onSave,
  onReadyToSend,
  onSend,
  onAssignHydrant,
  onClose,
} = {}) {
  const [step, setStep] = useState(Math.min(8, Math.max(1, Number(draft?.wizardStep) || 1)));
  const [hydrantSource, setHydrantSource] = useState("oos");
  const categories = getDamageCategoryOptions();
  const severities = getDamageSeverityOptions();
  const operationalStatuses = getDamageOperationalStatusOptions();
  const emailPreview = useMemo(() => buildHydrantDamageEmailPreview(draft || {}), [draft]);
  const oosHydrants = useMemo(() => listOutOfServiceHydrants(hydrants), [hydrants]);
  const selectHydrants = useMemo(() => {
    if (hydrantSource === "oos") return oosHydrants;
    return hydrants;
  }, [hydrantSource, oosHydrants, hydrants]);

  if (!draft) return null;

  function go(next) {
    const clamped = Math.min(8, Math.max(1, next));
    setStep(clamped);
    setDraft((current) => ({ ...current, wizardStep: clamped }));
  }

  return (
    <div className="hydrant-damage-wizard">
      <nav className="hydrant-damage-wizard-steps" aria-label="Damage report steps">
        {STEPS.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`hydrant-damage-wizard-step${step === row.id ? " active" : ""}${step > row.id ? " done" : ""}`}
            aria-current={step === row.id ? "step" : undefined}
            onClick={() => go(row.id)}
          >
            <span>{row.id}</span>
            {row.label}
          </button>
        ))}
      </nav>

      <div className="occupancy-form-grid">
        {step === 1 ? (
          <>
            <div className="config-field wide">
              <span>Select from inventory</span>
              <div className="oos-hydrant-source-toggle" role="group" aria-label="Hydrant list source">
                <button
                  type="button"
                  className={`secondary-button${hydrantSource === "oos" ? " active" : ""}`}
                  disabled={!canEdit}
                  onClick={() => setHydrantSource("oos")}
                >
                  Out of service ({oosHydrants.length})
                </button>
                <button
                  type="button"
                  className={`secondary-button${hydrantSource === "all" ? " active" : ""}`}
                  disabled={!canEdit}
                  onClick={() => setHydrantSource("all")}
                >
                  All hydrants ({hydrants.length})
                </button>
              </div>
            </div>

            {hydrantSource === "oos" ? (
              <div className="config-field wide">
                <OutOfServiceHydrantList
                  hydrants={hydrants}
                  reports={reports}
                  selectedKey={draft.hydrantId || ""}
                  onSelect={(key) => canEdit && onAssignHydrant?.(key)}
                  compact
                />
              </div>
            ) : null}

            <Field label="Hydrant">
              <select
                value={draft.hydrantId || ""}
                disabled={!canEdit}
                onChange={(e) => onAssignHydrant?.(e.target.value)}
              >
                <option value="">
                  {hydrantSource === "oos" ? "Select out-of-service hydrant…" : "Select hydrant…"}
                </option>
                {selectHydrants.slice(0, 800).map((row) => {
                  const key = hydrantRecordKey(row);
                  return (
                    <option key={key} value={key}>
                      {key} — {row.address || row.full_address || "No address"}
                    </option>
                  );
                })}
              </select>
            </Field>
            <Field label="Address">
              <input value={draft.hydrantAddress || ""} readOnly />
            </Field>
            <Field label="Current label">
              <input value={draft.hydrantLabel || ""} readOnly />
            </Field>
            <Field label="Water company (resolved)">
              <input value={draft.waterCompanyName || "Ownership review required"} readOnly />
            </Field>
            <Field label="Water district">
              <input value={draft.waterDistrictName || "—"} readOnly />
            </Field>
            <Field label="Assignment source">
              <input
                value={`${draft.assignmentSource || "—"} (${Math.round((draft.assignmentConfidence || 0) * 100)}%)`}
                readOnly
              />
            </Field>
            {(draft.ownershipCandidates || []).length > 1 || draft.status === "ownership_review_required" ? (
              <Field label="Ownership candidates" wide>
                <textarea
                  rows={Math.min(6, Math.max(2, (draft.ownershipCandidates || []).length + 1))}
                  readOnly
                  value={
                    (draft.ownershipCandidates || []).length
                      ? draft.ownershipCandidates
                        .map((row) => `${row.waterCompanyName || "Unknown company"} / ${row.waterDistrictName || "no district"} (${row.source}, p${row.priority ?? "—"})`)
                        .join("\n")
                      : `Needs review: ${draft.ownershipReason || "unknown"}`
                  }
                />
              </Field>
            ) : null}
          </>
        ) : null}


        {step === 2 ? (
          <Field label="Damage categories" wide>
            <div className="checkbox-grid">
              {categories.map((row) => {
                const checked = draft.damageCategoryIds?.includes(row.id);
                return (
                  <label key={row.id} className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={Boolean(checked)}
                      disabled={!canEdit}
                      onChange={(e) => {
                        setDraft((current) => {
                          const set = new Set(current.damageCategoryIds || []);
                          if (e.target.checked) set.add(row.id);
                          else set.delete(row.id);
                          return { ...current, damageCategoryIds: [...set] };
                        });
                      }}
                    />
                    <span>{row.name}</span>
                  </label>
                );
              })}
            </div>
          </Field>
        ) : null}

        {step === 3 ? (
          <>
            <Field label="Severity">
              <select
                value={draft.severity}
                disabled={!canEdit}
                onChange={(e) => setDraft((c) => ({ ...c, severity: e.target.value }))}
              >
                {severities.map((row) => (
                  <option key={row.id} value={row.id}>{row.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Operational status">
              <select
                value={draft.operationalStatus}
                disabled={!canEdit}
                onChange={(e) => setDraft((c) => ({ ...c, operationalStatus: e.target.value }))}
              >
                {operationalStatuses.map((row) => (
                  <option key={row.id} value={row.id}>{row.label}</option>
                ))}
              </select>
            </Field>
            <div className="config-field wide">
              <span>Operational impact flags</span>
              <div className="checkbox-grid">
                {[
                  ["leaking", "Leaking"],
                  ["roadwayHazard", "Roadway hazard"],
                  ["publicSafetyHazard", "Public safety hazard"],
                  ["dispatchNotificationRequired", "Notify dispatch"],
                  ["alternativeWaterSupplyRequired", "Alt. water supply needed"],
                ].map(([key, label]) => (
                  <label key={key} className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={Boolean(draft[key])}
                      disabled={!canEdit}
                      onChange={(e) => setDraft((c) => ({ ...c, [key]: e.target.checked }))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Field label="Description" wide>
              <textarea
                rows={5}
                value={draft.description || ""}
                disabled={!canEdit}
                onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))}
              />
            </Field>
            <Field label="Suspected cause" wide>
              <textarea
                rows={2}
                value={draft.suspectedCause || ""}
                disabled={!canEdit}
                onChange={(e) => setDraft((c) => ({ ...c, suspectedCause: e.target.value }))}
              />
            </Field>
            <Field label="Immediate actions" wide>
              <textarea
                rows={2}
                value={draft.immediateActions || ""}
                disabled={!canEdit}
                onChange={(e) => setDraft((c) => ({ ...c, immediateActions: e.target.value }))}
              />
            </Field>
            <Field label="Utility-facing notes" wide>
              <textarea
                rows={2}
                value={draft.utilityFacingNotes || ""}
                disabled={!canEdit}
                onChange={(e) => setDraft((c) => ({ ...c, utilityFacingNotes: e.target.value }))}
              />
            </Field>
            <Field label="Internal notes (never emailed)" wide>
              <textarea
                rows={2}
                value={draft.internalNotes || ""}
                disabled={!canEdit}
                onChange={(e) => setDraft((c) => ({ ...c, internalNotes: e.target.value }))}
              />
            </Field>
          </>
        ) : null}

        {step === 5 ? (
          <div className="config-field wide">
            <span>Evidence</span>
            <p className="occupancy-muted">
              Photo and document uploads attach in a later hardening phase. For now, list evidence references in the description or utility-facing notes so they appear on the PDF.
            </p>
            <p className="occupancy-muted">
              Attachments queued: {(draft.attachmentIds || []).length}
            </p>
          </div>
        ) : null}

        {step === 6 ? (
          <>
            <Field label="Water company">
              <select
                value={draft.waterCompanyId || ""}
                disabled={!canEdit}
                onChange={(e) => {
                  const company = companies.find((row) => row.id === e.target.value);
                  const recipients = [];
                  if (company?.damageReportEmail) {
                    recipients.push({
                      email: company.damageReportEmail,
                      name: company.legalName,
                      role: "damage_report",
                      required: true,
                    });
                  }
                  if (company?.emergencyEmail && ["critical", "immediate_hazard"].includes(draft.severity)) {
                    recipients.push({
                      email: company.emergencyEmail,
                      name: `${company.legalName} (Emergency)`,
                      role: "emergency",
                      required: true,
                    });
                  }
                  setDraft((c) => ({
                    ...c,
                    waterCompanyId: company?.id || "",
                    waterCompanyName: company?.legalName || "",
                    waterDistrictId: "",
                    waterDistrictName: "",
                    ownershipCandidates: [],
                    ownershipReason: "",
                    assignmentSource: company ? "manual_override" : c.assignmentSource,
                    assignmentConfidence: company ? 1 : c.assignmentConfidence,
                    recipientSnapshot: recipients,
                    preferredSubjectFormat: company?.preferredSubjectFormat || c.preferredSubjectFormat,
                    status: company && c.status === "ownership_review_required" ? "draft" : c.status,
                  }));
                }}
              >
                <option value="">Select company…</option>
                {companies.map((row) => (
                  <option key={row.id} value={row.id}>{row.legalName}</option>
                ))}
              </select>
            </Field>
            <Field label="Recipients" wide>
              <textarea
                rows={3}
                readOnly
                value={(draft.recipientSnapshot || []).map((row) => `${row.email} (${row.role})`).join("\n") || "None"}
              />
            </Field>
            <Field label="Ack due">
              <input value={draft.acknowledgmentDueAt ? new Date(draft.acknowledgmentDueAt).toLocaleString() : "—"} readOnly />
            </Field>
            <Field label="Repair target">
              <input value={draft.repairTargetAt ? new Date(draft.repairTargetAt).toLocaleString() : "—"} readOnly />
            </Field>
          </>
        ) : null}

        {step === 7 ? (
          <>
            <Field label="Subject" wide>
              <input value={emailPreview.subject} readOnly />
            </Field>
            <Field label="To" wide>
              <input value={(emailPreview.to || []).join(", ") || "—"} readOnly />
            </Field>
            <Field label="Email body" wide>
              <textarea rows={8} value={emailPreview.body} readOnly />
            </Field>
            <div className="occupancy-detail-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => openHydrantDamageReportPrintPreview(draft, { departmentName })}
              >
                <FileText size={14} /> Preview / print PDF
              </button>
            </div>
          </>
        ) : null}

        {step === 8 ? (
          <div className="config-field wide">
            <span>Send</span>
            <p className="occupancy-muted">
              Email is sent through a secure Cloud Function with SendGrid. The report is only marked Sent after the provider accepts the request.
            </p>
            <p>
              Status: <strong>{draft.statusLabel}</strong> · Email: <strong>{draft.emailStatusLabel}</strong>
            </p>
            {draft.acknowledgmentPortalUrl ? (
              <p className="occupancy-muted">
                Utility ack link: <a href={draft.acknowledgmentPortalUrl} target="_blank" rel="noreferrer">{draft.acknowledgmentPortalUrl}</a>
                {draft.acknowledgmentTokenExpiresAt
                  ? ` (expires ${new Date(draft.acknowledgmentTokenExpiresAt).toLocaleString()})`
                  : ""}
              </p>
            ) : null}
            {draft.providerMessageId ? (
              <p className="occupancy-muted">Provider message: {draft.providerMessageId}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="hydrant-damage-wizard-footer">
        <button
          className="secondary-button"
          type="button"
          disabled={step <= 1 && !onClose}
          onClick={() => {
            if (step <= 1) {
              onClose?.();
              return;
            }
            go(step - 1);
          }}
        >
          <ChevronLeft size={14} /> Back
        </button>
        <div className="occupancy-detail-actions">
          {canEdit ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={onSave}>
              <Save size={14} /> Save
            </button>
          ) : null}
          {step < 8 ? (
            <button className="primary-button" type="button" onClick={() => go(step + 1)}>
              Next <ChevronRight size={14} />
            </button>
          ) : null}
          {step === 7 && canEdit ? (
            <button className="secondary-button" type="button" disabled={saving} onClick={onReadyToSend}>
              Ready to send
            </button>
          ) : null}
          {step === 8 && canSend ? (
            <button className="primary-button" type="button" disabled={saving} onClick={onSend}>
              Send report
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
