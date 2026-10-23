import { useState } from "react";
import { Check, X } from "lucide-react";

export default function CreateRoleModal({
  roles = [],
  onClose,
  onCreate,
  creating = false,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cloneFromRoleId, setCloneFromRoleId] = useState("readOnly");
  const templateOptions = roles.filter((role) => role.id !== "creator");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    await onCreate?.({
      name: name.trim(),
      description: description.trim(),
      cloneFromRoleId,
    });
  }

  return (
    <div className="modal-backdrop">
      <section className="workflow-modal role-create-modal">
        <header>
          <strong>Create custom role</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <form className="modal-content" onSubmit={handleSubmit}>
          <div className="workflow-form">
            <label>
              <span>Role name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Captain, Training Officer, etc."
                autoFocus
                required
              />
            </label>
            <label className="wide-field">
              <span>Description</span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this role is for"
              />
            </label>
            <label>
              <span>Start from permissions of</span>
              <select
                value={cloneFromRoleId}
                onChange={(event) => setCloneFromRoleId(event.target.value)}
              >
                {templateOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name || role.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="auth-help">
            Custom roles appear in user assignment lists after creation. Adjust permissions below, then assign users under Permissions → Users.
          </p>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={creating}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={creating || !name.trim()}>
              <Check size={14} /> {creating ? "Creating..." : "Create role"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
