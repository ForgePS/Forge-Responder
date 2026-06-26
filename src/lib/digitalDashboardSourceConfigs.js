export const WEB_TABS = [
  { id: "web-url", label: "Web URL", enabled: true },
  { id: "rss", label: "RSS Feed", enabled: true },
  { id: "media-rss", label: "Media RSS", enabled: false },
  { id: "youtube", label: "YouTube", enabled: true },
  { id: "twitch", label: "Twitch", enabled: false },
  { id: "vimeo", label: "Vimeo", enabled: true },
  { id: "gdrive", label: "Google Drive", enabled: true },
  { id: "microsoft", label: "Microsoft 365", enabled: true },
  { id: "stock-quote", label: "Stock Quote", enabled: false },
  { id: "radio", label: "Radio", enabled: false },
  { id: "news", label: "News", enabled: true },
];

export const LOCAL_TABS = [
  { id: "weather", label: "Weather", enabled: true },
  { id: "traffic", label: "Traffic", enabled: true },
  { id: "events", label: "Events Listing", enabled: true },
  { id: "clock", label: "Clock", enabled: true },
  { id: "date", label: "Date", enabled: true },
  { id: "timer", label: "Timer", enabled: false },
  { id: "poi", label: "Point Of Interest", enabled: false },
  { id: "directories", label: "Directories", enabled: false },
  { id: "wayfinding", label: "Wayfinding", enabled: false },
];

export const SOCIAL_TABS = [
  { id: "facebook", label: "Facebook", enabled: true },
  { id: "instagram", label: "Instagram", enabled: true },
  { id: "x", label: "X / Twitter", enabled: true },
  { id: "teams", label: "Microsoft Teams", enabled: true },
  { id: "youtube-social", label: "YouTube", enabled: false },
  { id: "linkedin", label: "LinkedIn", enabled: false },
];

export const CATEGORY_HUB_TABS = {
  favorites: [
    { id: "saved", label: "Saved Items", enabled: true },
    { id: "pinned", label: "Pinned Loops", enabled: true },
  ],
  recent: [
    { id: "uploads", label: "Recent Uploads", enabled: true },
    { id: "edited", label: "Recently Edited", enabled: true },
  ],
  suite: [
    { id: "announcements", label: "Announcements", enabled: false },
    { id: "alerts", label: "Emergency Alerts", enabled: false },
  ],
  signature: [
    { id: "floorplans", label: "Floor Plans", enabled: false },
    { id: "maps", label: "Campus Maps", enabled: false },
  ],
  kiosks: [
    { id: "lobby", label: "Lobby Kiosk", enabled: false },
    { id: "training", label: "Training Room", enabled: false },
  ],
  custom: [
    { id: "html", label: "Custom HTML", enabled: true },
    { id: "api", label: "API Widget", enabled: false },
  ],
  ai: [
    { id: "copy", label: "AI Copywriter", enabled: false },
    { id: "image", label: "AI Image", enabled: false },
  ],
};

export const WEATHER_TEMPLATES = [
  { id: "weather-classic", label: "Classic Forecast", accent: "#2563eb" },
  { id: "weather-compact", label: "Compact Strip", accent: "#0891b2" },
  { id: "weather-radar", label: "Radar Overlay", accent: "#059669" },
  { id: "weather-weekly", label: "7-Day Grid", accent: "#7c3aed" },
  { id: "weather-alert", label: "Alert Banner", accent: "#dc2626" },
  { id: "weather-minimal", label: "Minimal Temp", accent: "#475569" },
  { id: "weather-station", label: "Station Board", accent: "#ea580c" },
  { id: "weather-landscape", label: "Landscape Hero", accent: "#0284c7" },
];

export const DEFAULT_WEB_CONFIG = {
  tab: "web-url",
  urlMode: "web",
  pageUrl: "https://",
  feedUrl: "",
  videoUrl: "",
  newsSource: "fire-service-news",
  refreshMinutes: 15,
  allowScripts: false,
};

export const DEFAULT_LOCAL_CONFIG = {
  tab: "weather",
  location: "",
  autoLocation: true,
  templateId: "weather-classic",
  units: "imperial",
  timezone: "America/Chicago",
  eventSource: "department-calendar",
  trafficRegion: "",
  clockFormat: "12h",
  showSeconds: false,
};

export const DEFAULT_SOCIAL_CONFIG = {
  tab: "facebook",
  profileUrl: "",
  hashtag: "",
  refreshMinutes: 30,
};

export function buildWebMediaFromConfig(config = {}, title = "") {
  const tab = config.tab || "web-url";
  if (tab === "web-url") {
    const url = String(config.pageUrl || "").trim();
    return {
      type: "html",
      url,
      title: title || url.replace(/^https?:\/\//, "").split("/")[0] || "Web page",
      content: `Web ${config.urlMode === "local" ? "local" : "remote"} page`,
    };
  }
  if (tab === "rss" || tab === "news") {
    const url = String(config.feedUrl || config.pageUrl || "").trim();
    return {
      type: "html",
      url,
      title: title || "RSS feed",
      content: tab === "news" ? `News · ${config.newsSource}` : "RSS feed widget",
    };
  }
  if (tab === "youtube" || tab === "vimeo") {
    const url = String(config.videoUrl || "").trim();
    return {
      type: "video",
      url,
      title: title || `${tab} video`,
      content: `${tab} embed`,
    };
  }
  if (tab === "gdrive" || tab === "microsoft") {
    const url = String(config.pageUrl || "").trim();
    return {
      type: tab === "microsoft" ? "office" : "html",
      url,
      title: title || tab,
      content: `Imported from ${tab}`,
    };
  }
  return { type: "html", url: "", title, content: "" };
}

export function buildLocalMediaFromConfig(config = {}, title = "") {
  const tab = config.tab || "weather";
  const location = config.autoLocation ? "Auto-detected" : (config.location || "Department HQ");
  const template = WEATHER_TEMPLATES.find((item) => item.id === config.templateId);
  return {
    type: tab === "weather" ? "weather" : "announcement",
    url: "",
    title: title || `${tab} · ${location}`,
    content: JSON.stringify({ ...config, templateLabel: template?.label || config.templateId }),
  };
}

export function buildSocialMediaFromConfig(config = {}, title = "") {
  const url = String(config.profileUrl || "").trim();
  return {
    type: "html",
    url,
    title: title || `${config.tab} feed`,
    content: `Social · ${config.tab}${config.hashtag ? ` · #${config.hashtag}` : ""}`,
  };
}
