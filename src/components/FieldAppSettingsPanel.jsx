/**
 * Admin → FORGE Field: settings for the offline field app.
 *  - General: app name and logo
 *  - Workflows: on/off and which roles get each one
 *  - Form fields: show / hide / require each field, for everyone or per role
 *  - Check-off lists: EMS unit and supply closet lists (items, par, expirations)
 *  - Check-off results: recent counts and what needs restocking
 *  - Plan updates: pre-fire plan updates sent from the field, for review
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import ObjectUploadField from "./ObjectUploadField.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { buildDepartmentLogoPath } from "../lib/storagePaths.js";
import { buildDepartmentGatewayPath } from "../lib/gatewayRouting.js";
import { canEditPreplans } from "../lib/inspections/inspectionPermissions.js";
import { normalizeRoleIds } from "../lib/permissions.js";
import {
  FIELD_FORMS,
  FIELD_MODES,
  FIELD_WORKFLOWS,
  normalizeFieldAppConfig,
  setFieldMode,
  setWorkflow,
} from "../field/fieldAppConfig.js";
import {
  CHECKOFF_FREQUENCIES,
  CHECKOFF_KINDS,
  STATUS_LABELS,
  newCheckoffItem,
  newCheckoffList,
  normalizeCheckoffList,
  validateCheckoffList,
} from "../field/checkoffModel.js";
import {
  archiveCheckoffList,
  listCheckoffLists,
  listPreplanFieldUpdates,
  listRecentCheckoffs,
  loadFieldAppConfig,
  markCheckoffRestocked,
  reviewPreplanFieldUpdate,
  saveCheckoffList,
  saveFieldAppConfig,
} from "../field/fieldAdminService.js";
import "./FieldAppSettingsPanel.css";

const TABS = [
  { id: "general", label: "General" },
  { id: "workflows", label: "Workflows" },
  { id: "fields", label: "Form fields" },
  { id: "lists", label: "Check-off lists" },
  { id: "results", label: "Check-off results" },
  { id: "updates", label: "Plan updates" },
];

const MODE_LABELS = { default: "Default", show: "Show", hide: "Hide", required: "Required" };

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Department admins (same rule as Firestore: fire chief, IT admin, department admin, creators). */
export function canConfigureFieldApp(membership, isCreator) {
  if (isCreator) return true;
  const roleIds = normalizeRoleIds(membership || {});
  return membership?.role === "department_admin" || roleIds.includes("fireChief") || roleIds.includes("itAdmin");
}

function RoleChips({ roles, value = [], onChange, disabled, emptyLabel = "Everyone" }) {
  const set = new Set(value);
  return (
    <div className="fa-admin-chips">
      <button type="button" className={`fa-admin-chip${!value.length ? " is-on" : ""}`} disabled={disabled} onClick={() => onChange([])}>{emptyLabel}</button>
      {roles.map((role) => (
        <button
          key={role.id}
          type="button"
          className={`fa-admin-chip${set.has(role.id) ? " is-on" : ""}`}
          disabled={disabled}
          onClick={() => {
            const next = new Set(set);
            if (next.has(role.id)) next.delete(role.id);
            else next.add(role.id);
            onChange([...next]);
          }}
        >
          {role.name || role.label || role.id}
        </button>
      ))}
    </div>
  );
}

