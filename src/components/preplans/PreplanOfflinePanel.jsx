import { useCallback, useEffect, useState } from "react";
import { Ban, CloudOff, Save, Smartphone } from "lucide-react";
import { normalizeOfflineSettings } from "../../lib/preplans/offlinePackageModel.js";
import {
  getOfflineSettings, listMyOfflineDevices, listOfflineDevices, revokeOfflineDevice, saveOfflineSettings,
} from "../../lib/preplans/offlinePackageService.js";

function when(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

/** Earliest expiry among a device's packages, and how many have passed it. */
function deviceExpiry(device, now = Date.now()) {
  const dates = (device.packages || []).map((row) => Date.parse(row.expiresAt)).filter(Number.isFinite);
  if (!dates.length) return { first: "", expired: 0 };
  return { first: new Date(Math.min(...dates)).toISOString(), expired: dates.filter((at) => at <= now).length };
}

/**
 * Offline preplan packages, RMS side: department settings and the devices
 * holding packages. Managers see every device and can revoke one; everyone
 * else sees and can revoke their own.
 */
export default function PreplanOfflinePanel({ departmentId, actor, canManage = false, offlineEnabled = true, preplanNames = {} }) {
  const [settings, setSettings] = useState(null);
  const [meta, setMeta] = useState({});
  const [devices, setDevices] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [loaded, rows] = await Promise.all([
        getOfflineSettings(departmentId),
        canManage ? listOfflineDevices(departmentId) : listMyOfflineDevices(departmentId, actor.actorUid),
      ]);
      setSettings(loaded.settings);
      setMeta(loaded);
      setDevices(rows);
    } catch (loadError) {
      setError(loadError?.message || "Couldn't load offline devices.");
      setDevices([]);
    }
  }, [departmentId, canManage, actor.actorUid]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const saved = await saveOfflineSettings(departmentId, settings, actor);
      setSettings(saved);
      setMeta({ saved: true, updatedAt: new Date().toISOString(), updatedByName: actor.actorName });
      setMessage("Saved. Devices use the new settings the next time they update.");
    } catch (saveError) {
      setError(saveError?.message || "Couldn't save the settings.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(device) {
    const reason = window.prompt(
      `Revoke offline preplans on ${device.userName || "this person"}'s ${device.label || "device"}?\n\n`
      + "The device removes its saved preplans the next time it connects. If it stays offline it keeps them until then "
      + "(they still expire on their own). This can't be undone; the person can save preplans again only from a different device.\n\n"
      + "Reason (optional):",
      "",
    );
    if (reason === null) return;
    try {
      await revokeOfflineDevice(departmentId, device.id, actor, reason);
      setMessage("Revoked. The device will remove its preplans when it next connects.");
      await load();
    } catch (revokeError) {
      setError(revokeError?.message || "Couldn't revoke the device.");
    }
  }

  const set = (patch) => setSettings((current) => normalizeOfflineSettings({ ...current, ...patch }));

  return (
    <>
      <section className="panel">
        <header><div><CloudOff size={15} /><strong>Offline preplans</strong></div></header>
        <div className="panel-body">
          {!offlineEnabled ? (
            <p className="occupancy-error">
              Offline access is turned off for this department (Config Studio → Preplans → features). Devices remove their saved preplans the next time they connect.
            </p>
          ) : null}
          <p className="occupancy-muted">
            Crews save approved preplans in FORGE FIELD (Pre-fire plans → Offline preplans) to use them without a signal: the approved plan, floor plans,
            site map, current alerts, nearby hydrants, verification dates and the photos and documents they&apos;re allowed to see. Copies are encrypted on the
            device, update themselves whenever the device is online, and are removed on sign-out. Satellite imagery isn&apos;t saved (the provider doesn&apos;t allow it).
          </p>
          {settings && canManage ? (
            <>
              <div className="occupancy-form-grid">
                <label className="config-field">
                  <span>Expire after (days without an update)</span>
                  <input type="number" min={1} max={90} value={settings.packageDays} onChange={(event) => set({ packageDays: event.target.value })} />
                </label>
                <label className="config-field">
                  <span>Flag as possibly out of date after (hours)</span>
                  <input type="number" min={1} max={168} value={settings.staleHours} onChange={(event) => set({ staleHours: event.target.value })} />
                </label>
                <label className="config-field">
                  <span>Photos and documents per preplan (MB, 0 for none)</span>
                  <input type="number" min={0} max={200} value={settings.maxFileMb} onChange={(event) => set({ maxFileMb: event.target.value })} />
                </label>
                <label className="config-field">
                  <span>Preplans per device</span>
                  <input type="number" min={1} max={1000} value={settings.maxPackages} onChange={(event) => set({ maxPackages: event.target.value })} />
                </label>
                <label className="config-field">
                  <span><input type="checkbox" checked={settings.includePhotos} onChange={(event) => set({ includePhotos: event.target.checked })} /> Include photos</span>
                </label>
                <label className="config-field">
                  <span><input type="checkbox" checked={settings.includeDocuments} onChange={(event) => set({ includeDocuments: event.target.checked })} /> Include documents (PDF)</span>
                </label>
              </div>
              <p className="occupancy-muted">
                {meta.saved ? `Last saved ${when(meta.updatedAt)}${meta.updatedByName ? ` by ${meta.updatedByName}` : ""}.` : "Using the standard settings."}
                {" "}An expired copy still opens, with a clear warning, so crews aren&apos;t left with nothing.
              </p>
              <div className="occupancy-detail-actions">
                <button type="button" className="primary-button" disabled={saving} onClick={save}><Save size={14} /> {saving ? "Saving…" : "Save settings"}</button>
              </div>
            </>
          ) : null}
          {settings && !canManage ? (
            <p className="occupancy-muted">Saved copies expire after {settings.packageDays} days without an update and are flagged after {settings.staleHours} hours.</p>
          ) : null}
          {message ? <p className="occupancy-message" role="status">{message}</p> : null}
          {error ? <p className="occupancy-error" role="alert">{error}</p> : null}
        </div>
      </section>

      <section className="panel">
        <header><div><Smartphone size={15} /><strong>{canManage ? "Devices with offline preplans" : "My devices"}</strong></div></header>
        <div className="panel-body">
          {devices === null ? <p className="occupancy-muted">Loading…</p> : null}
          {devices && !devices.length ? <p className="occupancy-muted">No device has saved preplans yet.</p> : null}
          {devices && devices.length ? (
            <div className="cert-table">
              <div className="cert-row cert-head">
                <span>Person</span>
                <span>Device</span>
                <span>Preplans</span>
                <span>Last connected</span>
                <span>Status</span>
              </div>
              {devices.map((device) => {
                const expiry = deviceExpiry(device);
                return (
                  <div key={device.id} className="cert-row">
                    <strong>{device.userName || "—"}</strong>
                    <span>{device.label || "Device"}</span>
                    <span>
                      <button type="button" className="link-button" onClick={() => setOpen(open === device.id ? "" : device.id)}>
                        {(device.packages || []).length}
                      </button>
                      {expiry.expired ? ` · ${expiry.expired} expired` : ""}
                    </span>
                    <span>{when(device.lastSyncAt)}</span>
                    <span>
                      {device.status === "revoked"
                        ? `Revoked ${when(device.revokedAt)}${device.revokedByName ? ` by ${device.revokedByName}` : ""}`
                        : (
                          <button type="button" className="secondary-button danger" onClick={() => revoke(device)}>
                            <Ban size={13} /> Revoke
                          </button>
                        )}
                    </span>
                    {open === device.id ? (
                      <ul className="occupancy-muted" style={{ gridColumn: "1 / -1", margin: "4px 0 0", paddingLeft: 18 }}>
                        {(device.packages || []).map((row) => (
                          <li key={row.preplanId}>
                            {preplanNames[row.preplanId] || row.preplanId} · updated {when(row.syncedAt)} · expires {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : "—"}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          <p className="occupancy-muted">
            A device reports what it holds each time it connects; this list can&apos;t show changes made while a device is offline.
            Removing someone&apos;s preplan access also makes their devices remove saved preplans when they next connect.
          </p>
        </div>
      </section>
    </>
  );
}
