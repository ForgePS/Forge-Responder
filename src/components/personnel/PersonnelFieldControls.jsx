import { useDropdowns } from "../../context/DropdownContext.jsx";
import { emergencyContactFieldKey, formatUsPhone } from "../../lib/personnelContact.js";
import { formatPersonnelDateForDisplay, formatPersonnelDateForInput } from "../../lib/personnelDates.js";
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
  const isDate = type === "date";
  const displayValue = isDate ? formatPersonnelDateForDisplay(value) : (value || "—");
  const inputValue = isDate ? formatPersonnelDateForInput(value) : value;

  return (
    <FlowFieldShell flow={flow} className={className} label={label} required={required}>
      {editing
        ? dropdownId
          ? <ManagedSelect dropdownId={dropdownId} value={value} onChange={onChange} />
          : (
            <input
              type={type}
              value={inputValue}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={stopSpaceBubble}
            />
          )
        : flow
          ? <div className="personnel-flow-value">{displayValue}</div>
          : <strong>{displayValue}</strong>}
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
        <div className={flow ? "profile-qualifiers profile-qualifiers-flow" : "profile-qualifiers"}>
          {options.map((option) => (
            <label key={option} className={flow ? "profile-checkbox personnel-flow-checkbox profile-qualifier-option" : "profile-checkbox"}>
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

function EmergencyContactBlock({
  draft,
  editing,
  onFieldChange,
  onSameAddressChange,
  flow = false,
  flowMode = "viewing",
  prefix = "emergency",
  heading = "Emergency Contact",
  showHeading = false,
}) {
  const sameAddressKey = emergencyContactFieldKey(prefix, "SameAddress");
  const sameAddress = Boolean(draft[sameAddressKey]);
  const lockEmergencyAddress = sameAddress && editing;
  const field = (suffix) => emergencyContactFieldKey(prefix, suffix);

  const contactFields = (
    <>
      <FormRow columns={4}>
        <ProfileField flow={flow} label="First Name" value={draft[field("FirstName")] || ""} editing={editing} onChange={(value) => onFieldChange(field("FirstName"), value)} />
        <ProfileField flow={flow} label="Last Name" value={draft[field("LastName")] || ""} editing={editing} onChange={(value) => onFieldChange(field("LastName"), value)} />
        <ProfileField flow={flow} label="Relationship" value={draft[field("Relationship")] || ""} editing={editing} dropdownId={editing ? "emergencyContactRelationships" : null} onChange={(value) => onFieldChange(field("Relationship"), value)} />
        <ProfilePhoneField flow={flow} label="Phone" value={draft[field("Phone")] || ""} editing={editing} onChange={(value) => onFieldChange(field("Phone"), value)} />
      </FormRow>
      {editing ? (
        <label className="profile-checkbox personnel-flow-checkbox">
          <input type="checkbox" checked={sameAddress} onChange={(event) => onSameAddressChange(event.target.checked, prefix)} />
          <span>Same Address</span>
        </label>
      ) : (
        <FormRow columns="zip-only">
          <ProfileField flow={flow} label="Same Address" value={sameAddress ? "Yes" : "No"} editing={false} onChange={() => {}} />
        </FormRow>
      )}
      {!sameAddress || !editing ? (
        <FormRow columns="address-compact">
          <ProfileField flow={flow} label="Address" value={draft[field("Address")] || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange(field("Address"), value)} />
          <ProfileField flow={flow} label="State" value={draft[field("State")] || ""} editing={editing && !lockEmergencyAddress} dropdownId={editing && !lockEmergencyAddress ? "usStates" : null} onChange={(value) => onFieldChange(field("State"), value)} />
          <ProfileField flow={flow} label="City" value={draft[field("City")] || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange(field("City"), value)} />
          <ProfileField flow={flow} label="Zip" value={draft[field("Zip")] || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange(field("Zip"), value)} />
        </FormRow>
      ) : null}
    </>
  );

  if (flow) {
    return (
      <>
        {showHeading ? <h3 className="personnel-form-section-title">{heading}</h3> : null}
        <div className={`personnel-form-flow personnel-form-flow-nested ${flowMode === "editing" ? "is-editing" : "is-viewing"}`}>
          {contactFields}
        </div>
      </>
    );
  }

  return (
    <div className="personnel-section-card">
      {showHeading ? <h3 className="personnel-form-section-title">{heading}</h3> : null}
      <div className="profile-fields personnel-form-grid">
        <ProfileField label="First Name" value={draft[field("FirstName")] || ""} editing={editing} onChange={(value) => onFieldChange(field("FirstName"), value)} />
        <ProfileField label="Last Name" value={draft[field("LastName")] || ""} editing={editing} onChange={(value) => onFieldChange(field("LastName"), value)} />
        <ProfileField label="Relationship" value={draft[field("Relationship")] || ""} editing={editing} dropdownId={editing ? "emergencyContactRelationships" : null} onChange={(value) => onFieldChange(field("Relationship"), value)} />
        <ProfilePhoneField label="Phone" value={draft[field("Phone")] || ""} editing={editing} onChange={(value) => onFieldChange(field("Phone"), value)} />
      </div>
      {editing ? (
        <label className="profile-checkbox">
          <input type="checkbox" checked={sameAddress} onChange={(event) => onSameAddressChange(event.target.checked, prefix)} />
          <span>Same Address</span>
        </label>
      ) : (
        <ProfileField label="Same Address" value={sameAddress ? "Yes" : "No"} editing={false} onChange={() => {}} />
      )}
      {!sameAddress || !editing ? (
        <div className="profile-fields personnel-form-grid">
          <ProfileField label="Address" value={draft[field("Address")] || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange(field("Address"), value)} />
          <ProfileField label="City" value={draft[field("City")] || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange(field("City"), value)} />
          <ProfileField label="State" value={draft[field("State")] || ""} editing={editing && !lockEmergencyAddress} dropdownId={editing && !lockEmergencyAddress ? "usStates" : null} onChange={(value) => onFieldChange(field("State"), value)} />
          <ProfileField label="Zip" value={draft[field("Zip")] || ""} editing={editing && !lockEmergencyAddress} onChange={(value) => onFieldChange(field("Zip"), value)} />
        </div>
      ) : null}
    </div>
  );
}

export function EmergencyContactSection({ draft, editing, onFieldChange, onSameAddressChange, flow = false, flowMode = "viewing", showHeading = false }) {
  if (flow) {
    return (
      <>
        <EmergencyContactBlock
          draft={draft}
          editing={editing}
          onFieldChange={onFieldChange}
          onSameAddressChange={onSameAddressChange}
          flow={flow}
          flowMode={flowMode}
          prefix="emergency"
          heading="Emergency Contact"
          showHeading={showHeading}
        />
        <EmergencyContactBlock
          draft={draft}
          editing={editing}
          onFieldChange={onFieldChange}
          onSameAddressChange={onSameAddressChange}
          flow={flow}
          flowMode={flowMode}
          prefix="emergency2"
          heading="Emergency Contact 2"
          showHeading
        />
      </>
    );
  }

  return (
    <>
      <EmergencyContactBlock
        draft={draft}
        editing={editing}
        onFieldChange={onFieldChange}
        onSameAddressChange={onSameAddressChange}
        flow={flow}
        flowMode={flowMode}
        prefix="emergency"
        heading="Emergency Contact"
        showHeading={showHeading}
      />
      <EmergencyContactBlock
        draft={draft}
        editing={editing}
        onFieldChange={onFieldChange}
        onSameAddressChange={onSameAddressChange}
        flow={flow}
        flowMode={flowMode}
        prefix="emergency2"
        heading="Emergency Contact 2"
        showHeading
      />
    </>
  );
}