function CheckoffListEditor({ list, onChange, onSave, onArchive, onCancel, saving, targets }) {
  const errors = validateCheckoffList(list);
  const setItem = (index, patch) => onChange({ ...list, items: list.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const move = (index, delta) => {
    const items = [...list.items];
    const [item] = items.splice(index, 1);
    items.splice(Math.max(0, Math.min(items.length, index + delta)), 0, item);
    onChange({ ...list, items });
  };
  return (
    <div className="fa-admin-card">
      <div className="workflow-form">
        <label><span>List name</span><input value={list.name} onChange={(e) => onChange({ ...list, name: e.target.value })} placeholder={list.kind === "supply" ? "e.g. Medical supply closet" : "e.g. ALS jump bag"} /></label>
        <label>
          <span>{list.kind === "supply" ? "Location" : "Unit"}</span>
          <input list="fa-admin-targets" value={list.target} onChange={(e) => onChange({ ...list, target: e.target.value })} placeholder={list.kind === "supply" ? "Station 1" : "Medic 1"} />
          <datalist id="fa-admin-targets">{targets.map((target) => <option key={target} value={target} />)}</datalist>
        </label>
        <label>
          <span>How often</span>
          <select value={list.frequency} onChange={(e) => onChange({ ...list, frequency: e.target.value })}>
            {CHECKOFF_FREQUENCIES.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
          </select>
        </label>
        <label className="permission-toggle permission-check">
          <input type="checkbox" checked={list.active} onChange={(e) => onChange({ ...list, active: e.target.checked })} /> Active (shows in the field app)
        </label>
      </div>
      <div className="fa-admin-table-wrap">
        <table className="fa-admin-table">
          <thead>
            <tr><th>Item</th><th>Category</th><th>Par</th><th>Unit</th><th>Expires?</th><th>Warn days</th><th>Required</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {list.items.map((item, index) => (
              <tr key={item.id}>
                <td><input value={item.name} onChange={(e) => setItem(index, { name: e.target.value })} placeholder="e.g. Epinephrine 1mg/mL" /></td>
                <td><input value={item.category} onChange={(e) => setItem(index, { category: e.target.value })} placeholder="e.g. Medications" /></td>
                <td><input type="number" min="0" value={item.par} onChange={(e) => setItem(index, { par: e.target.value })} className="fa-admin-num" /></td>
                <td><input value={item.unit} onChange={(e) => setItem(index, { unit: e.target.value })} placeholder="ea" className="fa-admin-num" /></td>
                <td className="fa-admin-center"><input type="checkbox" checked={item.tracksExpiration} onChange={(e) => setItem(index, { tracksExpiration: e.target.checked })} aria-label="Tracks expiration" /></td>
                <td><input type="number" min="1" value={item.warnDays} disabled={!item.tracksExpiration} onChange={(e) => setItem(index, { warnDays: e.target.value })} className="fa-admin-num" /></td>
                <td className="fa-admin-center"><input type="checkbox" checked={item.required} onChange={(e) => setItem(index, { required: e.target.checked })} aria-label="Required" /></td>
                <td className="fa-admin-actions">
                  <button type="button" className="ghost-button icon-button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={14} /></button>
                  <button type="button" className="ghost-button icon-button" onClick={() => move(index, 1)} disabled={index === list.items.length - 1} aria-label="Move down"><ArrowDown size={14} /></button>
                  <button type="button" className="ghost-button icon-button danger" onClick={() => onChange({ ...list, items: list.items.filter((_, i) => i !== index) })} aria-label="Remove item"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fa-admin-row">
        <button type="button" className="secondary-button" onClick={() => onChange({ ...list, items: [...list.items, newCheckoffItem({ category: list.items[list.items.length - 1]?.category || "" })] })}><Plus size={14} /> Add item</button>
        <span className="hint-text">{Object.values(errors)[0] || `${list.items.filter((item) => item.name.trim()).length} items`}</span>
        <span className="fa-admin-spacer" />
        {onArchive ? <button type="button" className="ghost-button danger" onClick={onArchive} disabled={saving}>Archive list</button> : null}
        <button type="button" className="ghost-button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="button" className="primary-button" onClick={onSave} disabled={saving || Object.keys(errors).length > 0}><Save size={14} /> Save list</button>
      </div>
    </div>
  );
}

export default function FieldAppSettingsPanel({ onMessage, apparatus = [] }) {
  const { departmentId, profile } = useTenant();
  const { membership, isCreator, rolesById, permissions, user } = useAuth();
  const canConfigure = canConfigureFieldApp(membership, isCreator);
  const canReviewPlans = canConfigure || canEditPreplans(permissions, isCreator);
  const actor = { actorUid: user?.uid || "", actorName: membership?.displayName || user?.email || "Admin" };
  const roles = useMemo(() => Object.values(rolesById || {}).filter((role) => role.id !== "creator").sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))), [rolesById]);
  const [tab, setTab] = useState("general");
  const [config, setConfig] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FIELD_FORMS[0].key);
  const [roleView, setRoleView] = useState("");
  const [lists, setLists] = useState([]);
  const [editing, setEditing] = useState(null);
  const [results, setResults] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [loadError, setLoadError] = useState("");

  const targets = useMemo(() => {
    const units = apparatus.map((item) => item.unit || item.name || item.id).filter(Boolean);
    const stations = Array.isArray(profile?.stations) ? profile.stations.map((station) => station?.name || station).filter(Boolean) : [];
    return [...new Set([...units, ...stations])];
  }, [apparatus, profile?.stations]);

  async function reload() {
    if (!departmentId) return;
    setLoadError("");
    try {
      const [nextConfig, nextLists, nextResults, nextUpdates] = await Promise.all([
        loadFieldAppConfig(departmentId),
        listCheckoffLists(departmentId).catch(() => []),
        listRecentCheckoffs(departmentId).catch(() => []),
        listPreplanFieldUpdates(departmentId).catch(() => []),
      ]);
      setConfig(nextConfig);
      setLists(nextLists);
      setResults(nextResults);
      setUpdates(nextUpdates);
      setDirty(false);
    } catch (error) {
      setLoadError(error?.message || "Couldn't load FORGE Field settings.");
    }
  }

  useEffect(() => {
    reload();
  }, [departmentId]);

  function change(next) {
    setConfig(normalizeFieldAppConfig(next));
    setDirty(true);
  }

  async function saveConfig() {
    setSaving(true);
    try {
      const saved = await saveFieldAppConfig(departmentId, config, actor);
      setConfig(normalizeFieldAppConfig(saved));
      setDirty(false);
      onMessage?.("FORGE Field settings saved — phones pick them up on their next update");
    } catch (error) {
      onMessage?.(error?.code === "permission-denied" ? "Only department administrators can change FORGE Field settings." : `Save failed: ${error?.message || error}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveList() {
    setSaving(true);
    try {
      await saveCheckoffList(departmentId, normalizeCheckoffList(editing), actor);
      setEditing(null);
      setLists(await listCheckoffLists(departmentId));
      onMessage?.("Check-off list saved");
    } catch (error) {
      onMessage?.(error?.code === "permission-denied" ? "Only department administrators can change check-off lists." : `Save failed: ${error?.message || error}`);
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return <div className="fa-admin">{loadError ? <p className="auth-help">{loadError}</p> : <p className="hint-text">Loading FORGE Field settings…</p>}</div>;
  }

  const formDef = FIELD_FORMS.find((row) => row.key === form) || FIELD_FORMS[0];
  const fieldAppUrl = `${buildDepartmentGatewayPath(departmentId).replace(/\/$/, "")}/field`;
  const restockOpen = results.filter((row) => row.restockNeeded && !row.restockedAt);
  const pendingUpdates = updates.filter((row) => row.status === "pending");

  return (
    <div className="fa-admin">
      <div className="department-config-nav" role="tablist" aria-label="FORGE Field settings">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`admin-section-pill department-config-pill${tab === item.id ? " is-open" : ""}`} onClick={() => setTab(item.id)}>
            <span>
              {item.label}
              {item.id === "results" && restockOpen.length ? ` (${restockOpen.length})` : ""}
              {item.id === "updates" && pendingUpdates.length ? ` (${pendingUpdates.length})` : ""}
            </span>
          </button>
        ))}
        <span className="fa-admin-spacer" />
        <a className="ghost-button" href={fieldAppUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open FORGE Field</a>
      </div>

      {!canConfigure && ["general", "workflows", "fields", "lists"].includes(tab) ? (
        <p className="auth-help">Only department administrators (Fire Chief, IT Admin, Department Admin) can change these settings.</p>
      ) : null}

      {["general", "workflows", "fields"].includes(tab) ? (
        <div className="fa-admin-savebar">
          <span className="hint-text">{dirty ? "Unsaved changes" : config.updatedAt ? `Saved ${formatWhen(config.updatedAt)}${config.updatedBy ? ` by ${config.updatedBy}` : ""}` : "Using defaults"}</span>
          <button type="button" className="primary-button" disabled={!canConfigure || !dirty || saving} onClick={saveConfig}><Save size={14} /> {saving ? "Saving…" : "Save settings"}</button>
        </div>
      ) : null}

      {tab === "general" ? (
        <div className="workflow-form">
          <label><span>App name (shown under the department name)</span><input value={config.appName} disabled={!canConfigure} onChange={(e) => change({ ...config, appName: e.target.value })} placeholder="FORGE Field" /></label>
          <div className="wide-field" style={{ display: "grid", gap: "10px" }}>
            <span>Field app logo</span>
            <ObjectUploadField
              variant="logo"
              label="Upload field app logo"
              hint="Square PNG or JPG works best. Leave empty to use the department logo."
              previewUrl={config.logoUrl || profile?.logoUrl || ""}
              previewAlt="Field app logo"
              buildPath={(file) => buildDepartmentLogoPath(departmentId, `field-app-${Date.now()}-${file.name}`)}
              onUploaded={(uploaded) => {
                change({ ...config, logoUrl: uploaded.downloadUrl, logoStoragePath: uploaded.storagePath });
                onMessage?.("Logo uploaded — save settings to apply");
              }}
              disabled={!canConfigure || saving}
            />
            {config.logoUrl ? <button type="button" className="ghost-button" disabled={!canConfigure} onClick={() => change({ ...config, logoUrl: "", logoStoragePath: "" })}>Use the department logo instead</button> : null}
          </div>
          <p className="hint-text wide-field">Crews open FORGE Field at <strong>{fieldAppUrl}</strong> on their phone and can add it to the home screen. Settings reach phones the next time they update (on open with signal, every 20 minutes, or Update on the home screen).</p>
        </div>
      ) : null}

      {tab === "workflows" ? (
        <div className="fa-admin-table-wrap">
          <table className="fa-admin-table">
            <thead><tr><th>Workflow</th><th>On</th><th>Who gets it (still needs the matching permission)</th></tr></thead>
            <tbody>
              {FIELD_WORKFLOWS.map((workflow) => {
                const entry = config.workflows[workflow.key] || {};
                const enabled = entry.enabled !== false;
                return (
                  <tr key={workflow.key}>
                    <td><strong>{workflow.label}</strong>{workflow.hint ? <div className="hint-text">{workflow.hint}</div> : null}</td>
                    <td className="fa-admin-center"><input type="checkbox" checked={enabled} disabled={!canConfigure} onChange={(e) => change(setWorkflow(config, workflow.key, { enabled: e.target.checked }))} aria-label={`${workflow.label} on`} /></td>
                    <td>
                      <RoleChips roles={roles} value={entry.roles || []} disabled={!canConfigure || !enabled} onChange={(value) => change(setWorkflow(config, workflow.key, { roles: value }))} />
                      {workflow.hasEditRoles ? (
                        <div className="fa-admin-subrow">
                          <span className="hint-text">Can create &amp; edit plans:</span>
                          <RoleChips roles={roles} value={entry.editRoles || []} disabled={!canConfigure || !enabled} emptyLabel="Use pre-plan permissions" onChange={(value) => change(setWorkflow(config, workflow.key, { editRoles: value }))} />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "fields" ? (
        <div className="fa-admin-fields">
          <div className="workflow-form">
            <label>
              <span>Form</span>
              <select value={form} onChange={(e) => setForm(e.target.value)}>
                {FIELD_FORMS.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
              </select>
            </label>
            <label>
              <span>Settings for</span>
              <select value={roleView} onChange={(e) => setRoleView(e.target.value)}>
                <option value="">Everyone (department default)</option>
                {roles.map((role) => <option key={role.id} value={role.id}>Role: {role.name || role.id}</option>)}
              </select>
            </label>
          </div>
          <p className="hint-text">{roleView ? "Role settings override the department default for people with this role. If someone has several roles, the most visible setting wins (Required, then Show, then Hide)." : "Required fields must be filled before a crew can save. Fields the record can't be saved without (like the hydrant or the date) are always required and aren't listed."}</p>
          <div className="fa-admin-table-wrap">
            <table className="fa-admin-table">
              <thead><tr><th>Field</th>{(roleView ? ["default", ...FIELD_MODES] : ["default", ...FIELD_MODES]).map((mode) => <th key={mode} className="fa-admin-center">{roleView && mode === "default" ? "Same as everyone" : MODE_LABELS[mode]}</th>)}</tr></thead>
              <tbody>
                {formDef.fields.map((field) => {
                  const entry = config.fields?.[form]?.[field.key] || {};
                  const current = roleView ? (entry.roles?.[roleView] || "default") : (entry.mode || "default");
                  return (
                    <tr key={field.key}>
                      <td>{field.label}</td>
                      {["default", ...FIELD_MODES].map((mode) => (
                        <td key={mode} className="fa-admin-center">
                          <input
                            type="radio"
                            name={`${form}:${field.key}:${roleView}`}
                            checked={current === mode}
                            disabled={!canConfigure}
                            onChange={() => change(setFieldMode(config, form, field.key, mode, roleView))}
                            aria-label={`${field.label}: ${MODE_LABELS[mode]}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint-text">Truck check items come from Fleet → Configuration Studio templates, and inspection items from inspection templates.</p>
        </div>
      ) : null}

      {tab === "lists" ? (
        <div className="fa-admin-lists">
          {editing ? (
            <CheckoffListEditor
              list={editing}
              onChange={setEditing}
              onSave={saveList}
              onCancel={() => setEditing(null)}
              onArchive={lists.some((row) => row.id === editing.id) ? async () => {
                setSaving(true);
                try {
                  await archiveCheckoffList(departmentId, editing.id, actor);
                  setEditing(null);
                  setLists(await listCheckoffLists(departmentId));
                } finally {
                  setSaving(false);
                }
              } : null}
              saving={saving}
              targets={targets}
            />
          ) : (
            <>
              <div className="fa-admin-row">
                {CHECKOFF_KINDS.map((kind) => (
                  <button key={kind.value} type="button" className="secondary-button" disabled={!canConfigure} onClick={() => setEditing(newCheckoffList(kind.value))}><Plus size={14} /> New {kind.value === "ems" ? "EMS unit" : "supply closet"} list</button>
                ))}
              </div>
              {!lists.length ? <p className="hint-text">No check-off lists yet. Build one for each EMS unit (jump bag, drug box, monitor) and each supply closet.</p> : null}
              <div className="fa-admin-table-wrap">
                <table className="fa-admin-table">
                  <thead><tr><th>Type</th><th>Unit / location</th><th>List</th><th>Items</th><th>How often</th><th>Status</th></tr></thead>
                  <tbody>
                    {lists.map((list) => (
                      <tr key={list.id} className="fa-admin-click" onClick={() => canConfigure && setEditing(list)}>
                        <td>{list.kind === "supply" ? "Supply closet" : "EMS unit"}</td>
                        <td>{list.target}</td>
                        <td><strong>{list.name}</strong></td>
                        <td>{list.items.length}{list.items.some((item) => item.tracksExpiration) ? ` · ${list.items.filter((item) => item.tracksExpiration).length} with expirations` : ""}</td>
                        <td>{CHECKOFF_FREQUENCIES.find((row) => row.value === list.frequency)?.label || "As needed"}</td>
                        <td>{list.active ? "Active" : "Archived"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === "results" ? (
        <div className="fa-admin-results">
          <div className="fa-admin-row">
            <span className="hint-text">{restockOpen.length ? `${restockOpen.length} check-off${restockOpen.length === 1 ? "" : "s"} need restocking` : "Nothing waiting to be restocked"}</span>
            <span className="fa-admin-spacer" />
            <button type="button" className="ghost-button" onClick={reload}><RefreshCw size={14} /> Refresh</button>
          </div>
          {results.slice(0, 80).map((row) => (
            <div key={row.id} className={`fa-admin-card${row.restockNeeded && !row.restockedAt ? " is-alert" : ""}`}>
              <div className="fa-admin-row">
                <strong>{row.target} · {row.listName}</strong>
                <span className="hint-text">{formatWhen(row.performedAt)} · {row.performedBy}{row.shift ? ` · ${row.shift}` : ""}</span>
                <span className="fa-admin-spacer" />
                <span className={`fa-admin-badge${row.restockNeeded && !row.restockedAt ? " is-alert" : ""}`}>{row.restockedAt ? `Restocked ${formatWhen(row.restockedAt)}` : row.result}</span>
                {row.restockNeeded && !row.restockedAt && canConfigure ? (
                  <button type="button" className="secondary-button" onClick={async () => { await markCheckoffRestocked(departmentId, row.id, actor); setResults(await listRecentCheckoffs(departmentId)); }}>Mark restocked</button>
                ) : null}
              </div>
              {(row.restock || []).length ? (
                <ul className="fa-admin-restock">
                  {row.restock.map((item) => <li key={item.itemId}><strong>{item.need}{item.unit ? ` ${item.unit}` : ""}</strong> {item.name} ({STATUS_LABELS[item.reason]?.toLowerCase() || item.reason})</li>)}
                </ul>
              ) : null}
              {(row.items || []).some((item) => item.status === "expiring") ? (
                <p className="hint-text">Expiring soon: {row.items.filter((item) => item.status === "expiring").map((item) => `${item.name} (${item.expiration})`).join(", ")}</p>
              ) : null}
              {row.notes ? <p className="hint-text">Note: {row.notes}</p> : null}
            </div>
          ))}
          {!results.length ? <p className="hint-text">No check-offs yet.</p> : null}
        </div>
      ) : null}

      {tab === "updates" ? (
        <div className="fa-admin-results">
          <div className="fa-admin-row">
            <span className="hint-text">{pendingUpdates.length ? `${pendingUpdates.length} update${pendingUpdates.length === 1 ? "" : "s"} waiting for review. Edit the plan in Pre-fire Plans, then mark the update reviewed.` : "No updates waiting."}</span>
            <span className="fa-admin-spacer" />
            <button type="button" className="ghost-button" onClick={reload}><RefreshCw size={14} /> Refresh</button>
          </div>
          {updates.slice(0, 100).map((row) => (
            <div key={row.id} className={`fa-admin-card${row.status === "pending" ? " is-alert" : ""}`}>
              <div className="fa-admin-row">
                <strong>{row.planName || row.address}</strong>
                <span className="hint-text">{row.section ? `${row.section} · ` : ""}{formatWhen(row.submittedAt)} · {row.submittedBy}</span>
                <span className="fa-admin-spacer" />
                <span className={`fa-admin-badge${row.status === "pending" ? " is-alert" : ""}`}>{row.status === "pending" ? "Waiting for review" : `${row.status === "applied" ? "Reviewed" : "Dismissed"} by ${row.reviewedBy || "—"}`}</span>
              </div>
              <p className="fa-admin-note">{row.note}</p>
              {(row.photos || []).length ? (
                <div className="fa-admin-photos">{row.photos.map((photo) => <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.name || "Photo"} /></a>)}</div>
              ) : null}
              {row.status === "pending" && canReviewPlans ? (
                <div className="fa-admin-row">
                  <button type="button" className="primary-button" onClick={async () => { await reviewPreplanFieldUpdate(departmentId, row.id, "applied", actor); setUpdates(await listPreplanFieldUpdates(departmentId)); }}>Mark reviewed (plan updated)</button>
                  <button type="button" className="ghost-button" onClick={async () => { await reviewPreplanFieldUpdate(departmentId, row.id, "dismissed", actor); setUpdates(await listPreplanFieldUpdates(departmentId)); }}>Dismiss</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
