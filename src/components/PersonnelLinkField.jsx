import { ExternalLink } from "lucide-react";
import { getPersonDisplayName } from "../lib/personnelSchema.js";

export default function PersonnelLinkField({
  value = "",
  onChange,
  personnel = [],
  disabled = false,
  onOpenPersonnelProfile,
  onOpenEmployeeProfile,
}) {
  const linkedPerson = personnel.find((person) => person.id === value) || null;

  return (
    <div className="personnel-link-field">
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="">No personnel linked</option>
        {personnel.map((person) => (
          <option key={person.id} value={person.id}>
            {getPersonDisplayName(person) || person.id} ({person.id})
          </option>
        ))}
        {value && !linkedPerson ? (
          <option value={value}>{value}</option>
        ) : null}
      </select>

      {linkedPerson ? (
        <div className="personnel-link-actions">
          {onOpenPersonnelProfile ? (
            <button
              type="button"
              className="link-button personnel-link-action"
              onClick={() => onOpenPersonnelProfile(linkedPerson.id)}
            >
              <ExternalLink size={13} />
              Open personnel profile
            </button>
          ) : null}
          {onOpenEmployeeProfile ? (
            <button
              type="button"
              className="link-button personnel-link-action"
              onClick={() => onOpenEmployeeProfile(linkedPerson.id)}
            >
              <ExternalLink size={13} />
              View employee portal profile
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
