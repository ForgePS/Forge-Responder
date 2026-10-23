import { CirclePlus, Trash2 } from "lucide-react";
import AdminTextInput from "../AdminTextInput.jsx";
import ManagedSelect from "../ManagedSelect.jsx";
import { MiniTable } from "./PersonnelFieldControls.jsx";
import {
  computeEmsCredentialStatus,
  formatCredentialDateForDisplay,
  formatCredentialDateForInput,
  normalizeEmsCredentialRows,
} from "../../lib/personnelEmsCredentials.js";

function createCredentialId() {
  return `ems-cred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PersonnelEmsCredentialsEditor({
  value = [],
  editing = false,
  onChange,
}) {
  const credentials = normalizeEmsCredentialRows(value);

  if (!editing) {
    const rows = credentials.map((row) => [
      row.credential || "—",
      formatCredentialDateForDisplay(row.expiration),
      row.status || computeEmsCredentialStatus(row.expiration),
    ]);

    return (
      <MiniTable
        columns={["Credential", "Expiration", "Status"]}
        rows={rows}
        emptyMessage="No EMS credentials recorded for this member."
      />
    );
  }

  function updateCredential(index, patch) {
    onChange(normalizeEmsCredentialRows(value).map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...patch };
      return {
        ...next,
        status: computeEmsCredentialStatus(next.expiration),
      };
    }));
  }

  function addCredential() {
    onChange([
      ...normalizeEmsCredentialRows(value),
      {
        id: createCredentialId(),
        credential: "",
        expiration: "",
        status: "Active",
      },
    ]);
  }

  function removeCredential(index) {
    onChange(normalizeEmsCredentialRows(value).filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="personnel-ems-credentials-editor">
      {!credentials.length ? (
        <p className="auth-help">No EMS credentials yet. Add Paramedic, AEMT, or EMT with expiration dates.</p>
      ) : (
        <div className="personnel-inline-table-list">
          {credentials.map((credential, index) => (
            <div className="personnel-inline-table-row" key={credential.id || `ems-cred-${index}`}>
              <div className="admin-field">
                <span>Credential</span>
                <ManagedSelect
                  dropdownId="emsLevels"
                  value={credential.credential}
                  onChange={(nextValue) => updateCredential(index, { credential: nextValue })}
                />
              </div>
              <div className="admin-field">
                <span>Expiration</span>
                <AdminTextInput
                  type="date"
                  value={formatCredentialDateForInput(credential.expiration)}
                  onChange={(nextValue) => updateCredential(index, { expiration: nextValue })}
                />
              </div>
              <div className="admin-field">
                <span>Status</span>
                <AdminTextInput
                  value={computeEmsCredentialStatus(credential.expiration)}
                  onChange={() => {}}
                  disabled
                />
              </div>
              <button
                className="row-action danger"
                type="button"
                onClick={() => removeCredential(index)}
                aria-label="Remove EMS credential"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="text-button personnel-inline-table-add" type="button" onClick={addCredential}>
        <CirclePlus size={14} /> Add EMS credential
      </button>
    </div>
  );
}
