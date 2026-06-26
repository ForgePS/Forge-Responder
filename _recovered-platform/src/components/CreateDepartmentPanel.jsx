import { useMemo, useState } from "react";
import { CirclePlus, ExternalLink } from "lucide-react";
import { buildDepartmentGatewayUrl } from "../lib/gatewayRouting.js";
import {
  slugifyDepartmentId,
  validateDepartmentId
} from "../lib/departmentProvisioning.js";
import { registerPlatformDepartment } from "../lib/platformService.js";

const EMPTY_FORM = {
  id: "",
  name: "",
  shortName: "",
  contactEmail: "",
  address: ""
};

export default function CreateDepartmentPanel({
  user,
  departments = [],
  onCreated,
  onMessage,
  compact = false
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [idTouched, setIdTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const existingIds = useMemo(
    () => departments.map((item) => item.id),
    [departments]
  );

  const suggestedId = slugifyDepartmentId(form.id || form.name);
  const validation = validateDepartmentId(suggestedId, existingIds);
  const gatewayPreview = validation.valid
    ? buildDepartmentGatewayUrl(validation.id).replace(/^https?:\/\//, "")
    : "";

  function updateField(field, value) {
    setError("");
    setForm((current) => {
      const next = { ...current, [field]: value };
      if ((field === "name" || field === "shortName") && !idTouched) {
        next.id = slugifyDepartmentId(current.id || value);
      }
      return next;
    });
  }

  async function handleCreate(event) {
    event?.preventDefault();
    if (!form.name.trim()) {
      setError("Department name is required.");
      return;
    }

    const idCheck = validateDepartmentId(form.id || form.name, existingIds);
    if (!idCheck.valid) {
      setError(idCheck.message);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const profile = await registerPlatformDepartment(idCheck.id, {
        name: form.name.trim(),
        shortName: form.shortName.trim() || form.name.trim(),
        contactEmail: form.contactEmail.trim(),
        address: form.address.trim(),
        branchLabel: "Department Branch"
      }, { user });

      setForm(EMPTY_FORM);
      setIdTouched(false);
      onCreated?.(idCheck.id, profile);
      onMessage?.(`Created department branch: ${profile.name}`);
    } catch (createError) {
      console.error("Failed to create department branch", createError);
      setError(createError?.message || "Failed to create department. Check creator permissions and try again.");
      onMessage?.("Failed to create department branch");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`create-department-panel ${compact ? "create-department-panel-compact" : ""}`}>
      <header className="create-department-header">
        <div>
          <strong>{compact ? "Add department branch" : "Provision New Department Platform"}</strong>
          <span>Create a new agency branch with its own portal URL, profile, settings, and module controls.</span>
        </div>
      </header>

      <form className="workflow-form create-department-form" onSubmit={handleCreate}>
        <label>
          <span>Department name</span>
          <input
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Southaven Fire Department"
            required
          />
        </label>
        <label>
          <span>Short name</span>
          <input
            value={form.shortName}
            onChange={(event) => updateField("shortName", event.target.value)}
            placeholder="Southaven FD"
          />
        </label>
        <label>
          <span>Department ID (URL slug)</span>
          <input
            value={form.id}
            onChange={(event) => {
              setIdTouched(true);
              updateField("id", slugifyDepartmentId(event.target.value));
            }}
            placeholder="southaven-fd"
            required
          />
        </label>
        <label>
          <span>Contact email (optional)</span>
          <input
            type="email"
            value={form.contactEmail}
            onChange={(event) => updateField("contactEmail", event.target.value)}
            placeholder="admin@agency.org"
          />
        </label>
        <label className="create-department-wide">
          <span>Address (optional)</span>
          <input
            value={form.address}
            onChange={(event) => updateField("address", event.target.value)}
            placeholder="123 Main St, City, ST"
          />
        </label>
      </form>

      {gatewayPreview && (
        <p className="create-department-gateway-preview">
          Department portal:
          <button
            type="button"
            className="platform-brand-link-button"
            onClick={() => window.open(buildDepartmentGatewayUrl(validation.id), "_blank", "noopener,noreferrer")}
          >
            {gatewayPreview}
          </button>
          <ExternalLink size={13} />
        </p>
      )}

      {error && <p className="create-department-error">{error}</p>}

      <div className="platform-config-actions">
        <button className="primary-button" type="button" onClick={handleCreate} disabled={saving}>
          <CirclePlus size={14} /> {saving ? "Creating..." : "Create department platform"}
        </button>
      </div>

      <p className="auth-help">
        Sets up Firestore profile, settings, default roles, gateway route, registry entry, and creator access for your account.
      </p>
    </section>
  );
}
