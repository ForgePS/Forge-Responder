import { useMemo, useRef, useState } from "react";
import {
  Atom,
  BarChart3,
  Camera,
  Clock3,
  Cloud,
  Code2,
  FolderOpen,
  Globe,
  HardDrive,
  Heart,
  HelpCircle,
  Images,
  Laptop,
  Link2,
  MapPin,
  Megaphone,
  MessageSquare,
  Monitor,
  MonitorUp,
  Plus,
  QrCode,
  Search,
  Settings,
  Star,
  Table2,
  X,
} from "lucide-react";
import {
  buildMediaStoragePath,
  formatDurationClock,
  inferMediaTypeFromFile,
  MEDIA_TYPES,
  parseDurationClock,
  SUPPORTED_MEDIA_EXTENSIONS,
} from "../../lib/digitalDashboard.js";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";

const MEDIA_KIND_TABS = [
  { id: "files", label: "Files", icon: FolderOpen, type: "image" },
  { id: "text", label: "Text", icon: Megaphone, type: "announcement" },
  { id: "html", label: "HTML5 Scripts", icon: Code2, type: "html" },
  { id: "qr", label: "QR Code", icon: QrCode, type: "html" },
  { id: "analytics", label: "Analytics", icon: BarChart3, type: "weather" },
  { id: "office", label: "Microsoft Office", icon: Table2, type: "announcement" },
  { id: "tables", label: "Tables", icon: Table2, type: "announcement" },
  { id: "progress", label: "Progress Meter", icon: BarChart3, type: "announcement" },
  { id: "announcements", label: "Announcements", icon: Megaphone, type: "announcement" },
];

const SOURCE_CATEGORIES = [
  { id: "favorites", label: "Favorites", icon: Heart },
  { id: "recent", label: "Recent", icon: Clock3 },
  { id: "general", label: "General", icon: FolderOpen },
  { id: "local", label: "Local", icon: HardDrive },
  { id: "web", label: "Web", icon: Globe },
  { id: "gallery", label: "Gallery", icon: Images },
  { id: "social", label: "Social", icon: MessageSquare },
  { id: "suite", label: "Select Suite", icon: Star },
  { id: "signature", label: "Signature 360", icon: MapPin },
  { id: "kiosks", label: "Kiosks", icon: Monitor },
  { id: "custom", label: "Custom", icon: Settings },
  { id: "ai", label: "AI Toolkit", icon: Atom },
];

const UPLOAD_METHODS = [
  { id: "upload", label: "File Upload" },
  { id: "web-server", label: "File From Web Server" },
  { id: "local-server", label: "File From Local Server" },
  { id: "ftp", label: "Secure FTP" },
];

const IMPORT_SOURCES = [
  { id: "device", label: "My Device", icon: Laptop },
  { id: "link", label: "Link", icon: Link2 },
  { id: "camera", label: "Camera", icon: Camera },
  { id: "screencast", label: "Screencast", icon: MonitorUp },
  { id: "gdrive", label: "Google Drive", icon: Cloud },
  { id: "onedrive", label: "OneDrive", icon: Cloud },
  { id: "dropbox", label: "Dropbox", icon: Cloud },
];

const CLOUD_LINK_HINTS = {
  gdrive: "Paste a Google Drive share link (Anyone with the link can view).",
  onedrive: "Paste a OneDrive or SharePoint share link.",
  dropbox: "Paste a Dropbox shared file link.",
};

function applyFileToForm(form, file, previewUrl) {
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return {
    ...form,
    title: form.title || baseName,
    type: inferMediaTypeFromFile(file.name, file.type),
    url: previewUrl || file.name,
    importSource: "device",
    content: form.content || `Imported: ${file.name}`,
  };
}

