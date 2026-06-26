import { useMemo, useState } from "react";
import { CirclePlus, ExternalLink } from "lucide-react";
import { buildDepartmentGatewayUrl } from "../lib/gatewayRouting.js";
import {
  isLikelyDuplicateDepartmentName,
  slugifyDepartmentId,
  validateDepartmentId
} from "../lib/departmentProvisioning.js";
import { isValidUsZipCode } from "../lib/departmentBranchUtils.js";
import { registerPlatformDepartment } from "../lib/platformService.js";
import { defaultSubscriptionDates } from "../lib/subscriptionUtils.js";
import DepartmentStateSelect from "./DepartmentStateSelect.jsx";

const EMPTY_FORM = {
  id: "",
  name: "",
  shortName: "",
  stateId: "",
  contactEmail: "",
  address: "",
  city: "",
  zip: "",
  ...defaultSubscriptionDates(),
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

    const duplicate = isLikelyDuplicateDepartmentName(form.name.trim(), departments);
    if (duplicate) {
      setError(`"${form.name.trim()}" already exists as ${duplicate.shortName || duplicate.name} (/${duplicate.id}). Open that branch instead of creating a duplicate.`);
      return;
    }

    const idCheck = validateDepartmentId(form.id || form.name, existingIds);
    if (!idCheck.valid) {
      setError(idCheck.message);
      return;
    }

    if (!form.city.trim()) {
      setError("City is required.");
      return;
    }

    if (!form.zip.trim()) {
      setError("ZIP code is required.");
      return;
    }

    if (!isValidUsZipCode(form.zip)) {
      setError("Enter a valid ZIP code (12345 or 12345-6789).");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const profile = await registerPlatformDepartment(idCheck.id, {
        name: form.name.trim(),
        shortName: form.shortName.trim() || form.name.trim(),
        stateId: form.stateId.trim(),
        contactEmail: form.contactEmail.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        zip: form.zip.trim(),
        branchLabel: "Department Branch",
        subscription: {
          startDate: form.startDate,
          expirationDate: form.expirationDate,
        },
      }, { user });

      setIdTouched(false);
      setForm({ ...EMPTY_FORM, ...defaultSubscriptionDates() });
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
          <span>State ID</span>
          <DepartmentStateSelect
            value={form.stateId}
            onChange={(value) => updateField("stateId", value)}
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
          <span>Street address (optional)</span>
          <input
            value={form.address}
            onChange={(event) => updateField("address", event.target.value)}
            placeholder="123 Main St"
          />
        </label>
        <label>
          <span>City</span>
          <input
            value={form.city}
            onChange={(event) => updateField("city", event.target.value)}
            placeholder="Southaven"
            required
          />
        </label>
        <label>
          <span>ZIP code</span>
          <input
            value={form.zip}
            onChange={(event) => updateField("zip", event.target.value)}
            placeholder="38671"
            inputMode="numeric"
            required
          />
        </label>
        <label>
          <span>Subscription start date</span>
          <input
            type="date"
            value={form.startDate}
            onChange={(event) => updateField("startDate", event.target.value)}
            required
          />
        </label>
        <label>
          <span>Subscription expiration date</span>
          <input
            type="date"
            value={form.expirationDate}
            onChange={(event) => updateField("expirationDate", event.target.value)}
            required
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
