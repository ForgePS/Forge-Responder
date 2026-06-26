import { useDropdowns } from "../../context/DropdownContext.jsx";
import { formatUsPhone } from "../../lib/personnelContact.js";
import ManagedSelect from "../ManagedSelect.jsx";

function fieldClass(flow, extra = "") {
  return [flow ? "personnel-flow-field" : "", extra].filter(Boolean).join(" ");
}

function FlowFieldShell({ flow, className = "", label, required = false, children }) {
  if (flow) {
    return (
      <div className={fieldClass(true, className)}>
        <span className="personnel-flow-label">{label}{required ? " (required)" : ""}</span>
        {children}
      </div>
    );
  }

  return (
    <label className={className}>
      <span>{label}{required ? " (required)" : ""}</span>
      {children}
    </label>
  );
}

function stopSpaceBubble(event) {
  event.stopPropagation();
}

export function ProfileField({ label, value, editing, onChange, dropdownId, required = false, type = "text", className = "", flow = false }) {
  return (
    <FlowFieldShell flow={flow} className={className} label={label} required={required}>
      {editing
        ? dropdownId
          ? <ManagedSelect dropdownId={dropdownId} value={value} onChange={onChange} />
          : (
            <input
              type={type}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={stopSpaceBubble}
            />
          )
        : flow
          ? <div className="personnel-flow-value">{value || "—"}</div>
          : <strong>{value || "—"}</strong>}
    </FlowFieldShell>
  );
}

export function ProfilePhoneField({ label, value, editing, onChange, required = false, flow = false }) {
  return (
    <FlowFieldShell flow={flow} label={label} required={required}>
      {editing
        ? (
          <input
            value={value}
            inputMode="tel"
            placeholder="(***) ***-****"
            onChange={(event) => onChange(formatUsPhone(event.target.value))}
            onKeyDown={stopSpaceBubble}
          />
        )
        : flow
          ? <div className="personnel-flow-value">{value || "—"}</div>
          : <strong>{value || "—"}</strong>}
    </FlowFieldShell>
  );
}

export function ProfileToggleField({ label, value, editing, onChange, flow = false }) {
  return (
    <FlowFieldShell flow={flow} className="personnel-flow-toggle" label={label}>
      {editing
        ? (
          <span className="personnel-toggle-switch">
            <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
            <span className="personnel-toggle-track" aria-hidden="true" />
          </span>
        )
        : flow
          ? <div className="personnel-flow-value">{value ? "Yes" : "No"}</div>
          : <strong>{value ? "Yes" : "No"}</strong>}
    </FlowFieldShell>
  );
}

export function ProfileQualifiersField({ value = [], editing, onChange, flow = false }) {
  const { getOptions } = useDropdowns();
  const options = getOptions("personnelQualifiers");
  const selected = Array.isArray(value) ? value : [];
  const display = selected.length ? selected.join(", ") : "—";

  return (
    <FlowFieldShell flow={flow} className="profile-qualifiers-field" label="Qualifiers">
      {editing ? (
        <div className="profile-qualifiers profile-qualifiers-compact">
          {options.map((option) => (
            <label key={option} className="profile-checkbox">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option);
                  onChange(next);
                }}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : flow
        ? <div className="personnel-flow-value">{display}</div>
        : <strong>{display}</strong>}
    </FlowFieldShell>
  );
}

export function FilterField({ label, value, onChange, dropdownId, type = "text" }) {
  return (
    <label className="personnel-filter-field">
      <span>{label}</span>
      {dropdownId
        ? <ManagedSelect dropdownId={dropdownId} value={value} onChange={onChange} />
        : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={stopSpaceBubble} />}
    </label>
  );
}

export function MiniTable({ columns, rows, emptyMessage = "No records found." }) {
  if (!rows?.length) {
    return <div className="personnel-empty-section">{emptyMessage}</div>;
  }

  return (
    <div className="mini-table">
      <div className="mini-row mini-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.map((row, rowIndex) => (
        <div className="mini-row" key={`${row.join("-")}-${rowIndex}`} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {row.map((cell, index) => <span key={`${cell}-${index}`}>{cell}</span>)}
        </div>
      ))}
    </div>
  );
}

