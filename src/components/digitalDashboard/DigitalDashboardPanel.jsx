import { useMemo, useState } from "react";
import {
  CalendarClock,
  CirclePlus,
  CloudUpload,
  ExternalLink,
  Film,
  LayoutGrid,
  LayoutTemplate,
  MonitorPlay,
  Pencil,
  Play,
  Plug,
  Siren,
  Trash2,
  Tv,
  Wifi,
  X,
} from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { buildAlertDashboardUrl } from "../../lib/alertDashboard.js";
import IntegrationsPanel from "./IntegrationsPanel.jsx";
import AlertDashboardSettingsPanel from "./AlertDashboardSettingsPanel.jsx";
import AddMediaModal from "./AddMediaModal.jsx";
import DigitalDashboardLibraryBar from "./DigitalDashboardLibraryBar.jsx";
import DisplayAlertUrlField from "./DisplayAlertUrlField.jsx";
import MvixProvisioningGuide from "./MvixProvisioningGuide.jsx";
import {
  buildMediaLookup,
  buildPlaylistLookup,
  computePlaylistDuration,
  createDigitalDashboardId,
  DAY_LABELS,
  defaultDisplayForm,
  defaultMediaForm,
  defaultPlaylistForm,
  defaultScheduleForm,
  DISPLAY_PLAYER_MODES,
  displayPlayerModeLabel,
  displayStatusTone,
  filterLibraryRecords,
  formatDisplayStatus,
  formatDurationSeconds,
  formatLastSync,
  mediaTypeLabel,
  MEDIA_TYPES,
  DISPLAY_STATUSES,
  resolveDisplayPlaylist,
  summarizeDashboardStats,
  TRANSITION_TYPES,
} from "../../lib/digitalDashboard.js";
import "../../theme/digital-dashboard.css";

const VIEWS = [
  { id: "overview", label: "Dashboard", icon: LayoutGrid },
  { id: "displays", label: "Devices", icon: Tv },
  { id: "media", label: "Media", icon: Film },
  { id: "playlists", label: "Playlists", icon: MonitorPlay },
  { id: "layouts", label: "Layouts", icon: LayoutTemplate },
  { id: "schedules", label: "Publish", icon: CloudUpload },
  { id: "alerts", label: "Alert Dashboard", icon: Siren },
  { id: "integrations", label: "Integrations", icon: Plug },
];

const KPI_CONFIG = [
  { key: "displayCount", label: "Displays", metaKey: "onlineCount", metaSuffix: " online", icon: Tv },
  { key: "mediaCount", label: "Media items", meta: "Library assets", icon: Film },
  { key: "playlistCount", label: "Playlists", meta: "Published loops", icon: MonitorPlay },
  { key: "activeScheduleCount", label: "Schedules", meta: "Currently active", icon: CalendarClock },
];

function StatusPill({ status }) {
  return (
    <span className={`dd-status-pill dd-status-${displayStatusTone(status)}`}>
      {formatDisplayStatus(status)}
    </span>
  );
}

