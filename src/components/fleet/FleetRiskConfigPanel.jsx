import { useEffect, useState } from "react";
import { CirclePlus, Save, Truck } from "lucide-react";
import {
  ensureTowProvidersSeeded,
  getAccidentEventTypes,
  saveTowProvider,
} from "../../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Tow providers + accident type reference for Configuration Studio.
 */
export default function FleetRiskConfigPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const eventTypes = getAccidentEventTypes();

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const next = await ensureTowProvidersSeeded(departmentId, actor);
      setProviders(next);
      setSelectedId((c) => c || next[0]?.id || "");
    } catch (err) {
      onError?.(err?.message || "Unable to load tow providers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    setDraft(providers.find((row) => row.id === selectedId) || null);
  }, [providers, selectedId]);

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading risk configuration...</p></div>;
  }

  return (
    <section className="fleet-risk-config">
      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Accident event types</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {eventTypes.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="personnel-workspace occupancy-workspace">
        <section className="panel">
          <header>
            <div><Truck size={15} /><strong>Tow / roadside providers</strong></div>
            <button
              className="text-button"
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const saved = await saveTowProvider(departmentId, {
                    name: "New tow provider",
                    services: "roadside",
                    active: true,
                  }, actor);
                  setProviders((c) => [saved, ...c]);
                  setSelectedId(saved.id);
                  onMessage?.("Provider created.");
                } catch (err) {
                  onError?.(err?.message || "Unable to create provider.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <CirclePlus size={14} /> Add provider
            </button>
          </header>
          <div className="panel-body">
            <div className="personnel-list">
              {providers.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === selectedId ? "person-row selected" : "person-row"}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.services || "General"}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {draft ? (
          <section className="panel">
            <header>
              <div><strong>Edit provider</strong></div>
              <button
                className="primary-button"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const saved = await saveTowProvider(departmentId, draft, actor);
                    setProviders((c) => [saved, ...c.filter((row) => row.id !== saved.id)].sort((a, b) => a.name.localeCompare(b.name)));
                    onMessage?.("Provider saved.");
                  } catch (err) {
                    onError?.(err?.message || "Unable to save provider.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Save size={14} /> Save
              </button>
            </header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name"><input value={draft.name || ""} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
              <Field label="Phone"><input value={draft.phone || ""} onChange={(e) => setDraft((c) => ({ ...c, phone: e.target.value }))} /></Field>
              <Field label="After-hours phone"><input value={draft.afterHoursPhone || ""} onChange={(e) => setDraft((c) => ({ ...c, afterHoursPhone: e.target.value }))} /></Field>
              <Field label="Services"><input value={draft.services || ""} onChange={(e) => setDraft((c) => ({ ...c, services: e.target.value }))} /></Field>
              <Field label="Notes"><textarea rows={2} value={draft.notes || ""} onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))} /></Field>
              <label className="occupancy-primary-toggle">
                <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))} />
                Active
              </label>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
