import { useEffect, useMemo, useState } from "react";
import { CirclePlus, Save } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import HydrantDamageModuleLayout, {
  HydrantDamagePermissionGate,
} from "../components/hydrants/HydrantDamageModuleLayout.jsx";
import {
  canManageWaterCompanies,
  canViewWaterCompanies,
  listWaterCompanies,
  listWaterCompanyContacts,
  saveWaterCompany,
  saveWaterCompanyContact,
  WATER_CONTACT_TYPES,
  WATER_UTILITY_TYPES,
} from "../lib/hydrantDamage/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const EMPTY_COMPANY = {
  legalName: "",
  dba: "",
  utilityType: "municipal",
  mainAddress: "",
  mainPhone: "",
  emergencyPhone: "",
  afterHoursPhone: "",
  generalEmail: "",
  damageReportEmail: "",
  emergencyEmail: "",
  maintenanceEmail: "",
  engineeringEmail: "",
  gisEmail: "",
  businessHours: "",
  acknowledgmentSlaMinutes: 240,
  emergencyResponseSlaMinutes: 60,
  normalRepairSlaHours: 72,
  preferredSubjectFormat: "Hydrant Damage Report {reportNumber} — {hydrantId}",
  portalEnabled: false,
  active: true,
  internalNotes: "",
};

