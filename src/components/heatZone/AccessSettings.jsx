import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Panel } from "../shell/ui.jsx";
import { setHeatZoneDistrictAccess } from "../../lib/heatZone/heatZoneService.js";
import { districtLabel, zoneOptions } from "../../lib/heatZone/heatZoneUi.js";
import MultiSelect from "./MultiSelect.jsx";
import SectionStatus from "./SectionStatus.jsx";

const sameSet = (a = [], b = []) => a.length === b.length && a.every((v) => b.includes(v));

/** Assign districts to members who do not have "View all districts". */
export default function AccessSettings({ departmentId, members = [], zones = [], status, run, onSaved }) {
  const [drafts, setDrafts] = useState({});
  const [query, setQuery] = useState("");
  const busy = Boolean(status?.busy);
  const options = useMemo(() => zoneOptions(zones, "district"), [zones]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((m) => `${m.name} ${m.email} ${m.role}`.toLowerCase().includes(q)) : members;
  }, [members, query]);

  const save = (member) => run(async () => {
    const ids = drafts[member.uid] ?? member.districtIds;
    const res = await setHeatZoneDistrictAccess(departmentId, member.uid, ids);
    onSaved(member.uid, res.districtIds || ids);
    setDrafts((prev) => { const next = { ...prev }; delete next[member.uid]; return next; });
    const names = (res.districtIds || ids).map((id) => districtLabel(zones, id));
    return `${member.name || member.email}: ${names.length ? names.join(", ") : "no districts"}.`;
  });

  return (
    <Panel title="District access" icon={Users}>
      <p className="hz-panel-note">
        Members with the “View all districts” permission (and Heat Zone managers) see every district regardless of what is set here.
        Everyone else sees only the districts assigned below — a member with no districts assigned sees no incidents.
      </p>
      <SectionStatus status={status} />
      {members.length > 8 && (
        <div className="hz-form">
          <label className="config-field">
            <span>Find member</span>
            <input type="search" className="hz-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email or role" />
          </label>
        </div>
      )}
      <div className="data-table-wrap">
        <table className="hz-table">
          <thead><tr><th>Member</th><th>Role</th><th>Districts</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {shown.map((m) => {
              const value = drafts[m.uid] ?? m.districtIds;
              const dirty = !sameSet(value, m.districtIds);
              return (
                <tr key={m.uid}>
                  <td className="hz-wrap"><strong>{m.name || m.email || m.uid}</strong>{m.name && m.email ? <span className="hz-muted"> · {m.email}</span> : null}</td>
                  <td>{m.role || "—"}</td>
                  <td>
                    <MultiSelect label="Districts" options={options} value={value} disabled={busy} emptyText="No districts configured" onChange={(next) => setDrafts((prev) => ({ ...prev, [m.uid]: next }))} />
                  </td>
                  <td className="hz-row-actions">
                    {dirty && (
                      <>
                        <button type="button" className="primary-button hz-button" disabled={busy} onClick={() => save(m)}>Save</button>
                        <button type="button" className="text-button" disabled={busy} onClick={() => setDrafts((prev) => { const next = { ...prev }; delete next[m.uid]; return next; })}>Cancel</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <div className="empty-table">{members.length ? "No members match." : "No active members."}</div>}
      </div>
    </Panel>
  );
}
