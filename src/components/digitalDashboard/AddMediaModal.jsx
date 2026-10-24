import { useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Camera,
  Clock3,
  CloudUpload,
  Code2,
  FileSpreadsheet,
  FolderOpen,
  Globe,
  HardDrive,
  Heart,
  Images,
  Laptop,
  Link2,
  Megaphone,
  MessageSquare,
  MonitorUp,
  Plus,
  QrCode,
  Search,
  Settings,
  Table2,
  X,
} from "lucide-react";
import {
  buildMediaStoragePath,
  formatDurationClock,
  inferMediaTypeFromFile,
  isMicrosoftHostedUrl,
  isOfficeFileName,
  MICROSOFT_OFFICE_EXTENSIONS,
  parseDurationClock,
  SUPPORTED_MEDIA_EXTENSIONS,
} from "../../lib/digitalDashboard.js";
import { uploadFirebaseFile } from "../../lib/firebaseClient.js";
import { DEFAULT_GALLERY_CONFIG, formatNewMediaTitle } from "../../lib/digitalDashboardGallery.js";
import {
  buildLocalMediaFromConfig,
  buildSocialMediaFromConfig,
  buildWebMediaFromConfig,
  CATEGORY_HUB_TABS,
  DEFAULT_LOCAL_CONFIG,
  DEFAULT_SOCIAL_CONFIG,
  DEFAULT_WEB_CONFIG,
} from "../../lib/digitalDashboardSourceConfigs.js";
import CategoryHubPanel from "./CategoryHubPanel.jsx";
import GallerySourcePanel from "./GallerySourcePanel.jsx";
import LocalSourcePanel from "./LocalSourcePanel.jsx";
import SocialSourcePanel from "./SocialSourcePanel.jsx";
import WebSourcePanel from "./WebSourcePanel.jsx";

function Microsoft365Icon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="dd-brand-icon-microsoft">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" rx="0.5" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" rx="0.5" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" rx="0.5" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" rx="0.5" />
    </svg>
  );
}

function GoogleDriveIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="dd-brand-icon-gdrive">
      <path d="M7.71 3.5L1.15 15h6.56L14.17 3.5H7.71z" fill="#3777E3" />
      <path d="M16.29 3.5H9.83l6.56 11.5h6.56L16.29 3.5z" fill="#FFCF63" />
      <path d="M12 20.5l6.56-11.5H12L5.44 20.5H12z" fill="#11A861" />
    </svg>
  );
}

function DropboxIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="dd-brand-icon-dropbox">
      <path fill="#0061FF" d="M6 4l6 3.5L18 4 12 7.5 6 4zm0 8L12 15.5 18 12l-6 3.5L6 12zm6 3.5L18 16l-6 3.5L6 16l6-3.5z" />
    </svg>
  );
}

const MEDIA_KIND_TABS = [
  { id: "files", label: "Files", icon: FolderOpen, type: "image" },
  { id: "text", label: "Text", icon: Megaphone, type: "announcement" },
  { id: "html", label: "HTML5 Scripts", icon: Code2, type: "html" },
  { id: "qr", label: "QR Code", icon: QrCode, type: "html" },
  { id: "analytics", label: "Analytics", icon: BarChart3, type: "weather" },
  { id: "office", label: "Microsoft Office", icon: FileSpreadsheet, type: "office" },
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
  { id: "custom", label: "Custom", icon: Settings },
];

const UPLOAD_METHODS = [
  { id: "upload", label: "File Upload" },
  { id: "web-server", label: "File From Web Server" },
  { id: "local-server", label: "File From Local Server" },
];

const IMPORT_SOURCES = [
  { id: "device", label: "My Device", icon: Laptop },
  { id: "link", label: "Link", icon: Link2 },
  { id: "camera", label: "Camera", icon: Camera },
  { id: "screencast", label: "Screencast", icon: MonitorUp },
  { id: "gdrive", label: "Google Drive", brand: "gdrive" },
  { id: "microsoft", label: "Microsoft 365", brand: "microsoft" },
  { id: "dropbox", label: "Dropbox", brand: "dropbox" },
];

const CLOUD_LINK_HINTS = {
  gdrive: "Paste a Google Drive share link (Anyone with the link can view).",
  microsoft: "Paste a OneDrive, SharePoint, or Office Online link — Word, Excel, PowerPoint, and PDF files are supported.",
  onedrive: "Paste a OneDrive or SharePoint share link.",
  dropbox: "Paste a Dropbox shared file link.",
};

const CATEGORY_PANEL_IDS = [
  "gallery", "web", "local", "social",
  "favorites", "recent", "custom",
];

