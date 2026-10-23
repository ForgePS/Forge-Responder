import { useEffect, useState } from "react";
import {
  KeyRound,
  LoaderCircle,
  MapPin,
  Save,
  Trash2,
} from "lucide-react";
import {
  clearGoogleApisConfig,
  getGoogleApisClientConfig,
  getGoogleApisStatus,
  saveGoogleApisConfig,
} from "../../lib/googleApisService.js";
import { savePublicAlertDashboardDoc } from "../../lib/alertDashboardPublicLoader.js";
import "../../theme/digital-dashboard.css";

const API_FIELDS = [
  {
    id: "mapsJsApiKey",
    label: "Maps JavaScript API key",
    hint: "Browser maps for traffic, wayfinding, campus maps, and alert pins on displays.",
    docs: "Enable Maps JavaScript API and restrict by HTTP referrer (your FORGE domain).",
  },
  {
    id: "geocodingApiKey",
    label: "Geocoding API key",
    hint: "Server-side address lookup for dispatch alerts, hydrants, and location widgets.",
    docs: "Enable Geocoding API and restrict by IP (Firebase Functions).",
  },
  {
    id: "placesApiKey",
    label: "Places API key",
    hint: "Points of interest, location search, and autocomplete in dashboard widgets.",
    docs: "Enable Places API. Can match your Maps key with appropriate restrictions.",
  },
  {
    id: "youtubeDataApiKey",
    label: "YouTube Data API key",
    hint: "Search and validate YouTube videos when adding web media to playlists.",
    docs: "Enable YouTube Data API v3 for signage video sources.",
  },
];