function FormRow({ columns, children }) {
  return <div className={`personnel-form-row personnel-form-row-${columns}`}>{children}</div>;
}

export function EmergencyContactSection({ draft, editing, onFieldChange, onSameAddressChange, flow = false, flowMode = "viewing", showHeading = false }) {
  const sameAddress = Boolean(draft.emergencySameAddress);
  const lockEmergencyAddress = sameAddress && editing;
  const Field = (props) => <ProfileField flow={flow} {...props} />;
  const PhoneField = (props) => <ProfilePhoneField flow={flow} {...props} />;

  if (flow) {
    return (
      <>
        {showHeading && <h3 className="personnel-form-section-title">Emergency Contact</h3>}
        <div className={`personnel-form-flow personnel-form-flow-nested ${flowMode === "editing" ? "is-editing" : "is-viewing"}`}>
          <FormRow columns={3}>
            <Field label="First Name" value={draft.emergencyFirstName || ""} editing={editing} onChange={(value) => onFieldChange("emergencyFirstName", value)} />
            <Field label="Last Name" value={draft.emergencyLastName || ""} editing={editing} onChange={(value) => onFieldChange("emergencyLastName", value)} />
            <PhoneField label="Phone" value={draft.emergencyPhone || ""} editing={editing} onChange={(value) => onFieldChange("emergencyPhone", value)} />
          </FormRow>
          {editing ? (
            <label className="profile-checkbox personnel-flow-checkbox">
              <input type="checkbox" checked={sameAddress} onChange={(event) => onSameAddressChange(event.target.checked)} />
              <span>Same address as employee</span>
            </label>
          ) : sameAddress ? (
            <p className="profile-inline-note">Emergency contact uses the same address as the employee.</p>
          ) : null}
          <FormRow columns="address-compact">
            <Field label="Address" value={draft.emergencyAddress || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange("emergencyAddress", value)} />
            <Field label="Unit/Suite" value={draft.emergencyUnitSuite || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange("emergencyUnitSuite", value)} />
            <Field label="State" value={draft.emergencyState || ""} editing={editing && !lockEmergencyAddress} dropdownId={editing && !lockEmergencyAddress ? "usStates" : null} onChange={(value) => onFieldChange("emergencyState", value)} />
            <Field label="City" value={draft.emergencyCity || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange("emergencyCity", value)} />
          </FormRow>
          <FormRow columns="zip-only">
            <Field label="Zip" value={draft.emergencyZip || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange("emergencyZip", value)} />
          </FormRow>
        </div>
      </>
    );
  }

  return (
    <div className="personnel-section-card">
      {showHeading && <h3 className="personnel-form-section-title">Emergency Contact</h3>}
      <div className="profile-fields personnel-form-grid">
        <ProfileField label="First Name" value={draft.emergencyFirstName || ""} editing={editing} onChange={(value) => onFieldChange("emergencyFirstName", value)} />
        <ProfileField label="Last Name" value={draft.emergencyLastName || ""} editing={editing} onChange={(value) => onFieldChange("emergencyLastName", value)} />
        <ProfilePhoneField label="Phone" value={draft.emergencyPhone || ""} editing={editing} onChange={(value) => onFieldChange("emergencyPhone", value)} />
      </div>
      {editing ? (
        <label className="profile-checkbox">
          <input type="checkbox" checked={sameAddress} onChange={(event) => onSameAddressChange(event.target.checked)} />
          <span>Same address as employee</span>
        </label>
      ) : sameAddress ? (
        <p className="profile-inline-note">Emergency contact uses the same address as the employee.</p>
      ) : null}
      <div className="profile-fields personnel-form-grid">
        <ProfileField label="Address" value={draft.emergencyAddress || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange("emergencyAddress", value)} />
        <ProfileField label="City" value={draft.emergencyCity || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange("emergencyCity", value)} />
        <ProfileField label="State" value={draft.emergencyState || ""} editing={editing && !lockEmergencyAddress} dropdownId={editing && !lockEmergencyAddress ? "usStates" : null} onChange={(value) => onFieldChange("emergencyState", value)} />
        <ProfileField label="Zip" value={draft.emergencyZip || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange("emergencyZip", value)} />
      </div>
    </div>
  );
}