export default function WaterCompanyDirectoryPage({ onNavigate }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewWaterCompanies(permissions, isCreator);
  const canManage = canManageWaterCompanies(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [contactDraft, setContactDraft] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    contactType: "primary",
    receivesRoutineReports: true,
    receivesUrgentReports: false,
    receivesOutOfServiceReports: false,
    receivesEscalation: false,
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextCompanies, nextContacts] = await Promise.all([
        listWaterCompanies(departmentId),
        listWaterCompanyContacts(departmentId),
      ]);
      setCompanies(nextCompanies);
      setContacts(nextContacts);
      setSelectedId((current) => current || nextCompanies[0]?.id || "");
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load water companies.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  useEffect(() => {
    const selected = companies.find((row) => row.id === selectedId) || null;
    setDraft(selected ? { ...selected } : null);
  }, [companies, selectedId]);

  const companyContacts = useMemo(
    () => contacts.filter((row) => row.waterCompanyId === selectedId && row.active !== false),
    [contacts, selectedId]
  );

  async function handleCreate() {
    if (!canManage) return;
    setDraft({ ...EMPTY_COMPANY });
    setSelectedId("");
    setMessage("Enter company details and save.");
  }

  async function handleSave() {
    if (!canManage || !draft) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveWaterCompany(departmentId, draft, actor);
      setCompanies((current) => {
        const rest = current.filter((row) => row.id !== saved.id);
        return [saved, ...rest].sort((a, b) => a.legalName.localeCompare(b.legalName));
      });
      setSelectedId(saved.id);
      setMessage("Water company saved.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save water company.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddContact() {
    if (!canManage || !selectedId) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveWaterCompanyContact(departmentId, {
        ...contactDraft,
        waterCompanyId: selectedId,
      }, actor);
      setContacts((current) => [...current, saved]);
      setContactDraft({
        name: "",
        title: "",
        email: "",
        phone: "",
        contactType: "primary",
        receivesRoutineReports: true,
        receivesUrgentReports: false,
        receivesOutOfServiceReports: false,
        receivesEscalation: false,
      });
      setMessage("Contact saved.");
    } catch (contactError) {
      setError(contactError?.message || "Unable to save contact.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <HydrantDamagePermissionGate
      allowed={allowed}
      title="Access denied"
      description="You do not have permission to view the water company directory."
    >
      <HydrantDamageModuleLayout
        title="Water Company Directory"
        description="Utility contacts used for hydrant damage email routing, SLA targets, and escalation."
        activeNavName="Water Company Directory"
        onNavigate={onNavigate}
        actions={canManage ? (
          <button className="primary-button" type="button" disabled={saving} onClick={handleCreate}>
            <CirclePlus size={14} /> Add water company
          </button>
        ) : null}
      >
        {loading ? <p className="occupancy-muted">Loading directory…</p> : null}
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}

        {!loading ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><div><strong>Companies</strong></div></header>
              <div className="panel-body">
                <div className="personnel-list">
                  {companies.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedId ? "person-row selected" : "person-row"}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span>
                        <strong>{item.legalName}</strong>
                        <small>{item.utilityTypeLabel} · {item.damageReportEmail || item.generalEmail || "No email"}</small>
                      </span>
                      <span className={`badge badge-${item.active ? "success" : "neutral"}`}>
                        {item.active ? "Active" : "Inactive"}
                      </span>
                    </button>
                  ))}
                  {!companies.length ? <p className="occupancy-muted">No water companies yet.</p> : null}
                </div>
              </div>
            </section>

            {draft ? (
              <section className="panel">
                <header>
                  <div><strong>{draft.legalName || "New water company"}</strong></div>
                  {canManage ? (
                    <button className="primary-button" type="button" disabled={saving} onClick={handleSave}>
                      <Save size={14} /> Save
                    </button>
                  ) : null}
                </header>
                <div className="panel-body occupancy-form-grid">
                  <Field label="Legal name">
                    <input
                      value={draft.legalName}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, legalName: e.target.value }))}
                    />
                  </Field>
                  <Field label="DBA">
                    <input
                      value={draft.dba || ""}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, dba: e.target.value }))}
                    />
                  </Field>
                  <Field label="Utility type">
                    <select
                      value={draft.utilityType}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, utilityType: e.target.value }))}
                    >
                      {WATER_UTILITY_TYPES.map((row) => (
                        <option key={row.id} value={row.id}>{row.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Main address">
                    <input
                      value={draft.mainAddress || ""}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, mainAddress: e.target.value }))}
                    />
                  </Field>
                  <Field label="Main phone">
                    <input
                      value={draft.mainPhone || ""}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, mainPhone: e.target.value }))}
                    />
                  </Field>
                  <Field label="Emergency phone">
                    <input
                      value={draft.emergencyPhone || ""}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, emergencyPhone: e.target.value }))}
                    />
                  </Field>
                  <Field label="Damage report email">
                    <input
                      value={draft.damageReportEmail || ""}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, damageReportEmail: e.target.value }))}
                    />
                  </Field>
                  <Field label="Emergency email">
                    <input
                      value={draft.emergencyEmail || ""}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, emergencyEmail: e.target.value }))}
                    />
                  </Field>
                  <Field label="General email">
                    <input
                      value={draft.generalEmail || ""}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, generalEmail: e.target.value }))}
                    />
                  </Field>
                  <Field label="Ack SLA (minutes)">
                    <input
                      type="number"
                      value={draft.acknowledgmentSlaMinutes || 240}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, acknowledgmentSlaMinutes: Number(e.target.value) || 0 }))}
                    />
                  </Field>
                  <Field label="Repair SLA (hours)">
                    <input
                      type="number"
                      value={draft.normalRepairSlaHours || 72}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, normalRepairSlaHours: Number(e.target.value) || 0 }))}
                    />
                  </Field>
                  <Field label="Subject format" wide>
                    <input
                      value={draft.preferredSubjectFormat || ""}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, preferredSubjectFormat: e.target.value }))}
                    />
                  </Field>
                  <Field label="Internal notes" wide>
                    <textarea
                      rows={3}
                      value={draft.internalNotes || ""}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, internalNotes: e.target.value }))}
                    />
                  </Field>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={draft.active !== false}
                      disabled={!canManage}
                      onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))}
                    />
                    <span>Active</span>
                  </label>

                  {selectedId ? (
                    <div className="config-field wide">
                      <span>Contacts</span>
                      <div className="personnel-list" style={{ maxHeight: 180 }}>
                        {companyContacts.map((row) => (
                          <div key={row.id} className="person-row">
                            <span>
                              <strong>{row.name || row.email}</strong>
                              <small>{row.contactTypeLabel} · {row.email || "No email"} · {row.phone || "No phone"}</small>
                            </span>
                          </div>
                        ))}
                        {!companyContacts.length ? <p className="occupancy-muted">No contacts yet.</p> : null}
                      </div>
                      {canManage ? (
                        <div className="occupancy-form-grid" style={{ marginTop: 10 }}>
                          <Field label="Contact name">
                            <input
                              value={contactDraft.name}
                              onChange={(e) => setContactDraft((c) => ({ ...c, name: e.target.value }))}
                            />
                          </Field>
                          <Field label="Title">
                            <input
                              value={contactDraft.title}
                              onChange={(e) => setContactDraft((c) => ({ ...c, title: e.target.value }))}
                            />
                          </Field>
                          <Field label="Email">
                            <input
                              value={contactDraft.email}
                              onChange={(e) => setContactDraft((c) => ({ ...c, email: e.target.value }))}
                            />
                          </Field>
                          <Field label="Phone">
                            <input
                              value={contactDraft.phone}
                              onChange={(e) => setContactDraft((c) => ({ ...c, phone: e.target.value }))}
                            />
                          </Field>
                          <Field label="Type">
                            <select
                              value={contactDraft.contactType}
                              onChange={(e) => setContactDraft((c) => ({ ...c, contactType: e.target.value }))}
                            >
                              {WATER_CONTACT_TYPES.map((row) => (
                                <option key={row.id} value={row.id}>{row.label}</option>
                              ))}
                            </select>
                          </Field>
                          <div className="config-field">
                            <span>&nbsp;</span>
                            <button className="secondary-button" type="button" disabled={saving} onClick={handleAddContact}>
                              Add contact
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="panel">
                <div className="panel-body">
                  <p className="occupancy-muted">Select or add a water company.</p>
                </div>
              </section>
            )}
          </section>
        ) : null}
      </HydrantDamageModuleLayout>
    </HydrantDamagePermissionGate>
  );
}
