import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CirclePlus,
  DollarSign,
  Flame,
  MapPin,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import {
  canCreatePreplans,
  canEditInspectionsModule,
  canViewFireProtectionSystems,
  canViewInspectionFees,
  canViewInspectionsModule,
  deleteOccupancyRecord,
  ensureOccupancyRecords,
  filterOccupancyRecords,
  normalizeOccupancyRecord,
  saveOccupancyRecord,
} from "../lib/inspections/index.js";

const EMPTY_DRAFT = {
  name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  occupancyType: "Business",
  hazard: "Low",
  occupancyLoad: "",
  status: "Active",
  inspector: "",
  lastInspectionAt: "",
  nextInspectionDueAt: "",
  constructionType: "",
  sprinkler: "",
  alarm: "",
  knoxBox: "",
  notes: "",
  contacts: [],
  timeline: [],
};

function Field({ label, children }) {
  return (
    <label className="occupancy-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function OccupanciesMasterPage({
  query = "",
  legacyRecords = [],
  onRecordsChange,
  onNavigate,
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const canView = canViewInspectionsModule(permissions, isCreator);
  const canEdit = canEditInspectionsModule(permissions, isCreator);
  const canCreatePreplan = canCreatePreplans(permissions, isCreator);
  const canViewFps = canViewFireProtectionSystems(permissions, isCreator);
  const canViewFees = canViewInspectionFees(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [localSearch, setLocalSearch] = useState("");

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!departmentId || !canView) {
        if (!cancelled) {
          setLoading(false);
          setRecords([]);
        }
        return;
      }
      setLoading(true);
      setError("");
      try {
        const next = await ensureOccupancyRecords(departmentId, legacyRecords, actor);
        if (cancelled) return;
        setRecords(next);
        onRecordsChange?.(next);
        setSelectedId((current) => current || next[0]?.id || "");
      } catch (loadError) {
        if (cancelled) return;
        console.error("Failed to load occupancies", loadError);
        setError(loadError?.message || "Unable to load occupancies.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // legacyRecords used only as migration fallback on empty collection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, canView]);

  const selected = useMemo(
    () => records.find((row) => row.id === selectedId) || null,
    [records, selectedId]
  );

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(normalizeOccupancyRecord(selected, departmentId));
    setMessage("");
  }, [selected, departmentId]);

  const searchNeedle = localSearch || query;
  const visible = useMemo(
    () => filterOccupancyRecords(records, searchNeedle),
    [records, searchNeedle]
  );

  const summary = useMemo(() => ({
    total: records.length,
    high: records.filter((row) => /high|immediate/i.test(String(row.hazard || row.riskLevel))).length,
    due: records.filter((row) => /due|pending|reinspection/i.test(String(row.status))).length,
    active: records.filter((row) => /active/i.test(String(row.status))).length,
  }), [records]);

  function updateDraft(field, value) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function updateContact(index, field, value) {
    setDraft((current) => {
      if (!current) return current;
      const contacts = [...(current.contacts || [])];
      contacts[index] = { ...contacts[index], [field]: value };
      if (field === "isPrimary" && value) {
        contacts.forEach((contact, i) => {
          contacts[i] = { ...contact, isPrimary: i === index };
        });
      }
      return { ...current, contacts };
    });
  }

  function addContact() {
    setDraft((current) => {
      if (!current) return current;
      const contacts = [...(current.contacts || [])];
      contacts.push({
        id: `contact-${Date.now()}`,
        name: "",
        role: "",
        phone: "",
        email: "",
        isPrimary: contacts.length === 0,
      });
      return { ...current, contacts };
    });
  }

  function removeContact(index) {
    setDraft((current) => {
      if (!current) return current;
      const contacts = (current.contacts || []).filter((_, i) => i !== index);
      if (contacts.length && !contacts.some((item) => item.isPrimary)) {
        contacts[0] = { ...contacts[0], isPrimary: true };
      }
      return { ...current, contacts };
    });
  }

  async function handleCreate() {
    if (!canEdit || !departmentId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await saveOccupancyRecord(
        departmentId,
        {
          ...EMPTY_DRAFT,
          name: "New Occupancy",
          address: "",
          contacts: [],
          timeline: [],
        },
        { ...actor, isNew: true }
      );
      const next = [created, ...records.filter((row) => row.id !== created.id)]
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setRecords(next);
      onRecordsChange?.(next);
      setSelectedId(created.id);
      setMessage("Occupancy created.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to create occupancy.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!canEdit || !departmentId || !draft?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveOccupancyRecord(departmentId, draft, { ...actor, isNew: false });
      const next = records
        .map((row) => (row.id === saved.id ? saved : row))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setRecords(next);
      onRecordsChange?.(next);
      setDraft(saved);
      setMessage("Occupancy saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save occupancy.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!canEdit || !departmentId || !draft?.id) return;
    if (!window.confirm(`Delete occupancy "${draft.name}"? This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await deleteOccupancyRecord(departmentId, draft.id, actor);
      const next = records.filter((row) => row.id !== draft.id);
      setRecords(next);
      onRecordsChange?.(next);
      setSelectedId(next[0]?.id || "");
      setMessage("Occupancy deleted.");
    } catch (deleteError) {
      setError(deleteError?.message || "Unable to delete occupancy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InspectionPermissionGate allowed={canView} loading={false}>
      <div className="module-page occupancy-master-page">
        <section className="module-heading">
          <div>
            <span className="module-icon"><Archive size={22} /></span>
            <div>
              <h1>Occupancies</h1>
              <p>Property occupancy master records with contacts, risk, and inspection history.</p>
            </div>
          </div>
          {canEdit ? (
            <button className="primary-button" type="button" onClick={handleCreate} disabled={saving || loading}>
              <CirclePlus size={14} /> Add Occupancy
            </button>
          ) : null}
        </section>

        <div className="occupancy-summary-grid">
          {[
            ["Occupancies", summary.total],
            ["High hazard", summary.high],
            ["Due / pending", summary.due],
            ["Active", summary.active],
          ].map(([label, value]) => (
            <article key={label} className="occupancy-summary-card">
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>

        <label className="occupancy-search">
          <span>Search occupancies</span>
          <input
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Name, address, contact, hazard..."
          />
        </label>

        {loading ? (
          <div className="inspections-loading-state" role="status"><p>Loading occupancies...</p></div>
        ) : null}

        {!loading && error ? (
          <div className="inspections-error-state" role="alert">
            <strong>Unable to load occupancies</strong>
            <p>{error}</p>
          </div>
        ) : null}

        {!loading && !error && !records.length ? (
          <InspectionEmptyState
            title="No occupancy records"
            description="Add an occupancy or migrate from the classic list. Migration runs automatically when the master collection is empty."
            icon={Archive}
          />
        ) : null}

        {!loading && !error && records.length ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><Archive size={15} /><strong>Occupancy Registry</strong></div>
                <span className="inspections-count">{visible.length}</span>
              </header>
              <div className="panel-body">
                <div className="personnel-list">
                  {visible.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selected?.id ? "person-row selected" : "person-row"}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.occupancyType || item.type} · {item.address || "No address"}</small>
                      </span>
                      <InspectionStatusBadge status={item.status} />
                    </button>
                  ))}
                  {!visible.length ? (
                    <p className="occupancy-muted">No occupancies match this search.</p>
                  ) : null}
                </div>
              </div>
            </section>

            {draft ? (
              <section className="panel occupancy-detail-panel">
                <header>
                  <div><ShieldCheck size={15} /><strong>Occupancy Detail</strong></div>
                  <div className="occupancy-detail-actions">
                    {canCreatePreplan && draft?.id ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          if (typeof sessionStorage !== "undefined") {
                            sessionStorage.setItem("forge-preplan-create-occupancy", draft.id);
                          }
                          onNavigate?.("New Preplan");
                        }}
                      >
                        <CirclePlus size={14} /> New Preplan
                      </button>
                    ) : null}
                    {canViewFps && draft?.id ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          if (typeof sessionStorage !== "undefined") {
                            sessionStorage.setItem("forge-fps-filter-occupancy", draft.id);
                          }
                          onNavigate?.("Fire Protection Systems");
                        }}
                      >
                        <Flame size={14} /> Fire protection systems
                      </button>
                    ) : null}
                    {canViewFees && draft?.id ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          if (typeof sessionStorage !== "undefined") {
                            sessionStorage.setItem("forge-fees-filter-occupancy", draft.id);
                          }
                          onNavigate?.("Fees & Payments");
                        }}
                      >
                        <DollarSign size={14} /> Fees & payments
                      </button>
                    ) : null}
                    {canEdit ? (
                      <>
                        <button className="secondary-button" type="button" onClick={handleDelete} disabled={saving}>
                          <Trash2 size={14} /> Delete
                        </button>
                        <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
                          <Save size={14} /> {saving ? "Saving..." : "Save"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </header>
                <div className="panel-body occupancy-detail-body">
                  {message ? <p className="occupancy-message">{message}</p> : null}

                  <div className="occupancy-form-grid">
                    <Field label="Name">
                      <input value={draft.name || ""} disabled={!canEdit} onChange={(e) => updateDraft("name", e.target.value)} />
                    </Field>
                    <Field label="Status">
                      <select value={draft.status || "Active"} disabled={!canEdit} onChange={(e) => updateDraft("status", e.target.value)}>
                        {["Active", "Pending Review", "Reinspection Due", "Inactive", "Vacant"].map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Address">
                      <input value={draft.address || ""} disabled={!canEdit} onChange={(e) => updateDraft("address", e.target.value)} />
                    </Field>
                    <Field label="City">
                      <input value={draft.city || ""} disabled={!canEdit} onChange={(e) => updateDraft("city", e.target.value)} />
                    </Field>
                    <Field label="State">
                      <input value={draft.state || ""} disabled={!canEdit} onChange={(e) => updateDraft("state", e.target.value)} />
                    </Field>
                    <Field label="ZIP">
                      <input value={draft.zip || ""} disabled={!canEdit} onChange={(e) => updateDraft("zip", e.target.value)} />
                    </Field>
                    <Field label="Occupancy type">
                      <input value={draft.occupancyType || ""} disabled={!canEdit} onChange={(e) => updateDraft("occupancyType", e.target.value)} />
                    </Field>
                    <Field label="Hazard / risk">
                      <select value={draft.hazard || "Low"} disabled={!canEdit} onChange={(e) => {
                        updateDraft("hazard", e.target.value);
                        updateDraft("riskLevel", e.target.value);
                      }}>
                        {["Low", "Moderate", "High", "Immediate"].map((level) => (
                          <option key={level}>{level}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Occupancy load">
                      <input value={draft.occupancyLoad || ""} disabled={!canEdit} onChange={(e) => updateDraft("occupancyLoad", e.target.value)} />
                    </Field>
                    <Field label="Assigned inspector">
                      <input value={draft.inspector || ""} disabled={!canEdit} onChange={(e) => updateDraft("inspector", e.target.value)} />
                    </Field>
                    <Field label="Last inspection">
                      <input value={draft.lastInspectionAt || ""} disabled={!canEdit} onChange={(e) => updateDraft("lastInspectionAt", e.target.value)} />
                    </Field>
                    <Field label="Inspection due">
                      <input value={draft.nextInspectionDueAt || ""} disabled={!canEdit} onChange={(e) => updateDraft("nextInspectionDueAt", e.target.value)} />
                    </Field>
                    <Field label="Construction">
                      <input value={draft.constructionType || ""} disabled={!canEdit} onChange={(e) => updateDraft("constructionType", e.target.value)} />
                    </Field>
                    <Field label="Sprinkler">
                      <input value={draft.sprinkler || ""} disabled={!canEdit} onChange={(e) => updateDraft("sprinkler", e.target.value)} />
                    </Field>
                    <Field label="Alarm">
                      <input value={draft.alarm || ""} disabled={!canEdit} onChange={(e) => updateDraft("alarm", e.target.value)} />
                    </Field>
                    <Field label="Knox box">
                      <input value={draft.knoxBox || ""} disabled={!canEdit} onChange={(e) => updateDraft("knoxBox", e.target.value)} />
                    </Field>
                    <Field label="Latitude">
                      <input
                        value={draft.latitude ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => updateDraft("latitude", e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Longitude">
                      <input
                        value={draft.longitude ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => updateDraft("longitude", e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </Field>
                  </div>

                  <Field label="Notes">
                    <textarea
                      rows={3}
                      value={draft.notes || ""}
                      disabled={!canEdit}
                      onChange={(e) => updateDraft("notes", e.target.value)}
                    />
                  </Field>

                  <section className="occupancy-section">
                    <header>
                      <div><Users size={15} /><strong>Contacts</strong></div>
                      {canEdit ? (
                        <button className="text-button" type="button" onClick={addContact}>Add contact</button>
                      ) : null}
                    </header>
                    {(draft.contacts || []).length === 0 ? (
                      <p className="occupancy-muted">No contacts on file.</p>
                    ) : (
                      <div className="occupancy-contacts">
                        {draft.contacts.map((contact, index) => (
                          <div key={contact.id || index} className="occupancy-contact-card">
                            <Field label="Name">
                              <input value={contact.name || ""} disabled={!canEdit} onChange={(e) => updateContact(index, "name", e.target.value)} />
                            </Field>
                            <Field label="Role">
                              <input value={contact.role || ""} disabled={!canEdit} onChange={(e) => updateContact(index, "role", e.target.value)} />
                            </Field>
                            <Field label="Phone">
                              <input value={contact.phone || ""} disabled={!canEdit} onChange={(e) => updateContact(index, "phone", e.target.value)} />
                            </Field>
                            <Field label="Email">
                              <input value={contact.email || ""} disabled={!canEdit} onChange={(e) => updateContact(index, "email", e.target.value)} />
                            </Field>
                            <label className="occupancy-primary-toggle">
                              <input
                                type="checkbox"
                                checked={Boolean(contact.isPrimary)}
                                disabled={!canEdit}
                                onChange={(e) => updateContact(index, "isPrimary", e.target.checked)}
                              />
                              Primary
                            </label>
                            {canEdit ? (
                              <button className="text-button" type="button" onClick={() => removeContact(index)}>Remove</button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="occupancy-section">
                    <header>
                      <div><MapPin size={15} /><strong>Timeline</strong></div>
                    </header>
                    {(draft.timeline || []).length === 0 ? (
                      <p className="occupancy-muted">No timeline events yet.</p>
                    ) : (
                      <ul className="occupancy-timeline">
                        {(draft.timeline || []).slice(0, 12).map((event) => (
                          <li key={event.id}>
                            <strong>{event.summary || event.type}</strong>
                            <small>
                              {event.at ? new Date(event.at).toLocaleString() : "—"}
                              {event.actorName ? ` · ${event.actorName}` : ""}
                            </small>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
      </div>
    </InspectionPermissionGate>
  );
}
