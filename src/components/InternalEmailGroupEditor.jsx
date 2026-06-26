import { useMemo, useState } from "react";
import { Check, CirclePlus, Trash2 } from "lucide-react";
import { slugifyGroupId } from "../lib/internalEmailRecipients.js";

export default function InternalEmailGroupEditor({
  groups = [],
  memberOptions = [],
  onChange,
  disabled = false,
}) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftMembers, setDraftMembers] = useState([]);
  const individualOptions = useMemo(
    () => memberOptions.filter((option) => (
      option.token.startsWith("person:") || option.token.startsWith("user:")
    )),
    [memberOptions]
  );

  function toggleDraftMember(token) {
    setDraftMembers((current) => (
      current.includes(token)
        ? current.filter((item) => item !== token)
        : [...current, token]
    ));
  }

  function addGroup() {
    const label = draftLabel.trim();
    if (!label || !draftMembers.length) return;

    const id = slugifyGroupId(label);
    const nextGroup = { id, label, members: [...draftMembers] };
    const existingIndex = groups.findIndex((group) => group.id === id);
    const nextGroups = existingIndex >= 0
      ? groups.map((group, index) => (index === existingIndex ? nextGroup : group))
      : [...groups, nextGroup];

    onChange?.(nextGroups);
    setDraftLabel("");
    setDraftMembers([]);
  }

  function removeGroup(groupId) {
    onChange?.(groups.filter((group) => group.id !== groupId));
  }

  return (
    <section className="internal-email-group-editor">
      <strong>Custom distribution groups</strong>
      <p className="auth-help">Create reusable groups that appear in the To dropdown for this department.</p>

      {groups.map((group) => (
        <div key={group.id} className="internal-email-group-row">
          <div>
            <strong>{group.label}</strong>
            <span>{group.members?.length || 0} members</span>
          </div>
          {!disabled && (
            <button type="button" className="text-button" onClick={() => removeGroup(group.id)}>
              <Trash2 size={13} /> Remove
            </button>
          )}
        </div>
      ))}

      {!disabled && (
        <div className="internal-email-group-form">
          <label>
            <span>Group name</span>
            <input
              value={draftLabel}
              onChange={(event) => setDraftLabel(event.target.value)}
              placeholder="Training officers"
            />
          </label>
          <div className="internal-email-group-members">
            <span>Members</span>
            <div className="internal-email-group-member-list">
              {individualOptions.map((option) => (
                <label key={option.token} className="permission-toggle permission-check">
                  <input
                    type="checkbox"
                    checked={draftMembers.includes(option.token)}
                    onChange={() => toggleDraftMember(option.token)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={addGroup}
            disabled={!draftLabel.trim() || !draftMembers.length}
          >
            <CirclePlus size={14} /> Save group
          </button>
        </div>
      )}

      {groups.length > 0 && (
        <p className="auth-help">
          <Check size={13} /> Custom groups are saved with department settings when you send a message or use Save groups.
        </p>
      )}
    </section>
  );
}