function EmptyState({ title, detail, actionLabel, onAction }) {
  return (
    <div className="dd-empty">
      <p className="dd-empty-title">{title}</p>
      <p className="dd-empty-detail">{detail}</p>
      {actionLabel && onAction ? (
        <button type="button" className="dd-action-button primary" onClick={onAction}>
          <CirclePlus size={16} />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function PreviewFrame({ display, playlist, mediaById, onClose }) {
  const items = (playlist?.itemIds || []).map((id) => mediaById[id]).filter(Boolean);
  const [index, setIndex] = useState(0);
  const current = items[index] || null;

  return (
    <div className="dd-preview-overlay" onClick={onClose}>
      <div className="dd-preview-modal" onClick={(event) => event.stopPropagation()}>
        <header className="dd-preview-header">
          <div>
            <h3>{display?.name || "Display Preview"}</h3>
            <p>{playlist?.name || "No playlist assigned"}</p>
          </div>
          <button type="button" className="dd-icon-button" onClick={onClose} aria-label="Close preview">
            <X size={18} />
          </button>
        </header>
        <div className={`dd-preview-screen ${display?.orientation === "portrait" ? "portrait" : ""}`}>
          {current ? (
            <div className={`dd-preview-slide dd-preview-type-${current.type}`}>
              <span className="dd-preview-type">{mediaTypeLabel(current.type)}</span>
              <h4>{current.title}</h4>
              <p>{current.content || current.url || "No preview content configured."}</p>
            </div>
          ) : (
            <div className="dd-preview-slide dd-preview-empty">
              <p>Assign media to this playlist to preview signage content.</p>
            </div>
          )}
        </div>
        {items.length > 1 ? (
          <footer className="dd-preview-footer">
            <button
              type="button"
              className="dd-action-button"
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              Previous
            </button>
            <span>{index + 1} / {items.length}</span>
            <button
              type="button"
              className="dd-action-button"
              disabled={index >= items.length - 1}
              onClick={() => setIndex((value) => Math.min(items.length - 1, value + 1))}
            >
              Next
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export default function DigitalDashboardPanel({
  displays = [],
  setDisplays,
  media = [],
  setMedia,
  playlists = [],
  setPlaylists,
  schedules = [],
  setSchedules,
  active911Alerts = [],
  setActive911Alerts,
  alertDashboardConfig = [],
  setAlertDashboardConfig,
  alertBusinessDirectory = [],
  setAlertBusinessDirectory,
  stationNames = [],
  profile = {},
  departmentId = "",
  canEdit = false,
  canManage = false,
}) {
  const { gatewayDepartmentId } = useTenant();
  const gatewaySlug = gatewayDepartmentId || departmentId || "";
  const [view, setView] = useState("overview");
  const [previewDisplay, setPreviewDisplay] = useState(null);
  const [modal, setModal] = useState(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [mediaTypeFilter, setMediaTypeFilter] = useState("all");
  const [displayStatusFilter, setDisplayStatusFilter] = useState("all");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState("all");

  const mediaById = useMemo(() => buildMediaLookup(media), [media]);
  const playlistsById = useMemo(() => buildPlaylistLookup(playlists), [playlists]);
  const stats = useMemo(
    () => summarizeDashboardStats(displays, media, playlists, schedules),
    [displays, media, playlists, schedules]
  );

  const stations = useMemo(() => {
    const fromDisplays = displays.map((item) => item.station).filter(Boolean);
    return [...new Set([...(stationNames || []), ...fromDisplays])];
  }, [displays, stationNames]);

  const filteredDisplays = useMemo(() => {
    let rows = filterLibraryRecords(displays, libraryQuery, ["name", "location", "station", "notes"]);
    if (displayStatusFilter !== "all") {
      rows = rows.filter((item) => item.status === displayStatusFilter);
    }
    return rows;
  }, [displays, libraryQuery, displayStatusFilter]);

  const filteredMedia = useMemo(() => {
    let rows = filterLibraryRecords(media, libraryQuery, ["title", "content", "url", "tags"]);
    if (mediaTypeFilter !== "all") {
      rows = rows.filter((item) => item.type === mediaTypeFilter);
    }
    return rows;
  }, [media, libraryQuery, mediaTypeFilter]);

  const filteredPlaylists = useMemo(() => {
    return filterLibraryRecords(playlists, libraryQuery, ["name", "description"]);
  }, [playlists, libraryQuery]);

  const filteredSchedules = useMemo(() => {
    let rows = filterLibraryRecords(schedules, libraryQuery, ["name"]);
    if (scheduleStatusFilter === "active") {
      rows = rows.filter((item) => item.active !== false);
    }
    if (scheduleStatusFilter === "paused") {
      rows = rows.filter((item) => item.active === false);
    }
    return rows;
  }, [schedules, libraryQuery, scheduleStatusFilter]);

  function closeModal() {
    setModal(null);
  }

  function upsertRecord(list, setList, record) {
    setList((current) => {
      const index = current.findIndex((item) => item.id === record.id);
      if (index === -1) return [...current, record];
      const next = [...current];
      next[index] = record;
      return next;
    });
    closeModal();
  }

  function removeRecord(list, setList, id) {
    if (!canManage) return;
    setList(list.filter((item) => item.id !== id));
    closeModal();
  }

  function saveDisplay(form) {
    const record = {
      ...form,
      id: form.id || createDigitalDashboardId("DDX"),
      lastSyncAt: form.lastSyncAt || new Date().toISOString(),
    };
    upsertRecord(displays, setDisplays, record);
  }

  function saveMediaItem(form) {
    const record = {
      ...form,
      id: form.id || createDigitalDashboardId("DDM"),
      durationSec: Number(form.durationSec) || 10,
      tags: Array.isArray(form.tags)
        ? form.tags
        : String(form.tags || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      groups: Array.isArray(form.groups)
        ? form.groups
        : String(form.groups || "Default")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      locked: form.locked === true,
      createdAt: form.createdAt || new Date().toISOString(),
    };
    upsertRecord(media, setMedia, record);
  }

  function addActive911AlertMedia(record) {
    if (!canEdit) return;
    setMedia((current) => [...current, record]);
  }

  function savePlaylist(form) {
    const record = {
      ...form,
      id: form.id || createDigitalDashboardId("DDP"),
      itemIds: Array.isArray(form.itemIds) ? form.itemIds : [],
    };
    upsertRecord(playlists, setPlaylists, record);
  }

  function saveSchedule(form) {
    const record = {
      ...form,
      id: form.id || createDigitalDashboardId("DDS"),
      displayIds: Array.isArray(form.displayIds) ? form.displayIds : [],
      daysOfWeek: Array.isArray(form.daysOfWeek) ? form.daysOfWeek : [],
      priority: Number(form.priority) || 1,
      active: form.active !== false,
    };
    upsertRecord(schedules, setSchedules, record);
  }

  function toggleScheduleDay(form, dayIndex) {
    const days = new Set(form.daysOfWeek || []);
    if (days.has(dayIndex)) days.delete(dayIndex);
    else days.add(dayIndex);
    setModal({ ...modal, form: { ...form, daysOfWeek: [...days].sort((a, b) => a - b) } });
  }

  function toggleScheduleDisplay(form, displayId) {
    const ids = new Set(form.displayIds || []);
    if (ids.has(displayId)) ids.delete(displayId);
    else ids.add(displayId);
    setModal({ ...modal, form: { ...form, displayIds: [...ids] } });
  }

  function togglePlaylistMedia(form, mediaId) {
    const ids = [...(form.itemIds || [])];
    const index = ids.indexOf(mediaId);
    if (index === -1) ids.push(mediaId);
    else ids.splice(index, 1);
    setModal({ ...modal, form: { ...form, itemIds: ids } });
  }

  const previewPlaylist = previewDisplay
    ? resolveDisplayPlaylist(previewDisplay, playlistsById)
    : null;

  return (
    <div className="digital-dashboard">
      <header className="dd-header-anchor">
        <div className="dd-header-start">
          <div className="dd-header-brand">
            <MonitorPlay size={18} />
            <span>Signage Control</span>
          </div>
          <nav className="dd-main-nav" aria-label="Digital Dashboard modules">
            {VIEWS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`dd-main-nav-item ${view === id ? "active" : ""}`}
                onClick={() => {
                  setView(id);
                  setLibraryQuery("");
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="dd-header-stats">
          <span className="dd-stat-chip">
            <Wifi size={14} />
            <strong>{stats.onlineCount}/{stats.displayCount}</strong>
            online
          </span>
          <span className="dd-stat-chip">
            <Film size={14} />
            <strong>{stats.mediaCount}</strong>
            media
          </span>
          <span className="dd-stat-chip">
            <CalendarClock size={14} />
            <strong>{stats.activeScheduleCount}</strong>
            schedules
          </span>
        </div>
      </header>

      <div className="dd-view-body">
      {view === "overview" ? (
        <section className="dd-overview">
          <div className="dd-kpi-grid">
            {KPI_CONFIG.map(({ key, label, metaKey, metaSuffix, meta, icon: Icon }) => (
              <article key={key} className="dd-kpi-card">
                <div className="dd-kpi-top">
                  <span className="dd-kpi-label">{label}</span>
                  <span className="dd-kpi-icon"><Icon size={16} /></span>
                </div>
                <strong>{stats[key]}</strong>
                <span className="dd-kpi-meta">
                  {metaKey ? `${stats[metaKey]}${metaSuffix || ""}` : meta}
                </span>
              </article>
            ))}
          </div>

          <div className="dd-panel">
            <div className="dd-panel-head">
              <h3>Display Network</h3>
              {canEdit ? (
                <button
                  type="button"
                  className="dd-action-button"
                  onClick={() => setModal({ type: "display", form: defaultDisplayForm() })}
                >
                  <CirclePlus size={16} />
                  Add display
                </button>
              ) : null}
            </div>
            <div className="dd-panel-body">
            {displays.length ? (
              <div className="dd-display-grid">
                {displays.map((display) => {
                  const playlist = resolveDisplayPlaylist(display, playlistsById);
                  return (
                    <article key={display.id} className={`dd-display-card is-${display.status || "offline"}`}>
                      <div className="dd-display-card-top">
                        <div>
                          <h4>{display.name}</h4>
                          <p>{display.location}{display.station ? ` · ${display.station}` : ""}</p>
                        </div>
                        <StatusPill status={display.status} />
                      </div>
                      <dl className="dd-display-meta">
                        <div><dt>Playlist</dt><dd>{playlist?.name || "Unassigned"}</dd></div>
                        <div><dt>Resolution</dt><dd>{display.resolution}</dd></div>
                        <div><dt>Last sync</dt><dd>{formatLastSync(display.lastSyncAt)}</dd></div>
                      </dl>
                      <div className="dd-display-actions">
                        <button type="button" className="dd-action-button" onClick={() => setPreviewDisplay(display)}>
                          <Play size={15} />
                          Preview
                        </button>
                        {canEdit ? (
                          <button
                            type="button"
                            className="dd-action-button"
                            onClick={() => setModal({ type: "display", form: { ...display } })}
                          >
                            <Pencil size={15} />
                            Edit
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No displays registered"
                detail="Add wall-mounted players, lobby screens, or training room projectors to start publishing content."
                actionLabel={canEdit ? "Add display" : undefined}
                onAction={canEdit ? () => setModal({ type: "display", form: defaultDisplayForm() }) : undefined}
              />
            )}
            </div>
          </div>
        </section>
      ) : null}

      {view === "displays" ? (
        <section className="dd-panel dd-library-panel">
          <DigitalDashboardLibraryBar
            title="Device Library"
            count={filteredDisplays.length}
            search={libraryQuery}
            onSearchChange={setLibraryQuery}
            searchPlaceholder="Search devices…"
            filters={[
              {
                id: "status",
                label: "Status",
                value: displayStatusFilter,
                onChange: setDisplayStatusFilter,
                options: [
                  { value: "all", label: "All statuses" },
                  ...DISPLAY_STATUSES.map((item) => ({ value: item.value, label: item.label })),
                ],
              },
            ]}
            addLabel="Add Device"
            onAdd={() => setModal({ type: "display", form: defaultDisplayForm() })}
            canEdit={canEdit}
          />
          <div className="dd-panel-body dd-mvix-guide-wrap">
            <MvixProvisioningGuide gatewaySlug={gatewaySlug} displays={displays} />
          </div>
          <div className="dd-panel-body">
          {filteredDisplays.length ? (
            <div className="dd-table-wrap">
              <table className="dd-table dd-library-table">
                <thead>
                  <tr>
                    <th aria-label="Type" className="dd-col-icon" />
                    <th>Name</th>
                    <th>Station</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>Playlist</th>
                    <th>Alert URL</th>
                    <th>Last sync</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredDisplays.map((display) => {
                    const playlist = resolveDisplayPlaylist(display, playlistsById);
                    return (
                      <tr key={display.id}>
                        <td className="dd-col-icon">
                          <span className="dd-row-type-icon"><Tv size={16} /></span>
                        </td>
                        <td>
                          <strong>{display.name}</strong>
                          <span className="dd-table-sub">{display.location}</span>
                        </td>
                        <td>{display.station || "—"}</td>
                        <td>{displayPlayerModeLabel(display.playerMode || "alert")}</td>
                        <td><StatusPill status={display.status} /></td>
                        <td>{playlist?.name || "—"}</td>
                        <td>
                          {gatewaySlug && display.id ? (
                            <a
                              href={buildAlertDashboardUrl(gatewaySlug, display.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="dd-table-link"
                            >
                              <ExternalLink size={14} />
                              Open
                            </a>
                          ) : "—"}
                        </td>
                        <td>{formatLastSync(display.lastSyncAt)}</td>
                        <td className="dd-row-actions">
                          <button type="button" className="dd-icon-button" onClick={() => setPreviewDisplay(display)} aria-label="Preview">
                            <Play size={16} />
                          </button>
                          {canEdit ? (
                            <button type="button" className="dd-icon-button" onClick={() => setModal({ type: "display", form: { ...display } })} aria-label="Edit">
                              <Pencil size={16} />
                            </button>
                          ) : null}
                          {canManage ? (
                            <button type="button" className="dd-icon-button danger" onClick={() => removeRecord(displays, setDisplays, display.id)} aria-label="Delete">
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={displays.length ? "No devices match your filters" : "No devices yet"}
              detail="Register players and assign playlists to push content to screens."
              actionLabel={canEdit && !displays.length ? "Add device" : undefined}
              onAction={canEdit && !displays.length ? () => setModal({ type: "display", form: defaultDisplayForm() }) : undefined}
            />
          )}
          </div>
        </section>
      ) : null}

      {view === "media" ? (
        <section className="dd-panel dd-library-panel">
          <DigitalDashboardLibraryBar
            title="Media Library"
            count={filteredMedia.length}
            search={libraryQuery}
            onSearchChange={setLibraryQuery}
            searchPlaceholder="Search media…"
            filters={[
              {
                id: "type",
                label: "Type",
                value: mediaTypeFilter,
                onChange: setMediaTypeFilter,
                options: [
                  { value: "all", label: "All types" },
                  ...MEDIA_TYPES.map((item) => ({ value: item.value, label: item.label })),
                ],
              },
            ]}
            addLabel="Add Media"
            onAdd={() => setModal({ type: "media", form: defaultMediaForm() })}
            canEdit={canEdit}
          />
          <div className="dd-panel-body">
          {filteredMedia.length ? (
            <div className="dd-table-wrap">
              <table className="dd-table dd-library-table">
                <thead>
                  <tr>
                    <th aria-label="Type" className="dd-col-icon" />
                    <th>Name</th>
                    <th>Type</th>
                    <th>Duration</th>
                    <th>Tags</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredMedia.map((item) => (
                    <tr key={item.id}>
                      <td className="dd-col-icon">
                        <span className={`dd-row-type-icon dd-media-type-${item.type}`}><Film size={16} /></span>
                      </td>
                      <td>
                        <strong>{item.title}</strong>
                        <span className="dd-table-sub">{item.content || item.url || "No description"}</span>
                      </td>
                      <td>{mediaTypeLabel(item.type)}</td>
                      <td>{formatDurationSeconds(item.durationSec)}</td>
                      <td>
                        {(item.tags || []).length ? (
                          <span className="dd-tag-pill">{(item.tags || [])[0]}</span>
                        ) : "—"}
                      </td>
                      <td className="dd-row-actions">
                        {canEdit ? (
                          <button type="button" className="dd-icon-button" onClick={() => setModal({ type: "media", form: { ...item, tags: item.tags || [] } })} aria-label="Edit">
                            <Pencil size={16} />
                          </button>
                        ) : null}
                        {canManage ? (
                          <button type="button" className="dd-icon-button danger" onClick={() => removeRecord(media, setMedia, item.id)} aria-label="Delete">
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={media.length ? "No media matches your filters" : "Media library is empty"}
              detail="Create announcements, images, video loops, or web widgets for your playlists."
              actionLabel={canEdit && !media.length ? "Add media" : undefined}
              onAction={canEdit && !media.length ? () => setModal({ type: "media", form: defaultMediaForm() }) : undefined}
            />
          )}
          </div>
        </section>
      ) : null}

      {view === "playlists" ? (
        <section className="dd-panel dd-library-panel">
          <DigitalDashboardLibraryBar
            title="Playlist Library"
            count={filteredPlaylists.length}
            search={libraryQuery}
            onSearchChange={setLibraryQuery}
            searchPlaceholder="Search playlists…"
            addLabel="Add Playlist"
            onAdd={() => setModal({ type: "playlist", form: defaultPlaylistForm() })}
            canEdit={canEdit}
          />
          <div className="dd-panel-body">
          {filteredPlaylists.length ? (
            <div className="dd-table-wrap">
              <table className="dd-table dd-library-table">
                <thead>
                  <tr>
                    <th aria-label="Type" className="dd-col-icon" />
                    <th>Name</th>
                    <th>Items</th>
                    <th>Duration</th>
                    <th>Loop</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredPlaylists.map((playlist) => {
                    const duration = computePlaylistDuration(playlist, mediaById);
                    const itemCount = (playlist.itemIds || []).length;
                    return (
                      <tr key={playlist.id}>
                        <td className="dd-col-icon">
                          <span className="dd-row-type-icon dd-row-type-playlist"><Play size={16} /></span>
                        </td>
                        <td>
                          <strong>{playlist.name}</strong>
                          <span className="dd-table-sub">{playlist.description || "No description"}</span>
                        </td>
                        <td>{itemCount}</td>
                        <td>{formatDurationSeconds(duration)}</td>
                        <td>
                          <span className={`dd-status-pill ${playlist.loop !== false ? "dd-status-success" : "dd-status-critical"}`}>
                            {playlist.loop !== false ? "Active" : "Once"}
                          </span>
                        </td>
                        <td className="dd-row-actions">
                          {canEdit ? (
                            <button type="button" className="dd-icon-button" onClick={() => setModal({ type: "playlist", form: { ...playlist, itemIds: [...(playlist.itemIds || [])] } })} aria-label="Edit">
                              <Pencil size={16} />
                            </button>
                          ) : null}
                          {canManage ? (
                            <button type="button" className="dd-icon-button danger" onClick={() => removeRecord(playlists, setPlaylists, playlist.id)} aria-label="Delete">
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={playlists.length ? "No playlists match your search" : "No playlists yet"}
              detail="Group media into loops before assigning them to displays or schedules."
              actionLabel={canEdit && !playlists.length ? "Add playlist" : undefined}
              onAction={canEdit && !playlists.length ? () => setModal({ type: "playlist", form: defaultPlaylistForm() }) : undefined}
            />
          )}
          </div>
        </section>
      ) : null}

      {view === "layouts" ? (
        <section className="dd-panel dd-library-panel">
          <DigitalDashboardLibraryBar
            title="Layout Library"
            count={0}
            search={libraryQuery}
            onSearchChange={setLibraryQuery}
            searchPlaceholder="Search layouts…"
            addLabel="Add Layout"
            onAdd={() => {}}
            canEdit={false}
          />
          <div className="dd-panel-body">
            <EmptyState
              title="Layout templates coming soon"
              detail="Zone-based screen layouts and multi-region templates will let you mirror station boards, lobby tickers, and training room displays."
            />
          </div>
        </section>
      ) : null}

      {view === "schedules" ? (
        <section className="dd-panel dd-library-panel">
          <DigitalDashboardLibraryBar
            title="Schedule Library"
            count={filteredSchedules.length}
            search={libraryQuery}
            onSearchChange={setLibraryQuery}
            searchPlaceholder="Search schedules…"
            filters={[
              {
                id: "status",
                label: "Status",
                value: scheduleStatusFilter,
                onChange: setScheduleStatusFilter,
                options: [
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "paused", label: "Paused" },
                ],
              },
            ]}
            addLabel="Create Schedule"
            onAdd={() => setModal({ type: "schedule", form: defaultScheduleForm() })}
            canEdit={canEdit}
          />
          <div className="dd-panel-body">
          {filteredSchedules.length ? (
            <div className="dd-table-wrap">
              <table className="dd-table dd-library-table">
                <thead>
                  <tr>
                    <th aria-label="Type" className="dd-col-icon" />
                    <th>Schedule</th>
                    <th>Displays</th>
                    <th>Playlist</th>
                    <th>Window</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedules.map((schedule) => {
                    const playlist = playlistsById[schedule.playlistId];
                    const displayCount = (schedule.displayIds || []).length;
                    const dayLabel = (schedule.daysOfWeek || [])
                      .map((day) => DAY_LABELS[day])
                      .join(", ");
                    return (
                      <tr key={schedule.id}>
                        <td className="dd-col-icon">
                          <span className="dd-row-type-icon dd-row-type-schedule"><CalendarClock size={16} /></span>
                        </td>
                        <td><strong>{schedule.name}</strong></td>
                        <td>{displayCount ? `${displayCount} display${displayCount === 1 ? "" : "s"}` : "All"}</td>
                        <td>{playlist?.name || "—"}</td>
                        <td>
                          <span className="dd-table-sub">{dayLabel || "Every day"}</span>
                          <span>{schedule.startTime} – {schedule.endTime}</span>
                        </td>
                        <td>{schedule.priority}</td>
                        <td>
                          <span className={`dd-status-pill ${schedule.active !== false ? "dd-status-success" : "dd-status-critical"}`}>
                            {schedule.active !== false ? "Active" : "Paused"}
                          </span>
                        </td>
                        <td className="dd-row-actions">
                          {canEdit ? (
                            <button type="button" className="dd-icon-button" onClick={() => setModal({ type: "schedule", form: { ...schedule, displayIds: [...(schedule.displayIds || [])], daysOfWeek: [...(schedule.daysOfWeek || [])] } })} aria-label="Edit">
                              <Pencil size={16} />
                            </button>
                          ) : null}
                          {canManage ? (
                            <button type="button" className="dd-icon-button danger" onClick={() => removeRecord(schedules, setSchedules, schedule.id)} aria-label="Delete">
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={schedules.length ? "No schedules match your filters" : "No schedules configured"}
              detail="Time-box playlists to specific displays for shift change, training nights, or weekend lobby loops."
              actionLabel={canEdit && !schedules.length ? "Create schedule" : undefined}
              onAction={canEdit && !schedules.length ? () => setModal({ type: "schedule", form: defaultScheduleForm() }) : undefined}
            />
          )}
          </div>
        </section>
      ) : null}

      {view === "integrations" ? (
        <IntegrationsPanel
          departmentId={departmentId}
          canEdit={canEdit}
          onAddAlertMedia={addActive911AlertMedia}
        />
      ) : null}

      {view === "alerts" ? (
        <AlertDashboardSettingsPanel
          departmentId={departmentId}
          displays={displays}
          configItems={alertDashboardConfig}
          setConfigItems={setAlertDashboardConfig}
          businessDirectory={alertBusinessDirectory}
          setBusinessDirectory={setAlertBusinessDirectory}
          active911Alerts={active911Alerts}
          setActive911Alerts={setActive911Alerts}
          canManage={canManage}
        />
      ) : null}
      </div>

      {previewDisplay ? (
        <PreviewFrame
          display={previewDisplay}
          playlist={previewPlaylist}
          mediaById={mediaById}
          onClose={() => setPreviewDisplay(null)}
        />
      ) : null}

      {modal?.type === "display" ? (
        <div className="dd-modal-overlay" onClick={closeModal}>
          <form
            className="dd-modal dd-modal-form"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveDisplay(modal.form);
            }}
          >
            <header><h3>{modal.form.id ? "Edit display" : "Add display"}</h3></header>
            <label>Name<input value={modal.form.name} onChange={(event) => setModal({ ...modal, form: { ...modal.form, name: event.target.value } })} required /></label>
            <label>Location<input value={modal.form.location} onChange={(event) => setModal({ ...modal, form: { ...modal.form, location: event.target.value } })} /></label>
            <label>
              Station
              <select value={modal.form.station} onChange={(event) => setModal({ ...modal, form: { ...modal.form, station: event.target.value } })}>
                <option value="">Select station</option>
                {stations.map((station) => <option key={station} value={station}>{station}</option>)}
              </select>
            </label>
            <div className="dd-form-row">
              <label>Resolution<input value={modal.form.resolution} onChange={(event) => setModal({ ...modal, form: { ...modal.form, resolution: event.target.value } })} /></label>
              <label>
                Orientation
                <select value={modal.form.orientation} onChange={(event) => setModal({ ...modal, form: { ...modal.form, orientation: event.target.value } })}>
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </label>
            </div>
            <div className="dd-form-row">
              <label>
                Player mode
                <select
                  value={modal.form.playerMode || "alert"}
                  onChange={(event) => setModal({ ...modal, form: { ...modal.form, playerMode: event.target.value } })}
                >
                  {DISPLAY_PLAYER_MODES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select value={modal.form.status} onChange={(event) => setModal({ ...modal, form: { ...modal.form, status: event.target.value } })}>
                  {DISPLAY_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            </div>
            {(modal.form.playerMode || "alert") === "signage" ? (
              <label>
                Playlist
                <select value={modal.form.playlistId} onChange={(event) => setModal({ ...modal, form: { ...modal.form, playlistId: event.target.value } })}>
                  <option value="">Unassigned</option>
                  {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
                </select>
              </label>
            ) : (
              <DisplayAlertUrlField
                url={modal.form.id && gatewaySlug ? buildAlertDashboardUrl(gatewaySlug, modal.form.id) : ""}
                label="MVIX / signage stick home URL"
              />
            )}
            <label>Notes<textarea rows={3} value={modal.form.notes} onChange={(event) => setModal({ ...modal, form: { ...modal.form, notes: event.target.value } })} /></label>
            <footer className="dd-modal-actions">
              <button type="button" className="dd-action-button" onClick={closeModal}>Cancel</button>
              <button type="button" className="dd-action-button primary" onClick={() => saveDisplay(modal.form)}>Save display</button>
            </footer>
          </form>
        </div>
      ) : null}

      {modal?.type === "media" ? (
        <AddMediaModal
          form={modal.form}
          setForm={(form) => setModal({ ...modal, form })}
          onClose={closeModal}
          onSave={saveMediaItem}
          isEdit={Boolean(modal.form.id)}
          departmentId={departmentId}
          playlists={playlists}
          schedules={schedules}
        />
      ) : null}

      {modal?.type === "playlist" ? (
        <div className="dd-modal-overlay" onClick={closeModal}>
          <form
            className="dd-modal dd-modal-wide dd-modal-form"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              savePlaylist(modal.form);
            }}
          >
            <header><h3>{modal.form.id ? "Edit playlist" : "Add playlist"}</h3></header>
            <label>Name<input value={modal.form.name} onChange={(event) => setModal({ ...modal, form: { ...modal.form, name: event.target.value } })} required /></label>
            <label>Description<textarea rows={2} value={modal.form.description} onChange={(event) => setModal({ ...modal, form: { ...modal.form, description: event.target.value } })} /></label>
            <div className="dd-form-row">
              <label>
                Transition
                <select value={modal.form.transition} onChange={(event) => setModal({ ...modal, form: { ...modal.form, transition: event.target.value } })}>
                  {TRANSITION_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="dd-checkbox">
                <input type="checkbox" checked={modal.form.loop !== false} onChange={(event) => setModal({ ...modal, form: { ...modal.form, loop: event.target.checked } })} />
                Loop continuously
              </label>
            </div>
            <fieldset className="dd-media-picker">
              <legend>Media items (order preserved)</legend>
              {media.length ? media.map((item) => (
                <label key={item.id} className="dd-picker-row">
                  <input
                    type="checkbox"
                    checked={(modal.form.itemIds || []).includes(item.id)}
                    onChange={() => togglePlaylistMedia(modal.form, item.id)}
                  />
                  <span>{item.title}</span>
                  <span className="dd-picker-meta">{mediaTypeLabel(item.type)} · {formatDurationSeconds(item.durationSec)}</span>
                </label>
              )) : (
                <p className="dd-empty-detail">Add media items first.</p>
              )}
            </fieldset>
            <footer className="dd-modal-actions">
              <button type="button" className="dd-action-button" onClick={closeModal}>Cancel</button>
              <button type="button" className="dd-action-button primary" onClick={() => savePlaylist(modal.form)}>Save playlist</button>
            </footer>
          </form>
        </div>
      ) : null}

      {modal?.type === "schedule" ? (
        <div className="dd-modal-overlay" onClick={closeModal}>
          <form
            className="dd-modal dd-modal-wide dd-modal-form"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveSchedule(modal.form);
            }}
          >
            <header><h3>{modal.form.id ? "Edit schedule" : "Add schedule"}</h3></header>
            <label>Name<input value={modal.form.name} onChange={(event) => setModal({ ...modal, form: { ...modal.form, name: event.target.value } })} required /></label>
            <label>
              Playlist
              <select value={modal.form.playlistId} onChange={(event) => setModal({ ...modal, form: { ...modal.form, playlistId: event.target.value } })} required>
                <option value="">Select playlist</option>
                {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
              </select>
            </label>
            <fieldset className="dd-media-picker">
              <legend>Target displays</legend>
              {displays.length ? displays.map((display) => (
                <label key={display.id} className="dd-picker-row">
                  <input
                    type="checkbox"
                    checked={(modal.form.displayIds || []).includes(display.id)}
                    onChange={() => toggleScheduleDisplay(modal.form, display.id)}
                  />
                  <span>{display.name}</span>
                </label>
              )) : (
                <p className="dd-empty-detail">Register displays first.</p>
              )}
            </fieldset>
            <div className="dd-day-picker">
              {DAY_LABELS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`dd-day-pill ${(modal.form.daysOfWeek || []).includes(index) ? "active" : ""}`}
                  onClick={() => toggleScheduleDay(modal.form, index)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="dd-form-row">
              <label>Start time<input type="time" value={modal.form.startTime} onChange={(event) => setModal({ ...modal, form: { ...modal.form, startTime: event.target.value } })} /></label>
              <label>End time<input type="time" value={modal.form.endTime} onChange={(event) => setModal({ ...modal, form: { ...modal.form, endTime: event.target.value } })} /></label>
              <label>Priority<input type="number" min="1" value={modal.form.priority} onChange={(event) => setModal({ ...modal, form: { ...modal.form, priority: event.target.value } })} /></label>
            </div>
            <label className="dd-checkbox">
              <input type="checkbox" checked={modal.form.active !== false} onChange={(event) => setModal({ ...modal, form: { ...modal.form, active: event.target.checked } })} />
              Schedule is active
            </label>
            <footer className="dd-modal-actions">
              <button type="button" className="dd-action-button" onClick={closeModal}>Cancel</button>
              <button type="button" className="dd-action-button primary" onClick={() => saveSchedule(modal.form)}>Save schedule</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