const MICROSOFT_LINK_EXAMPLES = [
  "https://contoso.sharepoint.com/.../presentation.pptx",
  "https://1drv.ms/...",
  "https://onedrive.live.com/...",
];

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

  const fileAccept = useMemo(() => {
    const extensions = mediaKind === "office"
      ? [...MICROSOFT_OFFICE_EXTENSIONS, "pdf"]
      : SUPPORTED_MEDIA_EXTENSIONS;
    return extensions.map((ext) => `.${ext}`).join(",");
  }, [mediaKind]);

  const formatList = useMemo(() => {
    if (mediaKind === "office") {
      return [...MICROSOFT_OFFICE_EXTENSIONS, "pdf"].join(", ");
    }
    return [...SUPPORTED_MEDIA_EXTENSIONS, ...MICROSOFT_OFFICE_EXTENSIONS].join(", ");
  }, [mediaKind]);

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
    if (sourceId === "gdrive" || sourceId === "microsoft" || sourceId === "onedrive" || sourceId === "dropbox") {
      setLinkUrl(form.url || "");
      updateForm({
        importSource: sourceId === "onedrive" ? "microsoft" : sourceId,
        type: sourceId === "microsoft" || sourceId === "onedrive" ? "office" : form.type,
      });
      if (sourceId === "microsoft" || sourceId === "onedrive") {
        setMediaKind("office");
      }
      return;
    }
  }

  function openMicrosoftFilePicker() {
    fileInputRef.current?.click();
  }

  function applyLinkImport() {
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      setUploadError("Enter a valid URL to import.");
      return;
    }
    const fromMicrosoft = activeImport === "microsoft"
      || activeImport === "onedrive"
      || isMicrosoftHostedUrl(trimmed);
    updateForm({
      url: trimmed,
      importSource: fromMicrosoft ? "microsoft" : (activeImport || "link"),
      title: form.title || trimmed.split("/").pop()?.split("?")[0] || "Imported link",
      type: fromMicrosoft ? "office" : (form.type || "html"),
      content: fromMicrosoft
        ? form.content || "Microsoft 365 document — displays via Office Online viewer when published."
        : form.content,
    });
    if (fromMicrosoft) setMediaKind("office");
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
    if (kindId === "office") {
      setActiveImport("microsoft");
    }
  }

  function renderImportIcon(source) {
    if (source.brand === "microsoft") return <Microsoft365Icon size={22} />;
    if (source.brand === "gdrive") return <GoogleDriveIcon size={22} />;
    if (source.brand === "dropbox") return <DropboxIcon size={22} />;
    const Icon = source.icon;
    return Icon ? <Icon size={22} /> : null;
  }

  async function handleSave() {
    setUploadError("");
    let nextForm = { ...form };

    if (pendingFile) {
      if (departmentId) {
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
      } else if (previewUrl) {
        nextForm = { ...nextForm, url: previewUrl };
      }
    }

    if (!nextForm.title?.trim()) {
      setUploadError("Name / Title is required.");
      return;
    }

    if (isCategoryPanel) {
      if (sourceCategory === "gallery" && !nextForm.url?.trim()) {
        setUploadError("Preview gallery images and select one to add.");
        return;
      }
      if (sourceCategory === "web") {
        const webConfig = { ...DEFAULT_WEB_CONFIG, ...(nextForm.webConfig || {}) };
        const media = buildWebMediaFromConfig(webConfig, nextForm.title);
        if (!media.url?.trim()) {
          setUploadError("Enter a URL and click Preview, or fill in the web app fields.");
          return;
        }
        nextForm = { ...nextForm, ...media, webConfig, importSource: "web" };
      }
      if (sourceCategory === "local") {
        const localConfig = { ...DEFAULT_LOCAL_CONFIG, ...(nextForm.localConfig || {}) };
        const media = buildLocalMediaFromConfig(localConfig, nextForm.title);
        nextForm = { ...nextForm, ...media, localConfig, importSource: "local" };
      }
      if (sourceCategory === "social") {
        const socialConfig = { ...DEFAULT_SOCIAL_CONFIG, ...(nextForm.socialConfig || {}) };
        const media = buildSocialMediaFromConfig(socialConfig, nextForm.title);
        if (!media.url?.trim()) {
          setUploadError("Enter a social profile URL and click Preview.");
          return;
        }
        nextForm = { ...nextForm, ...media, socialConfig, importSource: "social" };
      }
    }

    onSave(nextForm);
  }

  const showLinkPanel = activeImport === "link"
    || activeImport === "gdrive"
    || activeImport === "microsoft"
    || activeImport === "onedrive"
    || activeImport === "dropbox";
  const showMicrosoftPanel = activeImport === "microsoft" || activeImport === "onedrive";
  const isGallerySource = sourceCategory === "gallery";
  const isCategoryPanel = CATEGORY_PANEL_IDS.includes(sourceCategory);
  const galleryConfig = { ...DEFAULT_GALLERY_CONFIG, ...(form.galleryConfig || {}) };
  const webConfig = { ...DEFAULT_WEB_CONFIG, ...(form.webConfig || {}) };
  const localConfig = { ...DEFAULT_LOCAL_CONFIG, ...(form.localConfig || {}) };
  const socialConfig = { ...DEFAULT_SOCIAL_CONFIG, ...(form.socialConfig || {}) };

  function activateSourceCategory(id) {
    setSourceCategory(id);
    setUploadError("");
    const title = form.title || formatNewMediaTitle();
    const base = { importSource: id, title };

    if (id === "gallery") {
      updateForm({
        ...base,
        type: "image",
        galleryConfig: form.galleryConfig || { ...DEFAULT_GALLERY_CONFIG },
      });
      return;
    }
    if (id === "web") {
      updateForm({ ...base, type: "html", webConfig: form.webConfig || { ...DEFAULT_WEB_CONFIG } });
      return;
    }
    if (id === "local") {
      updateForm({ ...base, type: "weather", localConfig: form.localConfig || { ...DEFAULT_LOCAL_CONFIG } });
      return;
    }
    if (id === "social") {
      updateForm({ ...base, type: "html", socialConfig: form.socialConfig || { ...DEFAULT_SOCIAL_CONFIG } });
      return;
    }
    if (CATEGORY_HUB_TABS[id]) {
      updateForm({ ...base, type: "announcement", hubConfig: form.hubConfig || { tab: CATEGORY_HUB_TABS[id][0]?.id } });
    }
  }

  function applyCategoryMedia(patch) {
    updateForm({
      importSource: sourceCategory,
      title: form.title || patch.title || formatNewMediaTitle(),
      ...patch,
    });
    setUploadError("");
  }

  function renderCategoryPanel() {
    if (sourceCategory === "gallery") {
      return (
        <GallerySourcePanel
          galleryConfig={galleryConfig}
          onConfigChange={(next) => updateForm({ galleryConfig: next })}
          onSelectImage={handleSelectGalleryImage}
          selectedImageId={form.selectedGalleryImageId || ""}
        />
      );
    }
    if (sourceCategory === "web") {
      return (
        <WebSourcePanel
          webConfig={webConfig}
          onConfigChange={(next) => updateForm({ webConfig: next })}
          onApply={applyCategoryMedia}
          formTitle={form.title}
        />
      );
    }
    if (sourceCategory === "local") {
      return (
        <LocalSourcePanel
          localConfig={localConfig}
          onConfigChange={(next) => updateForm({ localConfig: next })}
          onApply={applyCategoryMedia}
          formTitle={form.title}
        />
      );
    }
    if (sourceCategory === "social") {
      return (
        <SocialSourcePanel
          socialConfig={socialConfig}
          onConfigChange={(next) => updateForm({ socialConfig: next })}
          onApply={applyCategoryMedia}
          formTitle={form.title}
        />
      );
    }
    if (CATEGORY_HUB_TABS[sourceCategory]) {
      return (
        <CategoryHubPanel
          categoryId={sourceCategory}
          hubConfig={form.hubConfig}
          onConfigChange={(next) => updateForm({ hubConfig: next })}
        />
      );
    }
    return null;
  }

  function handleSelectGalleryImage(image) {
    updateForm({
      type: "image",
      importSource: "gallery",
      url: image.fullUrl,
      title: form.title || image.title || formatNewMediaTitle(),
      content: form.content || `Gallery · ${image.provider} · ${image.title}`,
      selectedGalleryImageId: image.id,
      galleryConfig,
    });
    setPreviewUrl(image.previewUrl);
    setPendingFile(null);
    setUploadError("");
  }

  return (
    <div className="dd-modal-overlay dd-add-media-overlay" onClick={onClose}>
      <div className="dd-add-media-modal dd-add-media-modal-full" onClick={(event) => event.stopPropagation()}>
        <header className="dd-add-media-header">
          <h3>{isEdit ? "Edit Media" : "Add Media"}</h3>
          <div className="dd-add-media-header-actions">
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
                    if (CATEGORY_PANEL_IDS.includes(id)) {
                      activateSourceCategory(id);
                      return;
                    }
                    setSourceCategory(id);
                    if (id === "general") setActiveImport(null);
                  }}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="dd-add-media-center">
            {isCategoryPanel ? (
              <div className="dd-add-media-main dd-add-media-main-gallery">
                {renderCategoryPanel()}
                {isGallerySource && form.url ? (
                  <div className="dd-gallery-selected">
                    <img src={form.url} alt={form.title || "Selected gallery image"} />
                    <p>Selected for signage loop · {form.title}</p>
                  </div>
                ) : null}
                {!isGallerySource && form.content && (sourceCategory === "web" || sourceCategory === "local" || sourceCategory === "social") ? (
                  <div className="dd-source-applied">
                    <strong>Ready to add</strong>
                    <p>{form.title} · {form.type}{form.url ? ` · ${form.url}` : ""}</p>
                  </div>
                ) : null}
                {uploadError ? <p className="dd-upload-error">{uploadError}</p> : null}
              </div>
            ) : (
              <>
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
                            {isOfficeFileName(pendingFile.name) ? (
                              <FileSpreadsheet size={32} />
                            ) : (
                              <FolderOpen size={32} />
                            )}
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
                          {IMPORT_SOURCES.map((source) => (
                            <button
                              key={source.id}
                              type="button"
                              className={`dd-import-option ${activeImport === source.id || (source.id === "microsoft" && activeImport === "onedrive") ? "active" : ""} ${source.brand === "microsoft" ? "is-microsoft" : ""}`}
                              onClick={() => handleImportSource(source.id)}
                            >
                              <span className={`dd-import-option-icon ${source.brand ? `dd-import-brand-${source.brand}` : ""}`}>
                                {renderImportIcon(source)}
                              </span>
                              <span>{source.label}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <input ref={fileInputRef} type="file" hidden onChange={handleFileSelect} accept={fileAccept} />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFileSelect} />
                  </div>

                  {showLinkPanel ? (
                    <div className={`dd-import-panel ${showMicrosoftPanel ? "dd-import-panel-microsoft" : ""}`}>
                      {showMicrosoftPanel ? (
                        <div className="dd-microsoft-panel-head">
                          <Microsoft365Icon size={28} />
                          <div>
                            <strong>Import from Microsoft 365</strong>
                            <p>OneDrive · SharePoint · Teams · Office Online</p>
                          </div>
                        </div>
                      ) : null}
                      <p>{CLOUD_LINK_HINTS[activeImport === "onedrive" ? "microsoft" : activeImport] || "Paste a direct link to the media file or web page."}</p>
                      {showMicrosoftPanel ? (
                        <ul className="dd-microsoft-examples">
                          {MICROSOFT_LINK_EXAMPLES.map((example) => (
                            <li key={example}><code>{example}</code></li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="dd-import-panel-row">
                        <input
                          type="url"
                          value={linkUrl}
                          placeholder={showMicrosoftPanel ? "Paste OneDrive or SharePoint link…" : "https://…"}
                          onChange={(event) => setLinkUrl(event.target.value)}
                        />
                        <button type="button" className="dd-action-button primary" onClick={applyLinkImport}>
                          Import link
                        </button>
                      </div>
                      {showMicrosoftPanel ? (
                        <div className="dd-microsoft-actions">
                          <button type="button" className="dd-action-button" onClick={openMicrosoftFilePicker}>
                            <FileSpreadsheet size={15} />
                            Upload Word, Excel, or PowerPoint
                          </button>
                          <a
                            className="dd-text-action"
                            href="https://www.office.com/?auth=2"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open Office.com to copy a share link
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="dd-import-panel">
                  <p>
                    Enter the full URL or network path to the file on your server.
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
                Supported formats: {formatList}
              </p>

              {uploadError ? <p className="dd-upload-error">{uploadError}</p> : null}
            </div>
              </>
            )}
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

            {(mediaKind === "office" || form.type === "office") ? (
              <label>
                Office document URL
                <input
                  value={form.url}
                  onChange={(event) => updateForm({ url: event.target.value })}
                  placeholder="OneDrive, SharePoint, or uploaded file URL"
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
          <span />
          <div className="dd-add-media-footer-actions">
            <button type="button" className="dd-action-button" onClick={onClose} disabled={uploading}>Cancel</button>
            <button
              type="button"
              className="dd-action-button primary"
              onClick={handleSave}
              disabled={uploading || !form.title?.trim() || (isGallerySource && !form.url?.trim())}
            >
              {uploading ? "Uploading…" : isEdit ? "Save media" : "Add media"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
