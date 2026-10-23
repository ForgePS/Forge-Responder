import { useMemo, useState } from "react";
import {
  CalendarClock,
  CirclePlus,
  Film,
  LayoutGrid,
  MonitorPlay,
  Pencil,
  Play,
  Trash2,
  Tv,
  X,
} from "lucide-react";
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
  displayStatusTone,
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
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "displays", label: "Displays", icon: Tv },
  { id: "media", label: "Media Library", icon: Film },
  { id: "playlists", label: "Playlists", icon: MonitorPlay },
  { id: "schedules", label: "Schedules", icon: CalendarClock },
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
        <button type="button" className="btn primary" onClick={onAction}>
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
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview">
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
              className="btn ghost"
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              Previous
            </button>
            <span>{index + 1} / {items.length}</span>
            <button
              type="button"
              className="btn ghost"
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
  stationNames = [],
  canEdit = false,
  canManage = false,
}) {
  const [view, setView] = useState("overview");
  const [previewDisplay, setPreviewDisplay] = useState(null);
  const [modal, setModal] = useState(null);

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
      createdAt: form.createdAt || new Date().toISOString(),
    };
    upsertRecord(media, setMedia, record);
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

  function movePlaylistItem(playlistId, mediaId, direction) {
    if (!canEdit) return;
    setPlaylists((current) => current.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;
      const itemIds = [...(playlist.itemIds || [])];
      const index = itemIds.indexOf(mediaId);
      if (index === -1) return playlist;
      const target = index + direction;
      if (target < 0 || target >= itemIds.length) return playlist;
      [itemIds[index], itemIds[target]] = [itemIds[target], itemIds[index]];
      return { ...playlist, itemIds };
    }));
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
      <header className="dd-header">
        <div className="dd-header-start">
          <h2>Digital Dashboard</h2>
          <nav className="dd-tabs" aria-label="Digital Dashboard views">
            {VIEWS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`dd-tab ${view === id ? "active" : ""}`}
                onClick={() => setView(id)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="dd-header-stats">
          <span>{stats.onlineCount}/{stats.displayCount} online</span>
          <span>{stats.mediaCount} media</span>
          <span>{stats.activeScheduleCount} active schedules</span>
        </div>
      </header>

      {view === "overview" ? (
        <section className="dd-overview">
          <div className="dd-kpi-grid">
            <article className="dd-kpi-card">
              <span className="dd-kpi-label">Displays</span>
              <strong>{stats.displayCount}</strong>
              <span className="dd-kpi-meta">{stats.onlineCount} online</span>
            </article>
            <article className="dd-kpi-card">
              <span className="dd-kpi-label">Media items</span>
              <strong>{stats.mediaCount}</strong>
              <span className="dd-kpi-meta">Library assets</span>
            </article>
            <article className="dd-kpi-card">
              <span className="dd-kpi-label">Playlists</span>
              <strong>{stats.playlistCount}</strong>
              <span className="dd-kpi-meta">Published loops</span>
            </article>
            <article className="dd-kpi-card">
              <span className="dd-kpi-label">Schedules</span>
              <strong>{stats.activeScheduleCount}</strong>
              <span className="dd-kpi-meta">Currently active</span>
            </article>
          </div>

          <div className="dd-panel">
            <div className="dd-panel-head">
              <h3>Display Network</h3>
              {canEdit ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setModal({ type: "display", form: defaultDisplayForm() })}
                >
                  <CirclePlus size={16} />
                  Add display
                </button>
              ) : null}
            </div>
            {displays.length ? (
              <div className="dd-display-grid">
                {displays.map((display) => {
                  const playlist = resolveDisplayPlaylist(display, playlistsById);
                  return (
                    <article key={display.id} className="dd-display-card">
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
                        <button type="button" className="btn ghost" onClick={() => setPreviewDisplay(display)}>
                          <Play size={15} />
                          Preview
                        </button>
                        {canEdit ? (
                          <button
                            type="button"
                            className="btn ghost"
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
        </section>
      ) : null}

      {view === "displays" ? (
        <section className="dd-panel">
          <div className="dd-panel-head">
            <h3>Displays</h3>
            {canEdit ? (
              <button type="button" className="btn primary" onClick={() => setModal({ type: "display", form: defaultDisplayForm() })}>
                <CirclePlus size={16} />
                Add display
              </button>
            ) : null}
          </div>
          {displays.length ? (
            <div className="dd-table-wrap">
              <table className="dd-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Station</th>
                    <th>Status</th>
                    <th>Playlist</th>
                    <th>Last sync</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {displays.map((display) => {
                    const playlist = resolveDisplayPlaylist(display, playlistsById);
                    return (
                      <tr key={display.id}>
                        <td>
                          <strong>{display.name}</strong>
                          <span className="dd-table-sub">{display.location}</span>
                        </td>
                        <td>{display.station || "—"}</td>
                        <td><StatusPill status={display.status} /></td>
                        <td>{playlist?.name || "—"}</td>
                        <td>{formatLastSync(display.lastSyncAt)}</td>
                        <td className="dd-row-actions">
                          <button type="button" className="icon-btn" onClick={() => setPreviewDisplay(display)} aria-label="Preview">
                            <Play size={16} />
                          </button>
                          {canEdit ? (
                            <button type="button" className="icon-btn" onClick={() => setModal({ type: "display", form: { ...display } })} aria-label="Edit">
                              <Pencil size={16} />
                            </button>
                          ) : null}
                          {canManage ? (
                            <button type="button" className="icon-btn danger" onClick={() => removeRecord(displays, setDisplays, display.id)} aria-label="Delete">
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
            <EmptyState title="No displays yet" detail="Register players and assign playlists to push content to screens." />
          )}
        </section>
      ) : null}

      {view === "media" ? (
        <section className="dd-panel">
          <div className="dd-panel-head">
            <h3>Media Library</h3>
            {canEdit ? (
              <button type="button" className="btn primary" onClick={() => setModal({ type: "media", form: defaultMediaForm() })}>
                <CirclePlus size={16} />
                Add media
              </button>
            ) : null}
          </div>
          {media.length ? (
            <div className="dd-media-grid">
              {media.map((item) => (
                <article key={item.id} className={`dd-media-card dd-media-type-${item.type}`}>
                  <span className="dd-media-type">{mediaTypeLabel(item.type)}</span>
                  <h4>{item.title}</h4>
                  <p>{item.content || item.url || "No description"}</p>
                  <div className="dd-media-footer">
                    <span>{formatDurationSeconds(item.durationSec)}</span>
                    <div className="dd-row-actions">
                      {canEdit ? (
                        <button type="button" className="icon-btn" onClick={() => setModal({ type: "media", form: { ...item, tags: item.tags || [] } })} aria-label="Edit">
                          <Pencil size={16} />
                        </button>
                      ) : null}
                      {canManage ? (
                        <button type="button" className="icon-btn danger" onClick={() => removeRecord(media, setMedia, item.id)} aria-label="Delete">
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Media library is empty" detail="Create announcements, images, video loops, or web widgets for your playlists." />
          )}
        </section>
      ) : null}

      {view === "playlists" ? (
        <section className="dd-playlists">
          <div className="dd-panel-head">
            <h3>Playlists</h3>
            {canEdit ? (
              <button type="button" className="btn primary" onClick={() => setModal({ type: "playlist", form: defaultPlaylistForm() })}>
                <CirclePlus size={16} />
                Add playlist
              </button>
            ) : null}
          </div>
          {playlists.length ? (
            <div className="dd-playlist-grid">
              {playlists.map((playlist) => {
                const duration = computePlaylistDuration(playlist, mediaById);
                const items = (playlist.itemIds || []).map((id) => mediaById[id]).filter(Boolean);
                return (
                  <article key={playlist.id} className="dd-playlist-card">
                    <header>
                      <div>
                        <h4>{playlist.name}</h4>
                        <p>{playlist.description || "No description"}</p>
                      </div>
                      <div className="dd-playlist-meta">
                        <span>{items.length} items</span>
                        <span>{formatDurationSeconds(duration)}</span>
                      </div>
                    </header>
                    <ol className="dd-playlist-items">
                      {items.length ? items.map((item, index) => (
                        <li key={item.id}>
                          <span>{index + 1}. {item.title}</span>
                          {canEdit ? (
                            <span className="dd-playlist-item-actions">
                              <button type="button" className="icon-btn" onClick={() => movePlaylistItem(playlist.id, item.id, -1)} aria-label="Move up">↑</button>
                              <button type="button" className="icon-btn" onClick={() => movePlaylistItem(playlist.id, item.id, 1)} aria-label="Move down">↓</button>
                            </span>
                          ) : null}
                        </li>
                      )) : (
                        <li className="dd-playlist-empty">No media assigned</li>
                      )}
                    </ol>
                    <footer className="dd-display-actions">
                      {canEdit ? (
                        <button type="button" className="btn ghost" onClick={() => setModal({ type: "playlist", form: { ...playlist, itemIds: [...(playlist.itemIds || [])] } })}>
                          <Pencil size={15} />
                          Edit
                        </button>
                      ) : null}
                      {canManage ? (
                        <button type="button" className="btn ghost danger-text" onClick={() => removeRecord(playlists, setPlaylists, playlist.id)}>
                          <Trash2 size={15} />
                          Delete
                        </button>
                      ) : null}
                    </footer>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No playlists yet" detail="Group media into loops before assigning them to displays or schedules." />
          )}
        </section>
      ) : null}

      {view === "schedules" ? (
        <section className="dd-panel">
          <div className="dd-panel-head">
            <h3>Schedules</h3>
            {canEdit ? (
              <button type="button" className="btn primary" onClick={() => setModal({ type: "schedule", form: defaultScheduleForm() })}>
                <CirclePlus size={16} />
                Add schedule
              </button>
            ) : null}
          </div>
          {schedules.length ? (
            <div className="dd-table-wrap">
              <table className="dd-table">
                <thead>
                  <tr>
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
                  {schedules.map((schedule) => {
                    const playlist = playlistsById[schedule.playlistId];
                    const displayCount = (schedule.displayIds || []).length;
                    const dayLabel = (schedule.daysOfWeek || [])
                      .map((day) => DAY_LABELS[day])
                      .join(", ");
                    return (
                      <tr key={schedule.id}>
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
                            <button type="button" className="icon-btn" onClick={() => setModal({ type: "schedule", form: { ...schedule, displayIds: [...(schedule.displayIds || [])], daysOfWeek: [...(schedule.daysOfWeek || [])] } })} aria-label="Edit">
                              <Pencil size={16} />
                            </button>
                          ) : null}
                          {canManage ? (
                            <button type="button" className="icon-btn danger" onClick={() => removeRecord(schedules, setSchedules, schedule.id)} aria-label="Delete">
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
            <EmptyState title="No schedules configured" detail="Time-box playlists to specific displays for shift change, training nights, or weekend lobby loops." />
          )}
        </section>
      ) : null}

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
            className="dd-modal"
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
                Status
                <select value={modal.form.status} onChange={(event) => setModal({ ...modal, form: { ...modal.form, status: event.target.value } })}>
                  {DISPLAY_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>
                Playlist
                <select value={modal.form.playlistId} onChange={(event) => setModal({ ...modal, form: { ...modal.form, playlistId: event.target.value } })}>
                  <option value="">Unassigned</option>
                  {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
                </select>
              </label>
            </div>
            <label>Notes<textarea rows={3} value={modal.form.notes} onChange={(event) => setModal({ ...modal, form: { ...modal.form, notes: event.target.value } })} /></label>
            <footer className="dd-modal-actions">
              <button type="button" className="btn ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn primary">Save display</button>
            </footer>
          </form>
        </div>
      ) : null}

      {modal?.type === "media" ? (
        <div className="dd-modal-overlay" onClick={closeModal}>
          <form
            className="dd-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveMediaItem(modal.form);
            }}
          >
            <header><h3>{modal.form.id ? "Edit media" : "Add media"}</h3></header>
            <label>Title<input value={modal.form.title} onChange={(event) => setModal({ ...modal, form: { ...modal.form, title: event.target.value } })} required /></label>
            <div className="dd-form-row">
              <label>
                Type
                <select value={modal.form.type} onChange={(event) => setModal({ ...modal, form: { ...modal.form, type: event.target.value } })}>
                  {MEDIA_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>Duration (sec)<input type="number" min="5" value={modal.form.durationSec} onChange={(event) => setModal({ ...modal, form: { ...modal.form, durationSec: event.target.value } })} /></label>
            </div>
            <label>Content<textarea rows={4} value={modal.form.content} onChange={(event) => setModal({ ...modal, form: { ...modal.form, content: event.target.value } })} /></label>
            <label>URL / source<input value={modal.form.url} onChange={(event) => setModal({ ...modal, form: { ...modal.form, url: event.target.value } })} placeholder="Optional web or asset URL" /></label>
            <label>Tags (comma-separated)<input value={(modal.form.tags || []).join(", ")} onChange={(event) => setModal({ ...modal, form: { ...modal.form, tags: event.target.value } })} /></label>
            <footer className="dd-modal-actions">
              <button type="button" className="btn ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn primary">Save media</button>
            </footer>
          </form>
        </div>
      ) : null}

      {modal?.type === "playlist" ? (
        <div className="dd-modal-overlay" onClick={closeModal}>
          <form
            className="dd-modal dd-modal-wide"
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
              <button type="button" className="btn ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn primary">Save playlist</button>
            </footer>
          </form>
        </div>
      ) : null}

      {modal?.type === "schedule" ? (
        <div className="dd-modal-overlay" onClick={closeModal}>
          <form
            className="dd-modal dd-modal-wide"
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
              <button type="button" className="btn ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn primary">Save schedule</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
