import { useEffect, useState } from "react";
import { CirclePlus, Save, Trash2, Truck } from "lucide-react";
import {
  deleteTowProvider,
  listTowProviders,
  saveTowProvider,
} from "../../lib/fleet/index.js";
import { byActiveThenName, newTowProviderDraft } from "../../lib/fleet/configOpsLogic.js";
import "../../styles/fleet-config-ops.css";

const NEW_ID = "__new__";

function Field({ label, hint, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " fco-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint ? <small className="fco-hint">{hint}</small> : null}
    </label>
  );
}

function providerSummary(item) {
  const parts = [];
  if (item.services) parts.push(item.services);
  if (item.phone) parts.push(item.phone);
  if (item.afterHoursPhone) parts.push(`After hours ${item.afterHoursPhone}`);
  return parts.join(" · ") || "No details yet";
}

/**
 * Tow & roadside providers for Configuration Studio.
 */
export default function FleetRiskConfigPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);

  const isNew = selectedId === NEW_ID;
  const original = isNew ? null : providers.find((row) => row.id === selectedId) || null;
  const dirty = Boolean(draft) && (isNew || JSON.stringify(draft) !== JSON.stringify(original));

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    setLoadError("");
    try {
      // Read only: opening this tab never writes anything.
      const next = await listTowProviders(departmentId);
      setProviders([...next].sort(byActiveThenName));
      setSelectedId((c) => c || next[0]?.id || "");
    } catch (err) {
      const message = err?.message || "Unable to load tow and roadside providers.";
      setLoadError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    if (selectedId === NEW_ID) return;
    const row = providers.find((item) => item.id === selectedId);
    setDraft(row ? { ...row } : null);
  }, [providers, selectedId]);

  function confirmLeave() {
    return !dirty || window.confirm("You have unsaved changes to this provider. Discard them?");
  }

  function select(id) {
    if (id === selectedId || !confirmLeave()) return;
    setSelectedId(id);
  }

  function startNew() {
    if (!confirmLeave()) return;
    setSelectedId(NEW_ID);
    setDraft(newTowProviderDraft());
  }

  async function handleSave() {
    if (!draft) return;
    if (!String(draft.name || "").trim()) {
      onError?.("Give the provider a name before saving.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveTowProvider(departmentId, { ...draft, name: draft.name.trim() }, actor);
      setProviders((c) => [saved, ...c.filter((row) => row.id !== saved.id)].sort(byActiveThenName));
      setSelectedId(saved.id);
      setDraft({ ...saved });
      onMessage?.(isNew ? `Added "${saved.name}".` : `Saved "${saved.name}".`);
    } catch (err) {
      onError?.(err?.message || "Unable to save the provider.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (isNew) {
      setSelectedId(providers[0]?.id || "");
      if (!providers.length) setDraft(null);
      return;
    }
    if (!original) return;
    if (!window.confirm(`Remove "${original.name}"? Past roadside calls keep the provider's name. This can't be undone.`)) return;
    setSaving(true);
    try {
      await deleteTowProvider(departmentId, original.id, actor);
      const remaining = providers.filter((row) => row.id !== original.id);
      setProviders(remaining);
      setSelectedId(remaining[0]?.id || "");
      if (!remaining.length) setDraft(null);
      onMessage?.(`Removed "${original.name}".`);
    } catch (err) {
      onError?.(err?.message || "Unable to remove the provider.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading tow and roadside providers...</p></div>;
  }

  if (loadError) {
    return (
      <section className="panel">
        <div className="panel-body fco-empty" role="alert">
          <strong>Tow and roadside providers couldn't be loaded.</strong>
          <span>{loadError}</span>
          <button className="secondary-button" type="button" onClick={reload}>Try again</button>
        </div>
      </section>
    );
  }

  const set = (patch) => setDraft((c) => ({ ...c, ...patch }));

  return (
    <section className="fleet-risk-config">
      <p className="fco-intro">
        The tow companies and roadside services your department calls when a unit breaks down.
        Providers that are in use are offered when a roadside call is dispatched.
      </p>
      <section className="personnel-workspace occupancy-workspace">
        <section className="panel">
          <header>
            <div><Truck size={15} /><strong>Tow &amp; roadside providers</strong></div>
            <button className="text-button" type="button" disabled={saving} onClick={startNew}>
              <CirclePlus size={14} /> Add provider
            </button>
          </header>
          <div className="panel-body">
            <div className="personnel-list">
              {isNew ? (
                <button type="button" className="person-row selected">
                  <span>
                    <strong>{draft?.name?.trim() || "New provider"}<span className="fco-tag fco-tag-new">Not saved</span></strong>
                    <small>{providerSummary(draft || {})}</small>
                  </span>
                </button>
              ) : null}
              {providers.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${item.id === selectedId ? "person-row selected" : "person-row"}${item.active === false ? " fco-row-off" : ""}`}
                  onClick={() => select(item.id)}
                >
                  <span>
                    <strong>
                      {item.name}
                      {item.active === false ? <span className="fco-tag">Not in use</span> : null}
                    </strong>
                    <small>{providerSummary(item)}</small>
                  </span>
                </button>
              ))}
              {!providers.length && !isNew ? (
                <div className="fco-empty">
                  <strong>No tow or roadside providers yet.</strong>
                  <span>Add the companies you call for towing, jump starts, tire changes, and heavy recovery.</span>
                  <button className="secondary-button" type="button" onClick={startNew}>
                    <CirclePlus size={14} /> Add provider
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {draft ? (
          <section className="panel">
            <header>
              <div><strong>{isNew ? "New provider" : "Edit provider"}</strong></div>
              <div className="fco-header-actions">
                <button className="secondary-button danger-button" type="button" disabled={saving} onClick={handleRemove}>
                  <Trash2 size={14} /> {isNew ? "Discard" : "Remove"}
                </button>
                <button className="primary-button" type="button" disabled={saving || !dirty} onClick={handleSave}>
                  <Save size={14} /> {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Company name">
                <input value={draft.name || ""} placeholder="e.g. Smith Towing" onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={draft.phone || ""} onChange={(e) => set({ phone: e.target.value })} />
              </Field>
              <Field label="After-hours phone">
                <input type="tel" value={draft.afterHoursPhone || ""} onChange={(e) => set({ afterHoursPhone: e.target.value })} />
              </Field>
              <Field label="Services offered" hint="For example: heavy wrecker, light duty, jump start, tire change.">
                <input value={draft.services || ""} onChange={(e) => set({ services: e.target.value })} />
              </Field>
              <Field label="Notes" wide>
                <textarea rows={2} value={draft.notes || ""} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
              <label className="occupancy-primary-toggle">
                <input type="checkbox" checked={draft.active !== false} onChange={(e) => set({ active: e.target.checked })} />
                <span>
                  In use
                  <small className="fco-hint">Only providers in use are offered when dispatching a roadside call.</small>
                </span>
              </label>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
