import { Wifi } from "lucide-react";
import {
  DEFAULT_DEVICE_POLICY,
  getDownloadPackTypes,
  getConflictResolutions,
} from "../../lib/inspections/index.js";

/**
 * Offline / device policy reference for Inspection Config Studio (Phase 11).
 */
export default function InspectionOfflineConfigPanel() {
  const packs = getDownloadPackTypes();
  const resolutions = getConflictResolutions();
  const policy = DEFAULT_DEVICE_POLICY;

  return (
    <section className="personnel-workspace occupancy-workspace">
      <section className="panel">
        <header>
          <div>
            <Wifi size={15} />
            <strong>Offline & mobile</strong>
          </div>
        </header>
        <div className="panel-body">
          <p className="occupancy-muted">
            Download packs, mutation/attachment queues, conflict resolution, and editable device policy live under
            Prevention → Offline & Sync. Attachments are uploaded to the inspection when the device syncs.
          </p>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>Default device policy</strong></div></header>
        <div className="panel-body">
          <ul className="config-reference-list">
            <li><code>maxCacheDays</code><span>{policy.maxCacheDays}</span></li>
            <li><code>maxQueueItems</code><span>{policy.maxQueueItems}</span></li>
            <li><code>maxAttachmentQueueItems</code><span>{policy.maxAttachmentQueueItems}</span></li>
            <li><code>autoSyncOnReconnect</code><span>{String(policy.autoSyncOnReconnect)}</span></li>
            <li><code>allowOfflineDrafts</code><span>{String(policy.allowOfflineDrafts)}</span></li>
          </ul>
        </div>
      </section>

      <div className="config-reference-grid">
        <section className="panel">
          <header><div><strong>Download packs</strong></div></header>
          <div className="panel-body">
            <ul className="config-reference-list">
              {packs.map((row) => (
                <li key={row.id}>
                  <code>{row.id}</code>
                  <span>{row.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="panel">
          <header><div><strong>Conflict resolutions</strong></div></header>
          <div className="panel-body">
            <ul className="config-reference-list">
              {resolutions.map((row) => (
                <li key={row.id}>
                  <code>{row.id}</code>
                  <span>{row.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </section>
  );
}