export default function GoogleApisIntegrationPanel({
  departmentId = "",
  canConfigure = false,
  variant = "admin",
}) {
  const [status, setStatus] = useState({ configured: false, keys: {} });
  const [form, setForm] = useState({
    mapsJsApiKey: "",
    geocodingApiKey: "",
    placesApiKey: "",
    youtubeDataApiKey: "",
    defaultMapCenter: "",
    defaultMapZoom: "12",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!canConfigure || !departmentId) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    getGoogleApisStatus(departmentId)
      .then((next) => {
        if (!active) return;
        setStatus(next || { configured: false, keys: {} });
        setForm((current) => ({
          ...current,
          defaultMapCenter: next?.defaultMapCenter || "",
          defaultMapZoom: String(next?.defaultMapZoom ?? 12),
        }));
      })
      .catch((err) => {
        if (active) setError(err.message || "Could not load Google API settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [departmentId, canConfigure]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!canConfigure) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const payload = {
        departmentId,
        defaultMapCenter: form.defaultMapCenter,
        defaultMapZoom: Number(form.defaultMapZoom) || 12,
      };
      API_FIELDS.forEach(({ id }) => {
        const value = String(form[id] || "").trim();
        if (value) payload[id] = value;
      });

      const next = await saveGoogleApisConfig(payload);
      setStatus(next);
      try {
        const clientConfig = await getGoogleApisClientConfig(departmentId);
        if (clientConfig?.mapsJsApiKey) {
          await savePublicAlertDashboardDoc(departmentId, {
            mapsJsApiKey: clientConfig.mapsJsApiKey,
          });
        }
      } catch {
        // Public display doc sync is best-effort; admin save still succeeds.
      }
      setForm((current) => ({
        ...current,
        mapsJsApiKey: "",
        geocodingApiKey: "",
        placesApiKey: "",
        youtubeDataApiKey: "",
      }));
      setNotice("Google API settings saved. Keys are stored server-side and never written to the browser bundle.");
    } catch (err) {
      setError(err.message || "Save failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleClearKey(fieldId) {
    if (!canConfigure) return;
    setBusy(`clear-${fieldId}`);
    setError("");
    try {
      const next = await saveGoogleApisConfig({
        departmentId,
        removeKeys: [fieldId],
      });
      setStatus(next);
      setNotice(`Removed ${API_FIELDS.find((item) => item.id === fieldId)?.label || "API key"}.`);
    } catch (err) {
      setError(err.message || "Could not remove key.");
    } finally {
      setBusy("");
    }
  }

  async function handleClearAll() {
    if (!canConfigure) return;
    if (!window.confirm("Remove all Google API keys for this department?")) return;
    setBusy("clear-all");
    setError("");
    try {
      await clearGoogleApisConfig(departmentId);
      setStatus({ configured: false, keys: {} });
      setForm({
        mapsJsApiKey: "",
        geocodingApiKey: "",
        placesApiKey: "",
        youtubeDataApiKey: "",
        defaultMapCenter: "",
        defaultMapZoom: "12",
      });
      setNotice("All Google API keys removed.");
    } catch (err) {
      setError(err.message || "Could not clear keys.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={`dd-panel dd-google-apis-panel${variant === "admin" ? " dd-google-apis-admin" : ""}`}>
      <div className="dd-panel-head">
        <div>
          <h3>Google APIs</h3>
          <p className="dd-panel-subtitle">
            Maps, geocoding, places, and YouTube keys for Digital Dashboard and location widgets.
            {variant === "admin" ? " Restricted to platform creator and super admin." : ""}
          </p>
        </div>
        {status.configured ? (
          <span className="dd-status-pill dd-status-success">
            <KeyRound size={14} />
            Configured
          </span>
        ) : (
          <span className="dd-status-pill dd-status-critical">Not configured</span>
        )}
      </div>

      <div className="dd-panel-body">
        {loading ? (
          <p className="dd-empty-detail"><LoaderCircle size={16} className="dd-spin" /> Loading Google API settings…</p>
        ) : null}

        {!canConfigure ? (
          <p className="dd-empty-detail">
            Google API keys are managed in <strong>System Admin → Google &amp; API Keys</strong> by the platform creator or super admin only.
            {status.configured ? " Keys are configured for this department." : ""}
          </p>
        ) : (
          <form className="dd-google-apis-form" onSubmit={handleSave}>
            <div className="dd-google-apis-intro">
              <p>
                Create keys in the
                {" "}
                <a href="https://console.cloud.google.com/google/maps-apis/overview" target="_blank" rel="noreferrer">
                  Google Cloud Console
                </a>
                . Use separate keys for browser (referrer-restricted) and server (IP-restricted) usage when possible.
              </p>
            </div>

            {API_FIELDS.map((field) => {
              const keyStatus = status.keys?.[field.id] || {};
              return (
                <div key={field.id} className="dd-google-api-field">
                  <label htmlFor={field.id}>
                    {field.label}
                    {keyStatus.configured ? (
                      <span className="dd-google-api-saved">Saved {keyStatus.hint}</span>
                    ) : null}
                  </label>
                  <input
                    id={field.id}
                    type="password"
                    value={form[field.id]}
                    onChange={(event) => updateField(field.id, event.target.value)}
                    placeholder={keyStatus.configured ? "Enter a new key to replace the saved value" : "Paste API key"}
                    autoComplete="off"
                  />
                  <p className="dd-google-api-hint">{field.hint}</p>
                  <p className="dd-google-api-docs">{field.docs}</p>
                  {keyStatus.configured ? (
                    <button
                      type="button"
                      className="dd-action-button danger compact"
                      onClick={() => handleClearKey(field.id)}
                      disabled={busy === `clear-${field.id}`}
                    >
                      <Trash2 size={14} />
                      Remove key
                    </button>
                  ) : null}
                </div>
              );
            })}

            <div className="dd-google-api-map-defaults">
              <h4><MapPin size={16} /> Default map view</h4>
              <div className="dd-form-row">
                <label>
                  Center (lat,lng or address)
                  <input
                    value={form.defaultMapCenter}
                    onChange={(event) => updateField("defaultMapCenter", event.target.value)}
                    placeholder="34.95,-90.03 or 123 Main St, Your City ST"
                  />
                </label>
                <label>
                  Zoom
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={form.defaultMapZoom}
                    onChange={(event) => updateField("defaultMapZoom", event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="dd-google-api-actions">
              <button type="submit" className="dd-action-button primary" disabled={busy === "save"}>
                {busy === "save" ? <LoaderCircle size={16} className="dd-spin" /> : <Save size={16} />}
                Save Google API settings
              </button>
              {status.configured ? (
                <button type="button" className="dd-action-button danger" onClick={handleClearAll} disabled={busy === "clear-all"}>
                  <Trash2 size={16} />
                  Remove all keys
                </button>
              ) : null}
            </div>
          </form>
        )}

        {status.updatedAt ? (
          <p className="dd-google-api-meta">
            Last updated {new Date(status.updatedAt).toLocaleString()}
            {status.updatedBy ? ` · ${status.updatedBy}` : ""}
          </p>
        ) : null}

        {notice ? <p className="dd-gallery-note">{notice}</p> : null}
        {error ? <p className="dd-upload-error">{error}</p> : null}
      </div>
    </section>
  );
}
