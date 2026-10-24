import { useState } from "react";
import { ChevronDown, ChevronUp, ImageIcon, LoaderCircle } from "lucide-react";
import {
  DEFAULT_GALLERY_CONFIG,
  fetchGalleryStockPhotos,
  GALLERY_CATEGORIES,
  GALLERY_FEATURES,
  GALLERY_IMAGE_TYPES,
  GALLERY_ORIENTATIONS,
  GALLERY_PROVIDERS,
  GALLERY_TABS,
} from "../../lib/digitalDashboardGallery.js";

export default function GallerySourcePanel({ galleryConfig, onConfigChange, onSelectImage, selectedImageId = "" }) {
  const config = { ...DEFAULT_GALLERY_CONFIG, ...galleryConfig };
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewImages, setPreviewImages] = useState([]);
  const [previewNote, setPreviewNote] = useState("");
  const [previewError, setPreviewError] = useState("");

  const activeTab = GALLERY_TABS.find((tab) => tab.id === config.tab) || GALLERY_TABS[0];

  function updateConfig(patch) {
    onConfigChange?.({ ...config, ...patch });
  }

  async function handlePreview() {
    if (config.tab !== "stock-photos") return;
    setLoading(true);
    setPreviewError("");
    try {
      const apiKey = import.meta.env.VITE_PIXABAY_API_KEY || "";
      const result = await fetchGalleryStockPhotos(config, apiKey);
      setPreviewImages(result.images);
      setPreviewNote(result.message || "");
    } catch {
      setPreviewError("Could not load gallery preview. Try again in a moment.");
      setPreviewImages([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dd-gallery-panel">
      <nav className="dd-gallery-tabs" aria-label="Gallery sources">
        {GALLERY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dd-gallery-tab ${config.tab === tab.id ? "active" : ""} ${tab.enabled ? "" : "is-disabled"}`}
            onClick={() => tab.enabled && updateConfig({ tab: tab.id })}
            disabled={!tab.enabled}
          >
            {tab.label}
            {tab.badge ? <span className="dd-gallery-tab-badge">{tab.badge}</span> : null}
          </button>
        ))}
      </nav>

      {config.tab === "stock-photos" ? (
        <div className="dd-gallery-stock">
          <div className="dd-gallery-mode-toggle">
            <button
              type="button"
              className={config.mode === "auto" ? "active" : ""}
              onClick={() => updateConfig({ mode: "auto" })}
            >
              Auto
            </button>
            <button
              type="button"
              className={config.mode === "manual" ? "active" : ""}
              onClick={() => updateConfig({ mode: "manual" })}
            >
              Manual
            </button>
          </div>

          <div className="dd-gallery-form-grid">
            <label>
              Provider
              <select value={config.provider} onChange={(event) => updateConfig({ provider: event.target.value })}>
                {GALLERY_PROVIDERS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              Feature
              <select value={config.feature} onChange={(event) => updateConfig({ feature: event.target.value })}>
                {GALLERY_FEATURES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select value={config.category} onChange={(event) => updateConfig({ category: event.target.value })}>
                {GALLERY_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              Image Type
              <select value={config.imageType} onChange={(event) => updateConfig({ imageType: event.target.value })}>
                {GALLERY_IMAGE_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              Orientation
              <select value={config.orientation} onChange={(event) => updateConfig({ orientation: event.target.value })}>
                {GALLERY_ORIENTATIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            className="dd-gallery-advanced-toggle"
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            Advanced Settings
            {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {advancedOpen ? (
            <div className="dd-gallery-advanced">
              <label>
                Search keywords
                <input
                  type="text"
                  value={config.searchQuery}
                  onChange={(event) => updateConfig({ searchQuery: event.target.value })}
                  placeholder="fire department, training, community"
                />
              </label>
              {config.mode === "auto" ? (
                <label>
                  Auto-refresh interval (hours)
                  <select
                    value={String(config.refreshHours)}
                    onChange={(event) => updateConfig({ refreshHours: Number(event.target.value) })}
                  >
                    <option value="6">Every 6 hours</option>
                    <option value="12">Every 12 hours</option>
                    <option value="24">Every 24 hours</option>
                    <option value="168">Weekly</option>
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="dd-gallery-actions">
            <button type="button" className="dd-action-button dd-gallery-preview-btn" onClick={handlePreview} disabled={loading}>
              {loading ? <LoaderCircle size={16} className="dd-spin" /> : <ImageIcon size={16} />}
              Preview
            </button>
          </div>

          {previewNote ? <p className="dd-gallery-note">{previewNote}</p> : null}
          {previewError ? <p className="dd-upload-error">{previewError}</p> : null}

          {previewImages.length ? (
            <div className="dd-gallery-preview-grid">
              {previewImages.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className={`dd-gallery-preview-card ${selectedImageId === image.id ? "selected" : ""}`}
                  onClick={() => onSelectImage?.(image)}
                >
                  <img src={image.previewUrl} alt={image.title} loading="lazy" />
                  <span>{image.title}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="dd-gallery-placeholder">
          <strong>{activeTab.label}</strong>
          <p>{activeTab.label} gallery integration is coming soon. Use Stock Photos for signage backgrounds today.</p>
        </div>
      )}
    </div>
  );
}