export default function AddMediaModal({
  form,
  setForm,
  onClose,
  onSave,
  isEdit = false,
  departmentId = "",
  playlists = [],
  schedules = [],
  onAddToPlaylist,
  onAddToSchedule,
}) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [mediaKind, setMediaKind] = useState("files");
  const [sourceCategory, setSourceCategory] = useState("general");
  const [appSearch, setAppSearch] = useState("");
  const [uploadMethod, setUploadMethod] = useState("upload");
  const [activeImport, setActiveImport] = useState(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [serverPath, setServerPath] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const durationClock = useMemo(
    () => formatDurationClock(form.durationSec),
    [form.durationSec]
  );

  const filteredCategories = useMemo(() => {
    const needle = appSearch.trim().toLowerCase();
    if (!needle) return SOURCE_CATEGORIES;
    return SOURCE_CATEGORIES.filter((item) => item.label.toLowerCase().includes(needle));
  }, [appSearch]);

  function updateForm(patch) {
    setForm({ ...form, ...patch });
  }

  function setPreviewFromFile(file) {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl(nextPreview);
    setPendingFile(file);
    setForm(applyFileToForm(form, file, nextPreview));
    setUploadError("");
  }

  function handleFiles(files) {
    const file = files?.[0];
    if (!file) return;
    setPreviewFromFile(file);
    setActiveImport("device");
  }

  function handleFileSelect(event) {
    handleFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    handleFiles(event.dataTransfer?.files);
  }

  async function captureScreencast() {
    setUploadError("");
    setActiveImport("screencast");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      stream.getTracks().forEach((track) => track.stop());
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const file = new File([blob], `screencast-${Date.now()}.png`, { type: "image/png" });
      setPreviewFromFile(file);
      updateForm({ importSource: "screencast" });
    } catch (error) {
      if (error?.name !== "NotAllowedError") {
        setUploadError("Could not capture screencast. Check browser permissions and try again.");
      }
    }
  }

  function handleImportSource(sourceId) {
    setActiveImport(sourceId);
    setUploadError("");

    if (sourceId === "device") {
      fileInputRef.current?.click();
      return;
    }
    if (sourceId === "camera") {
      cameraInputRef.current?.click();
      return;
    }
    if (sourceId === "screencast") {
      captureScreencast();
      return;
    }
    if (sourceId === "link") {
      setLinkUrl(form.url || "");
      return;
    }
    if (sourceId === "gdrive" || sourceId === "onedrive" || sourceId === "dropbox") {
      setLinkUrl(form.url || "");
      updateForm({ importSource: sourceId });
    }
  }

  function applyLinkImport() {
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      setUploadError("Enter a valid URL to import.");
      return;
    }
    updateForm({
      url: trimmed,
      importSource: activeImport || "link",
      title: form.title || trimmed.split("/").pop() || "Imported link",
      type: form.type || "html",
    });
    setUploadError("");
  }

  function applyServerPath() {
    const trimmed = serverPath.trim();
    if (!trimmed) {
      setUploadError("Enter a file path or server URL.");
      return;
    }
    updateForm({
      url: trimmed,
      importSource: uploadMethod,
      title: form.title || trimmed.split(/[/\\]/).pop() || "Server file",
    });
    setUploadError("");
  }

  function selectMediaKind(kindId) {
    setMediaKind(kindId);
    const tab = MEDIA_KIND_TABS.find((item) => item.id === kindId);
    if (tab?.type) updateForm({ type: tab.type });
  }

  async function handleSave() {
    setUploadError("");
    let nextForm = { ...form };

    if (pendingFile && departmentId) {
      setUploading(true);
      try {
        const storagePath = buildMediaStoragePath(departmentId, pendingFile.name);
        const uploaded = await uploadFirebaseFile(storagePath, pendingFile);
        if (!uploaded?.downloadUrl) {
          throw new Error("Upload failed");
        }
        nextForm = {
          ...nextForm,
          url: uploaded.downloadUrl,
          storagePath: uploaded.storagePath,
        };
      } catch {
        setUploadError("File upload failed. Check your connection and try again.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    if (!nextForm.title?.trim()) {
      setUploadError("Name / Title is required.");
      return;
    }

    onSave(nextForm);
  }

  const showLinkPanel = activeImport === "link"
    || activeImport === "gdrive"
    || activeImport === "onedrive"
    || activeImport === "dropbox";
  const showServerPanel = uploadMethod === "web-server" || uploadMethod === "local-server" || uploadMethod === "ftp";

  return (
    <div className="dd-modal-overlay dd-add-media-overlay" onClick={onClose}>
      <div className="dd-add-media-modal dd-add-media-modal-full" onClick={(event) => event.stopPropagation()}>
        <header className="dd-add-media-header">
          <h3>{isEdit ? "Edit Media" : "Add Media"}</h3>
          <div className="dd-add-media-header-actions">
            <button type="button" className="dd-icon-button" aria-label="Help"><HelpCircle size={18} /></button>
            <button type="button" className="dd-icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </header>

        <div className="dd-add-media-workspace">
          <aside className="dd-add-media-sources">
            <label className="dd-add-media-app-search">
              <Search size={15} />
              <input
                type="search"
                placeholder="Search Apps"
                value={appSearch}
                onChange={(event) => setAppSearch(event.target.value)}
              />
            </label>
            <nav aria-label="Media sources">
              {filteredCategories.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`dd-add-media-source ${sourceCategory === id ? "active" : ""}`}
                  onClick={() => {
                    setSourceCategory(id);
                    if (id === "web") setActiveImport("link");
                    if (id === "local") setActiveImport("device");
                  }}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="dd-add-media-center">
            <nav className="dd-add-media-types" aria-label="Media types">
              {MEDIA_KIND_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`dd-add-media-type ${mediaKind === id ? "active" : ""}`}
                  onClick={() => selectMediaKind(id)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            <div className="dd-add-media-main">
              <div className="dd-add-media-source-tabs">
                {UPLOAD_METHODS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={uploadMethod === id ? "active" : ""}
                    onClick={() => setUploadMethod(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {uploadMethod === "upload" ? (
                <>
                  <div
                    className={`dd-upload-zone ${dragOver ? "drag-over" : ""} ${previewUrl ? "has-preview" : ""}`}
                    onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
                    {previewUrl && pendingFile ? (
                      <div className="dd-upload-preview">
                        {pendingFile.type.startsWith("image/") ? (
                          <img src={previewUrl} alt={pendingFile.name} />
                        ) : (
                          <div className="dd-upload-preview-file">
                            <FolderOpen size={32} />
                            <strong>{pendingFile.name}</strong>
                          </div>
                        )}
                        <p>{pendingFile.name} · {(pendingFile.size / 1024).toFixed(1)} KB</p>
                        <button
                          type="button"
                          className="dd-action-button"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Replace file
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="dd-upload-lead">Drop files here, browse files or import from:</p>
                        <div className="dd-import-grid">
                          {IMPORT_SOURCES.map(({ id, label, icon: Icon }) => (
                            <button
                              key={id}
                              type="button"
                              className={`dd-import-option ${activeImport === id ? "active" : ""}`}
                              onClick={() => handleImportSource(id)}
                            >
                              <span className="dd-import-option-icon"><Icon size={22} /></span>
                              <span>{label}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <input ref={fileInputRef} type="file" hidden onChange={handleFileSelect} accept={SUPPORTED_MEDIA_EXTENSIONS.map((ext) => `.${ext}`).join(",")} />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFileSelect} />
                  </div>

                  {showLinkPanel ? (
                    <div className="dd-import-panel">
                      <p>{CLOUD_LINK_HINTS[activeImport] || "Paste a direct link to the media file or web page."}</p>
                      <div className="dd-import-panel-row">
                        <input
                          type="url"
                          value={linkUrl}
                          placeholder="https://…"
                          onChange={(event) => setLinkUrl(event.target.value)}
                        />
                        <button type="button" className="dd-action-button primary" onClick={applyLinkImport}>
                          Import link
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="dd-import-panel">
                  <p>
                    {uploadMethod === "ftp"
                      ? "Enter Secure FTP credentials and remote path (coming soon — use path preview below)."
                      : "Enter the full URL or network path to the file on your server."}
                  </p>
                  <div className="dd-import-panel-row">
                    <input
                      type="text"
                      value={serverPath}
                      placeholder={uploadMethod === "local-server" ? "\\\\server\\share\\file.mp4" : "https://intranet/files/signage.mp4"}
                      onChange={(event) => setServerPath(event.target.value)}
                    />
                    <button type="button" className="dd-action-button primary" onClick={applyServerPath}>
                      Use path
                    </button>
                  </div>
                </div>
              )}

              <p className="dd-upload-formats">
                Supported formats: {SUPPORTED_MEDIA_EXTENSIONS.join(", ")}
              </p>

              {uploadError ? <p className="dd-upload-error">{uploadError}</p> : null}
            </div>
          </div>

          <aside className="dd-add-media-sidebar">
            <h4>Media Information</h4>
            <label>
              Name / Title
              <input
                value={form.title}
                onChange={(event) => updateForm({ title: event.target.value })}
                required
              />
            </label>
            <label className="dd-duration-field">
              Duration <span className="dd-optional">(optional)</span>
              <span className="dd-duration-input">
                <Clock3 size={15} />
                <input
                  type="text"
                  value={durationClock}
                  onChange={(event) => updateForm({ durationSec: parseDurationClock(event.target.value) })}
                  placeholder="00:00:10"
                />
              </span>
            </label>
            <label>
              Add to Groups <span className="dd-optional">(optional)</span>
              <select
                value={(form.groups || ["Default"])[0] || "Default"}
                onChange={(event) => updateForm({ groups: [event.target.value] })}
              >
                <option value="Default">Default</option>
                <option value="Lobby">Lobby</option>
                <option value="Training">Training</option>
                <option value="Operations">Operations</option>
              </select>
            </label>
            <label>
              Add Tags <span className="dd-optional">(optional)</span>
              <input
                value={(form.tags || []).join(", ")}
                onChange={(event) => updateForm({ tags: event.target.value })}
                placeholder="lobby, training, ops"
              />
            </label>

            {(mediaKind === "text" || mediaKind === "announcements" || form.type === "announcement") ? (
              <label>
                Content / caption
                <textarea
                  rows={3}
                  value={form.content}
                  onChange={(event) => updateForm({ content: event.target.value })}
                />
              </label>
            ) : null}

            <div className="dd-sidebar-quick-actions">
              {playlists.length && onAddToPlaylist ? (
                <button type="button" className="dd-text-action" onClick={() => onAddToPlaylist(form)}>
                  <Plus size={14} />
                  to Playlist
                </button>
              ) : null}
              {schedules.length && onAddToSchedule ? (
                <button type="button" className="dd-text-action" onClick={() => onAddToSchedule(form)}>
                  <Plus size={14} />
                  to Schedule
                </button>
              ) : null}
            </div>

            <label className="dd-toggle-row">
              <span>{form.locked ? "Locked" : "Unlocked"}</span>
              <input
                type="checkbox"
                role="switch"
                checked={form.locked !== true}
                onChange={(event) => updateForm({ locked: !event.target.checked })}
              />
            </label>

            <label className="dd-disabled-field">
              Validity
              <select disabled><option>Not configured</option></select>
            </label>
            <label className="dd-disabled-field">
              Priority
              <select disabled><option>Normal</option></select>
            </label>
          </aside>
        </div>

        <footer className="dd-add-media-footer">
          <button type="button" className="dd-action-button dd-help-button" aria-label="Help">
            <HelpCircle size={15} />
            Help
          </button>
          <div className="dd-add-media-footer-actions">
            <button type="button" className="dd-action-button" onClick={onClose} disabled={uploading}>Cancel</button>
            <button
              type="button"
              className="dd-action-button primary"
              onClick={handleSave}
              disabled={uploading || !form.title?.trim()}
            >
              {uploading ? "Uploading…" : isEdit ? "Save media" : "Add media"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
